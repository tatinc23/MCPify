# CLAUDE.md — MCPify

## What this is
Monetization middleware for the agentic web: multi-tenant Cloudflare Workers that turn any MCP server
into a paid storefront via the **x402** payment protocol + **Stripe Connect** (fiat payouts) + USDC-on-Base
batch settlement. Two components: the platform **settlement worker** (repo root `src/`) and a complete
tenant **blueprint** (`restaurant-mcp/`).

## Stack / deploy
- Cloudflare Workers, D1 (`SETTLEMENT_DB` = x402-settlement-ledger), KV (`PLATFORM_KV`), Queues (`settlement-ingest`).
- Root worker: `x402-settlement-worker` (`wrangler.toml`). Binding IDs are placeholders — supply at deploy.
- Settlement: `queue()` ingests vouchers → D1 ledger; `scheduled()` 5-min cron compresses + settles
  (USDC batch via EIP-3009 / Stripe transfer).
- Stripe: use `constructEventAsync` in Workers (sync `constructEvent` throws — SubtleCrypto). See `docs/stripe-webhook.md`.

## Positioning (intent — honor or flag)
- **x402-Quantum (`docs/x402-quantum-spec-*.md`) is a SPECULATIVE design essay, never a solved/shipped protocol.**
  Composes known primitives (zkCP, adaptor sigs, FHE, VDF). Keep its Status disclaimer intact. See memory
  `x402-quantum-is-a-design-essay.md`.
- **The `contingent` scheme is real, submitted upstream** (x402-foundation/x402#2834), draft 0, conformance
  vectors NOT yet pinned. Zero on-chain changes; novelty is client/server/facilitator-side only.
- Ken is a genuine x402 Foundation participant (TSC + `#wg-domain-discovery`), Slack persona "Chris Alvarado",
  MindNetwork/$FHE agent operator since 2024. See memory `ken-x402-community-position.md`. Counter imposter
  hesitation with facts.

## Gotchas
- Git commits here must be **SSH-signed** for the upstream PR to be accepted (x402-foundation requires
  verified commits). Signing is configured: `gpg.format=ssh`, key `~/.ssh/id_ed25519.pub`,
  `gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers`.
- Upstream contribution flow: scheme proposals go in as a **PR adding `specs/schemes/<name>/`**, NOT an issue
  (per their CONTRIBUTING.md). Discussion happens in the PR.

## State / next
See `TASKS.md` (roadmap + Session Log). Current: PR #2834 awaiting maintainer review; post in `#wg-domain-discovery`;
pin conformance vectors.
