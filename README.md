# soltest

**Automatic end-to-end test generator for Solana Anchor programs**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/soltest.svg)](https://www.npmjs.com/package/soltest)

soltest reads your Anchor IDL and generates working, runnable integration tests in TypeScript for Solana programs—without writing tests by hand. It's designed to lower the barrier to entry for Solana development and establish testing best practices from day one.

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Example Output](#example-output)
- [Project Architecture](#project-architecture)
- [Supported Program Types](#supported-program-types)
- [Limitations & Roadmap](#limitations--roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The Problem

Writing comprehensive tests for Anchor programs is one of the **biggest barriers** for new Solana developers:

| Challenge | Impact |
|-----------|--------|
| **PDA Derivation** | Hard to get seeds and bumps right, leading to runtime failures |
| **Instruction Ordering** | Setup → Action → Assert flows are non-obvious for beginners |
| **Signer Validation** | Testing authorization logic requires deep understanding of accounts |
| **Boilerplate Overhead** | Repetitive account setup discourages thorough testing |

**The Result:**
- 🚫 Many developers skip testing entirely
- 📋 Copy-pasted test snippets that don't match their program
- 😞 Early frustration leads to abandoning projects
- 🐛 Production deployments with untested edge cases

**soltest eliminates these blockers by automatically generating correct, runnable tests from your compiled program.**

---

## The Solution

soltest analyzes your Anchor IDL and generates three categories of tests:

1. **✅ Success Path Tests** – Verify instructions execute correctly with valid inputs
2. **❌ Authorization Tests** – Ensure unauthorized signers are rejected
3. **⚠️ Edge Case Tests** – Test boundary conditions and error handling

### Key Principles

- **Zero Assumptions**: No hardcoded templates or program-specific logic
- **IDL-First**: Everything is derived from your program's interface
- **Real On-Chain Testing**: Tests run on localnet/devnet, not mocks
- **Developer-Friendly**: Simple CLI, clear output, minimal configuration

---

## Features

### ✨ Core Capabilities

- 🔍 **Automatic IDL Analysis** – Parses instructions, accounts, and constraints
- 🧩 **Smart PDA Derivation** – Correctly handles seeds from multiple sources
- 🔄 **Flow Detection** – Identifies CRUD patterns (Create/Update/Delete)
- 📝 **TypeScript Generation** – Produces clean, readable test files
- 🎯 **Account Resolution** – Automatically resolves account relationships
- ⚡ **Zero Configuration** – Works out of the box with `anchor build`

### 🎨 Generated Test Types

```typescript
// Success tests
✅ Creates accounts with valid parameters
✅ Updates state correctly
✅ Deletes accounts and recovers rent

// Authorization tests  
❌ Rejects unauthorized signers
❌ Validates owner constraints
❌ Enforces account ownership

// Edge case tests
⚠️ Handles empty strings
⚠️ Tests maximum value boundaries
⚠️ Validates required fields
```

---

## Installation

### Global Installation (Recommended)

```bash
npm install -g soltest
```

### Via npx (No Installation)

```bash
npx soltest generate
```

### Requirements

- Node.js ≥ 16
- Anchor CLI ≥ 0.28.0
- A compiled Anchor program with IDL

---

## Quick Start

### 1️⃣ Build Your Anchor Program

```bash
anchor build
```

This generates `target/idl/<program_name>.json`

### 2️⃣ Generate Tests

```bash
soltest generate
```

or

```bash
npx soltest generate
```

**What happens:**
- Detects your program from `Anchor.toml`
- Analyzes the IDL structure
- Generates tests in `tests/soltest/<program_name>.test.ts`
- Prompts before overwriting existing tests

### 3️⃣ Run Tests

```bash
anchor test
```

**That's it.** Your program now has comprehensive test coverage.

---

## How It Works

### Architecture Overview

```
┌─────────────────┐
│  Anchor Build   │
│  (IDL Output)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   IDL Reader    │──► Parses JSON structure
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Instruction    │──► Detects patterns (CRUD, voting, etc.)
│    Parser       │──► Resolves account relationships
└────────┬────────┘    Identifies PDA seeds
         │
         ▼
┌─────────────────┐
│     Template    │──► Generates TypeScript tests
│    Generator    │──► Creates success/failure scenarios
└────────┬────────┘    Injects account mocking
         │
         ▼
┌─────────────────┐
│  tests/soltest/ │
│  *.test.ts      │──► Ready to run with `anchor test`
└─────────────────┘
```

### Example Flow: Journal Program

**Input IDL:**
```json
{
  "instructions": [
    {
      "name": "createJournalEntry",
      "accounts": [
        { "name": "journalEntry", "isMut": true, "isSigner": false },
        { "name": "owner", "isMut": true, "isSigner": true }
      ],
      "args": [
        { "name": "title", "type": "string" },
        { "name": "message", "type": "string" }
      ]
    }
  ]
}
```

**Generated Test:**
```typescript
it("successfully creates a journal entry", async () => {
  const title = "Test Entry";
  const message = "Hello World";

  // PDA derivation automatically generated
  const [journalEntryPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(title), provider.wallet.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .createJournalEntry(title, message)
    .accounts({
      journalEntry: journalEntryPda,
      owner: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  // Future: State assertions will be added here
  const account = await program.account.journalEntry.fetch(journalEntryPda);
  assert.equal(account.title, title);
});
```

---

## Example Output

### Sample Generated Test Suite

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Favorites } from "../target/types/favorites";
import { assert } from "chai";

describe("favorites", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Favorites as Program<Favorites>;

  it("creates a favorites entry", async () => {
    const user = provider.wallet.publicKey;
    const [favoritesPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("favorites"), user.toBuffer()],
      program.programId
    );

    await program.methods
      .setFavorites(42, "solana", "pizza")
      .accounts({
        favorites: favoritesPda,
        user: user,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.favorites.fetch(favoritesPda);
    assert.equal(account.number, 42);
  });

  it("rejects unauthorized signer", async () => {
    const wrongSigner = anchor.web3.Keypair.generate();
    const [favoritesPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("favorites"), wrongSigner.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .setFavorites(42, "solana", "pizza")
        .accounts({
          favorites: favoritesPda,
          user: wrongSigner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wrongSigner])
        .rpc();
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.include(err.message, "unknown signer");
    }
  });
});
```

---

## Project Architecture

```
src/
├── generate/
│   ├── generate.ts      # Main test generation pipeline
│   ├── idl-reader.ts    # IDL parsing and validation
│   ├── parser.ts        # Instruction analysis and pattern detection
│   └── template.ts      # Test template generation (success/failure/edge)
│
├── types/
│   └── idl.ts           # TypeScript interfaces for Anchor IDL
│
├── utils/
│   ├── fs.ts            # File system operations
│   ├── log.ts           # Logging utilities
│   └── pda.ts           # PDA seed extraction and derivation
│
└── index.ts             # CLI entry point
```

### Key Design Decisions

| Module | Responsibility | Why |
|--------|----------------|-----|
| **idl-reader** | Parse and validate IDL JSON | Single source of truth for program structure |
| **parser** | Detect CRUD patterns and relationships | Enables smart test generation without hardcoding |
| **template** | Generate TypeScript test code | Modular templates support future customization |
| **pda** | Handle seed derivation logic | Critical for correct account resolution |

---

## Supported Program Types

### ✅ Fully Supported (MVP)

| Program Type | Example Use Case | Test Coverage |
|--------------|------------------|---------------|
| **Simple PDA** | Favorites, profiles | ✅ Create, Update |
| **CRUD Apps** | To-do lists, notes | ✅ Create, Read, Update, Delete |
| **Voting Systems** | Polls, proposals | ✅ Initialize, Vote, Close |
| **Counter Programs** | Analytics, metrics | ✅ Initialize, Increment, Reset |

### 🚧 Partial Support

- **Multi-PDA Programs**: Basic support (manual hints may be needed)
- **CPI-Heavy Programs**: Works for simple cases (escrow planned for v2)

### 📋 Tested Examples

soltest has been verified on real-world Anchor programs:

- ✅ [Favorites Program](https://github.com/solana-developers/program-examples)
- ✅ [Journal CRUD App](https://github.com/solana-developers/program-examples)
- ✅ [Voting Program](https://github.com/solana-developers/program-examples)

All generated tests pass with `anchor test` on localnet.

---

## Limitations & Roadmap

### Current Limitations (Acceptable for MVP)

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| **Complex CPIs** | Escrow/vault programs need manual setup | Post-MVP: CPI graph analysis |
| **State Assertions** | Tests verify execution, not state changes | Post-MVP: Auto-generate `assert` calls |
| **Custom Ordering** | Multi-step flows use heuristics | Post-MVP: Configurable instruction ordering |

These are **explicit design choices** for MVP scope, not bugs.

### Roadmap

#### 🎯 Version 1.1 (Q2 2024)
- [ ] State assertion generation
- [ ] Enhanced error message parsing
- [ ] Support for custom account types

#### 🎯 Version 2.0 (Q3 2024)
- [ ] Escrow/vault/CPI-heavy programs
- [ ] Plugin system for custom templates
- [ ] Interactive mode for instruction ordering
- [ ] Program-type presets (marketplace, AMM, escrow)

#### 🎯 Version 3.0 (Q4 2024)
- [ ] Integration with Anchor test framework v0.30+
- [ ] Visual test coverage reports
- [ ] Mutation testing support

---

## Why This Deserves Grant Support

### 🎯 Impact on Solana Ecosystem

1. **Lowers Barrier to Entry**
   - Testing is the #1 blocker for new developers
   - soltest removes this friction entirely

2. **Establishes Best Practices**
   - Encourages testing from day one
   - Promotes security-first development culture

3. **Accelerates Development**
   - Saves hours of boilerplate writing
   - Lets developers focus on business logic

4. **Improves Code Quality**
   - Generated tests catch bugs early
   - Reduces production incidents

### 📊 Measurable Goals

| Metric | Target (6 months) | Impact |
|--------|-------------------|--------|
| **Weekly Downloads** | 500+ | Adoption by active Anchor developers |
| **GitHub Stars** | 250+ | Community validation |
| **Programs Tested** | 1,000+ | Real-world usage |
| **Reduced Test Time** | 80% | Developer productivity |

### 🛠️ Technical Merit

- **No Mocking**: Tests run on real chain (localnet/devnet)
- **IDL-Driven**: Future-proof as Anchor evolves
- **Modular Design**: Easy to extend and customize
- **Zero Config**: Works out of the box

### 🌱 Ecosystem Alignment

- Complements Anchor's mission to simplify Solana development
- Reduces developer churn during onboarding
- Creates a culture of tested, production-ready code

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone repository
git clone https://github.com/KaustubhOG/soltest
cd soltest

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test
```

### Areas for Contribution

- 🐛 Bug reports and fixes
- 📚 Documentation improvements
- ✨ New program type support
- 🎨 Template enhancements
- 🧪 Test coverage expansion

---

## License

MIT © [Kaustubh Ogale](https://github.com/KaustubhOG)

---

## Links

- **GitHub**: [github.com/KaustubhOG/soltest](https://github.com/KaustubhOG/soltest)
- **npm**: [npmjs.com/package/soltest](https://www.npmjs.com/package/soltest)
- **Documentation**: [Coming Soon]
- **Issues**: [github.com/KaustubhOG/soltest/issues](https://github.com/KaustubhOG/soltest/issues)

---

<div align="center">

**Built with ❤️ for the Solana developer community**

[⭐ Star on GitHub](https://github.com/KaustubhOG/soltest) | [📦 Install via npm](https://www.npmjs.com/package/soltest) | [🐛 Report Bug](https://github.com/KaustubhOG/soltest/issues)

</div>
