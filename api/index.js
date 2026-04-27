// MainVPN · Vercel XHTTP Relay
// https://github.com/mainvpn/vercel-xhttp-relay
// Edge-runtime XHTTP relay for Xray/V2Ray. MIT licensed.

export const config = { runtime: "edge" };

const DEFAULT_TARGET_BASE = "http://157.173.100.12:2020";

const TARGET_BASE = (
  process.env.TARGET_DOMAIN ||
  process.env.TARGET_URL ||
  process.env.UPSTREAM_URL ||
  DEFAULT_TARGET_BASE
).replace(/\/$/, "");

// Hop-by-hop and platform headers that must NEVER be forwarded upstream.
const STRIP_REQ_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  // Force identity below; drop whatever the client/edge negotiated so the
  // Edge fetch doesn't transparently decompress the upstream body and
  // desync the XHTTP framing.
  "accept-encoding",
]);

// Headers we must strip from the upstream response before handing it back
// to Vercel's edge: hop-by-hop, plus content-encoding / content-length
// (we forced identity upstream, but defensive in case an intermediate
// added them).
const STRIP_RES_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
]);

function getRequestPath(url) {
  const pathStart = url.indexOf("/", 8);
  return pathStart === -1 ? "/" : url.slice(pathStart);
}

function wantsHtml(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

function maskTarget(target) {
  if (!target) return "Not configured";

  try {
    const url = new URL(target);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return target;
  }
}

function renderPage() {
  const isConfigured = Boolean(TARGET_BASE);
  const statusLabel = isConfigured ? "Ready" : "Setup required";
  const statusColor = isConfigured ? "#0f9d58" : "#e37400";
  const statusText = isConfigured
    ? "Relay is configured and ready to forward XHTTP traffic."
    : "Add TARGET_DOMAIN in your Vercel project settings, then redeploy or promote the new deployment.";
  const targetPreview = maskTarget(TARGET_BASE);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MainVPN Relay Status</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --panel: rgba(255, 252, 246, 0.88);
        --text: #1b1b18;
        --muted: #645f57;
        --line: rgba(27, 27, 24, 0.1);
        --accent: #0b6e4f;
        --accent-2: #d95d39;
        --shadow: 0 30px 80px rgba(61, 44, 19, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(217, 93, 57, 0.22), transparent 30%),
          radial-gradient(circle at bottom right, rgba(11, 110, 79, 0.2), transparent 32%),
          linear-gradient(135deg, #f7f1e8, #efe6d8 45%, #f6f0e8);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .shell {
        width: min(980px, 100%);
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
        backdrop-filter: blur(14px);
      }
      .hero {
        padding: 32px 32px 20px;
        border-bottom: 1px solid var(--line);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--line);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${statusColor};
        box-shadow: 0 0 0 6px color-mix(in srgb, ${statusColor} 18%, transparent);
      }
      h1 {
        margin: 18px 0 10px;
        font-size: clamp(36px, 6vw, 72px);
        line-height: 0.94;
        letter-spacing: -0.04em;
      }
      .lede {
        margin: 0;
        max-width: 64ch;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.6;
      }
      .grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 0;
      }
      .panel {
        padding: 28px 32px 32px;
      }
      .panel + .panel {
        border-left: 1px solid var(--line);
      }
      h2 {
        margin: 0 0 16px;
        font-size: 16px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px 20px;
        background: rgba(255, 255, 255, 0.6);
      }
      .card + .card { margin-top: 14px; }
      .label {
        color: var(--muted);
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .value {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 700;
        word-break: break-word;
      }
      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 14px;
      }
      ol {
        margin: 12px 0 0;
        padding-left: 20px;
        color: var(--muted);
        line-height: 1.7;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 32px 28px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 14px;
      }
      a { color: var(--accent); }
      .accent { color: var(--accent-2); }
      @media (max-width: 820px) {
        .grid { grid-template-columns: 1fr; }
        .panel + .panel {
          border-left: 0;
          border-top: 1px solid var(--line);
        }
        .footer {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow"><span class="dot"></span>MainVPN relay status</div>
        <h1>Vercel XHTTP Relay</h1>
        <p class="lede">${statusText} Browser visits land on this setup page; XHTTP relay traffic continues to stream through the same Edge function.</p>
      </section>
      <section class="grid">
        <section class="panel">
          <h2>Runtime</h2>
          <div class="card">
            <div class="label">Status</div>
            <div class="value">${statusLabel}</div>
          </div>
          <div class="card">
            <div class="label">Configured upstream</div>
            <div class="value"><code>${targetPreview}</code></div>
          </div>
          <div class="card">
            <div class="label">Expected env var</div>
            <div class="value"><code>TARGET_DOMAIN</code></div>
          </div>
        </section>
        <section class="panel">
          <h2>Deploy checklist</h2>
          <div class="card">
            <div class="label">What to do</div>
            <ol>
              <li>Open your Vercel project settings and add <code>TARGET_DOMAIN</code>.</li>
              <li>Use the full upstream URL, for example <code>https://xray.example.com:2096</code>.</li>
              <li>Redeploy, or promote a deployment created after the env var was added.</li>
              <li>Point your Xray client host to this Vercel deployment domain.</li>
            </ol>
          </div>
          <div class="card">
            <div class="label">Relay path</div>
            <div class="value"><code>Any path supported by your backend XHTTP inbound</code></div>
          </div>
        </section>
      </section>
      <footer class="footer">
        <span>Maintained by <span class="accent">MainVPN</span></span>
        <a href="https://github.com/mainvpn/vercel-xhttp-relay">github.com/mainvpn/vercel-xhttp-relay</a>
      </footer>
    </main>
  </body>
</html>`;
}

export default async function handler(req) {
  const requestPath = getRequestPath(req.url);

  if (requestPath === "/__health") {
    return Response.json({
      ok: Boolean(TARGET_BASE),
      configured: Boolean(TARGET_BASE),
      target: maskTarget(TARGET_BASE),
    }, {
      status: TARGET_BASE ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  }

  if (wantsHtml(req)) {
    return new Response(renderPage(), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const targetUrl = requestPath === "/" ? TARGET_BASE + "/" : TARGET_BASE + requestPath;

    const reqHeaders = new Headers();
    let clientIp = null;
    for (const [k, v] of req.headers) {
      if (STRIP_REQ_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      if (k === "x-real-ip") {
        clientIp = v;
        continue;
      }
      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = v;
        continue;
      }
      reqHeaders.set(k, v);
    }
    if (clientIp) reqHeaders.set("x-forwarded-for", clientIp);
    // Tell upstream "do not compress" so the Edge fetch returns raw bytes
    // and XHTTP framing stays byte-exact end-to-end.
    reqHeaders.set("accept-encoding", "identity");

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const upstream = await fetch(targetUrl, {
      method,
      headers: reqHeaders,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    // Re-emit the response with hop-by-hop / encoding headers stripped so
    // Vercel's edge doesn't double-process or re-chunk the body.
    const resHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      if (STRIP_RES_HEADERS.has(k)) continue;
      resHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("relay error:", err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
