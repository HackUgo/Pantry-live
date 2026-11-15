import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabase-config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const LEVELS = ["out", "low", "some", "plenty"];
export const CATEGORIES = [
  "Dairy & Eggs", "Produce", "Protein", "Canned", "Grains & Pasta",
  "Bread", "Snacks", "Drinks", "Other",
];
export const LEVEL_LABEL = { out: "Out", low: "Low", some: "In stock", plenty: "Plenty" };

// "Canned Beans" -> "canned-bean", "Eggs" -> "egg". Used as the row id so names match.
export function slug(name) {
  let s = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  return s || "item";
}

export function levelFromCount(count) {
  if (count === null || count === undefined || Number.isNaN(count)) return null;
  if (count <= 0) return "out";
  if (count <= 4) return "low";
  if (count <= 14) return "some";
  return "plenty";
}

export function maxLevel(a, b) {
  const i = Math.max(LEVELS.indexOf(a), LEVELS.indexOf(b));
  return i < 0 ? "some" : LEVELS[i];
}

export function timeAgo(ts) {
  if (!ts) return "";
  const ms = typeof ts === "string" ? Date.parse(ts) : Number(ts);
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
