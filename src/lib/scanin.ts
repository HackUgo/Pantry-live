// What a Put on the board request may contain, checked before anything is
// written: a photo in our scans bucket, a staff name, and 1 to 20 items with
// whole counts from 1 to 500. Rows naming the same item are merged so one
// photo adds once per item.

import { CATEGORIES, slug } from "../../public/js/catalog.js";
import { cleanDate } from "./reader";

export const MAX_ITEMS = 20;
export const MAX_COUNT = 500;

export type PublishItem = { id: string; name: string; category: string; unit: string; count: number; best_by: string | null };
export type PublishInput = { photo: string; by: string; items: PublishItem[]; request: string | null };

export class PublishError extends Error {}

export function cleanName(v: unknown): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function cleanPublish(body: any, supabaseUrl: string): PublishInput {
  const photo = String(body?.photo_url ?? "");
  if (!photo.startsWith(`${supabaseUrl}/storage/v1/object/public/scans/`)) {
    throw new PublishError("The photo is missing. Take it again.");
  }
  const by = cleanName(body?.by_name);
  if (!by) throw new PublishError("Pick your name first.");

  const merged = new Map<string, PublishItem>();
  for (const raw of Array.isArray(body?.items) ? body.items : []) {
    const name = cleanName(raw?.name);
    const count = Number(raw?.count);
    if (!name || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) continue;
    const id = slug(name);
    const prev = merged.get(id);
    const bestBy = cleanDate(raw?.best_by);
    if (prev) {
      prev.count += count;
      if (bestBy && (!prev.best_by || bestBy < prev.best_by)) prev.best_by = bestBy;
    }
    else merged.set(id, {
      id, name,
      // No category or an unknown one: the item keeps its own (a new item gets Other).
      category: CATEGORIES.includes(raw?.category) ? raw.category : "",
      unit: String(raw?.unit ?? "").trim().toLowerCase().slice(0, 20),
      count,
      best_by: bestBy,
    });
  }
  const items = [...merged.values()];
  if (!items.length) throw new PublishError("Nothing to put on the board. Every item needs a count.");
  if (items.length > MAX_ITEMS) throw new PublishError(`At most ${MAX_ITEMS} items per photo.`);
  const request = typeof body?.request_id === "string" ? body.request_id.slice(0, 64) : null;
  return { photo, by, items, request };
}
