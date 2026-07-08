// Tenant Worker integration — relay snippet
// Add this to each tenant's Worker (the x402-middleware.ts from the restaurant template)
// so it relays payments to your settlement Worker.

import type { PaymentEvent } from "./types";

// NOTE: Replace with your actual deployed settlement Worker URL
const SETTLEMENT_WORKER_URL = "https://x402-settlement-worker.your-platform.workers.dev";

// Declare env shape used in this snippet (merge with your Worker's Env)
declare const env: { RELAY_API_KEY: string; TENANT_ID: string; WORKER_HOSTNAME: string };

export async function relayPayment(payment: PaymentEvent): Promise<void> {
  await fetch(`${SETTLEMENT_WORKER_URL}/relay/payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RELAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payment),
  });
}

// In enforcePayment(), replace the Queue send:
// OLD: await env.SETTLEMENT_QUEUE.send(paymentEvent);
// NEW:
//
// await relayPayment({
//   type: "payment_verified",
//   tenant_id: env.TENANT_ID,
//   tenant_worker_url: `https://${env.WORKER_HOSTNAME}`,
//   tool: toolName,
//   amount: pricing.amount,
//   agent_wallet: result.agentWallet ?? "unknown",
//   merchant_address: merchant.address,
//   stripe_account_id: merchant.stripe_account_id,
//   network: pricing.network,
//   timestamp: new Date().toISOString(),
// });
