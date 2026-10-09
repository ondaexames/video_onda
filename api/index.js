import application from "../dist/server/index.js";
import { createNeonD1 } from "../server/neon-d1.js";
import { createVercelBlobStore } from "../server/vercel-blob.js";

let database;
let documents;

function runtimeEnvironment() {
  database ||= createNeonD1(process.env.DATABASE_URL);
  documents ||= createVercelBlobStore();
  return { ...process.env, DB: database, DOCUMENTS: documents };
}

async function requestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(request, response) {
  const protocol = String(request.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = request.headers.host || "localhost";
  const webRequest = new Request(`${protocol}://${host}${request.url || "/"}`, {
    method: request.method,
    headers: request.headers,
    body: await requestBody(request),
  });
  const webResponse = await application.fetch(webRequest, runtimeEnvironment(), {});
  response.statusCode = webResponse.status;
  for (const [name, value] of webResponse.headers) response.setHeader(name, value);
  if (request.method === "HEAD" || !webResponse.body) return response.end();
  return response.end(Buffer.from(await webResponse.arrayBuffer()));
}

