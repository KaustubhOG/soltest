import { Instruction, Account } from "../types/idl";

export class InstructionAnalyzer {
  categorize(instruction: Instruction): "create" | "modify" | "delete" | "other" {
    const name = instruction.name.toLowerCase();
    
    if (name.includes("init") || name.includes("create") || name.includes("add")) {
      const createsPDA = instruction.accounts.some(acc => 
        acc.pda && acc.writable && !this.isExternalReference(acc, instruction)
      );
      if (createsPDA) return "create";
    }
    
    if (name.includes("update")) return "modify";
    if (name.includes("delete") || name.includes("close")) return "delete";
    
    const hasExternalPDA = instruction.accounts.some(acc => 
      acc.pda && this.isExternalReference(acc, instruction)
    );
    
    if (hasExternalPDA) return "modify";
    
    return "other";
  }

  private isExternalReference(account: Account, instruction: Instruction): boolean {
    if (!account.pda) return false;
    
    for (const seed of account.pda.seeds) {
      if (seed.kind === "arg") {
        const argExists = instruction.args.some(a => 
          a.name === seed.path || a.name === `_${seed.path}`
        );
        if (!argExists) return true;
      }
    }
    
    return false;
  }

  findDependencies(instruction: Instruction, allInstructions: Instruction[]): Instruction[] {
    const deps: Instruction[] = [];
    const category = this.categorize(instruction);
    
    if (category !== "create") {
      for (const acc of instruction.accounts) {
        if (!acc.pda) continue;
        
        for (const otherIx of allInstructions) {
          if (otherIx.name === instruction.name) continue;
          
          const otherCategory = this.categorize(otherIx);
          if (otherCategory === "create") {
            const createsCompatiblePDA = otherIx.accounts.some(otherAcc => 
              otherAcc.pda && this.arePDAsCompatible(acc, otherAcc, instruction, otherIx)
            );
            
            if (createsCompatiblePDA && !deps.includes(otherIx)) {
              deps.push(otherIx);
            }
          }
        }
      }
    }
    
    return deps;
  }

  private arePDAsCompatible(acc1: Account, acc2: Account, ix1: Instruction, ix2: Instruction): boolean {
    if (!acc1.pda || !acc2.pda) return false;
    
    const seeds1 = acc1.pda.seeds;
    const seeds2 = acc2.pda.seeds;
    
    if (seeds1.length !== seeds2.length) return false;
    
    for (let i = 0; i < seeds1.length; i++) {
      const s1 = seeds1[i];
      const s2 = seeds2[i];
      
      if (s1.kind !== s2.kind) return false;
      
      if (s1.kind === "const") {
        if (JSON.stringify(s1.value) !== JSON.stringify(s2.value)) return false;
      }
    }
    
    return true;
  }
}