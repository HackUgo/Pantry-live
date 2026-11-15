// The house standards, checked on every file a student or volunteer can read
// and every file that could leak a secret. Run by `npm run standards`, by
// `npm run ready` before a push, and in CI. Exits 1 and names each line that
// breaks a rule.
//
// Copy rules (pages, page scripts, email text in the Worker):
//   no em or en dashes, no emoji, never the word AI, and never the count words
//   fresh, stale, updated, estimated or roughly.
// Secret rules (everything tracked by git):
//   no service role or secret keys, no Anthropic keys, no private key blocks,
//   no app passwords, and the staff PIN never written down.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const isCopy = (f) =>
  /^public\/.*\.(html|js|webmanifest)$/.test(f) && !f.startsWith("public/js/vendor/") ||
  /^src\/.*\.ts$/.test(f) && !f.endsWith(".test.ts");

// Words are matched as whole words inside quotes or markup text, so
// identifiers like updated_at in code do not trip the rule. A line that must
// hold one of these words as data (the name matcher) says "standards: allow".
const COPY_RULES = [
  [/[–—]/, "dash used as punctuation"],
  [/\p{Extended_Pictographic}/u, "emoji"],
  [/["'`>][^"'`<]*\bAI\b/, "the word AI"],
  [/["'`>][^"'`<]*\b(fresh|stale|updated|estimated|roughly)\b/i, "a count word the product never uses"],
];

const SECRET_RULES = [
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/, "a signed JWT (service role key?)"],
  [/sb_secret_[A-Za-z0-9_-]{16,}/, "a Supabase secret key"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "an Anthropic key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key block"],
  [/["'`=]\s*[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}\s*["'`]/, "something shaped like a Gmail app password"],
  [/STAFF_PIN\s*[:=]\s*["']?\d{4}/, "the staff PIN written down"],
];

const SKIP_SECRETS = new Set(["scripts/standards.mjs", "package-lock.json"]);
const problems = [];

for (const file of files) {
  if (/\.(png|jpe?g|webp|gif|ico|woff2?|mjs\.map)$/.test(file)) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  const lines = text.split("\n");
  lines.forEach((line, n) => {
    if (isCopy(file)) {
      const code = line.trim();
      const comment = code.startsWith("//") || code.startsWith("*") || code.startsWith("/*") || code.startsWith("<!--");
      for (const [rule, why] of COPY_RULES) {
        if (!comment && !line.includes("standards: allow") && rule.test(line)) problems.push(`${file}:${n + 1}  ${why}`);
      }
    }
    if (!SKIP_SECRETS.has(file) && !file.startsWith("public/js/vendor/")) {
      for (const [rule, why] of SECRET_RULES) {
        if (rule.test(line)) problems.push(`${file}:${n + 1}  ${why}`);
      }
    }
  });
}

if (problems.length) {
  console.error(`Standards: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Standards: ${files.length} files clean`);
