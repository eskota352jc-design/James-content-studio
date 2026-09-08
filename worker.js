const ALLOWED_ORIGIN = "https://eskota352jc-design.github.io";
const REDIRECT_URI = "https://square-violet-cb18.eskota352-jc.workers.dev/oauth/callback";
const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API = "https://open.tiktokapis.com/v2";
const TIKTOK_SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload";
const REFRESH_EARLY_MS = 5 * 60 * 1000;

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
      return json({ ok: true, service: "James Content Studio API", status: url.pathname === "/health" ? "healthy" : "online", tiktok_credentials_configured: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET), token_storage_configured: Boolean(env.TIKTOK_TOKENS), oauth_redirect_uri: REDIRECT_URI }, 200, corsHeaders);
    }

    if (url.pathname === "/oauth/start") {
      if (!env.TIKTOK_CLIENT_KEY) return json({ ok: false, error: "TikTok client key is not configured" }, 500, corsHeaders);
      const state = crypto.randomUUID().replaceAll("-", "");
      const authUrl = new URL(TIKTOK_AUTHORIZE_URL);
      authUrl.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", TIKTOK_SCOPES);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("state", state);
      const headers = new Headers({ Location: authUrl.toString() });
      headers.append("Set-Cookie", `tiktok_oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/oauth/callback") {
      const oauthError = url.searchParams.get("error");
      if (oauthError) return json({ ok: false, error: oauthError, error_description: url.searchParams.get("error_description") || "TikTok authorization was not completed" }, 400, corsHeaders);
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const cookieState = readCookie(request.headers.get("Cookie") || "", "tiktok_oauth_state");
      if (!code) return json({ ok: false, error: "Missing authorization code" }, 400, corsHeaders);
      if (!returnedState || !cookieState || returnedState !== cookieState) return json({ ok: false, error: "Invalid OAuth state" }, 400, corsHeaders);
      if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) return json({ ok: false, error: "TikTok credentials are not configured" }, 500, corsHeaders);
      if (!env.TIKTOK_TOKENS) return json({ ok: false, error: "Secure token storage is not configured" }, 500, corsHeaders);
      const tokenData = await tokenRequest(new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI }));
      if (!tokenData.ok) return json(tokenData.body, tokenData.status, corsHeaders);
      await storeTokens(env, tokenData.body);
      const headers = { ...corsHeaders, "Set-Cookie": "tiktok_oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" };
      return json({ ok: true, status: "connected_and_stored", connected: true, scope: tokenData.body.scope, message: "TikTok authorization succeeded. Tokens are stored server-side and refresh automatically when needed." }, 200, headers);
    }

    if (url.pathname === "/oauth/status") {
      try {
        const token = await getActiveToken(env);
        return json({ ok: true, connected: true, scope: token.scope, access_token_expires_at: token.access_token_expires_at, refresh_token_expires_at: token.refresh_token_expires_at }, 200, corsHeaders);
      } catch (error) { return json({ ok: true, connected: false, error: error.message }, 200, corsHeaders); }
    }

    if (url.pathname === "/api/tiktok/profile" && request.method === "GET") {
      try {
        const token = await getActiveToken(env);
        const fields = "open_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,username,follower_count,following_count,likes_count,video_count";
        const response = await fetch(`${TIKTOK_API}/user/info/?fields=${encodeURIComponent(fields)}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
        return proxyJson(response, corsHeaders);
      } catch (error) { return json({ ok: false, error: error.message }, 401, corsHeaders); }
    }

    if (url.pathname === "/api/tiktok/videos" && request.method === "GET") {
      try {
        const token = await getActiveToken(env);
        const requested = Math.min(Math.max(Number(url.searchParams.get("count") || 20), 1), 20);
        const fields = "id,create_time,cover_image_url,share_url,video_description,duration,height,width,title,like_count,comment_count,share_count,view_count";
        const response = await fetch(`${TIKTOK_API}/video/list/?fields=${encodeURIComponent(fields)}`, { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: requested }) });
        return proxyJson(response, corsHeaders);
      } catch (error) { return json({ ok: false, error: error.message }, 401, corsHeaders); }
    }

    if (url.pathname === "/api/tiktok/creator-info" && request.method === "GET") {
      try {
        const token = await getActiveToken(env);
        const response = await fetch(`${TIKTOK_API}/post/publish/creator_info/query/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({}),
        });
        return proxyJson(response, corsHeaders);
      } catch (error) { return json({ ok: false, error: error.message }, 401, corsHeaders); }
    }

    if (url.pathname === "/api/tiktok/post/photo" && request.method === "POST") {
      try {
        const token = await getActiveToken(env);
        const body = await request.json();
        const photoImages = Array.isArray(body.photo_images) ? body.photo_images : [];
        if (!body.privacy_level || photoImages.length < 1 || photoImages.length > 35) {
          return json({ ok: false, error: "privacy_level and 1-35 photo_images are required" }, 400, corsHeaders);
        }
        const payload = {
          post_info: {
            title: String(body.title || ""),
            description: String(body.description || ""),
            disable_comment: body.disable_comment !== false,
            privacy_level: String(body.privacy_level),
            auto_add_music: body.auto_add_music === true,
            brand_content_toggle: body.brand_content_toggle === true,
            brand_organic_toggle: body.brand_organic_toggle === true
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: Math.max(0, Math.min(Number(body.photo_cover_index || 0), photoImages.length - 1)),
            photo_images: photoImages.map(String)
          },
          post_mode: "DIRECT_POST",
          media_type: "PHOTO",
          is_aigc: body.is_aigc === true
        };
        const response = await fetch(`${TIKTOK_API}/post/publish/content/init/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify(payload)
        });
        return proxyJson(response, corsHeaders);
      } catch (error) { return json({ ok: false, error: error.message }, 400, corsHeaders); }
    }

    if (url.pathname === "/api/tiktok/post/status" && request.method === "POST") {
      try {
        const token = await getActiveToken(env);
        const body = await request.json();
        if (!body.publish_id) return json({ ok: false, error: "publish_id is required" }, 400, corsHeaders);
        const response = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ publish_id: String(body.publish_id) })
        });
        return proxyJson(response, corsHeaders);
      } catch (error) { return json({ ok: false, error: error.message }, 400, corsHeaders); }
    }

    return json({ ok: false, error: "Not found" }, 404, corsHeaders);
  },
};

