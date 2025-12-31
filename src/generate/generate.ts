import fs from "fs";
import path from "path";
import readline from "readline";
import { loadIDL } from "./idl-reader";
import { TestGenerator } from "./template";
import { findExistingTests } from "../utils/fs";

export class CLI {
  private forceMode = false;
  private testsRoot: string;
  private soltestDir: string;
  private existingTests: string[] = [];

  constructor() {
    this.testsRoot = path.join(process.cwd(), "tests");
    this.soltestDir = path.join(this.testsRoot, "soltest");
  }

  async run(args: string[]): Promise<void> {
    const [cmd, ...flags] = args;

    if (cmd !== "generate") {
      console.error("Usage: soltest generate [--force]");
      process.exit(1);
    }

    this.forceMode = flags.includes("--force");
    console.log("soltest generate\n");

    try {
      this.detectExistingTests();
      const { idl, programName } = loadIDL();
      
      console.log(`Program: ${programName}`);
      console.log(`Instructions: ${idl.instructions.length}\n`);

      const generator = new TestGenerator();
      const testCode = generator.generate(idl, programName);

      await this.handleExistingTests();
      this.writeTestFile(programName, testCode);

      console.log("\nDone! Run 'anchor test'");
    } catch (error) {
      console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  private detectExistingTests(): void {
    if (!fs.existsSync(this.testsRoot)) return;

    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (full.startsWith(this.soltestDir)) continue;
        
        if (fs.statSync(full).isDirectory()) {
          walk(full);
        } else if (f.endsWith(".ts")) {
          this.existingTests.push(full);
        }
      }
    };

    walk(this.testsRoot);
  }

  private async handleExistingTests(): Promise<void> {
    if (this.existingTests.length === 0) return;

    const choice = await this.askUser();

    if (choice === "delete") {
      this.existingTests.forEach(f => {
        try {
          fs.unlinkSync(f);
        } catch {}
      });
      console.log("Cleaned up old tests");
    }
  }

  private async askUser(): Promise<"continue" | "delete"> {
    if (this.forceMode) return "delete";

    console.log("Existing tests found:");
    this.existingTests.forEach(f => console.log(`  ${path.relative(process.cwd(), f)}`));

    console.log("\n1) Keep  2) Delete (recommended)");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question("Choice: ", ans => {
        rl.close();
        resolve(ans.trim() === "2" ? "delete" : "continue");
      });
    });
  }

  private writeTestFile(programName: string, testCode: string): void {
    fs.mkdirSync(this.soltestDir, { recursive: true });
    const outPath = path.join(this.soltestDir, `${programName}.test.ts`);
    fs.writeFileSync(outPath, testCode);
    console.log(`\nGenerated: ${path.relative(process.cwd(), outPath)}`);
  }
}