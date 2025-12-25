import fs from "fs";
import path from "path";

console.log("soltest started");

// path: target/idl
const idlDir = path.join(process.cwd(), "target", "idl");

if (!fs.existsSync(idlDir)) {
  console.error(" target/idl folder not found");
  process.exit(1);
}

const files = fs.readdirSync(idlDir).filter((f) => f.endsWith(".json"));

if (files.length === 0) {
  console.error("No IDL files found");
  process.exit(1);
}

const idlPath = path.join(idlDir, files[0]);
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

const programName = path.basename(files[0], ".json");

console.log(" Program name:", programName);
const instructions = idl.instructions;

if (!instructions || instructions.length === 0) {
  console.error("No instructions found in IDL");
  process.exit(1);
}

const ix = instructions[0];

console.log("Instruction:", ix.name);

console.log("Accounts:");
ix.accounts.forEach((acc: any) => {
  const flags = [];
  if (acc.isSigner) flags.push("signer");
  if (acc.isMut) flags.push("mut");

  console.log(`- ${acc.name} (${flags.join(", ") || "readonly"})`);
});

console.log("Args:");
ix.args.forEach((arg: any) => {
  console.log(`- ${arg.name}: ${arg.type}`);
});
// ---- Part 4: signer detection ----

const signerAccounts = ix.accounts.filter((acc: any) => acc.isSigner);

let primarySigner: string;

if (signerAccounts.length === 0) {
  primarySigner = "provider.wallet (default)";
} else {
  primarySigner = signerAccounts[0].name;
}

console.log("Signer accounts:");
if (signerAccounts.length === 0) {
  console.log("- none (using provider.wallet)");
} else {
  signerAccounts.forEach((acc: any) => {
    console.log(`- ${acc.name}`);
  });
}

console.log("Primary signer for tests:", primarySigner);
// : account classification ----

const PROGRAM_ACCOUNTS = new Set([
  "system_program",
  "token_program",
  "token_2022_program",
  "associated_token_program",
  "rent",
]);

type AccountKind = "program" | "signer" | "pda" | "user";

const classifiedAccounts = ix.accounts.map((acc: any) => {
  let kind: AccountKind = "user";

  if (PROGRAM_ACCOUNTS.has(acc.name)) {
    kind = "program";
  } else if (acc.isSigner) {
    kind = "signer";
  } else if (!acc.isSigner) {
    // MVP assumption: non-signer, non-program accounts are PDAs
    kind = "pda";
  }

  return {
    name: acc.name,
    kind,
    isMut: acc.isMut,
  };
});

console.log("Account classification:");
classifiedAccounts.forEach((acc) => {
  const flags = [];
  if (acc.isMut) flags.push("mut");

  console.log(
    `- ${acc.name} → ${acc.kind}${flags.length ? " (" + flags.join(", ") + ")" : ""}`
  );
});
