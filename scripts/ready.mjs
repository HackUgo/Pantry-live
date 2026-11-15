// `npm run ready`: push the current branch only when it meets the standards.
// In order: refuse main and staging, refuse uncommitted work, then types,
// unit tests and the standards scan. The first failure stops everything and
// nothing is pushed. When all pass, the branch goes to origin and the open
// pull request picks it up. Merging to main is never done here.

import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function step(label, cmd, args) {
  process.stdout.write(`${label} ... `);
  try {
    execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    console.log("ok");
  } catch (err) {
    console.log("failed");
    console.error(String(err.stdout || "") + String(err.stderr || ""));
    console.error("Nothing was pushed.");
    process.exit(1);
  }
}

const branch = git("branch", "--show-current");
if (!branch || ["main", "staging"].includes(branch)) {
  console.error(`On ${branch || "a detached head"}. Ready only pushes feature branches. Nothing was pushed.`);
  process.exit(1);
}
if (git("status", "--porcelain")) {
  console.error("There is uncommitted work. Commit it first, then run ready again. Nothing was pushed.");
  process.exit(1);
}

step("Types", "npm", ["run", "-s", "check"]);
step("Unit tests", "npm", ["test", "-s"]);
step("Standards", "node", ["scripts/standards.mjs"]);

process.stdout.write(`Pushing ${branch} ... `);
execFileSync("git", ["push", "origin", branch], { stdio: ["ignore", "pipe", "pipe"] });
console.log("ok");
console.log(`${git("log", "--oneline", "-1")} is on origin/${branch}.`);
