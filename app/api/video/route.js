// CineForge AI — Video generation API
// POST /api/video   -> submit generation to Seedance (fal queue) OR free demo mode
// GET  /api/video?statusUrl=... -> poll queue status (+ fetch result when done)

import { buildPayload, MODEL_BY_ID, SAMPLE_VIDEOS } from "../../../lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

const API_KEY = process.env.FAL_KEY || "";
const HAS_KEY = API_KEY && API_KEY.length > 8 && !/YOUR|XXX|PLACEHOLDER|changeme/i.test(API_KEY);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function uploadToFal(base64Data, fileName = "image.png") {
  const b64 = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/png" }), fileName);
  const res = await fetch("https://rest.alpha.fal.ai/storage/upload", {
    method: "POST",
    headers: { Authorization: `Key ${API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Image upload failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.url;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const modelId = body.modelId;
    const form = body.form || {};
    const model = MODEL_BY_ID[modelId];

    if (!model) return json({ error: "Unknown model" }, 400);

    // ——— FREE DEMO MODE (no FAL key configured) ———
    if (!HAS_KEY) {
      const demoUrl = SAMPLE_VIDEOS[Math.floor(Math.random() * SAMPLE_VIDEOS.length)];
      return json({
        ok: true,
        demo: true,
        modelId,
        requestId: `demo_${Date.now().toString(36)}`,
        demoUrl,
        demoSeconds: 4 + Math.floor(Math.random() * 5),
      });
    }

    // ——— REAL GENERATION ———
    const payload = { ...buildPayload(model, form) };

    // Upload base64 images to fal storage
    if (form.imageData) {
      payload.image_url = await uploadToFal(form.imageData, "start.png");
    }
    if (form.endImageData) {
      payload.end_image_url = await uploadToFal(form.endImageData, "end.png");
    }
    if (form.refImagesData && form.refImagesData.length) {
      const urls = [];
      for (const d of form.refImagesData) urls.push(await uploadToFal(d, `ref_${urls.length}.png`));
      payload.reference_image_urls = urls;
    }

    const res = await fetch(`https://queue.fal.run/${modelId}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json(
        { error: `fal API error ${res.status}: ${(data.detail || data.message || JSON.stringify(data)).slice(0, 300)}` },
        502
      );
    }
    const requestId = data.request_id || data.id;
    if (!requestId) return json({ error: "fal did not return a request id" }, 502);

    return json({
      ok: true,
      demo: false,
      modelId,
      requestId,
      statusUrl: data.status_url || `https://queue.fal.run/${modelId}/requests/${requestId}/status`,
      responseUrl: data.response_url || `https://queue.fal.run/${modelId}/requests/${requestId}`,
      payload,
    });
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 500);
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const statusUrl = url.searchParams.get("statusUrl");

    if (!statusUrl) return json({ error: "Missing statusUrl" }, 400);

    if (!HAS_KEY) {
      // Demo polling should never hit the server; return generic.
      return json({ ok: false, error: "Demo mode polls from the client" }, 200);
    }

    // Only allow queue.fal.run URLs (no open proxy)
    let target;
    try {
      target = new URL(statusUrl);
    } catch {
      return json({ error: "Invalid status URL" }, 400);
    }
    if (!target.hostname.endsWith("fal.run") && !target.hostname.endsWith("fal.ai")) {
      return json({ error: "Unallowed host" }, 400);
    }

    const res = await fetch(target.toString(), {
      headers: { Authorization: `Key ${API_KEY}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));

    let result = null;
    if (data.status === "COMPLETED") {
      const respUrl = data.response_url || data.responseUrl || data.url;
      if (respUrl) {
        try {
          const r2 = await fetch(respUrl, { headers: { Authorization: `Key ${API_KEY}` }, cache: "no-store" });
          result = await r2.json();
        } catch {
          result = null;
        }
      }
    }

    return json({ ok: true, status: data.status, queuePosition: data.queue_position, result, raw: data });
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 500);
  }
}