import type { Env, PaymentEvent, SettlementBatch, TenantRecord } from "./types";
import { usdcToStripeCents, atomicToUsdc, usdcToAtomic } from "./types";
import { createStripeTransfer, verifyStripeAccount } from "./stripe-client";
import { transferUsdcOnChain } from "./on-chain-settlement";

// ─── Batch settlement threshold ───────────────────────
// Settle when a merchant accumulates >= $1.00 USDC
const BATCH_THRESHOLD_USDC = "1.00";
// Or settle after 24 hours regardless of amount
const MAX_AGE_HOURS = 24;

export default {
  // ════════════════════════════════════════════════════
  //  HTTP HANDLER: Payment relay endpoint for tenant Workers
  // ════════════════════════════════════════════════════
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Health check ──────────────────────────────────
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", time: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Payment relay endpoint ────────────────────────
    // Tenant Workers POST verified payments here
    if (url.pathname === "/relay/payment" && request.method === "POST") {
      // Authenticate with shared API key
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.RELAY_API_KEY}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const payment = (await request.json()) as PaymentEvent;

      // Validate required fields
      if (!payment.tenant_id || !payment.merchant_address || !payment.amount) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Enqueue for async processing
      await env.INTERNAL_QUEUE.send(payment);

      return new Response(
        JSON.stringify({ status: "queued", tenant_id: payment.tenant_id }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Tenant registration endpoint ──────────────────
    // Called by your platform when a new temp account is deployed
    if (url.pathname === "/relay/register" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.RELAY_API_KEY}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const tenant = (await request.json()) as TenantRecord;

      await env.SETTLEMENT_DB.prepare(
        `INSERT INTO tenants (tenant_id, worker_url, claim_url, merchant_address, stripe_account_id, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id) DO UPDATE SET
           worker_url = excluded.worker_url,
           claim_url = excluded.claim_url,
           merchant_address = excluded.merchant_address,
           stripe_account_id = excluded.stripe_account_id`
      ).bind(
        tenant.tenant_id,
        tenant.worker_url,
        tenant.claim_url,
        tenant.merchant_address,
        tenant.stripe_account_id ?? null,
        tenant.status
      ).run();

      return new Response(
        JSON.stringify({ status: "registered", tenant_id: tenant.tenant_id }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Dashboard: pending settlements ────────────────
    if (url.pathname === "/dashboard/pending") {
      const result = await env.SETTLEMENT_DB.prepare(`
        SELECT merchant_address, stripe_account_id,
               SUM(CAST(amount_usdc AS REAL)) as total_usdc,
               COUNT(*) as payment_count,
               MIN(created_at) as oldest_payment
        FROM payments
        WHERE status = 'pending'
        GROUP BY merchant_address, stripe_account_id
        ORDER BY total_usdc DESC
      `).all();

      return new Response(JSON.stringify(result.results, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },

  // ════════════════════════════════════════════════════
  //  QUEUE CONSUMER: Ingest payment events into D1 ledger
  // ════════════════════════════════════════════════════
  async queue(
    batch: MessageBatch<PaymentEvent>,
    env: Env
  ): Promise<void> {
    const stmt = env.SETTLEMENT_DB.prepare(
      `INSERT INTO payments (id, tenant_id, tenant_worker_url, agent_wallet, tool_name,
        amount_usdc, merchant_address, stripe_account_id, network, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    );

    for (const message of batch.messages) {
      const payment = message.body;
      const paymentId = crypto.randomUUID();

      try {
        await stmt.bind(
          paymentId,
          payment.tenant_id,
          payment.tenant_worker_url,
          payment.agent_wallet,
          payment.tool,
          payment.amount,
          payment.merchant_address,
          payment.stripe_account_id ?? null,
          payment.network,
          payment.timestamp
        ).run();

        console.log(`[ledger] Recorded payment ${paymentId}: ${payment.amount} USDC from ${payment.agent_wallet}`);
        message.ack();
      } catch (err) {
        console.error(`[ledger] Failed to record payment: ${err}`);
        message.retry({ delaySeconds: 5 });
      }
    }
  },

  // ════════════════════════════════════════════════════
  //  CRON HANDLER: Batch settle every 5 minutes
  // ════════════════════════════════════════════════════
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`[settlement] Cron triggered: ${controller.cron}`);

    const batches = await env.SETTLEMENT_DB.prepare(`
      SELECT
        merchant_address,
        stripe_account_id,
        SUM(CAST(amount_usdc AS REAL)) as total_usdc,
        COUNT(*) as payment_count,
        MIN(created_at) as oldest_payment
      FROM payments
      WHERE status = 'pending'
      GROUP BY merchant_address, stripe_account_id
      HAVING
        total_usdc >= ? OR
        oldest_payment <= datetime('now', ?)
    `).bind(
      parseFloat(BATCH_THRESHOLD_USDC),
      `-${MAX_AGE_HOURS} hours`
    ).all();

    if (batches.results.length === 0) {
      console.log("[settlement] No batches ready for settlement");
      return;
    }

    console.log(`[settlement] Found ${batches.results.length} merchant batches ready`);

    for (const batchRow of batches.results) {
      const merchantAddress = batchRow.merchant_address as string;
      const stripeAccountId = batchRow.stripe_account_id as string | null;
      const totalUsdc = batchRow.total_usdc as number;
      const paymentCount = batchRow.payment_count as number;

      const batchId = crypto.randomUUID();
      const totalUsdcStr = totalUsdc.toFixed(6);

      console.log(
        `[settlement] Batch ${batchId}: ${paymentCount} payments, ` +
        `${totalUsdcStr} USDC → ${merchantAddress}`
      );

      await env.SETTLEMENT_DB.prepare(
        `INSERT INTO settlement_batches (id, merchant_address, stripe_account_id,
          total_usdc, payment_count, status)
         VALUES (?, ?, ?, ?, ?, 'created')`
      ).bind(batchId, merchantAddress, stripeAccountId, totalUsdcStr, paymentCount).run();

      await env.SETTLEMENT_DB.prepare(
        `UPDATE payments SET status = 'batched', batch_id = ?, batched_at = datetime('now')
         WHERE merchant_address = ? AND status = 'pending'`
      ).bind(batchId, merchantAddress).run();

      const onChainResult = await transferUsdcOnChain(
        env.PLATFORM_WALLET_PRIVATE_KEY,
        merchantAddress,
        totalUsdcStr
      );

      if (!onChainResult.success) {
        console.error(`[settlement] On-chain transfer failed: ${onChainResult.error}`);
        await env.SETTLEMENT_DB.prepare(
          `UPDATE settlement_batches SET status = 'on_chain_failed' WHERE id = ?`
        ).bind(batchId).run();
        await env.SETTLEMENT_DB.prepare(
          `UPDATE payments SET status = 'pending', batch_id = NULL WHERE batch_id = ?`
        ).bind(batchId).run();
        continue;
      }

      await env.SETTLEMENT_DB.prepare(
        `UPDATE settlement_batches SET status = 'on_chain_sent', tx_hash = ? WHERE id = ?`
      ).bind(onChainResult.txHash, batchId).run();

      await env.SETTLEMENT_DB.prepare(
        `UPDATE payments SET status = 'on_chain_sent', tx_hash = ? WHERE batch_id = ?`
      ).bind(onChainResult.txHash, batchId).run();

      if (stripeAccountId) {
        try {
          const accountValid = await verifyStripeAccount(env.STRIPE_SECRET_KEY, stripeAccountId);

          if (!accountValid) {
            console.error(`[settlement] Stripe account ${stripeAccountId} not enabled`);
            await env.SETTLEMENT_DB.prepare(
              `UPDATE settlement_batches SET status = 'stripe_failed' WHERE id = ?`
            ).bind(batchId).run();
            continue;
          }

          const stripeAmount = usdcToStripeCents(totalUsdcStr);
          const transfer = await createStripeTransfer(env.STRIPE_SECRET_KEY, {
            amount: stripeAmount,
            currency: "usd",
            destination: stripeAccountId,
            transferGroup: batchId,
            description: `x402 settlement: ${paymentCount} payments, batch ${batchId}`,
          });

          await env.SETTLEMENT_DB.prepare(
            `UPDATE settlement_batches SET status = 'stripe_paid', stripe_transfer_id = ? WHERE id = ?`
          ).bind(transfer.id, batchId).run();

          await env.SETTLEMENT_DB.prepare(
            `UPDATE payments SET status = 'stripe_paid', stripe_transfer_id = ? WHERE batch_id = ?`
          ).bind(transfer.id, batchId).run();

          console.log(
            `[settlement] Stripe transfer ${transfer.id}: ` +
            `$${(stripeAmount / 100).toFixed(2)} → ${stripeAccountId}`
          );
        } catch (err) {
          console.error(`[settlement] Stripe transfer failed: ${err}`);
          await env.SETTLEMENT_DB.prepare(
            `UPDATE settlement_batches SET status = 'stripe_failed' WHERE id = ?`
          ).bind(batchId).run();
        }
      } else {
        console.log(`[settlement] No Stripe account for ${merchantAddress}, on-chain only`);
      }

      await env.SETTLEMENT_DB.prepare(
        `UPDATE settlement_batches SET status = 'completed', completed_at = datetime('now')
         WHERE id = ? AND status = 'stripe_paid'`
      ).bind(batchId).run();

      await env.SETTLEMENT_DB.prepare(
        `UPDATE payments SET status = 'settled', settled_at = datetime('now')
         WHERE batch_id = ? AND status = 'stripe_paid'`
      ).bind(batchId).run();

      console.log(`[settlement] Batch ${batchId} completed ✅`);
    }

    const summary = await env.SETTLEMENT_DB.prepare(`
      SELECT status, COUNT(*) as count, SUM(CAST(amount_usdc AS REAL)) as total
      FROM payments
      GROUP BY status
    `).all();

    console.log("[settlement] Ledger summary:");
    for (const row of summary.results) {
      console.log(`  ${row.status}: ${row.count} payments, ${row.total} USDC`);
    }
  },
} satisfies ExportedHandler<Env, PaymentEvent>;
