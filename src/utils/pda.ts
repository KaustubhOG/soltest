import { Seed, Arg } from "../types/idl";

export class SeedProcessor {
  processSeeds(seeds: Seed[], args: Arg[]) {
    const expressions: string[] = [];
    let usesArgs = false;

    for (const seed of seeds) {
      if (seed.kind === "const" && Array.isArray(seed.value)) {
        expressions.push(`Buffer.from([${seed.value.join(", ")}])`);
      } else if (seed.kind === "account") {
        expressions.push("provider.wallet.publicKey.toBuffer()");
      } else if (seed.kind === "arg") {
        const arg = args.find(a => a.name === seed.path || a.name === `_${seed.path}`);
        if (!arg) continue;

        const name = arg.name.startsWith("_") ? arg.name.slice(1) : arg.name;
        const type = typeof arg.type === "string" ? arg.type : arg.type.kind;

        if (type === "u64" || type === "i64") {
          expressions.push(`Buffer.from(${name}.toArrayLike(Buffer, "le", 8))`);
        } else if (type === "string") {
          expressions.push(`Buffer.from(${name})`);
        }

        usesArgs = true;
      }
    }

    return { expressions, usesArgs };
  }
}
