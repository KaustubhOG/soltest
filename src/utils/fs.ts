import fs from "fs";
import path from "path";

export function findExistingTests(root: string, ignore: string): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (p.startsWith(ignore)) continue;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".ts")) out.push(p);
    }
  };

  if (fs.existsSync(root)) walk(root);
  return out;
}
