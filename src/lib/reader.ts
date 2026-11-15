// Reads one photo with Anthropic's model (READER_MODEL) and returns the items in it.
// The model draws one box per physical unit it can see, in pixels of the
// photo. The count is the number of boxes. When units cannot be told apart
// (a sealed case, a stack) it returns count null with one box around the
// group, and the review screen asks the volunteer for the number.
// Boxes go back to the page as [ymin, xmin, ymax, xmax] on a 0 to 1000 scale.
// Nothing is saved here.

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "../../public/js/catalog.js";
import type { Env } from "../env";

export type Box = [number, number, number, number];
export type ReadItem = {
  name: string;
  category: string;
  unit: string;
  count: number | null;
  box_2d: Box[];
  best_by: string | null;
  confidence: number;
};

const PIXEL_BOX = {
  type: "object",
  properties: {
    top: { type: "integer" },
    left: { type: "integer" },
    bottom: { type: "integer" },
    right: { type: "integer" },
  },
  required: ["top", "left", "bottom", "right"],
  additionalProperties: false,
};

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          unit: { type: "string" },
          boxes: { type: "array", items: PIXEL_BOX },
          count: { type: ["integer", "null"] },
          best_by: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
        required: ["name", "category", "unit", "boxes", "count", "best_by", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function prompt(existing: string[], width: number, height: number): string {
  const known = existing.length ? existing.join(", ") : "none yet";
  return `This photo was taken by a volunteer at a student food pantry as food arrived. It is ${width} pixels wide and ${height} pixels tall. List every food product in it.

Items already on the pantry board: ${known}.

For each distinct product:
- name: if it is the same product as one already on the board, use that name exactly. Otherwise a short plain name in sentence case, plural where natural, no brand and no size, for example "Bananas", "Canned corn", "Peanut butter".
- category: one of ${CATEGORIES.join(", ")}.
- unit: the plural word for one unit, for example "cans", "boxes", "jugs", "bottles", "bags", "jars". Use "" for loose produce counted one by one, such as bananas or apples.
- boxes: one box for every physical unit you can see, in pixel coordinates of this photo (top, left, bottom, right). Never one box for several units.
- count: the number of boxes. If units are not individually visible, such as a sealed case or a stack where some are hidden, set count to null and give one box around the whole group.
- best_by: the soonest best by, use by, sell by or expiry date printed on these units, as YYYY-MM-DD, only when you can read it clearly in the photo. Otherwise null. Never guess a date from the kind of food.
- confidence: 0 to 1.

Only food. Do not count shelves, hands, signs, people or price labels. Do not invent anything you cannot see.`;
}

const scale = (v: unknown, size: number) =>
  Math.max(0, Math.min(1000, Math.round(((Number(v) || 0) / size) * 1000)));

function toBox(b: any, width: number, height: number): Box | null {
  if (!b || typeof b !== "object") return null;
  const box: Box = [scale(b.top, height), scale(b.left, width), scale(b.bottom, height), scale(b.right, width)];
  return box[2] > box[0] && box[3] > box[1] ? box : null;
}

// A printed date from the photo, kept only when it is a real day within a
// sane range (up to 60 days past, 5 years ahead). Anything else is null.
export function cleanDate(v: unknown, now = new Date()): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  const days = (d.getTime() - now.getTime()) / 86_400_000;
  return days >= -60 && days <= 5 * 365 ? s : null;
}

function cleanItem(raw: any, width: number, height: number): ReadItem | null {
  const name = String(raw?.name ?? "").trim().slice(0, 40);
  if (!name) return null;
  const boxes = (Array.isArray(raw.boxes) ? raw.boxes : [])
    .map((b: unknown) => toBox(b, width, height))
    .filter(Boolean) as Box[];
  const declared = Number.isInteger(raw.count) && raw.count >= 0 ? (raw.count as number) : null;
  // The count is the number of boxes. A null from the model stays null.
  const count = declared === null ? null : boxes.length || declared;
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    category: CATEGORIES.includes(raw.category) ? raw.category : "Other",
    unit: String(raw.unit ?? "").trim().toLowerCase().slice(0, 20),
    count,
    box_2d: boxes.slice(0, 200),
    best_by: cleanDate(raw.best_by),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
  };
}

export class ReaderError extends Error {}

export async function readPhoto(
  env: Env,
  imageBase64: string,
  existing: string[],
  width: number,
  height: number,
): Promise<ReadItem[]> {
  if (!env.ANTHROPIC_API_KEY) {
    console.error("reader skipped: ANTHROPIC_API_KEY missing");
    throw new ReaderError("The reader is not set up yet. Tell whoever runs the pantry app.");
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 });

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create({
      model: env.READER_MODEL,
      max_tokens: 16000,
      // If the model declines, the API reruns the request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: prompt(existing, width, height) },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new ReaderError("Reading took too long. Try again.");
    if (err instanceof Anthropic.RateLimitError) throw new ReaderError("The reader is busy. Try again in a moment.");
    if (err instanceof Anthropic.APIError) {
      console.error("reader error", err.status, err.message);
      throw new ReaderError("The reader could not read this photo. Try again.");
    }
    throw err;
  }

  if (message.stop_reason === "refusal") throw new ReaderError("The reader would not read this photo. Retake it.");
  if (message.stop_reason === "max_tokens") throw new ReaderError("Too many items in one photo. Take two photos.");

  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ReaderError("The reader sent something unreadable. Try again.");
  }
  return (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it: unknown) => cleanItem(it, width, height))
    .filter(Boolean) as ReadItem[];
}
