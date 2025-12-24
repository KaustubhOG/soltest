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
