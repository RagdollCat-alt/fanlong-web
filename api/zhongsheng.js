const DEFAULT_BACKEND = "https://api.huaian.cloud/zhongsheng-api/index.php";

function readCookie(header, name) {
  const cookies = String(header || "").split(";");
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function sessionCookie(token, maxAge = 2592000) {
  return `zs_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export default async function handler(request, response) {
  const endpoint = process.env.ZHONGSHENG_BACKEND_URL || DEFAULT_BACKEND;
  const target = new URL(endpoint);
  const action = String(request.query.action || "health");
  target.searchParams.set("action", action);

  for (const [key, value] of Object.entries(request.query || {})) {
    if (key === "action") continue;
    if (Array.isArray(value)) value.forEach((item) => target.searchParams.append(key, item));
    else if (value !== undefined) target.searchParams.set(key, value);
  }

  const headers = {
    Accept: action === "media" ? "image/*" : "application/json",
    "X-Forwarded-For": String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || ""),
    "X-Zhongsheng-Proxy": process.env.ZHONGSHENG_PROXY_SECRET || "",
  };
  if (!["GET", "HEAD"].includes(request.method)) headers["Content-Type"] = "application/json";
  const session = readCookie(request.headers.cookie, "zs_session");
  if (session && action !== "media") headers["X-ZS-Session"] = session;
  if (request.headers["idempotency-key"]) headers["Idempotency-Key"] = request.headers["idempotency-key"];

  const options = { method: request.method, headers };
  if (!["GET", "HEAD"].includes(request.method)) options.body = JSON.stringify(request.body || {});

  try {
    const backend = await fetch(target.toString(), options);
    const contentType = backend.headers.get("content-type") || "";
    if (action === "media" && backend.ok && contentType.startsWith("image/")) {
      const bytes = Buffer.from(await backend.arrayBuffer());
      response.setHeader("Content-Type", contentType);
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("CDN-Cache-Control", "public, max-age=31536000");
      response.setHeader("Vercel-CDN-Cache-Control", "public, max-age=31536000");
      response.setHeader("X-Content-Type-Options", "nosniff");
      return response.status(200).send(bytes);
    }
    const payload = contentType.includes("application/json")
      ? await backend.json()
      : { ok: false, error: "众声后端返回了无法识别的内容" };

    if (action === "login" && backend.ok && payload?.data?.token) {
      response.setHeader("Set-Cookie", sessionCookie(payload.data.token));
      delete payload.data.token;
    }
    if (action === "logout" || (action === "change-password" && backend.ok)) {
      response.setHeader("Set-Cookie", sessionCookie("", 0));
    }
    response.setHeader("Cache-Control", "private, no-store");
    response.status(backend.status).json(payload);
  } catch (error) {
    console.error("[zhongsheng-proxy]", error);
    response.status(502).json({ ok: false, error: "众声服务器暂时无法连接" });
  }
}
