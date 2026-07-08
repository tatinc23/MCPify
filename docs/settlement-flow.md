# Settlement Flow

End-to-end flow from AI agent tool call through on-chain USDC transfer and Stripe Connect fiat settlement.

```
┌──────────────────────────────────────────────────────────────────┐
│  TENANT WORKER (SMB account)                                      │
│                                                                   │
│  1. AI agent calls paid MCP tool                                  │
│  2. x402 middleware verifies PAYMENT-SIGNATURE                    │
│  3. On success → POST /relay/payment to settlement Worker         │
│     { tenant_id, amount, merchant_address, stripe_account_id }    │
└─────────────────────────┬─────────────────────────────────────────┘
                          │ HTTP POST (authenticated)
┌─────────────────────────▼─────────────────────────────────────────┐
│  SETTLEMENT WORKER (master account)                               │
│                                                                   │
│  fetch() handler:                                                 │
│  ├─ /relay/payment → enqueue to INTERNAL_QUEUE                    │
│  └─ /relay/register → upsert tenant record in D1                  │
│                                                                   │
│  queue() handler:                                                 │
│  └─ Insert each payment event into D1 ledger (status: pending)    │
│                                                                   │
│  scheduled() handler (every 5 min):                               │
│  1. Query D1 for merchants with pending >= $1 USDC or > 24h old   │
│  2. For each merchant batch:                                      │
│     a. Create batch record in D1                                  │
│     b. Mark payments as 'batched'                                 │
│     c. Transfer USDC on-chain (Base) → merchant wallet            │
│     d. Mark payments as 'on_chain_sent'                           │
│     e. Create Stripe Connect transfer (fiat) → merchant's Stripe  │
│     f. Mark payments as 'stripe_paid' → 'settled'                 │
│  3. Log ledger summary                                            │
└───────────────────────────────────────────────────────────────────┘
```
