import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
rmSync("public", { recursive: true, force: true });
mkdirSync("dist/server", { recursive: true });
mkdirSync("dist/.openai/drizzle/meta", { recursive: true });
mkdirSync("public", { recursive: true });

const html = readFileSync("src/index.html", "utf8");
const staffUi = readFileSync("src/staff-ui.js", "utf8");
const appJs = readFileSync("src/app.js", "utf8").replace(/\}\)\(\);\s*$/, `${staffUi}\n})();`);
const staffManagement = readFileSync("worker/staff-management.js", "utf8");
const petImage = readFileSync("src/mascotes-onda.png");
const petImageBase64 = petImage.toString("base64");
const ondaLogo = readFileSync("src/onda-logo.png");
const ondaLogoBase64 = ondaLogo.toString("base64");
const renderedHtml = html
  .replaceAll("__PET_CORNER_DATA_URL__", "/mascotes-onda.png")
  .replaceAll("__ONDA_LOGO_URL__", "/onda-logo.png");
const worker = `${staffManagement}\n${readFileSync("worker/index.js", "utf8")}`
  .replace("__HTML_CONTENT__", JSON.stringify(renderedHtml))
  .replace("__APP_JS_CONTENT__", JSON.stringify(appJs))
  .replace("__PET_IMAGE_BASE64__", JSON.stringify(petImageBase64))
  .replace("__ONDA_LOGO_BASE64__", JSON.stringify(ondaLogoBase64));

writeFileSync("dist/server/index.js", worker);
writeFileSync("public/index.html", renderedHtml);
writeFileSync("public/app.js", appJs);
writeFileSync("public/mascotes-onda.png", petImage);
writeFileSync("public/onda-logo.png", ondaLogo);
cpSync(".openai/hosting.json", "dist/.openai/hosting.json");
cpSync("drizzle", "dist/.openai/drizzle", { recursive: true });
