// Assemble the static demo site that GitHub Pages serves.
//
// The showcase pages reference the bundle and the sample log with absolute
// paths (`/mining-lib.umd.js`, `/runs/...`) — fine behind the dev/preview
// server, but broken on a project Pages site served under `/<repo>/`. This
// flattens the built showcase into `dist-demo/` and rewrites those to relative
// `./` paths, which resolve correctly under any base. Run after `pnpm build`.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const out = resolve(root, "dist-demo");
const showcase = resolve(root, "example/showcase");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1 — the library bundle the demo pages load via <script>.
cpSync(resolve(root, "dist/mining-lib.umd.js"), resolve(out, "mining-lib.umd.js"));

// 2 — the one sample log every showcase page fetches.
mkdirSync(resolve(out, "runs/loan-origination"), { recursive: true });
cpSync(
  resolve(root, "data/input/runs/loan-origination/events.csv"),
  resolve(out, "runs/loan-origination/events.csv"),
);

// 3 — built showcase pages, flattened to the site root with relative paths.
//     The gallery already links to `./<name>.html`, which matches these names.
const toRelative = (html) =>
  html
    .replaceAll('src="/mining-lib.umd.js"', 'src="./mining-lib.umd.js"')
    .replaceAll('fetch("/runs/', 'fetch("./runs/');

let pages = 0;
for (const file of readdirSync(showcase)) {
  if (!file.endsWith(".built.html")) continue;
  const name = file === "index.built.html" ? "index.html" : file.replace(".built.html", ".html");
  writeFileSync(resolve(out, name), toRelative(readFileSync(resolve(showcase, file), "utf8")));
  pages += 1;
}

console.log(`demo site assembled → dist-demo/ (${pages} pages)`);
