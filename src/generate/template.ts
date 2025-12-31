import { IDL, Instruction, Arg, Account, SetupInstruction } from "../types/idl";
import { SeedProcessor } from "../utils/pda";
import { InstructionAnalyzer } from "./parser";

const toCamelCase = (s: string): string =>
  s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const toTitleCase = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

export class TestGenerator {
  private seedProcessor = new SeedProcessor();
  private analyzer = new InstructionAnalyzer();

  generate(idl: IDL, programName: string): string {
    const instructions = this.selectInstructions(idl.instructions);
    
    const setupMap = new Map<string, SetupInstruction[]>();
    
    for (const ix of instructions) {
      const deps = this.analyzer.findDependencies(ix, instructions);
      if (deps.length > 0) {
        setupMap.set(ix.name, deps.map(dep => this.buildSetupInstruction(dep)));
      }
    }

    const scopePDAs = this.generateAllScopePDAs(instructions);
    const scopePDANames = new Set(
      scopePDAs.map(pda => {
        const match = pda.match(/const \[(\w+)Pda\]/);
        return match ? match[1] : "";
      }).filter(Boolean)
    );
    
    const allTests: string[] = [];
    let testCounter = 1;
    
    for (const instruction of instructions) {
      const setup = setupMap.get(instruction.name) || [];
      const tests = this.generateInstructionTests(instruction, setup, scopePDANames, testCounter);
      allTests.push(tests);
      testCounter += 3;
    }

    return this.wrapTests(programName, allTests, scopePDAs);
  }

