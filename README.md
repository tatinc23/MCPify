# 🚀 MCPify: The Shopify for the Agentic Web

MCPify is a high-performance, multi-tenant middleware framework built on **Cloudflare Workers** that enables businesses, creators, and developers to instantly deploy, manage, and monetize Model Context Protocol (MCP) servers. 

By marrying Cloudflare’s edge infrastructure with the open **x402 protocol** and **Stripe Connect**, MCPify turns any web resource, API endpoint, or data asset into a micro-transactional storefront optimized for autonomous AI agents.

---

## 🌟 Key Features

*   **Zero-Friction SMB Onboarding:** Leverage Cloudflare’s `wrangler deploy --temporary` primitive to let businesses preview a custom, AI-generated MCP server in seconds with zero configuration or upfront sign-up.
*   **Edge-Native HTTP 402 Handshakes:** Intercept agent traffic at the Cloudflare edge, evaluate programmatic pricing rules, issue standard `HTTP 402 Payment Required` challenges, and validate cryptographic payment signatures in sub-10ms.
*   **Asynchronous Clearinghouse Engine:** Offload heavy payment operations from individual client sites using decoupled Cloudflare Queues to ingest, batch, and compress micro-vouchers seamlessly.
*   **Off-Chain Batch Settlement:** Settle fractional-cent transactions natively in **USDC via Base** using x402’s `batch-settlement` (EIP-712/EIP-3009) to completely avoid network gas bleed on micro-requests.
*   **Fiat-Settled Merchant Payouts:** Fully integrated with **Stripe Connect** to seamlessly abstract away web3 complexities—allowing everyday small businesses to collect agent revenue directly into their traditional bank accounts.
*   **Modular Enterprise Add-ons:** Drop-in support for turn-key edge templates, including pay-per-minute WebRTC video gating via **Cloudflare Stream**, content generation via **Workers AI**, and agentic analytics via **D1**.

---

## 🛠️ Project Structure & Architecture

```text
restaurant-mcp/
├── manifest.json
├── package.json
├── tsconfig.json
├── wrangler.phase1.toml          # Temp-safe deployment target (no R2/Stream required)
├── wrangler.phase2.toml          # Post-claim environment target (full asset bindings)
├── migrations/
│   └── 0001_init.sql             # D1 schema for tenant configuration, metrics, & caching
├── pricing/
│   └── defaults.json             # x402 tool capability pricing schemas
├── scripts/
│   ├── deploy-phase1.sh          # Handles automated temporary deployment loops
│   ├── post-claim-setup.ts       # Injector for R2 buckets, Stream tokens, and platform keys
│   └── claim-detector.ts         # Heartbeat polling script to catch when an account is claimed
└── src/
    ├── index.ts                  # Entry Worker + multi-tenant x402 middleware router
    ├── mcp-server.ts             # PaidMCP Durable Object (Manages JSON-RPC protocol states)
    ├── x402-middleware.ts        # Dynamic crypto payment signature verification and headers
    ├── stream-handler.ts         # Phase 2: Pay-per-minute live shopping WebRTC player proxy
    ├── media-transform.ts        # Phase 2: R2 video storage ingest + auto-cropping automation
    └── types.ts                  # Shared platform types and protocol contracts

```

---

## 💳 Settlement Architecture: The Multi-Tenant Clearinghouse

MCPify scales infinitely by decoupling data delivery from payment processing. Instead of slowing down client data paths with synchronous blockchain settlement or external API calls, the network executes via a high-throughput, queue-backed ledger design:

```
┌─────────────────────────────────────────────────────────────┐
│  TENANT WORKERS (SMB accounts)                              │
│                                                             │
│  Each tenant's Worker enforces edge-level x402 challenges.  │
│  On verified signature → enqueue to SETTLEMENT_QUEUE.       │
│  Payload: tool, amount, agent_wallet, merchant_address, etc.│
└──────────────────────┬──────────────────────────────────────┘
                       │ Asynchronous Queue Messaging
┌──────────────────────▼──────────────────────────────────────┐
│  SETTLEMENT WORKER (Platform Master Account)                │
│                                                             │
│  Two dedicated handlers manage the clearinghouse:           │
│  1. queue()     — Ingests incoming vouchers into D1 ledger. │
│  2. scheduled() — Cron triggers every 5m to compress and    │
│                   settle aggregate balances via Stripe.     │
│                                                             │
│  Bindings:                                                  │
│  • SETTLEMENT_QUEUE (Queue) — Multi-tenant entry streams    │
│  • SETTLEMENT_DB (D1)       — Distributed master ledger     │
│  • PLATFORM_KV (KV)         — Global Merchant Registry      │
└─────────────────────────────────────────────────────────────┘

```

---

## 🚀 Quick Start (Zero-Signup Onboarding)

MCPify utilizes an autonomous agent loop to scrape a business URL, generate an optimized tool schema, and spin up an ephemeral preview environment.

### Phase 1: Silent Temporary Deployment

Generate and push a custom storefront to an ephemeral Cloudflare preview account:

```bash
npm install
npm run deploy:temp

```

### Phase 2: Detect & Claim Account Handoff

Monitor when the business owner claims the temporary 60-minute zone and safely hand off custody to their permanent environment:

```bash
npm run detect-claim

```

### Phase 3: Post-Claim Activation (R2 + Stream Add-ons)

Inject environment variables, establish your platform's Stripe billing hooks, and provision edge resource bindings (Cloudflare D1, R2, and Stream):

```bash
export CF_ACCOUNT_ID="your-claimed-account-id"
export CF_API_TOKEN="your-claimed-zone-token"
npm run post-claim
npm run deploy:full

```

---

## 📐 Blueprint Implementation Metrics

The included `restaurant-mcp` directory demonstrates how an automated agent browses, queries, and interacts with a local business by settling usage-based payments on the fly:

| MCP Tool | Price | Settlement Scheme | Description |
| --- | --- | --- | --- |
| `get_hours` | **Free** | Unauthenticated | Standard business operational hours |
| `get_menu` | **$0.01 USDC** | x402 Request Signature | Parses fresh markdown of items & daily specials |
| `reserve_table` | **$0.05 USDC** | x402 Request Signature | Directly updates internal booking database |
| `place_order` | **$0.10 USDC** | x402 Request Signature | Dispatches transactional payload to POS system |
| `stream_kitchen` | **$0.02 USDC/min** | x402 Stream Proxy | Gated, sub-second WebRTC kitchen livestream |

---

## 🤝 Contributing & Community Insights

MCPify is actively working with the **x402 Foundation Technical Steering Committee (TSC)** to enhance machine-to-machine commerce standards. We are currently addressing protocol expansions around:

1. **Edge Session Management:** Eliminating repetitive handshake overhead with paid-state cookies via the new Workers Cache APIs.
2. **Pre-flight Price Discovery:** Implementing zero-cost budget maps via `/.well-known/x402`.
3. **Buyer Escrow Verification:** Protecting agents from paying for server failures (`500 Internal Server Errors`).
