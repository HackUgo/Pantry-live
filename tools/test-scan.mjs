// Runs every photo in a folder through your live /api/scan and prints what came back.
// Usage:  node tools/test-scan.mjs https://YOUR-APP.vercel.app ./test-photos
// Tip: name photos like "eggs-12.jpg" or "shelf-messy.jpg" so you can eyeball right vs wrong.
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const [, , baseUrl, folder = "./test-photos"] = process.argv;
if (!baseUrl) {
  console.error("Usage: node tools/test-scan.mjs https://YOUR-APP.vercel.app ./test-photos");
  process.exit(1);
}

const files = (await readdir(folder)).filter((f) => [".jpg", ".jpeg"].includes(extname(f).toLowerCase()));
if (!files.length) console.log("No .jpg files found. (Photos must be JPEG and ideally under 1.5 MB.)");

for (const f of files) {
  const image = (await readFile(join(folder, f))).toString("base64");
  const t0 = Date.now();
  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, mode: "shelf", existingItems: ["Eggs", "Milk", "Banana", "Canned Beans", "Rice", "Cereal", "Peanut Butter"] }),
  });
  const data = await r.json();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== ${f}  (${secs}s) ===`);
  if (data.error) { console.log("ERROR:", data.error); continue; }
  for (const it of data.items) {
    console.log(`  ${it.emoji} ${it.name.padEnd(18)} count=${String(it.count).padEnd(5)} level=${it.level.padEnd(7)} conf=${it.confidence}`);
  }
  if (data.notes) console.log("  notes:", data.notes);
}
