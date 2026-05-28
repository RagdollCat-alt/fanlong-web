const DEFAULT_ARCHIVE_ENDPOINT = "http://122.51.158.182:8443/archives";

export default async function handler(request, response) {
  const targetUrl = process.env.ARCHIVE_BACKEND_URL || DEFAULT_ARCHIVE_ENDPOINT;

  try {
    const target = new URL(targetUrl);
    const backendRes = await fetch(targetUrl, {
      headers: {
        Host: target.hostname
      }
    });

    if (!backendRes.ok) {
      response.status(backendRes.status).json({
        error: "Archive endpoint unavailable",
        detail: `Backend returned ${backendRes.status}`
      });
      return;
    }

    const data = await backendRes.json();
    response.status(200).json(data);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: "Archive backend connection failed",
      detail: error.message
    });
  }
}
