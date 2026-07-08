// claim-detector.ts
// Polls the worker URL to detect when the temp account has been claimed.

import { readFileSync } from "fs";

interface DeployOutput {
  worker_url: string;
  claim_url: string;
  deployed_at: string;
  expires_at: string;
  phase: string;
}

async function checkWorkerHealth(workerUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${workerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getWorkerPhase(workerUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${workerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { phase?: string };
    return data.phase ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const deployOutput = JSON.parse(
    readFileSync(".deploy-output.json", "utf-8")
  ) as DeployOutput;

  const { worker_url, expires_at } = deployOutput;
  const expiryTime = new Date(expires_at).getTime();

  console.log(`🔍 Monitoring claim status for: ${worker_url}`);
  console.log(`⏰ Temp account expires at: ${expires_at}`);
  console.log("");

  let pollCount = 0;
  const pollIntervalMs = 30_000; // 30 seconds

  while (true) {
    pollCount++;
    const now = Date.now();
    const isAlive = await checkWorkerHealth(worker_url);
    const phase = await getWorkerPhase(worker_url);

    console.log(
      `[${new Date().toISOString()}] Poll #${pollCount} — ` +
      `Alive: ${isAlive} — Phase: ${phase ?? "unknown"}`
    );

    if (phase === "claimed") {
      console.log("✅ Account claimed! Phase transition detected.");
      console.log("→ Run: npm run post-claim");
      break;
    }

    if (now > expiryTime && isAlive) {
      console.log("✅ Account claimed! Worker survived past temp expiry.");
      console.log("→ Run: npm run post-claim");
      break;
    }

    if (now > expiryTime + 5 * 60_000 && !isAlive) {
      console.log("❌ Temp account expired and was not claimed.");
      console.log("→ Re-run: npm run deploy:temp");
      break;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

main().catch(console.error);
