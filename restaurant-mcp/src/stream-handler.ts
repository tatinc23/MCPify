import type { Env } from "./types";

// Phase 2: Handle media uploads to R2 + Stream transformations

export async function handleMediaUpload(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.MEDIA_BUCKET) {
    return new Response(JSON.stringify({
      error: "Media storage not configured. Complete account claim to enable.",
    }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const formData = await request.formData();
  const file = formData.get("video") as File;
  if (!file) {
    return new Response(JSON.stringify({ error: "No video file provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Upload raw video to R2
  const r2Key = `uploads/${crypto.randomUUID()}/${file.name}`;
  await env.MEDIA_BUCKET.put(r2Key, file.stream(), {
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
      contentType: file.type,
    },
  });

  // 2. Upload to Stream for processing + live input
  if (env.STREAM_API_TOKEN && env.ACCOUNT_ID) {
    const streamFormData = new FormData();
    streamFormData.append("file", file);

    const streamRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/stream`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.STREAM_API_TOKEN}` },
        body: streamFormData,
      }
    );
    const streamData = await streamRes.json();

    return new Response(JSON.stringify({
      r2_key: r2Key,
      stream_uid: streamData.result?.uid,
      playback_url: streamData.result?.playback?.hls,
      message: "Video uploaded to R2 and Stream for processing",
    }), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    r2_key: r2Key,
    message: "Video uploaded to R2 (Stream not configured)",
  }), { headers: { "Content-Type": "application/json" } });
}

// Generate vertical-cropped variant for social media
export async function createVerticalVariant(
  streamUid: string,
  env: Env
): Promise<Response> {
  if (!env.STREAM_API_TOKEN || !env.ACCOUNT_ID) {
    return new Response(JSON.stringify({ error: "Stream not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Request media transformation (9:16 vertical crop for Reels/Shorts)
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/stream/${streamUid}/copies`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STREAM_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta: { name: "vertical-9x16" },
        size: { width: 1080, height: 1920 },
        crop: { x: 0, y: 0, width: 1080, height: 1920 },
      }),
    }
  );
  const data = await res.json();

  return new Response(JSON.stringify(data.result), {
    headers: { "Content-Type": "application/json" },
  });
}
