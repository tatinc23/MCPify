#!/bin/bash
set -euo pipefail

echo "🚀 Deploying Restaurant MCP (Phase 1 — Temporary Account)"
echo ""

# Deploy with temporary account
# Wrangler 4.102.0+ required
OUTPUT=$(wrangler deploy --config wrangler.phase1.toml --temporary 2>&1)

echo "$OUTPUT"

# Extract claim URL and worker URL
CLAIM_URL=$(echo "$OUTPUT" | grep -oP 'https://dash\.cloudflare\.com/claim-preview\?claimToken=\S+')
WORKER_URL=$(echo "$OUTPUT" | grep -oP 'https://\S+\.workers\.dev')

if [ -z "$CLAIM_URL" ]; then
  echo "❌ Failed to extract claim URL from Wrangler output"
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  Worker URL:  $WORKER_URL"
echo "  Claim URL:   $CLAIM_URL"
echo "  Expires in:  60 minutes"
echo "══════════════════════════════════════════════════"
echo ""

# Save to file for platform integration
cat > .deploy-output.json << EOF
{
  "worker_url": "$WORKER_URL",
  "claim_url": "$CLAIM_URL",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "expires_at": "$(date -u -d '+60 minutes' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+60M +%Y-%m-%dT%H:%M:%SZ)",
  "phase": "temporary"
}
EOF

echo "📄 Deployment info saved to .deploy-output.json"
echo ""
echo "Next steps:"
echo "  1. Hand the Claim URL to the business owner"
echo "  2. Run claim detector: npm run detect-claim"
echo "  3. After claim: npm run post-claim"
