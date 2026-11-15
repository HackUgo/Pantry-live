// Resets the live board for a new demo: calls demo_reset() and empties the
// scans bucket. Needs the service role key in the environment, never in a file:
//
//   SUPABASE_URL=https://tcjqrtvupiesddusclkc.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node tools/reset.mjs

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };

const reset = await fetch(`${url}/rest/v1/rpc/demo_reset`, { method: "POST", headers, body: "{}" });
console.log(reset.ok ? "Board reset to the starting shelf." : `Reset failed: ${reset.status} ${await reset.text()}`);

async function list(prefix) {
  const res = await fetch(`${url}/storage/v1/object/list/scans`, {
    method: "POST", headers, body: JSON.stringify({ prefix, limit: 1000 }),
  });
  return res.ok ? res.json() : [];
}

const paths = [];
for (const entry of await list("")) {
  if (entry.id) paths.push(entry.name);
  else for (const file of await list(`${entry.name}/`)) if (file.id) paths.push(`${entry.name}/${file.name}`);
}
if (paths.length) {
  const del = await fetch(`${url}/storage/v1/object/scans`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: paths }) });
  console.log(del.ok ? `Removed ${paths.length} ${paths.length === 1 ? "photo" : "photos"} from the scans bucket.` : `Photo removal failed: ${del.status}`);
} else {
  console.log("The scans bucket is already empty.");
}
process.exit(reset.ok ? 0 : 1);
