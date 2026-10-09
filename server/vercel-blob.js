import { get, put } from "@vercel/blob";

export function createVercelBlobStore() {
  return {
    async put(key, value, options = {}) {
      const blob = await put(key, value, {
        access: "private",
        addRandomSuffix: false,
        contentType: options.httpMetadata?.contentType || "application/octet-stream",
      });
      return { key: blob.pathname };
    },
    async get(key) {
      const result = await get(key, { access: "private" });
      return result?.statusCode === 200 ? { body: result.stream } : null;
    },
  };
}

