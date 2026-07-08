# Payment Status Lifecycle

Every x402 micropayment flows through these states:

```
PENDING → VERIFIED → BATCHED → SETTLED → COMPLETED
                                   ↓
                               REFUNDED
```

## State Definitions

| Status | Meaning | Trigger | System Action |
|---|---|---|---|
| `PENDING` | AI agent received 402, has not yet retried with payment | 402 response sent | None — waiting for agent to sign USDC payment |
| `VERIFIED` | Payment signature validated by @x402/evm, funds confirmed on-chain | `verifyPayment()` returns `{ valid: true }` | Enqueue to `SETTLEMENT_QUEUE`, write to D1 `agent_payments` table |
| `BATCHED` | Payment grouped with other payments for same merchant, batch threshold met | Settlement Worker cron runs, `SUM(amount_usdc) >= 1.00` per merchant | On-chain USDC transfer initiated from platform custody wallet → merchant wallet |
| `SETTLED` | On-chain transfer confirmed, Stripe Connect transfer created | Transaction hash confirmed on Base | Stripe Connect transfer API called, `stripe_transfer_id` stored |
| `COMPLETED` | Stripe transfer succeeded, funds available in merchant's Stripe account | Stripe webhook `transfer.created` received | Final state — no further action |
| `REFUNDED` | Merchant or platform initiated refund | Manual or automated dispute resolution | On-chain USDC returned to agent wallet, Stripe reversal created |

## D1 Schema

```sql
CREATE TABLE IF NOT EXISTS payment_lifecycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT UNIQUE NOT NULL,          -- UUID generated at 402 response
  agent_wallet TEXT NOT NULL,
  merchant_address TEXT NOT NULL,
  stripe_account_id TEXT,
  tool_name TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  network TEXT NOT NULL,                    -- "eip155:84532"
  status TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING|VERIFIED|BATCHED|SETTLED|COMPLETED|REFUNDED
  tx_hash TEXT,                             -- On-chain tx hash (SETTLED+)
  stripe_transfer_id TEXT,                  -- Stripe transfer ID (SETTLED+)
  batch_id TEXT,                            -- Groups payments settled together
  created_at TEXT DEFAULT (datetime('now')),
  verified_at TEXT,
  batched_at TEXT,
  settled_at TEXT,
  completed_at TEXT,
  refunded_at TEXT,
  error TEXT
);

CREATE INDEX idx_status ON payment_lifecycle(status);
CREATE INDEX idx_merchant ON payment_lifecycle(merchant_address, status);
CREATE INDEX idx_batch ON payment_lifecycle(batch_id);
```

## State Transitions in Code

```typescript
// ── PENDING → VERIFIED ──────────────────────────────
// Happens in the SMB's Worker (x402 middleware)
// When verifyPayment() returns valid:

await env.CRM_DB.prepare(`
  INSERT INTO payment_lifecycle
    (payment_id, agent_wallet, merchant_address, tool_name, amount_usdc, network, status, verified_at)
  VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED', datetime('now'))
`).bind(
  paymentId,
  agentWallet,
  merchantAddress,
  toolName,
  amount,
  network
).run();

// ── VERIFIED → BATCHED ──────────────────────────────
// Happens in your platform's Settlement Worker (cron every 5 min)
const batchId = crypto.randomUUID();

await env.SETTLEMENT_DB.prepare(`
  UPDATE payment_lifecycle
  SET status = 'BATCHED', batch_id = ?, batched_at = datetime('now')
  WHERE merchant_address = ? AND status = 'VERIFIED'
`).bind(batchId, merchantAddress).run();

// ── BATCHED → SETTLED ───────────────────────────────
// After on-chain USDC transfer confirms:

await env.SETTLEMENT_DB.prepare(`
  UPDATE payment_lifecycle
  SET status = 'SETTLED', tx_hash = ?, stripe_transfer_id = ?, settled_at = datetime('now')
  WHERE batch_id = ?
