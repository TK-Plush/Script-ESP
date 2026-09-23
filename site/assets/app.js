/* BreachLookup — shared client logic */

const $ = (id) => document.getElementById(id);

/* ---------------- Fingerprint ---------------- */
function canvasHash() {
  try {
    const c = document.createElement("canvas");
    c.width = 260; c.height = 40;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 0, 80, 40);
    ctx.fillStyle = "#069";
    ctx.fillText("BreachLookup🦠", 4, 8);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("fp-xyz", 100, 18);
    return c.toDataURL().slice(-64);
  } catch (e) { return "canvas-denied"; }
}

async function fingerprint() {
  const ua = navigator.userAgent;
  const match = ua.match(/\((.*?)\)/);
  const device = match ? match[1] : ua.slice(0, 80);
  const parts = {
    time: new Date().toISOString(),
    url: location.href,
    path: location.pathname + location.search,
    referer: document.referrer,
    device,
    user_agent: ua,
    platform: navigator.platform || "",
    language: navigator.language,
    languages: navigator.languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: window.devicePixelRatio,
    touch: navigator.maxTouchPoints > 0,
    online: navigator.onLine,
    canvas_hash: canvasHash(),
    battery: null,
  };
  if (navigator.getBattery) {
    try {
      const b = await navigator.getBattery();
      parts.battery = `${Math.round(b.level * 100)}%${b.charging ? " charging" : ""}`;
    } catch (e) {}
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      parts.webgl_renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "n/a";
    }
  } catch (e) {}
  try {
    const fonts = ["Arial", "Verdana", "Comic Sans MS", "Roboto", "Impact", "Monospace",
                   "Poppins", "Calibri", "Helvetica Neue", "Segoe UI", "Times New Roman"];
    const available = fonts.filter((f) => document.fonts && document.fonts.check(`16px "${f}"`));
    parts.fonts = available;
  } catch (e) {}
  return parts;
}

/* ---------------- API helpers ---------------- */
async function postReport(payload) {
  // Tries backend first, then webhook.site style, then falls back to local demo
  const targets = [
    { url: "/report", mode: "same-origin" },
    { url: localStorage.getItem("report_url") || "", mode: "custom" },
  ];
  for (const t of targets) {
    if (!t.url) continue;
    try {
      const r = await fetch(t.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) return { sent: true, to: t.url };
    } catch (e) { /* try next */ }
  }
  return { sent: false };
}

async function geomap(ip) {
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { timeout: 5000 });
    const d = await r.json();
    return `${d.country_name || "?"} / ${d.city || "?"} / ${d.org || "?"} (${d.latitude},${d.longitude})`;
  } catch (e) { return "geo unavailable"; }
}

function shortUrl(url) {
  return fetch("https://tinyurl.com/api-create.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "url=" + encodeURIComponent(url),
  }).then((r) => r.text()).then((t) => (t.startsWith("http") ? t : url)).catch(() => url);
}

function qrFor(url, holder) {
  const img = document.createElement("img");
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=12&data=${encodeURIComponent(url)}`;
  img.alt = "QR";
  holder.innerHTML = "";
  holder.appendChild(img);
}

/* ---------------- Password check (k-anonymity) ---------------- */
async function sha1hex(str) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function pwCheck(password) {
  const hash = await sha1hex(password);
  const prefix = hash.slice(0, 5), suffix = hash.slice(5);
  const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
  const text = await r.text();
  for (const line of text.split("\n")) {
    const [h, count] = line.trim().split(":");
    if (h === suffix) return { hit: true, count };
  }
  return { hit: false };
}

/* ---------------- Page behaviors ---------------- */
function wireIndex() {
  if (!$("btn-pw")) return;
  $("btn-pw").onclick = async () => {
    const pw = $("pw").value;
    const out = $("out-pw");
    if (!pw) return;
    out.textContent = "Checking against HIBP breach corpus…";
    try {
      const res = await pwCheck(pw);
      out.className = "out " + (res.hit ? "bad" : "good");
      out.textContent = res.hit
        ? `⚠ BREACHED — this password appears ${res.count} times in known breaches.`
        : "✓ Clean — not found in breach corpora.";
    } catch (e) { out.className = "out bad"; out.textContent = "Error: " + e.message; }
  };
  $("btn-em").onclick = async () => {
    const em = $("em").value; const out = $("out-em");
    if (!em) return;
    out.textContent = "Sending to backend… (needs `python3 breach_lookup.py lookup " + em + " --email you@x.com` running)\n\nTip: this needs the Python CLI with an API key — run it in your terminal.";
    out.className = "out";
  };
  $("btn-fp").onclick = async () => {
    const out = $("out-fp");
    out.textContent = "collecting…";
    const fp = await fingerprint();
    out.textContent = JSON.stringify(fp, null, 2);
  };
}

function wireGenlink() {
  if (!$("btn-gen")) return;
  $("btn-gen").onclick = async () => {
    const base = $("base").value.trim();
    const target = $("target").value.trim();
    const out = $("out");
    if (!base) { out.textContent = "Enter your backend URL first."; return; }
    let url = base.replace(/\/+$/, "") + "/";
    if (target) url += "?q=" + encodeURIComponent(target);
    out.textContent = "Shortening…";
    const short = await shortUrl(url);
    out.innerHTML = "";
    const longEl = document.createElement("div");
    longEl.innerHTML = `<b>Long URL:</b> <a href="${url}" target="_blank">${url}</a><br><b>Short URL:</b> <a href="${short}" target="_blank">${short}</a><br><b>Tip:</b> the QR shows the short link.`;
    out.appendChild(longEl);
    out.appendChild(document.createElement("br"));
    qrFor(short, out);
    out.classList.add("good");
  };
}

function wireClick() {
  const fpEl = $("fp"), formbox = $("formbox"), status = $("status");
  if (!fpEl) return;
  if (performance.getEntriesByType("navigation")[0]?.type === "reload") {
    // second visit — auto-send quietly
  }
  fingerprint().then(async (fp) => {
    fpEl.textContent = JSON.stringify(fp, null, 2);
    window.__fp = fp;
  });
  $("btn-send").onclick = async () => {
    const payload = Object.assign({}, window.__fp, {
      email: $("cem").value || "",
      phone: $("ctel").value || "",
    });
    status.textContent = "Sending report…";
    const res = await postReport(payload);
    if (res.sent) {
      status.className = "out good";
      status.textContent = "✓ Report sent to " + res.to + "\n\nPayload:\n" + JSON.stringify(payload, null, 2);
      formbox.style.display = "none";
    } else {
      status.className = "out bad";
      status.textContent = "No backend reachable. Configure your Python server.\n\nPayload:\n" + JSON.stringify(payload, null, 2);
    }
  };
}

document.addEventListener("DOMContentLoaded", () => {
  wireIndex(); wireGenlink(); wireClick();
});