async function getActiveToken(env) {
  if (!env.TIKTOK_TOKENS) throw new Error("Secure token storage is not configured");
  const openId = await env.TIKTOK_TOKENS.get("tiktok:active_open_id");
  if (!openId) throw new Error("TikTok is not connected");
  return getValidToken(env, openId);
}

async function getValidToken(env, openId) {
  const key = `tiktok:${openId}`;
  const stored = await env.TIKTOK_TOKENS.get(key, "json");
  if (!stored) throw new Error("TikTok connection was not found");
  if (Date.now() + REFRESH_EARLY_MS < Number(stored.access_token_expires_at || 0)) return stored;
  if (!stored.refresh_token || Date.now() >= Number(stored.refresh_token_expires_at || 0)) throw new Error("TikTok authorization has expired and must be renewed");
  const refreshed = await tokenRequest(new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: stored.refresh_token }));
  if (!refreshed.ok) throw new Error(refreshed.body.error_description || refreshed.body.error || "TikTok token refresh failed");
  const now = Date.now();
  const next = { ...stored, open_id: refreshed.body.open_id || stored.open_id, access_token: refreshed.body.access_token, refresh_token: refreshed.body.refresh_token || stored.refresh_token, scope: refreshed.body.scope || stored.scope, token_type: refreshed.body.token_type || stored.token_type, access_token_expires_at: now + Number(refreshed.body.expires_in || 0) * 1000, refresh_token_expires_at: now + Number(refreshed.body.refresh_expires_in || 0) * 1000, refreshed_at: now };
  await env.TIKTOK_TOKENS.put(key, JSON.stringify(next));
  return next;
}

async function storeTokens(env, tokenData) {
  const now = Date.now();
  const stored = { open_id: tokenData.open_id, access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, scope: tokenData.scope, token_type: tokenData.token_type, access_token_expires_at: now + Number(tokenData.expires_in || 0) * 1000, refresh_token_expires_at: now + Number(tokenData.refresh_expires_in || 0) * 1000, connected_at: now };
  await env.TIKTOK_TOKENS.put(`tiktok:${tokenData.open_id}`, JSON.stringify(stored));
  await env.TIKTOK_TOKENS.put("tiktok:active_open_id", tokenData.open_id);
}

async function tokenRequest(body) {
  const response = await fetch(TIKTOK_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" }, body });
  const data = await response.json();
  if (!response.ok || data.error) return { ok: false, status: response.status || 400, body: { ok: false, status: "token_request_failed", error: data.error || "token_request_failed", error_description: data.error_description || "TikTok token request failed", log_id: data.log_id || null } };
  return { ok: true, status: response.status, body: data };
}

async function proxyJson(response, corsHeaders) {
  let data;
  try { data = await response.json(); } catch { data = { error: { code: "invalid_response", message: "TikTok returned a non-JSON response" } }; }
  return json(data, response.status, corsHeaders);
}

function readCookie(cookieHeader, name) {
  for (const part of cookieHeader.split(";")) { const [key, ...value] = part.trim().split("="); if (key === name) return value.join("="); }
  return null;
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json; charset=UTF-8", ...headers } });
}
