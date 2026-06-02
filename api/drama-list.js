const DEFAULT_DRAMA_LIST_ENDPOINT = "http://122.51.158.182:8443/drama-list";

export default async function handler(request, response) {
  const targetUrl = process.env.DRAMA_LIST_BACKEND_URL || DEFAULT_DRAMA_LIST_ENDPOINT;

  try {
    const target = new URL(targetUrl);
    const backendRes = await fetch(target.toString(), {
      headers: {
        Host: target.hostname
      }
    });

    const contentType = backendRes.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await backendRes.json()
      : { error: "Drama list endpoint returned non-json response", detail: await backendRes.text() };

    response.status(backendRes.status).json(body);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: "Drama list backend connection failed",
      detail: error.message
    });
  }
}
