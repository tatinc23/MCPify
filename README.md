# Restaurant MCP Server

AI-agent-accessible restaurant server with x402 micropayments, D1 CRM, and optional live shopping add-on.

## Quick Start

### Phase 1: Temporary Deployment (zero signup)

```bash
npm install
npm run deploy:temp
```

### Detect Claim

```bash
npm run detect-claim
```

### Phase 2: Post-Claim Setup (R2 + Stream)

```bash
export CF_ACCOUNT_ID=""
export CF_API_TOKEN=""
npm run post-claim
npm run deploy:full
```

## MCP Tools

| Tool | Price | Description |
| --- | --- | --- |
| `get_hours` | Free | Business hours |
| `get_menu` | $0.01 USDC | Full menu with prices |
| `reserve_table` | $0.05 USDC | Table reservation |
| `place_takeout_order` | $0.10 USDC | Takeout order |
| `generate_marketing_copy` | $0.03 USDC | AI-generated social media post |
| `watch_live_kitchen` | $0.02 USDC/min | Live kitchen stream (Phase 2) |
