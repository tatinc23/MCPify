# Payment Status Lifecycle

Each payment record in the D1 ledger moves through the following statuses:

```
pending → batched → on_chain_sent → stripe_paid → settled
              ↓           ↓               ↓
          (retry)     (retry)      (manual review)
```

## Status Definitions

| Status | Meaning |
|---|---|
| `pending` | Payment received from tenant, awaiting batch threshold |
| `batched` | Grouped with other payments for the same merchant |
| `on_chain_sent` | USDC transferred on Base to merchant wallet |
| `stripe_paid` | Stripe Connect transfer created (fiat equivalent) |
| `settled` | Fully complete — both on-chain and Stripe transfers confirmed |

## Failure Handling

- **`on_chain_failed`**: On-chain transfer failed — payments are reverted to `pending` and retried next cron cycle.
- **`stripe_failed`**: Stripe transfer failed after on-chain already sent — flagged for manual review / retry since the USDC has already been transferred.
- **DLQ**: Queue messages that exhaust retries land in `settlement-dlq` for investigation.

## Batch Thresholds

A batch is triggered for a merchant when either condition is met:

- Accumulated pending balance **≥ $1.00 USDC** (`BATCH_THRESHOLD_USDC`)
- Oldest pending payment is **≥ 24 hours old** (`MAX_AGE_HOURS`)
