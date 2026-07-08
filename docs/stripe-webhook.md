# Stripe Webhook Handler

This Worker runs on your platform's master account and listens for Stripe Connect events to complete the settlement lifecycle.

Webhook endpoint: `https://your-platform.workers.dev/stripe/webhook`

## Complete Lifecycle with Webhook

```
Agent calls tool
    │
    ▼
┌─ SMB Worker ──────────────────────────────────┐
│  402 response (payment_id = UUID)  → PENDING  │
│  Agent pays, retries                           │
│  verifyPayment() ✓                  → VERIFIED │
│  Enqueue to SETTLEMENT_QUEUE                   │
└──────────────────┬────────────────────────────┘
                   │ Queue message
┌──────────────────▼────────────────────────────┐
│  SMB Worker Queue Consumer                     │
│  Write to D1 agent_payments                    │
│  (payment already VERIFIED in lifecycle table) │
└──────────────────┬────────────────────────────┘
                   │ Cron every 5 min
┌──────────────────▼────────────────────────────┐
│  Platform Settlement Worker (cron)             │
│  Group VERIFIED by merchant, SUM >= $1.00      │
│  On-chain USDC transfer  → BATCHED             │
│  Stripe transfer created → SETTLED             │
└──────────────────┬────────────────────────────┘
                   │ Stripe webhook
┌──────────────────▼────────────────────────────┐
│  Platform Stripe Webhook Worker                │
│  transfer.created       → COMPLETED            │
│  transfer.reversed      → REFUNDED             │
│  transfer.failed        → VERIFIED (rollback)  │
└────────────────────────────────────────────────┘
```

## Stripe Dashboard Setup

1. Go to **Developers → Webhooks** in your Stripe dashboard
2. Add endpoint: `https://<your-platform-worker>.workers.dev/stripe/webhook`
3. Select events:
   - `transfer.created`
   - `transfer.reversed`
   - `transfer.failed`
4. Copy the Signing Secret and run:

```bash
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_SECRET_KEY
```

## wrangler.toml

```toml
name = "platform-stripe-webhook"
main = "src/stripe-webhook.ts"
compatibility_date = "2026-07-08"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "SETTLEMENT_DB"
database_name = "platform-settlements"

# Secrets (set via wrangler secret put):
# STRIPE_WEBHOOK_SECRET
# STRIPE_SECRET_KEY
```
