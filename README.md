# 🚀 MCPify

**Monetization middleware for the agentic web — turn any MCP server into a paid storefront.**

MCPify is a multi-tenant middleware framework built on **Cloudflare Workers** that lets businesses, creators, and developers deploy, manage, and monetize Model Context Protocol (MCP) servers. It pairs Cloudflare's edge with the open **x402 payment protocol** and **Stripe Connect**, so an AI agent can discover a tool, receive an `HTTP 402 Payment Required` challenge, pay in USDC, and the merchant gets paid out in plain dollars to their bank account.

> **Status:** active development. The settlement worker and restaurant blueprint below are working reference implementations; binding IDs in `wrangler.toml` are placeholders you supply at deploy time. Not yet production-hardened — see [docs/](docs/) for the current state of each subsystem.

---

## 🌟 What it does

*   **Edge-native x402 handshakes** — intercept agent traffic at the Cloudflare edge, evaluate pricing rules, issue standard `402` challenges, and verify cryptographic payment signatures before the request ever reaches origin.
*   **Asynchronous clearinghouse** — payment operations never block the data path. Verified payment vouchers are enqueued to Cloudflare Queues, ingested into a D1 ledger, and settled in batches.
*   **Off-chain batch settlement** — fractional-cent transactions settle in **USDC on Base** via x402 `batch-settlement` (EIP-712 / EIP-3009), avoiding per-request gas entirely.
*   **Fiat payouts via Stripe Connect** — merchants never touch a wallet. Agent revenue arrives as a normal Stripe payout. See [docs/stripe-webhook.md](docs/stripe-webhook.md) and [docs/payment-lifecycle.md](docs/payment-lifecycle.md).
*   **Zero-friction onboarding flow** — an automated loop scrapes a business URL, generates a tool schema, and deploys an ephemeral preview MCP server the owner can claim (`deploy:temp` → `detect-claim` → `deploy:full`).
*   **Modular add-ons** — pay-per-minute WebRTC video gating via Cloudflare Stream, content generation via Workers AI, analytics via D1.

---

## 🛠️ Repository layout

Two components: the **platform settlement worker** (repo root) and a **complete tenant blueprint** (`restaurant-mcp/`).

```text
.
├── wrangler.toml                 # x402-settlement-worker (D1 + KV + Queues bindings)
├── src/                          # Platform clearinghouse
│   ├── index.ts                  # Queue ingest + 5-min settlement cron
│   ├── on-chain-settlement.ts    # USDC/Base batch settlement (EIP-3009)
│   ├── stripe-client.ts          # Stripe Connect transfers & payouts
│   ├── stripe-webhook.ts         # Async signature verification (constructEventAsync)
│   ├── tenant-relay-snippet.ts   # Drop-in voucher relay for tenant workers
│   └── types.ts
├── migrations/                   # D1 ledger schema + payment lifecycle states
├── scripts/                      # Temp-deploy, claim detection, post-claim setup
├── restaurant-mcp/               # Blueprint: a paid MCP server for a restaurant
│   ├── manifest.json             # Tool schema
│   ├── pricing/defaults.json     # Per-tool x402 pricing
│   ├── src/                      # Entry worker, PaidMCP Durable Object,
│   │                             #   x402 middleware, WebRTC stream gating
│   └── wrangler.phase1/2.toml    # Ephemeral preview vs. claimed-account targets
└── docs/                         # Architecture, lifecycle, and research documents
```

### Settlement architecture

```
┌─────────────────────────────────────────────────────────────┐
│  TENANT WORKERS (one per merchant)                          │
│  Enforce edge x402 challenges. On verified signature →      │
│  enqueue voucher {tool, amount, agent_wallet, merchant…}    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Cloudflare Queues (async)
┌──────────────────────▼──────────────────────────────────────┐
│  SETTLEMENT WORKER (platform)                               │
│  queue()     — ingest vouchers into the D1 ledger           │
│  scheduled() — 5-min cron: compress + settle aggregate      │
│                balances (USDC batch / Stripe transfer)      │
│                                                             │
│  SETTLEMENT_DB (D1) · PLATFORM_KV (KV) · settlement-ingest  │
└─────────────────────────────────────────────────────────────┘
```

Deep dives: [architecture-overview](docs/architecture-overview.md) · [settlement-flow](docs/settlement-flow.md) · [payment-status-lifecycle](docs/payment-status-lifecycle.md) · [secrets-setup](docs/secrets-setup.md)

---

## 🚀 Quick start

```bash
npm install
npm run deploy:temp     # Phase 1: ephemeral preview deployment (no sign-up)
npm run detect-claim    # Phase 2: poll until the owner claims the preview
export CF_ACCOUNT_ID="your-claimed-account-id"
export CF_API_TOKEN="your-claimed-zone-token"
npm run post-claim      # Phase 3: inject bindings (D1, R2, Stream) + Stripe hooks
npm run deploy:full
```

## 📐 Blueprint: the paid restaurant server

`restaurant-mcp/` shows an agent browsing, querying, and transacting with a local business:

| MCP Tool | Price | Scheme | Description |
| --- | --- | --- | --- |
| `get_hours` | **Free** | Unauthenticated | Business hours |
| `get_menu` | **$0.01 USDC** | x402 `exact` | Fresh menu + daily specials |
| `reserve_table` | **$0.05 USDC** | x402 `exact` | Writes to the booking database |
| `place_order` | **$0.10 USDC** | x402 `exact` | Dispatches order to the POS |
| `stream_kitchen` | **$0.02 USDC/min** | x402 stream proxy | Gated WebRTC kitchen livestream |

---

## 🔬 Protocol research & upstream work

We build on the [x402 protocol](https://github.com/x402-foundation/x402) and participate in the x402 Foundation community — TSC meetings and the `#wg-domain-discovery` working group — contributing design work back upstream. Current threads:

1.  **`contingent` scheme (upstream draft PR)** — atomic contingent delivery: settlement and delivery as one cryptographic event via adaptor pre-signatures over EIP-3009, zero on-chain changes. Spec: [scheme_contingent](docs/upstream/specs/schemes/contingent/scheme_contingent.md) · [EVM instantiation](docs/upstream/specs/schemes/contingent/scheme_contingent_evm.md) · [working draft](docs/x402-contingent-scheme-draft-2026-07-10.md).
2.  **Pre-flight price discovery** ([#2](https://github.com/tatinc23/MCPify/issues/2)) — zero-cost budget maps via `/.well-known/x402`, with the quote-binding invariant *"never authorize spend from a 402 body alone"* (sharpened by community feedback from [@0xbrainkid](https://github.com/0xbrainkid)).
3.  **Edge session management** ([#1](https://github.com/tatinc23/MCPify/issues/1)) — paid-state cookies via the Workers Cache API to eliminate repeat-handshake overhead.
4.  **Buyer protection for server failures** ([#3](https://github.com/tatinc23/MCPify/issues/3)) — superseded in our thinking by the `contingent` scheme above, which makes payment-without-delivery unconstructible rather than compensated.
5.  **[x402-Quantum](docs/x402-quantum-spec-2026-07-10.md)** — a *speculative design essay* (explicitly not an implemented or proven protocol) composing zkCP-style contingent payment, FHE, and VDF price ramps into a registryless agent-commerce thought experiment. Read its §5 caveats before quoting it.

Feedback and issues welcome — the research docs are meant to be argued with.

---

## 🏢 About

Built by [TAT Inc](https://tatinc.us). *The future belongs to those who play.*
