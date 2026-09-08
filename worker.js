const ALLOWED_ORIGIN = "https://eskota352jc-design.github.io";
const REDIRECT_URI = "https://square-violet-cb18.eskota352-jc.workers.dev/oauth/callback";
const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

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
      return json({
        ok: true,
        service: "James Content Studio API",
        status: url.pathname === "/health" ? "healthy" : "online",
        tiktok_credentials_configured: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
        token_storage_configured: Boolean(env.TIKTOK_TOKENS),
        oauth_redirect_uri: REDIRECT_URI,
      }, 200, corsHeaders);
    }

    if (url.pathname === "/oauth/start") {
      if (!env.TIKTOK_CLIENT_KEY) {
        return json({ ok: false, error: "TikTok client key is not configured" }, 500, corsHeaders);
      }

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
      const oauthError = url.searchParams.get("error");
      if (oauthError) {
        return json({
          ok: false,
          error: oauthError,
          error_description: url.searchParams.get("error_description") || "TikTok authorization was not completed",
        }, 400, corsHeaders);
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const cookieState = readCookie(request.headers.get("Cookie") || "", "tiktok_oauth_state");

      if (!code) return json({ ok: false, error: "Missing authorization code" }, 400, corsHeaders);
      if (!returnedState || !cookieState || returnedState !== cookieState) {
        return json({ ok: false, error: "Invalid OAuth state" }, 400, corsHeaders);
      }
      if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
        return json({ ok: false, error: "TikTok credentials are not configured" }, 500, corsHeaders);
      }
      if (!env.TIKTOK_TOKENS) {
        return json({ ok: false, error: "Secure token storage is not configured" }, 500, corsHeaders);
      }

      const body = new URLSearchParams({
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      });

      const tokenResponse = await fetch(TIKTOK_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body,
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || tokenData.error) {
        return json({
          ok: false,
          status: "token_exchange_failed",
          error: tokenData.error || "token_exchange_failed",
          error_description: tokenData.error_description || "TikTok did not issue a user access token",
          log_id: tokenData.log_id || null,
        }, tokenResponse.status || 400, corsHeaders);
      }

      const now = Date.now();
      const storedToken = {
        open_id: tokenData.open_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        access_token_expires_at: now + Number(tokenData.expires_in || 0) * 1000,
        refresh_token_expires_at: now + Number(tokenData.refresh_expires_in || 0) * 1000,
        connected_at: now,
      };

      await env.TIKTOK_TOKENS.put(`tiktok:${tokenData.open_id}`, JSON.stringify(storedToken));
      await env.TIKTOK_TOKENS.put("tiktok:active_open_id", tokenData.open_id);

      const headers = {
        ...corsHeaders,
        "Set-Cookie": "tiktok_oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      };

      return json({
        ok: true,
        status: "connected_and_stored",
        connected: true,
        scope: tokenData.scope,
        access_token_expires_in: tokenData.expires_in,
        refresh_token_expires_in: tokenData.refresh_expires_in,
        message: "TikTok authorization succeeded. Tokens are stored server-side and are not exposed to the browser.",
      }, 200, headers);
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

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...headers,
    },
  });
}
