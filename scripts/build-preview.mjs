// Inline public/ into one HTML fragment for the claude.ai Artifact preview.
// Usage: node scripts/build-preview.mjs <out.html>
import { readFileSync, writeFileSync } from "node:fs";
const pub = new URL("../public/", import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
let html = read("index.html");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
let out = head
  .replace(/<meta charset[^>]*>\n?/, "")
  .replace(/<meta name="viewport"[^>]*>\n?/, "")
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read("styles.css")}\n</style>`)
  + body
  .replace('<script src="vendor/qrcode.js"></script>', () => `<script>\n${read("vendor/qrcode.js")}\n</script>`)
  .replace('<script src="config.js"></script>', () => `<script>\n${read("config.js")}\n</script>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${read("app.js")}\n</script>`);
writeFileSync(process.argv[2] || "preview.html", out);
console.log("wrote", process.argv[2], out.length, "bytes");
