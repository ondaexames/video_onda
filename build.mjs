import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/server", { recursive: true });
mkdirSync("dist/.openai/drizzle/meta", { recursive: true });

const html = readFileSync("src/index.html", "utf8");
const appJs = readFileSync("src/app.js", "utf8");
const petImageBase64 = readFileSync("src/mascotes-onda.png").toString("base64");
const worker = readFileSync("worker/index.js", "utf8")
  .replace("__HTML_CONTENT__", JSON.stringify(html.replaceAll("__PET_CORNER_DATA_URL__", "/mascotes-onda.png")))
  .replace("__APP_JS_CONTENT__", JSON.stringify(appJs))
  .replace("__PET_IMAGE_BASE64__", JSON.stringify(petImageBase64));

writeFileSync("dist/server/index.js", worker);
cpSync(".openai/hosting.json", "dist/.openai/hosting.json");
cpSync("drizzle", "dist/.openai/drizzle", { recursive: true });
