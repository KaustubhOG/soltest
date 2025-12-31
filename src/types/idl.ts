export interface Seed {
  kind: "const" | "account" | "arg";
  value?: number[] | string;
  path?: string;
}

export interface Account {
  name: string;
  writable?: boolean;
  signer?: boolean;
  pda?: { seeds: Seed[] };
  address?: string;
}

export interface Arg {
  name: string;
  type: string | { kind: string };
}

export interface Instruction {
  name: string;
  accounts: Account[];
  args: Arg[];
}

export interface IDL {
  instructions: Instruction[];
  metadata?: { name: string };
}

export interface SetupInstruction {
  instruction: Instruction;
  methodName: string;
  args: Map<string, string>;
  pdas: string[];
}