import server from "../dist/server/server.js";

export default async function handler(req, res) {
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  const request = new Request(url, {
    method,
    headers: req.headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? "half" : undefined,
  });

  const response = await server.fetch(request, process.env, {});
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}
