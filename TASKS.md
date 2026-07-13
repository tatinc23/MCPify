# MCPify — Tasks & Roadmap

MCPify = monetization middleware for the agentic web (Cloudflare Workers + x402 + Stripe Connect).
`CLAUDE.md` = stable reference. This file = moving state. See also `~/.claude/projects/-Users-cawc-Github-MCPify/memory/`.

## Roadmap

### Upstream (x402 Foundation)
- [x] `contingent` scheme spec — draft 0 submitted as [x402-foundation/x402#2834](https://github.com/x402-foundation/x402/pull/2834), commits verified (SSH signing)
- [ ] Respond to maintainer review on #2834 (scheme vs. extension question; conformance-vector location)
- [ ] Post PR link in `#wg-domain-discovery` Slack, tying the nonce binding to the #2582 manifest proposal
- [ ] Pin conformance vectors for `contingent` (currently unpinned — required before it leaves draft)

### MCPify repo (own issues)
- [ ] #2 Pre-flight price discovery via `/.well-known/x402` manifest (0xbrainkid feedback incorporated)
- [ ] #1 Edge session management / paid-state cookies via Workers Cache API
- [ ] #3 Buyer escrow for 5xx — reframed: superseded by `contingent` (atomicity, not compensation)

### Platform / product
- [ ] Fill placeholder binding IDs in `wrangler.toml` (D1, KV) for a real deploy
- [ ] Harden settlement worker beyond reference-implementation stage

## Session Log

### 2026-07-10 · Fable 5 (main) + audit
- **Fork audit:** jmthomasofficial/MCPify fork is endpoint-listing self-promo (issue #4), NOT doc theft — zero original commits, GitHub-enforced attribution intact. No credit emergency.
- **Contingent scheme upstream:** converted `docs/x402-contingent-scheme-draft-2026-07-10.md` into x402-foundation's `specs/schemes/<name>/` two-file convention (`docs/upstream/specs/schemes/contingent/`), submitted PR #2834. Ken rebased + SSH-signed commits himself after a usage stop — **now fully verified**.
- **README:** rewrote public-facing — removed inflated "working with the TSC" claim, then restored the *accurate* version (TSC meetings + `#wg-domain-discovery` WG member); fixed repo-layout to match actual tree; labeled x402-Quantum a speculative essay; credited 0xbrainkid.
- **1Password `op` popup/hang FIXED:** root cause was SA token only loading in interactive shells → non-interactive (Claude/MCP) shells fell back to desktop app → macOS TCC popup + wedged daemons blocking all `op`. Fix: `~/.zshenv` loads the SA token for every shell + `mcp.env` rewritten to a 12h secret cache with 20s-capped `op` calls. Verified: warm shell resolves all 4 secrets in 0.011s, zero popups.
- **Memory:** added `ken-x402-community-position.md` (WG member, TSC attendee, MindNetwork/$FHE agent operator since 2024, Slack persona "Chris Alvarado").
- **Next:** maintainer review on #2834; Slack post; pin conformance vectors.
