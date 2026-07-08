// stripe-webhook.ts
// Deploy on your platform's master account
// Stripe webhook endpoint: https://your-platform.workers.dev/stripe/webhook

import Stripe from "stripe";

interface Env {
  SETTLEMENT_DB: D1Database;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SECRET_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/stripe/webhook") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // ── Verify Stripe signature ───────────────────────
    const signature = request.headers.get("Stripe-Signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const rawBody = await request.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Signature verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    // ── Route by event type ────────────────────────────
    switch (event.type) {
      case "transfer.created":
        await handleTransferCreated(event, env);
        break;
      case "transfer.reversed":
        await handleTransferReversed(event, env);
        break;
      case "transfer.failed":
        await handleTransferFailed(event, env);
        break;
      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
} satisfies ExportedHandler<Env>;

// ── SETTLED → COMPLETED ────────────────────────────────
async function handleTransferCreated(event: Stripe.Event, env: Env) {
  const transfer = event.data.object as Stripe.Transfer;

  await env.SETTLEMENT_DB.prepare(`
    UPDATE payment_lifecycle
    SET status = 'COMPLETED', completed_at = datetime('now')
    WHERE stripe_transfer_id = ? AND status = 'SETTLED'
  `).bind(transfer.id).run();

  if (transfer.transfer_group) {
    await env.SETTLEMENT_DB.prepare(`
      UPDATE payment_lifecycle
      SET status = 'COMPLETED', completed_at = datetime('now')
      WHERE batch_id = ? AND status = 'SETTLED'
    `).bind(transfer.transfer_group).run();
  }

  console.log(`Transfer ${transfer.id} completed — batch ${transfer.transfer_group}`);
}

// ── COMPLETED → REFUNDED ───────────────────────────────
async function handleTransferReversed(event: Stripe.Event, env: Env) {
  const reversal = event.data.object as Stripe.TransferReversal;
  const transferId = reversal.transfer;

  const batch = await env.SETTLEMENT_DB.prepare(`
    SELECT batch_id FROM payment_lifecycle
    WHERE stripe_transfer_id = ? LIMIT 1
  `).bind(transferId).first<{ batch_id: string }>();

  if (batch?.batch_id) {
    await env.SETTLEMENT_DB.prepare(`
      UPDATE payment_lifecycle
      SET status = 'REFUNDED', refunded_at = datetime('now'),
          error = 'Stripe transfer reversed'
      WHERE batch_id = ?
    `).bind(batch.batch_id).run();

    console.log(`Batch ${batch.batch_id} reversed by Stripe`);
  }
}

// ── BATCHED/SETTLED → VERIFIED (rollback) ─────────────
async function handleTransferFailed(event: Stripe.Event, env: Env) {
  const transfer = event.data.object as Stripe.Transfer;

  if (transfer.transfer_group) {
    await env.SETTLEMENT_DB.prepare(`
      UPDATE payment_lifecycle
      SET status = 'VERIFIED', batch_id = NULL,
          error = 'Stripe transfer failed: ' || ?
      WHERE batch_id = ? AND status IN ('BATCHED', 'SETTLED')
    `).bind(transfer.id, transfer.transfer_group).run();

    console.log(`Batch ${transfer.transfer_group} failed — rolled back to VERIFIED`);
  }
}
