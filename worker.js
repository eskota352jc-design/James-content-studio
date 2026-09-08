const ALLOWED_ORIGIN = "https://eskota352jc-design.github.io";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      const credentialsConfigured = Boolean(
        env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET
      );

      return json(
        {
          ok: true,
          service: "James Content Studio API",
          status: url.pathname === "/health" ? "healthy" : "online",
          tiktok_credentials_configured: credentialsConfigured,
        },
        200,
        corsHeaders
      );
    }

    return json({ ok: false, error: "Not found" }, 404, corsHeaders);
  },
};

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...extraHeaders,
    },
  });
}
