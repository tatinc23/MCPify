-- Payment lifecycle tracking table
-- Tracks the full state machine for every x402 micropayment

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
