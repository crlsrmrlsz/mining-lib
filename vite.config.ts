import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type Connect, defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

function fixturesMiddleware(): Plugin {
  const root = resolve(rootDir, "data/input/runs");
  const handler: Connect.NextHandleFunction = (req, res) => {
    const reject = () => {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("Not Found");
    };
    const urlPath = (req.url ?? "/").split("?")[0] ?? "/";
    const abs = resolve(root, `.${urlPath}`);
    if (abs !== root && !abs.startsWith(root + sep)) return reject();
    if (!existsSync(abs) || !statSync(abs).isFile()) return reject();
    const dot = abs.lastIndexOf(".");
    const ext = dot === -1 ? "" : abs.slice(dot);
    const type =
      ext === ".csv"
        ? "text/csv"
        : ext === ".json"
          ? "application/json"
          : "application/octet-stream";
    res.setHeader("Content-Type", type);
    createReadStream(abs).pipe(res);
  };
  return {
    name: "mining-lib:fixtures",
    configureServer(server) {
      server.middlewares.use("/runs", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/runs", handler);
    },
  };
}

export default defineConfig(({ command }) => {
  const isBuild = command === "build";

  return {
    root: isBuild ? rootDir : resolve(rootDir, "example"),
    publicDir: isBuild ? resolve(rootDir, "example") : false,
    resolve: {
      alias: {
        "mining-lib": resolve(rootDir, "src/index.ts"),
      },
    },
    build: {
      outDir: resolve(rootDir, "dist"),
      emptyOutDir: true,
      // "hidden": emit .map files for local debugging but DON'T add the
      // `//# sourceMappingURL` comment — so the shipped bundle has no
      // dangling reference to a sourcemap we intentionally don't publish.
      sourcemap: "hidden",
      lib: {
        entry: resolve(rootDir, "src/index.ts"),
        name: "MiningLib",
        formats: ["es", "umd"],
        fileName: (format) => `mining-lib.${format === "es" ? "js" : "umd.js"}`,
      },
    },
    plugins: [
      fixturesMiddleware(),
      dts({
        entryRoot: resolve(rootDir, "src"),
        outDir: resolve(rootDir, "dist/types"),
        // NB: do NOT use `insertTypesEntry` — with this entryRoot it emits a
        // broken `export {}` stub at dist/types/index.d.ts (the package's
        // declared `types`), so consumers got ZERO types while attw still saw
        // a "resolvable" (empty) module. `types` points at the real entry
        // (dist/types/src/index.d.ts) instead.
        include: ["src/**/*"],
        // Internal test files must not emit public `.d.ts` into the shipped
        // package (49 `*.test.d.ts` were leaking into dist/types).
        exclude: ["src/**/*.test.ts"],
        tsconfigPath: resolve(rootDir, "tsconfig.json"),
        compilerOptions: {
          noEmit: false,
          declaration: true,
          // No declaration maps: they reference the .ts source, which is not
          // shipped — so for a consumer they only add ~48 dangling files.
          declarationMap: false,
          emitDeclarationOnly: true,
        },
      }),
    ],
  };
});
