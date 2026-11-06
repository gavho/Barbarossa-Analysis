// Copy the single-file build to the repo root so non-developers can just open it.
import { readFileSync, statSync, writeFileSync } from "node:fs";
const dist = new URL("../dist/index.html", import.meta.url);
const out = new URL("../../Barbarossa.html", import.meta.url);

// The single-file plugin inlines the 7 MB app script into <head>, so nothing can paint until all of it has arrived.
// Moving it to the end of <body> lets the loading screen in #root show at once; a module script runs after parsing
// either way. (The inlined code escapes "</script>" inside strings, so the first closing tag ends the script.)
let html = readFileSync(dist, "utf8");
const start = html.indexOf('<script type="module"');
const end = html.indexOf("</script>", start) + "</script>".length;
if (start < 0 || start > html.indexOf("</head>")) throw new Error("copy-dist: inlined module script not found in <head>");
const script = html.slice(start, end);
html = html.slice(0, start) + html.slice(end);
const body = html.lastIndexOf("</body>");
html = html.slice(0, body) + script + "\n" + html.slice(body);
writeFileSync(dist, html);
writeFileSync(out, html);
console.log(`Barbarossa.html ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