  private selectInstructions(instructions: Instruction[]): Instruction[] {
    const scored = instructions.map(ix => {
      let score = 0;
      const name = ix.name.toLowerCase();
      
      if (name.includes("init") || name.includes("create")) score -= 10;
      if (name.includes("update")) score -= 5;
      if (name.includes("delete")) score -= 3;
      
      for (const acc of ix.accounts) {
        if (!acc.pda && !acc.signer && !acc.address) score += 5;
      }
      
      return { instruction: ix, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, Math.min(3, instructions.length)).map(s => s.instruction);
  }

  private buildSetupInstruction(instruction: Instruction): SetupInstruction {
    const args = new Map<string, string>();
    
    for (const arg of instruction.args) {
      const varName = arg.name.startsWith("_") ? arg.name.slice(1) : arg.name;
      args.set(varName, this.generateArgValue(arg, "success", 1));
    }
    
    const pdas: string[] = [];
    for (const acc of instruction.accounts) {
      if (acc.pda) {
        const result = this.seedProcessor.processSeeds(acc.pda.seeds, instruction.args);
        if (!result.usesArgs) {
          pdas.push(acc.name);
        }
      }
    }
    
    return {
      instruction,
      methodName: toCamelCase(instruction.name),
      args,
      pdas
    };
  }

  private generateAllScopePDAs(instructions: Instruction[]): string[] {
    const pdas: string[] = [];
    const seen = new Set<string>();

    for (const ix of instructions) {
      for (const acc of ix.accounts) {
        if (!acc.pda) continue;
        
        const result = this.seedProcessor.processSeeds(acc.pda.seeds, ix.args);
        
        if (!result.usesArgs && !seen.has(acc.name)) {
          seen.add(acc.name);
          const seedsCode = result.expressions.map(e => `      ${e}`).join(",\n");
          pdas.push(
            `  const [${acc.name}Pda] = anchor.web3.PublicKey.findProgramAddressSync(\n` +
            `    [\n${seedsCode}\n    ],\n` +
            `    program.programId\n` +
            `  );`
          );
        }
      }
    }

    return pdas;
  }

  private generateInstructionTests(
    instruction: Instruction, 
    setupInstructions: SetupInstruction[],
    scopePDANames: Set<string>,
    baseTestCounter: number
  ): string {
    const methodName = toCamelCase(instruction.name);
    const action = this.getAction(instruction.name);
    const subject = this.getSubject(instruction.name);
    
    const tests: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      const testCounter = baseTestCounter + i;
      const testCase = i === 0 ? "success" : (i === 2 ? "edge" : "success");
      const shouldFail = i === 1;
      
      const setupCode = this.generateSetupCode(setupInstructions, scopePDANames, testCounter);
      const setupPDANames = this.extractSetupPDAs(setupCode);
      const setupPDAMap = this.buildSetupPDAMap(setupInstructions);
      
      const testPDAs = this.generateTestLevelPDAs(instruction, scopePDANames, setupPDANames, testCounter);
      const accountsObj = this.generateAccountsObject(instruction.accounts, shouldFail, setupPDAMap);
      
      let testName: string;
      if (shouldFail) {
        testName = `fails to ${action} ${subject} with unauthorized signer`;
      } else if (testCase === "edge") {
        testName = `handles ${action} ${subject} with minimal values`;
      } else {
        testName = `successfully ${action}s ${subject}`;
      }
      
      if (shouldFail && !instruction.accounts.some(acc => acc.signer)) {
        continue;
      }
      
      if (testCase === "edge" && instruction.args.length === 0) {
        continue;
      }
      
      tests.push(this.generateTest({
        name: testName,
        instruction,
        methodName,
        testPDAs,
        accountsObj,
        testCase,
        shouldFail,
        setupCode,
        testCounter
      }));
    }
    
    return tests.join("\n\n");
  }

  private generateSetupCode(setupInstructions: SetupInstruction[], scopePDANames: Set<string>, testCounter: number): string {
    if (setupInstructions.length === 0) return "";
    
    const lines: string[] = ["\n    // Setup: Create required accounts"];
    const declaredArgs = new Set<string>();
    const declaredPDAs = new Set<string>();
    
    for (const setup of setupInstructions) {
      for (const [varName, value] of setup.args) {
        if (!declaredArgs.has(varName)) {
          const uniqueValue = this.makeValueUnique(value, testCounter);
          lines.push(`    const ${varName} = ${uniqueValue};`);
          declaredArgs.add(varName);
        }
      }
      
      for (const acc of setup.instruction.accounts) {
        if (!acc.pda) continue;
        if (scopePDANames.has(acc.name)) continue;
        if (declaredPDAs.has(acc.name)) continue;
        
        const result = this.seedProcessor.processSeeds(acc.pda.seeds, setup.instruction.args);
        
        if (result.usesArgs) {
          const seedsCode = result.expressions.map(e => `      ${e}`).join(",\n");
          lines.push(
            `    const [${acc.name}Pda] = anchor.web3.PublicKey.findProgramAddressSync(\n` +
            `      [\n${seedsCode}\n      ],\n` +
            `      program.programId\n` +
            `    );`
          );
          declaredPDAs.add(acc.name);
        }
      }
      
      const setupArgs = Array.from(setup.args.keys()).join(", ");
      const setupPDAMap = this.buildSetupPDAMap([setup]);
      const setupAccounts = this.generateAccountsObject(setup.instruction.accounts, false, setupPDAMap);
      
      lines.push(
        `    await program.methods\n` +
        `      .${setup.methodName}(${setupArgs})\n` +
        `      .accounts({\n${setupAccounts}\n      })\n` +
        `      .rpc();`
      );
    }
    
    lines.push("");
    return lines.join("\n");
  }

  private generateTest(params: {
    name: string;
    instruction: Instruction;
    methodName: string;
    testPDAs: string;
    accountsObj: string;
    testCase: "success" | "edge";
    shouldFail: boolean;
    setupCode: string;
    testCounter: number;
  }): string {
    const hasSetup = params.setupCode.length > 0;
    const setupVars = hasSetup ? this.extractSetupVars(params.setupCode) : new Set<string>();
    
    const argDecls = this.generateArgDeclarations(
      params.instruction.args, 
      params.testCase,
      setupVars,
      params.testCounter
    );
    const methodArgs = this.generateMethodArgs(params.instruction.args);
    
    const testBody = params.shouldFail
      ? `try {
      await program.methods
        .${params.methodName}(${methodArgs})
        .accounts({
${params.accountsObj}
        })
        .rpc();
      throw new Error("Expected to fail");
    } catch (err: any) {
      if (err.message === "Expected to fail") throw err;
    }`
      : `await program.methods
      .${params.methodName}(${methodArgs})
      .accounts({
${params.accountsObj}
      })
      .rpc();`;

    return `  it("${params.name}", async () => {${params.setupCode}${argDecls}${params.testPDAs}
    ${testBody}
  });`;
  }

  private extractSetupVars(setupCode: string): Set<string> {
    const vars = new Set<string>();
    const lines = setupCode.split('\n');
    
    for (const line of lines) {
      const constMatch = line.match(/const\s+(\w+)\s*=/);
      const destructMatch = line.match(/const\s+\[(\w+)Pda\]/);
      
      if (constMatch) {
        vars.add(constMatch[1]);
      }
      if (destructMatch) {
        vars.add(destructMatch[1]);
      }
    }
    
    return vars;
  }

  private extractSetupPDAs(setupCode: string): Set<string> {
    const pdas = new Set<string>();
    const lines = setupCode.split('\n');
    
    for (const line of lines) {
      const match = line.match(/const\s+\[(\w+)Pda\]/);
      if (match) {
        pdas.add(match[1]);
      }
    }
    
    return pdas;
  }

  private buildSetupPDAMap(setupInstructions: SetupInstruction[]): Map<string, string> {
    const map = new Map<string, string>();
    
    for (const setup of setupInstructions) {
      for (const acc of setup.instruction.accounts) {
        if (acc.pda) {
          map.set(acc.name, `${acc.name}Pda`);
        }
      }
    }
    
    return map;
  }

  private makeValueUnique(value: string, testCounter: number): string {
    if (value.includes("new anchor.BN(")) {
      return value.replace(/new anchor\.BN\((\d+)\)/, `new anchor.BN(${testCounter})`);
    }
    
    if (value.startsWith('"') && value.endsWith('"')) {
      const content = value.slice(1, -1);
      if (content === "") return value;
      return `"${content}_${testCounter}"`;
    }
    
    return value;
  }

  private generateTestLevelPDAs(instruction: Instruction, scopePDANames: Set<string>, setupPDANames: Set<string>, testCounter: number): string {
    const pdas: string[] = [];

    for (const acc of instruction.accounts) {
      if (!acc.pda) continue;

      if (scopePDANames.has(acc.name) || setupPDANames.has(acc.name)) continue;

      const result = this.seedProcessor.processSeeds(acc.pda.seeds, instruction.args);
      
      if (result.usesArgs) {
        const seedsCode = result.expressions.map(e => `      ${e}`).join(",\n");
        pdas.push(
          `    const [${acc.name}Pda] = anchor.web3.PublicKey.findProgramAddressSync(\n` +
          `      [\n${seedsCode}\n      ],\n` +
          `      program.programId\n` +
          `    );`
        );
      }
    }

    return pdas.length > 0 ? "\n" + pdas.join("\n") + "\n" : "";
  }

  private generateAccountsObject(accounts: Account[], isFailure: boolean, setupPDAMap: Map<string, string> = new Map()): string {
    return accounts
      .map(acc => {
        const key = toCamelCase(acc.name);
        
        if (acc.address || acc.name === "system_program") {
          return `        ${key}: anchor.web3.SystemProgram.programId`;
        }
        
        if (acc.signer) {
          return `        ${key}: ${isFailure ? "anchor.web3.Keypair.generate().publicKey" : "provider.wallet.publicKey"}`;
        }
        
        if (acc.pda) {
          return `        ${key}: ${acc.name}Pda`;
        }
        
        const setupPDA = setupPDAMap.get(acc.name);
        if (setupPDA) {
          return `        ${key}: ${setupPDA}`;
        }
        
        return `        ${key}: provider.wallet.publicKey`;
      })
      .join(",\n");
  }

  private generateArgDeclarations(args: Arg[], testCase: "success" | "edge", skipVars?: Set<string>, testCounter: number = 1): string {
    if (args.length === 0) return "";
    
    const decls = args
      .filter(arg => {
        const varName = arg.name.startsWith("_") ? arg.name.slice(1) : arg.name;
        return !skipVars || !skipVars.has(varName);
      })
      .map(arg => {
        const varName = arg.name.startsWith("_") ? arg.name.slice(1) : arg.name;
        const value = this.generateArgValue(arg, testCase, testCounter);
        return `const ${varName} = ${value};`;
      });
    
    if (decls.length === 0) return "";
    
    return `\n    ${decls.join("\n    ")}\n`;
  }

  private generateArgValue(arg: Arg, testCase: "success" | "edge", testCounter: number = 1): string {
    const argType = typeof arg.type === "string" ? arg.type : arg.type.kind;
    const name = arg.name.toLowerCase();
    
    if (testCase === "edge") {
      if (argType === "u64" || argType === "i64") return "new anchor.BN(0)";
      if (argType === "string") return '""';
      return "0";
    }
    
    if (argType === "u64" || argType === "i64") return `new anchor.BN(${testCounter})`;
    if (argType === "string") {
      let baseValue = '"test"';
      if (name.includes("title")) baseValue = '"Test Title"';
      else if (name.includes("message")) baseValue = '"Test message"';
      else if (name.includes("description")) baseValue = '"Test description"';
      else if (name.includes("name")) baseValue = '"Test"';
      else if (name.includes("color")) baseValue = '"blue"';
      else if (name.includes("candidate")) baseValue = '"Alice"';
      
      if (baseValue === '""') return baseValue;
      return baseValue.slice(0, -1) + `_${testCounter}"`;
    }
    
    return "1";
  }

  private generateMethodArgs(args: Arg[]): string {
    return args.map(arg => {
      const varName = arg.name.startsWith("_") ? arg.name.slice(1) : arg.name;
      return varName;
    }).join(", ");
  }

  private getAction(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("create") || n.includes("init")) return "create";
    if (n.includes("update")) return "update";
    if (n.includes("delete")) return "delete";
    if (n.includes("add")) return "add";
    if (n.includes("vote")) return "cast vote for";
    return name.replace(/_/g, " ");
  }

  private getSubject(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("poll")) return "a poll";
    if (n.includes("candidate")) return "a candidate";
    if (n.includes("entry") || n.includes("journal")) return "a journal entry";
    if (n.includes("favorite")) return "favorites";
    return "data";
  }

  private wrapTests(programName: string, tests: string[], scopePDAs: string[]): string {
    const title = toTitleCase(programName);
    const pdaSection = scopePDAs.length > 0 ? "\n" + scopePDAs.join("\n") + "\n" : "";
    
    return `import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ${title} } from "../target/types/${programName}";

describe("${programName}", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.${title} as Program<${title}>;
${pdaSection}
${tests.join("\n\n")}
});
`;
  }
}