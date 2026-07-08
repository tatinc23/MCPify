import type { ToolPricing, MerchantConfig, Env } from "./types";

// x402 v2 types re-exported from agents/x402 (per Agents SDK v0.4.0 changelog)
import type { PaymentRequirements } from "agents/x402";

export function buildPaymentRequirements(
  pricing: ToolPricing,
  merchant: MerchantConfig
): PaymentRequirements {
  return {
    amount: pricing.amount,
    asset: pricing.asset,
    network: pricing.network,
    payTo: merchant.address,
  } as PaymentRequirements;
}

export async function verifyPayment(
  request: Request,
  pricing: ToolPricing,
  merchant: MerchantConfig
): Promise<{ valid: boolean; agentWallet?: string; error?: string }> {
  const paymentHeader =
    request.headers.get("PAYMENT-SIGNATURE") ??
    request.headers.get("X-PAYMENT");

  if (!paymentHeader) {
    return { valid: false, error: "No payment header present" };
  }

  const agentWallet = request.headers.get("X-PAYER-ADDRESS") ?? "unknown";

  return { valid: true, agentWallet };
}

export function create402Response(
  pricing: ToolPricing,
  merchant: MerchantConfig,
  requestId: string
): Response {
  const requirements = buildPaymentRequirements(pricing, merchant);

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Payment Required",
        data: {
          x402_version: 2,
          payment_requirements: [requirements],
          request_id: requestId,
        },
      },
      id: requestId,
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-402-Version": "2",
      },
    }
  );
}

export async function getToolPricing(
  toolName: string,
  env: Env
): Promise<ToolPricing | null> {
  const raw = await env.PRICING_KV.get("pricing:tools");
  if (!raw) return null;
  const all = JSON.parse(raw) as Record<string, ToolPricing>;
  return all[toolName] ?? null;
}

export async function getMerchantConfig(env: Env): Promise<MerchantConfig | null> {
  const raw = await env.PRICING_KV.get("wallet:merchant");
  if (!raw) return null;
  return JSON.parse(raw) as MerchantConfig;
}

export async function enforcePayment(
  request: Request,
  toolName: string,
  env: Env
): Promise<Response | null> {
  const pricing = await getToolPricing(toolName, env);
  if (!pricing || parseFloat(pricing.amount) === 0) {
    return null;
  }

  const merchant = await getMerchantConfig(env);
  if (!merchant) {
    return new Response(JSON.stringify({ error: "Merchant not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await verifyPayment(request, pricing, merchant);
  if (!result.valid) {
    return create402Response(pricing, merchant, crypto.randomUUID());
  }

  await env.SETTLEMENT_QUEUE.send({
    type: "payment_verified",
    tool: toolName,
    amount: pricing.amount,
    agent_wallet: result.agentWallet ?? "unknown",
    merchant_address: merchant.address,
    network: pricing.network,
    timestamp: new Date().toISOString(),
  });

  return null;
}
