## What

Adds `specs/schemes/contingent/` (chain-agnostic spec + EVM/EIP-3009 instantiation), per the recommended scheme-proposal flow in CONTRIBUTING.md: propose via PR, discuss architecture here, implement after merge.

**Status: Draft 0.** Not implemented; conformance vectors not yet pinned. Opening early for architectural discussion.

## Why

The fairness work currently tracked here — buyer-side escrow (#2222, #1247, PR #2298), delivery receipts (#1195, #2357, #2740), arbitration (#2001), risk signaling (#1594) — is compensatory: it detects or remediates payment-without-delivery after the fact. `contingent` makes that failure state unconstructible instead: the client's payment authorization is an adaptor pre-signature, and the server completing it (a) settles through the existing rail unchanged and (b) reveals the decryption key for an already-delivered ciphertext. No escrow, no held state, no refund path — settled ⇒ delivered, by construction.

Key properties:

- **Zero on-chain changes** — `transferWithAuthorization` receives a completed, standard ECDSA signature; all novelty is in client construction, server completion, and facilitator `/verify`.
- **The EIP-3009 nonce becomes the quote binding** (`keccak256(quoteId ‖ keyCommitment ‖ bindingCommitment ‖ resource.url ‖ chainId)`) — one authorization is completable for exactly one offer/price/payee/resource, and at-most-once settlement falls out of existing nonce consumption.
- **Batch-settlement compatible** — the `SettlementResponse` echoes the completed signature so key extraction survives aggregation.
- **Composes with receipts/arbitration rather than replacing them** — a binding mismatch yields a self-contained evidence bundle (#1195 / #2001 can consume it). Wrong-but-well-formed answers are explicitly out of scope for the scheme.

Honest costs (stated in the spec): +1 round trip vs `exact` (amortizable under V2 sessions); the griefing surface moves from buyer to seller (server computes before payment is assured); clients need new signing-side SDK surface (adaptor pre-signature + DLEQ).

## Prior art

- **zkCP** (Maxwell, 2011 concept / 2016 execution): payment-completion-reveals-key.
- **Adaptor signatures**: atomic-swap literature; ECDSA variants need a DLEQ completability proof (Moreno-Sanchez et al., Aumayr et al.).
- **A402** (arXiv:2603.01179, 2026): TEE-assisted Schnorr adaptor signatures binding x402 payments to execution — same witness-reveal atomicity, traded against hardware trust, ~2,875 req/s. Not currently referenced in this repo; this proposal is the no-TEE, zero-on-chain-changes variant.

## Questions for maintainers

1. Is a new scheme the right extension point, or should this be shaped as an extension over `exact`?
2. How does this relate to the deferred/conditional settlement roadmap item?
3. ECDSA adaptors are subtle — is pinning a versioned construction (`ecdsa-secp256k1-v1`) + conformance vectors the right contract, and where should those vectors live?

Happy to iterate here or reshape per feedback.

*Acknowledgment: the quote-binding invariant ("never authorize spend from a 402 body alone" — the manifest-version commitment in the nonce construction) was sharpened by feedback from @0xbrainkid on our tracking issue (tatinc23/MCPify#2).*
