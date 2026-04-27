// MainVPN · Vercel XHTTP Relay
// https://github.com/mainvpn/vercel-xhttp-relay
// Edge-runtime XHTTP relay for Xray/V2Ray. MIT licensed.

export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

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

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const pathStart = req.url.indexOf("/", 8);
    const targetUrl =
      pathStart === -1 ? TARGET_BASE + "/" : TARGET_BASE + req.url.slice(pathStart);

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
