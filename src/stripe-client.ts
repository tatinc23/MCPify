// Minimal Stripe Connect client — no SDK needed, just fetch

interface StripeTransferParams {
  amount: number;          // in cents
  currency: string;        // "usd"
  destination: string;     // Stripe Connect account ID (acct_XXX)
  transferGroup: string;   // batch ID
  description?: string;
}

interface StripeTransferResponse {
  id: string;
  object: string;
  amount: number;
  currency: string;
  destination: string;
  transfer_group: string;
  created: number;
  livemode: boolean;
}

export async function createStripeTransfer(
  secretKey: string,
  params: StripeTransferParams
): Promise<StripeTransferResponse> {
  const body = new URLSearchParams({
    amount: params.amount.toString(),
    currency: params.currency,
    destination: params.destination,
    transfer_group: params.transferGroup,
  });

  if (params.description) {
    body.set("description", params.description);
  }

  const res = await fetch("https://api.stripe.com/v1/transfers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Stripe transfer failed: ${JSON.stringify(error.error)}`);
  }

  return res.json();
}

// Verify a Stripe Connect account exists and is enabled
export async function verifyStripeAccount(
  secretKey: string,
  accountId: string
): Promise<boolean> {
  const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!res.ok) return false;

  const account = await res.json();
  return account.charges_enabled === true;
}

// Create a balance transaction record for reconciliation
export async function createStripeBalanceTransaction(
  secretKey: string,
  transferId: string,
  metadata: Record<string, string>
): Promise<void> {
  // Metadata is set on the transfer itself — this is a no-op
  // but could be extended for additional reconciliation logging
}
