export interface Env {
  MCPSERVER: DurableObjectNamespace;
  PRICING_KV: KVNamespace;
  CRM_DB: D1Database;
  SETTLEMENT_QUEUE: Queue;
  AI: Ai;
  MEDIA_BUCKET?: R2Bucket;
  LIVE_INPUT_ID?: string;
  STREAM_API_TOKEN?: string;
  ACCOUNT_ID?: string;
}

export interface QueueMessage {
  type: "payment_verified";
  tool: string;
  amount: string;
  agent_wallet: string;
  merchant_address: string;
  network: string;
  timestamp: string;
}

export interface ToolPricing {
  amount: string;
  asset: string;
  network: string;
}

export interface MerchantConfig {
  address: string;
  settlement: "stripe_connect" | "native";
  stripe_account_id?: string;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
}

export interface Reservation {
  id: number;
  customer_name: string;
  party_size: number;
  datetime: string;
  phone?: string;
  email?: string;
  status: string;
}
