// Rebuilds the browser copies of outside libraries in public/js/vendor/ from
// node_modules, so the pages load nothing from another site:
//   supabase.mjs  supabase-js, bundled and minified
//   qrcode.mjs    qrcode-generator, copied as is
// Run after updating either package: node scripts/vendor.mjs
import { build } from "esbuild";
import { copyFileSync } from "node:fs";

await build({
  stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd() },
  bundle: true, format: "esm", minify: true, platform: "browser",
  outfile: "public/js/vendor/supabase.mjs", logLevel: "error",
});
copyFileSync("node_modules/qrcode-generator/dist/qrcode.mjs", "public/js/vendor/qrcode.mjs");
console.log("public/js/vendor rebuilt");
