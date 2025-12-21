# soltest
Generate Anchor tests from IDL. One command. No boilerplate.


## Project Structure
```
soltest/
├── bin/
│   └── soltest.js          # CLI entry (npx soltest)
├── src/
│   ├── index.ts            # command dispatcher (generate)
│   ├── generate/
│   │   ├── generate.ts     # main generator logic
│   │   ├── idl-reader.ts   # reads target/idl/*.json
│   │   ├── parser.ts       # parses instructions, accounts, signers
│   │   └── template.ts     # test file templates
│   ├── utils/
│   │   ├── pda.ts          # PDA helpers
│   │   ├── fs.ts           # file system helpers
│   │   └── log.ts          # CLI logs
│   └── types/
│       └── idl.ts          # IDL typings
├── examples/
│   └── basic-anchor/       # sample Anchor program
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```
