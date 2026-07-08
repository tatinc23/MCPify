// post-claim-setup.ts
// Runs after claim is detected. Creates R2 bucket + Stream live input.

import { readFileSync, writeFileSync } from "fs";

interface DeployOutput {
  worker_url: string;
  claim_url: string;
  deployed_at: string;
  expires_at: string;
  phase: string;
}

async function createR2Bucket(accountId: string, apiToken: string, bucketName: string) {
  console.log(`📦 Creating R2 bucket: ${bucketName}`);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: bucketName }),
    }
  );
  const data = await res.json() as any;
  if (!data.success) {
    console.log(`  ⚠️  ${data.errors?.[0]?.message ?? "Bucket may already exist"}`);
  } else {
    console.log(`  ✅ Created`);
  }
  return data;
}

async function createStreamLiveInput(accountId: string, apiToken: string, name: string) {
  console.log(`🎥 Creating Stream live input: ${name}`);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta: { name },
        recording: { mode: "automatic" },
      }),
    }
  );
  const data = await res.json() as any;
  if (!data.success) {
    throw new Error(`Stream live input creation failed: ${JSON.stringify(data.errors)}`);
  }
  console.log(`  ✅ Created — UID: ${data.result.uid}`);
  return data.result.uid;
}

async function storeWorkerSecret(
  accountId: string,
  apiToken: string,
  workerName: string,
  secretName: string,
  secretValue: string
) {
  console.log(`🔑 Storing secret: ${secretName}`);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/secrets`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: secretName,
        text: secretValue,
        type: "secret_text",
      }),
    }
  );
  const data = await res.json() as any;
  if (!data.success) {
    throw new Error(`Failed to store secret ${secretName}: ${JSON.stringify(data.errors)}`);
  }
  console.log(`  ✅ Stored`);
}

async function main() {
  const accountId = process.env.CF_ACCOUNT_ID!;
  const apiToken = process.env.CF_API_TOKEN!;
  const workerName = "restaurant-mcp";

  if (!accountId || !apiToken) {
    console.error("❌ Set CF_ACCOUNT_ID and CF_API_TOKEN environment variables");
    process.exit(1);
  }

  console.log("🔧 Post-claim setup starting...\n");

  await createR2Bucket(accountId, apiToken, "restaurant-media");
  const liveInputUid = await createStreamLiveInput(accountId, apiToken, "restaurant-live");

  await storeWorkerSecret(accountId, apiToken, workerName, "LIVE_INPUT_ID", liveInputUid);
  await storeWorkerSecret(accountId, apiToken, workerName, "STREAM_API_TOKEN", apiToken);
  await storeWorkerSecret(accountId, apiToken, workerName, "ACCOUNT_ID", accountId);

  const deployOutput = JSON.parse(readFileSync(".deploy-output.json", "utf-8")) as DeployOutput;
  deployOutput.phase = "claimed";
  writeFileSync(".deploy-output.json", JSON.stringify(deployOutput, null, 2));

  console.log("\n✅ Post-claim setup complete!");
}

main().catch(console.error);
