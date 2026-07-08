import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env, MenuItem, Reservation } from "./types";

export class PaidMCP extends McpAgent {
  server = new McpServer({
    name: "Restaurant MCP Server",
    version: "1.0.0",
  });

  async init() {
    // ── Free: Business hours ─────────────────────────
    this.server.tool(
      "get_hours",
      "Get restaurant business hours (free)",
      {},
      async () => {
        const hours = {
          monday: "11:00-22:00",
          tuesday: "11:00-22:00",
          wednesday: "11:00-22:00",
          thursday: "11:00-22:00",
          friday: "11:00-23:00",
          saturday: "12:00-23:00",
          sunday: "12:00-21:00",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(hours) }],
        };
      }
    );

    // ── Paid: Full menu ($0.01) ──────────────────────
    this.server.tool(
      "get_menu",
      "Get full restaurant menu with prices and descriptions",
      { category: z.string().optional() },
      async ({ category }) => {
        let query = "SELECT * FROM menu_items WHERE available = 1";
        const params: string[] = [];
        if (category) {
          query += " AND category = ?";
          params.push(category);
        }
        query += " ORDER BY category, name";

        const result = await this.env.CRM_DB.prepare(query).bind(...params).all();
        return {
          content: [{ type: "text", text: JSON.stringify(result.results) }],
        };
      }
    );

    // ── Paid: Reserve table ($0.05) ──────────────────
    this.server.tool(
      "reserve_table",
      "Reserve a table at the restaurant",
      {
        customer_name: z.string(),
        party_size: z.number().int().min(1).max(20),
        datetime: z.string(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
      },
      async ({ customer_name, party_size, datetime, phone, email }) => {
        const result = await this.env.CRM_DB.prepare(
          `INSERT INTO reservations (customer_name, party_size, datetime, phone, email)
           VALUES (?, ?, ?, ?, ?)
           RETURNING *`
        ).bind(customer_name, party_size, datetime, phone ?? null, email ?? null)
          .first();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              confirmed: true,
              reservation: result,
              message: `Table reserved for ${party_size} on ${datetime}`,
            }),
          }],
        };
      }
    );

    // ── Paid: Place takeout order ($0.10) ────────────
    this.server.tool(
      "place_takeout_order",
      "Place a takeout order",
      {
        customer_name: z.string(),
        items: z.array(z.object({
          menu_item_id: z.number(),
          quantity: z.number().int().min(1),
        })),
        pickup_time: z.string(),
      },
      async ({ customer_name, items, pickup_time }) => {
        const itemIds = items.map(i => i.menu_item_id);
        const placeholders = itemIds.map(() => "?").join(",");
        const menuItems = await this.env.CRM_DB.prepare(
          `SELECT id, name, price FROM menu_items WHERE id IN (${placeholders})`
        ).bind(...itemIds).all();

        const itemMap = new Map(menuItems.results.map(m => [m.id, m]));
        let total = 0;
        const orderItems = items.map(i => {
          const menuItem = itemMap.get(i.menu_item_id);
          if (!menuItem) throw new Error(`Menu item ${i.menu_item_id} not found`);
          total += menuItem.price * i.quantity;
          return { name: menuItem.name, price: menuItem.price, quantity: i.quantity };
        });

        const result = await this.env.CRM_DB.prepare(
          `INSERT INTO takeout_orders (customer_name, items_json, total, pickup_time)
           VALUES (?, ?, ?, ?) RETURNING *`
        ).bind(
          customer_name,
          JSON.stringify(orderItems),
          total,
          pickup_time
        ).first();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              confirmed: true,
              order: result,
              total: `$${total.toFixed(2)}`,
              pickup_time,
            }),
          }],
        };
      }
    );

    // ── Paid: Generate marketing copy ($0.03) ────────
    this.server.tool(
      "generate_marketing_copy",
      "Generate AI marketing copy for social media",
      {
        platform: z.enum(["instagram", "facebook", "twitter"]),
        tone: z.enum(["casual", "professional", "playful"]).default("casual"),
      },
      async ({ platform, tone }) => {
        const menu = await this.env.CRM_DB.prepare(
          "SELECT name, description FROM menu_items WHERE available = 1 LIMIT 5"
        ).all();

        const menuText = menu.results
          .map(m => `${m.name}: ${m.description}`)
          .join("\n");

        const aiResponse = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct" as any, {
          messages: [
            {
              role: "system",
              content: `You are a marketing copywriter for a restaurant. Write a ${tone} ${platform} post. Keep it under 200 characters. Include relevant emojis.`,
            },
            {
              role: "user",
              content: `Menu items:\n${menuText}\n\nWrite a promotional post.`,
            },
          ],
        });

        const copy = (aiResponse as any).response ?? "Generated copy unavailable";

        await this.env.CRM_DB.prepare(
          "INSERT INTO marketing_assets (type, content, platform) VALUES (?, ?, ?)"
        ).bind("social_post", copy, platform).run();

        return {
          content: [{ type: "text", text: JSON.stringify({ platform, tone, copy }) }],
        };
      }
    );

    // ── Paid: Watch live kitchen ($0.02/min) ─────────
    this.server.tool(
      "watch_live_kitchen",
      "Watch the live kitchen stream (per-minute charge)",
      { duration_minutes: z.number().int().min(1).max(60).default(5) },
      async ({ duration_minutes }) => {
        if (!this.env.LIVE_INPUT_ID || !this.env.STREAM_API_TOKEN) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Live streaming not configured. Complete account claim to enable.",
              }),
            }],
          };
        }

        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/stream/live_inputs/${this.env.LIVE_INPUT_ID}/videos`,
          { headers: { Authorization: `Bearer ${this.env.STREAM_API_TOKEN}` } }
        );
        const data = await res.json();
        const liveVideo = data.result?.find((v: any) => v.status === "live");

        if (!liveVideo) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: "No active live stream right now" }),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              hls_url: `https://customer-${this.env.ACCOUNT_ID}.cloudflarestream.com/${liveVideo.uid}/manifest/video.m3u8`,
              duration_minutes,
              message: `Access granted for ${duration_minutes} minutes`,
            }),
          }],
        };
      }
    );
  }
}
