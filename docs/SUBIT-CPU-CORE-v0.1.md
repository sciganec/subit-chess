# SUBIT-CPU Core v0.1 — Executable Reference

Status: **prototype / executable specification**  
Target branch: `work/subit-cpu-core-v0.1`

## Scope

This module is the first executable CPU slice for SUBIT-CHESS v3.0. It provides a deterministic 16-bit instruction interpreter, typed register banks, a unified 16-bit address space, Belnap FOUR operations, instruction-level commit/abort records, and a small regression suite.

It does **not** yet execute chess search or replace the chess engine embedded in `index.html`. The current engine remains the reference chess rules/search implementation. The next integration stage must connect CPU programs to the Chess Unit through a versioned ABI.

## FOUR representation

A FOUR cell is a pair of evidence rails:

- `N = 00`
- `F = 01`
- `T = 10`
- `B = 11`

A FOUR_WORD contains eight cells in most-significant-first order. RF has eight FOUR_WORD registers. URF has four unsigned 16-bit registers; SRF has four signed 32-bit registers.

Operations are cell-wise:

- NOT(t,f) = (f,t)
- AND((t₁,f₁),(t₂,f₂)) = (t₁ ∧ t₂, f₁ ∨ f₂)
- OR((t₁,f₁),(t₂,f₂)) = (t₁ ∨ t₂, f₁ ∧ f₂)
- SJOIN = component-wise OR (knowledge join)
- SMEET = component-wise AND (knowledge meet)

No collapse of B or N into Boolean true/false is performed.

## Instruction encoding

Base instruction word:

`OP[15:11] RD[10:8] RA[7:5] RB[4:2] AUX[1:0]`

An immediate instruction consumes the next 16-bit word. The current immediate set is LOADI, SETAR, JMP, JN, JF, JT, JB, CALL.

Implemented opcodes:

| Opcode | Operation | Semantics in v0.1 |
|---|---|---|
| NOP | no-op | advances PC |
| MOV | RF[RD] ← RF[RA] | FOUR_WORD copy |
| NOT | RF[RD] ← NOT RF[RA] | cell-wise |
| AND / OR | RF[RD] ← RF[RA] op RF[RB] | Belnap truth operations |
| SJOIN / SMEET | knowledge join / meet | cell-wise |
| BXOR / NAND / NOR | FOUR extensions | cell-wise |
| SHL / SHR / ROTATE | bit operations | shift count = AUX + 1 |
| LOAD / STORE | memory ↔ RF | address in AR |
| LOADI | URF[RD mod 4] ← imm16 | consumes extension word |
| SETAR | AR ← imm16 | consumes extension word |
| JMP | PC ← imm16 | absolute word address |
| JN / JF / JT / JB | conditional branch | branch if any of RF[RA]'s eight cells equals N/F/T/B |
| EMIT | append RF[RA] | output event |
| HALT | stop | successful halt |
| CMP / EQ | equality | all eight output cells become T if RF[RA] = RF[RB], otherwise F |
| FILL | RF[RD] ← repeated AUX cell | AUX selects N/F/T/B |
| CALL | push return PC; jump to imm16 | immediate absolute target |
| RET | pop PC | returns to saved word address |
| PUSH | push RF[RA] | descending 16-bit memory stack |
| POP | RF[RD] ← pop | descending 16-bit memory stack |
| TRAP | abort | AUX is the trap code |

TRAP retains opcode `0x1F`. The branch predicate and CMP/EQ alias are provisional v0.1 semantics and must be reviewed before freezing the ISA.

## Execution and fault model

The stack pointer (SP) initializes to 0xFFFF and grows downward. PUSH/CALL write at SP then decrement; POP/RET increment SP then read. CALL saves the PC after its extension word. Stack writes are journaled and rolled back on an aborted instruction. Stack bounds are checked, but stack/code collision protection is not yet implemented.\n\nEach `step()` performs fetch → decode → execute → commit. A committed instruction increments the instruction clock and appends a journal/provenance record. On a fault, architectural registers and any memory writes made by the instruction are restored, the instruction clock does not advance, and an ABORTED trap record is retained.

The interpreter rejects out-of-range PC and missing immediate words. Sequential execution does not silently wrap past address `0xFFFF`. Immediate targets remain 16-bit absolute addresses.

The current memory model is a single `Uint16Array(65536)`; code/data protection, memory-mapped device regions, capability handles, durable transaction reservations, and crash recovery are not yet implemented.

## Run tests

`node tests/cpu.test.js`

The legacy suite and runner now point to the current root `index.html` instead of the missing `src/subit_chess_v1.9.1.html`.

## Acceptance gates before v0.2

1. Execute this test suite in CI on Node 20+.
2. Add typed memory regions and explicit access validation.
3. Freeze and test instruction semantics (especially branches, CMP, shifts).
4. Define the Chess Unit ABI and a deterministic host-call boundary.
5. Demonstrate a CPU-executed chess command before claiming CPU-native search.

## SUBIT-CPU extended integer page (v0.2 prototype)

The all-ones word `0xFFFF` is the extended-instruction prefix. It is followed by one 16-bit extension word:

`XOP[15:12] RD[11:10] RA[9:8] RB[7:6] IMM6[5:0]`

The prefix is reserved and cannot be used as the ordinary `TRAP` encoding. Other TRAP words retain their v0.1 behavior.

Extended operations use the typed integer banks (URF: four unsigned 16-bit registers; SRF: four signed 32-bit registers):

- `UADD, USUB, UMUL, UDIV`: unsigned arithmetic; divide-by-zero traps.
- `UAND, UOR, UXOR, UNOT`: unsigned bitwise operations.
- `UADDI, USUBI`: signed 6-bit immediate arithmetic.
- `UCMP`: compare URF[RA] and URF[RB], updating FLAGS.
- `XBR`: conditional relative branch using the latest FLAGS; RD condition 0=Z, 1=NZ, 2=N, 3=C; IMM6 is signed displacement from the PC after the extension word.
- `SADD, SSUB, SMUL, SDIV`: signed 32-bit arithmetic; divide-by-zero traps.

FLAGS bits: Z=1, N=2, C=4, V=8. For unsigned add/multiply C indicates carry; for unsigned subtract C indicates borrow. V currently records overflow for signed add/subtract. These flag conventions are prototype semantics and require broader edge-case verification before ISA freeze.

CALL/RET and PUSH/POP use a descending memory stack with SP initialized to 0xFFFF. CALL saves the return PC after its immediate extension word. Stack operations are transactional with memory and SP rollback on faults. Memory protection and stack/code collision detection remain future work.

The extended page is a prototype extension, not yet a frozen ISA. In particular, instruction timing, signed immediate corner cases, and full flag semantics remain open for audit.

## Executable control-flow example

`examples/cpu_native_loop.js` demonstrates a loop executed entirely by the CPU interpreter: initialize a counter, increment it with UADDI, compare with UCMP, and branch backward with XBR until the equality flag is set. It is a CPU-native integer-control-flow proof, not yet a chess-search program.