`).bind(txHash, stripeTransferId, batchId).run();

// ── SETTLED → COMPLETED ─────────────────────────────
// After Stripe webhook confirms transfer:

await env.SETTLEMENT_DB.prepare(`
  UPDATE payment_lifecycle
  SET status = 'COMPLETED', completed_at = datetime('now')
  WHERE stripe_transfer_id = ?
`).bind(stripeTransferId).run();

// ── Any state → REFUNDED ────────────────────────────
await env.SETTLEMENT_DB.prepare(`
  UPDATE payment_lifecycle
  SET status = 'REFUNDED', refunded_at = datetime('now'), error = ?
  WHERE payment_id = ?
`).bind(reason, paymentId).run();
```

## Settlement Worker Cron Logic

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    // 1. Find merchants with enough VERIFIED payments to batch
    const merchants = await env.SETTLEMENT_DB.prepare(`
      SELECT merchant_address, stripe_account_id,
             SUM(CAST(amount_usdc AS REAL)) as total,
             COUNT(*) as payment_count
      FROM payment_lifecycle
      WHERE status = 'VERIFIED'
      GROUP BY merchant_address, stripe_account_id
      HAVING total >= 1.00
    `).all();

    for (const merchant of merchants.results) {
      const batchId = crypto.randomUUID();
      const totalUsdc = merchant.total as number;

      // 2. Mark payments as BATCHED
      await env.SETTLEMENT_DB.prepare(`
        UPDATE payment_lifecycle
        SET status = 'BATCHED', batch_id = ?, batched_at = datetime('now')
        WHERE merchant_address = ? AND status = 'VERIFIED'
      `).bind(batchId, merchant.merchant_address).run();

      try {
        // 3. Transfer USDC on-chain (Base) from custody wallet → merchant
        const txHash = await transferUsdc(
          merchant.merchant_address as string,
          totalUsdc
        );

        // 4. Create Stripe Connect transfer (fiat equivalent)
        const stripeTransfer = await stripe.transfers.create({
          amount: Math.round(totalUsdc * 100),  // USDC → USD cents (1:1)
          currency: "usd",
          destination: merchant.stripe_account_id as string,
          transfer_group: batchId,
          metadata: {
            batch_id: batchId,
            tx_hash: txHash,
            payment_count: String(merchant.payment_count),
          },
        });

        // 5. Mark as SETTLED
        await env.SETTLEMENT_DB.prepare(`
          UPDATE payment_lifecycle
          SET status = 'SETTLED', tx_hash = ?, stripe_transfer_id = ?,
              settled_at = datetime('now')
          WHERE batch_id = ?
        `).bind(txHash, stripeTransfer.id, batchId).run();

        console.log(`Batch ${batchId} settled: ${totalUsdc} USDC → ${merchant.merchant_address}`);

      } catch (error) {
        // Rollback to VERIFIED for retry on next cron cycle
        await env.SETTLEMENT_DB.prepare(`
          UPDATE payment_lifecycle
          SET status = 'VERIFIED', batch_id = NULL, error = ?
          WHERE batch_id = ?
        `).bind(String(error), batchId).run();

        console.error(`Batch ${batchId} failed:`, error);
      }
    }
  },
} satisfies ExportedHandler<Env>;
```

## Edge Cases

- **Partial batch failure** — If the on-chain transfer succeeds but Stripe fails, payments stay `BATCHED` with `tx_hash` set but `stripe_transfer_id` NULL. A separate recovery cron retries the Stripe transfer only.
- **Agent retry on same payment_id** — The 402 response includes a `payment_id` (UUID). If an agent retries with the same payment signature, the Worker checks D1 for an existing `VERIFIED` record and skips re-verification.
- **Sub-threshold accumulation** — Payments below the $1.00 batch threshold accumulate as `VERIFIED` until enough payments arrive. The cron picks them up automatically once the threshold is met.
- **Temp account expiry** — If the SMB's temp account expires before claim, all `PENDING` payments are lost (the Worker is deleted). `VERIFIED` payments that were already enqueued to your platform's settlement queue still process normally — the USDC was already collected.
