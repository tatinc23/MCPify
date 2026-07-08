-- Master settlement ledger (runs on your platform's account)

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tenant_worker_url TEXT NOT NULL,
  agent_wallet TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  merchant_address TEXT NOT NULL,
  stripe_account_id TEXT,
  network TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending → batched → on_chain_sent → stripe_paid → settled
  batch_id TEXT,
  tx_hash TEXT,
  stripe_transfer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  batched_at TEXT,
  settled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_address);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id TEXT PRIMARY KEY,
  merchant_address TEXT NOT NULL,
  stripe_account_id TEXT,
  total_usdc TEXT NOT NULL,
  payment_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  -- created → on_chain_sent → stripe_paid → completed
  tx_hash TEXT,
  stripe_transfer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  worker_url TEXT NOT NULL,
  claim_url TEXT,
  merchant_address TEXT NOT NULL,
  stripe_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'temporary',
  -- temporary → claimed → active
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
