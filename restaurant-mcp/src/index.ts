import { PaidMCP } from "./mcp-server";
import { enforcePayment } from "./x402-middleware";
import { handleMediaUpload, createVerticalVariant } from "./stream-handler";
import type { Env } from "./types";

export { PaidMCP };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Health check / claim heartbeat ───────────────
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        time: Date.now(),
        phase: env.MEDIA_BUCKET ? "claimed" : "temporary",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Phase 2: Media upload endpoint ───────────────
    if (url.pathname === "/media/upload" && request.method === "POST") {
      return handleMediaUpload(request, env);
    }

    // ── Phase 2: Create vertical variant ─────────────
    if (url.pathname.startsWith("/media/vertical/") && request.method === "POST") {
      const streamUid = url.pathname.split("/")[3];
      return createVerticalVariant(streamUid, env);
    }

    // ── MCP requests: x402 payment gate ──────────────
    if (request.method === "POST") {
      let toolName: string | null = null;
      try {
        const cloned = request.clone();
        const body = await cloned.json();
        if (body?.method === "tools/call" && body?.params?.name) {
          toolName = body.params.name;
        }
      } catch {
        // Not JSON-RPC — forward to MCP handler
      }

      if (toolName) {
        const blockResponse = await enforcePayment(request, toolName, env);
        if (blockResponse) {
          return blockResponse; // 402 — payment required
        }
      }
    }

    // ── Forward to MCP Durable Object ────────────────
    const id = env.MCPSERVER.idFromName("default");
    const stub = env.MCPSERVER.get(id);
    return stub.fetch(request);
  },

  // ── Queue consumer: batch settlement logging ───────
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const payment = message.body;
      // Log to D1 for settlement tracking
      await env.CRM_DB.prepare(
        `INSERT INTO agent_payments (agent_wallet, tool_name, amount_usdc, tx_hash)
         VALUES (?, ?, ?, ?)`
      ).bind(
        payment.agent_wallet,
        payment.tool,
        payment.amount,
        payment.tx_hash ?? null
      ).run();

      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;
