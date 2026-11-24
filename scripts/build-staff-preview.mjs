// Inline public/staff/ into one HTML fragment for the claude.ai Artifact preview (demo mode, PIN 123456).
// Usage: node scripts/build-staff-preview.mjs <out.html>
import { readFileSync, writeFileSync } from "node:fs";
const pub = new URL("../public/", import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const html = read("staff/index.html");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const jsqr = "data:text/javascript;base64," + Buffer.from(read("vendor/jsqr.min.js")).toString("base64");
let out = head
  .replace(/<meta charset[^>]*>\n?/, "")
  .replace(/<meta name="viewport"[^>]*>\n?/, "")
  .replace('<link rel="stylesheet" href="/staff/staff.css">', () => `<style>\n${read("staff/staff.css")}\n</style>`)
  + body
  .replace('<script src="/config.js"></script>', () => `<script>window.TGGC_CONFIG = { ENDPOINT: "", JSQR_SRC: "${jsqr}" };</script>`)
  .replace('<script src="/staff/staff.js"></script>', () => `<script>\n${read("staff/staff.js")}\n</script>`);
const logo = "data:image/png;base64," + readFileSync(new URL("assets/logo-mark.png", pub)).toString("base64");
out = out.split("/assets/logo-mark.png").join(logo);
writeFileSync(process.argv[2] || "staff-preview.html", out);
console.log("wrote", process.argv[2], out.length, "bytes");
