// Copy the single-file build to the repo root so non-developers can just open it.
import { copyFileSync, statSync } from "node:fs";
const out = new URL("../../Barbarossa.html", import.meta.url);
copyFileSync(new URL("../dist/index.html", import.meta.url), out);
console.log(`Barbarossa.html ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
