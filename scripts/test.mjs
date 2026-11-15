// Runs the unit tests: bundles each src/**/*.test.ts with esbuild (already
// installed with wrangler) into .test-build/, then runs them with node --test.
// No network: the reader test reads a recorded answer from src/lib/fixtures.
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const out = ".test-build";
rmSync(out, { recursive: true, force: true });
const tests = readdirSync("src/lib").filter((f) => f.endsWith(".test.ts")).map((f) => join("src/lib", f));
// Workers only: SMTP sockets. Tests never open one, so a stand-in refuses.
const workersOnly = {
  name: "workers-only",
  setup(b) {
    b.onResolve({ filter: /^cloudflare:sockets$/ }, () => ({ path: "sockets", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export function connect() { throw new Error('no sockets in tests'); }",
    }));
  },
};
await build({
  entryPoints: tests, bundle: true, platform: "node", format: "esm",
  outdir: out, outExtension: { ".js": ".mjs" }, logLevel: "error",
  external: ["@anthropic-ai/sdk", "@supabase/supabase-js", "hono", "@pushforge/builder"],
  plugins: [workersOnly],
});
const files = readdirSync(out).filter((f) => f.endsWith(".test.mjs")).map((f) => join(out, f));
const run = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
rmSync(out, { recursive: true, force: true });
process.exit(run.status ?? 1);
