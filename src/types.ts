export interface Env {
  SETTLEMENT_DB: D1Database;
  PLATFORM_KV: KVNamespace;
  INTERNAL_QUEUE: Queue<PaymentEvent>;
  // Secrets:
  STRIPE_SECRET_KEY: string;
  PLATFORM_WALLET_PRIVATE_KEY: string;
  RELAY_API_KEY: string;
}

export interface PaymentEvent {
  type: "payment_verified";
  tenant_id: string;
  tenant_worker_url: string;
  tool: string;
  amount: string;
  agent_wallet: string;
  merchant_address: string;
  stripe_account_id?: string;
  network: string;
  timestamp: string;
}

export interface TenantRecord {
  tenant_id: string;
  worker_url: string;
  claim_url: string;
  merchant_address: string;
  stripe_account_id?: string;
  status: "temporary" | "claimed" | "active";
  created_at: string;
  claimed_at?: string;
}

export interface SettlementBatch {
  id: string;
  merchant_address: string;
  stripe_account_id?: string;
  total_usdc: string;
  payment_count: number;
  payment_ids: string[];
}

// Stripe Connect transfer response
interface StripeTransferResponse {
  id: string;
  object: string;
  amount: number;
  currency: string;
  destination: string;
  transfer_group: string;
  created: number;
}

// USDC on Base has 6 decimals
const USDC_DECIMALS = 6;

export function usdcToAtomic(amount: string): bigint {
  // Convert human-readable USDC (e.g. "0.05") to atomic units (50000)
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || "0");
}

export function atomicToUsdc(amount: bigint): string {
  const divisor = 10n ** BigInt(USDC_DECIMALS);
  const whole = amount / divisor;
  const frac = amount % divisor;
  return `${whole}.${frac.toString().padStart(USDC_DECIMALS, "0")}`;
}

// Stripe amounts are in cents
export function usdcToStripeCents(amount: string): number {
  // 1 USDC ≈ $1 USD → cents = amount * 100
  return Math.round(parseFloat(amount) * 100);
}
