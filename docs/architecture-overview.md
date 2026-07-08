# Architecture Overview

The settlement system consists of two layers: **Tenant Workers** (SMB accounts) and a **Settlement Worker** (your master account).

```
┌─────────────────────────────────────────────────────────────┐
│  TENANT WORKERS (SMB accounts)                               │
│                                                              │
│  Each tenant's Worker enforces x402 payments.                │
│  On verified payment → POST to settlement Worker relay.      │
│  Payload includes: tool, amount, agent_wallet,               │
│  merchant_address, stripe_account_id, network, timestamp.    │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP POST (authenticated)
┌──────────────────────▼──────────────────────────────────────┐
│  SETTLEMENT WORKER (your master account)                     │
│                                                              │
│  Three handlers:                                             │
│  1. fetch()      — HTTP relay + registration endpoints        │
│  2. queue()      — ingest payment events into D1 ledger      │
│  3. scheduled()  — cron every 5 min: batch + settle          │
│                                                              │
│  Bindings:                                                   │
│  • INTERNAL_QUEUE (Queue) — internal ingest queue            │
│  • SETTLEMENT_DB (D1)     — master ledger                    │
│  • PLATFORM_KV (KV)       — merchant registry               │
│  • Secrets: STRIPE_SECRET_KEY, PLATFORM_WALLET_PRIVATE_KEY,  │
│             RELAY_API_KEY                                    │
└─────────────────────────────────────────────────────────────┘
```

## Cross-Account Queue Constraint

Cloudflare Queues are **account-scoped** — a tenant Worker on a different Cloudflare account cannot send directly to your master account's queue. This implementation uses the **HTTP relay** approach (option 1) since it is real-time and requires no Logpush setup per tenant.

- **Option 1 (implemented): HTTP relay** — Each tenant Worker POSTs verified payments to `/relay/payment` on the settlement Worker, which enqueues them internally.
- **Option 2: Logpush + polling** — Use Workers Logs + Logpush to ship payment events from tenant accounts to your master account's D1.
