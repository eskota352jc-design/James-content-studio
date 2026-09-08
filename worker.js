const ALLOWED_ORIGIN = "https://eskota352jc-design.github.io";
const REDIRECT_URI = "https://square-violet-cb18.eskota352-jc.workers.dev/oauth/callback";
const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "James Content Studio API",
        status: url.pathname === "/health" ? "healthy" : "online",
        tiktok_credentials_configured: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
        oauth_redirect_uri: REDIRECT_URI,
      }, 200, corsHeaders);
    }

    if (url.pathname === "/oauth/start") {
      if (!env.TIKTOK_CLIENT_KEY) return json({ ok: false, error: "TikTok client key is not configured" }, 500, corsHeaders);

      const state = crypto.randomUUID().replaceAll("-", "");
      const authUrl = new URL(TIKTOK_AUTHORIZE_URL);
      authUrl.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "user.info.basic");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("state", state);

      const headers = new Headers({ Location: authUrl.toString() });
      headers.append("Set-Cookie", `tiktok_oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/oauth/callback") {
      const error = url.searchParams.get("error");
      if (error) {
        return json({ ok: false, error, error_description: url.searchParams.get("error_description") || "TikTok authorization was not completed" }, 400, corsHeaders);
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const cookieState = readCookie(request.headers.get("Cookie") || "", "tiktok_oauth_state");
      if (!code) return json({ ok: false, error: "Missing authorization code" }, 400, corsHeaders);
      if (!returnedState || !cookieState || returnedState !== cookieState) return json({ ok: false, error: "Invalid OAuth state" }, 400, corsHeaders);

      return json({ ok: true, status: "authorization_code_received", message: "TikTok returned a valid authorization code. Token exchange is the next backend step." }, 200, corsHeaders, {
        "Set-Cookie": "tiktok_oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      });
    }

    return json({ ok: false, error: "Not found" }, 404, corsHeaders);
  },
};

function readCookie(cookieHeader, name) {
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function json(data, status, extraHeaders = {}, additionalHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8", ...extraHeaders, ...additionalHeaders },
  });
}
