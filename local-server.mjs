import { createServer } from "node:http";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
process.chdir(root);

const build = spawnSync(process.execPath, ["build.mjs"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status || 1);

const stateDir = join(root, ".local-data");
const documentsDir = join(stateDir, "documents");
mkdirSync(documentsDir, { recursive: true });

const database = new DatabaseSync(join(stateDir, "onda-video-consulta.sqlite"));
database.exec("PRAGMA foreign_keys = ON");
database.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");

for (const name of readdirSync(join(root, "drizzle")).filter((file) => file.endsWith(".sql")).sort()) {
  const applied = database.prepare("SELECT name FROM _local_migrations WHERE name = ?").get(name);
  if (applied) continue;
  database.exec(readFileSync(join(root, "drizzle", name), "utf8"));
  database.prepare("INSERT INTO _local_migrations (name, applied_at) VALUES (?, ?)").run(name, Date.now());
}

class LocalStatement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new LocalStatement(this.db, this.sql, params); }
  async first() { return this.db.prepare(this.sql).get(...this.params) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params), success: true }; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

const DB = {
  prepare(sql) { return new LocalStatement(database, sql); },
  async batch(statements) {
    database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      database.exec("COMMIT");
      return results;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  },
};

function safeObjectPath(key) {
  const normalized = String(key || "").replaceAll("\\", "/");
  if (!normalized || normalized.includes("..")) throw new Error("Caminho de documento inválido");
  return join(documentsDir, ...normalized.split("/"));
}

const DOCUMENTS = {
  async put(key, value) {
    const target = safeObjectPath(key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(value));
  },
  async get(key) {
    try { return { body: readFileSync(safeObjectPath(key)) }; }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  },
};

function readLocalEnv() {
  const values = {};
  for (const filename of [".env", ".dev.vars"]) {
    try {
      for (const line of readFileSync(join(root, filename), "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
      }
    } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  return values;
}

const env = {
  TOKEN_SECRET: "onda-local-secret-change-before-production",
  HOST_PIN: "123456",
  VET_EMAIL: "veterinaria@onda-animal.com.br",
  VET_PASSWORD: "123456",
  VET_NAME: "Dra. Bruna",
  VET_CRMV: "",
  VET_UNIT: "Gravataí",
  PAYMENT_TEST_MODE: "true",
  ...readLocalEnv(),
  DB,
  DOCUMENTS,
};

const workerUrl = `${pathToFileURL(join(root, "dist/server/index.js")).href}?v=${Date.now()}`;
const worker = (await import(workerUrl)).default;
const port = Number(process.env.PORT || 3000);

const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const url = `http://${request.headers.host || `localhost:${port}`}${request.url || "/"}`;
    const webRequest = new Request(url, { method: request.method, headers: request.headers, body });
    const webResponse = await worker.fetch(webRequest, env, {});
    response.statusCode = webResponse.status;
    for (const [name, value] of webResponse.headers) response.setHeader(name, value);
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.end("Erro ao abrir o sistema localmente");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`\nOnda Animal disponível em http://localhost:${port}`);
  console.log(`Painel veterinário: http://localhost:${port}/vet`);
  console.log("Login local: veterinaria@onda-animal.com.br / 123456\n");
});
