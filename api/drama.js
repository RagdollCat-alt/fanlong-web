const DEFAULT_DRAMA_ENDPOINT = "http://122.51.158.182:8443/drama";

export default async function handler(request, response) {
  const { id, sig } = request.query;

  if (!id || !sig) {
    response.status(400).json({ error: "Missing drama id or signature" });
    return;
  }

  const targetUrl = process.env.DRAMA_BACKEND_URL || DEFAULT_DRAMA_ENDPOINT;

  try {
    const target = new URL(targetUrl);
    target.searchParams.set("id", id);
    target.searchParams.set("sig", sig);

    const backendRes = await fetch(target.toString(), {
      headers: {
        Host: target.hostname
      }
    });

    const contentType = backendRes.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await backendRes.json()
      : { error: "Drama endpoint returned non-json response", detail: await backendRes.text() };

    response.status(backendRes.status).json(body);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: "Drama backend connection failed",
      detail: error.message
    });
  }
}
