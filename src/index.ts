import { CLI } from "./generate/generate";

const [, , ...args] = process.argv;
new CLI().run(args);
