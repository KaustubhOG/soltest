import fs from "fs";
import path from "path";
import { IDL } from "../types/idl";

export function loadIDL(): { idl: IDL; programName: string } {
  const dir = path.join(process.cwd(), "target", "idl");
  if (!fs.existsSync(dir)) throw new Error("target/idl not found");

  const file = fs.readdirSync(dir).find(f => f.endsWith(".json"));
  if (!file) throw new Error("No IDL found");

  const idl = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
  return { idl, programName: path.basename(file, ".json") };
}
