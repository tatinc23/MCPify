# Secrets Setup

## Master Account — Settlement Worker

Run these commands scoped to your master Cloudflare account:

```bash
# Stripe secret key (from your Stripe Connect dashboard)
wrangler secret put STRIPE_SECRET_KEY

# Platform custody wallet private key (Base/EVM wallet holding USDC)
wrangler secret put PLATFORM_WALLET_PRIVATE_KEY

# Shared API key for tenant relay authentication
# Generate a random key and set it on BOTH the settlement Worker
# and each tenant Worker
wrangler secret put RELAY_API_KEY
```

## Each Tenant Worker

```bash
# Same relay API key (must match the settlement Worker's RELAY_API_KEY)
wrangler secret put RELAY_API_KEY

# Unique tenant ID assigned by your platform
wrangler secret put TENANT_ID
```

## Notes

- `RELAY_API_KEY` must be identical across the settlement Worker and all tenant Workers — it is the shared bearer token used to authenticate relay POSTs.
- `TENANT_ID` is unique per tenant and is included in every payment event for ledger attribution.
- `PLATFORM_WALLET_PRIVATE_KEY` is the EVM private key for the custody wallet that holds collected USDC on Base before on-chain dispersal to merchants.
