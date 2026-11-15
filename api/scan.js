// POST /api/scan  — photo in, list of pantry items out.
// The Gemini key lives in the Vercel env var GEMINI_API_KEY (never in the browser).

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash"; // override with the GEMINI_MODEL env var in Vercel
const LEVELS = ["out", "low", "some", "plenty"];
const CATEGORIES = [
  "Dairy & Eggs", "Produce", "Canned", "Grains & Pasta", "Bread",
  "Snacks", "Drinks", "Protein", "Other",
];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          isNew: { type: "BOOLEAN" },
          category: { type: "STRING", enum: CATEGORIES },
          emoji: { type: "STRING" },
          count: { type: "INTEGER", nullable: true },
          unit: { type: "STRING" },
          level: { type: "STRING", enum: LEVELS },
          confidence: { type: "NUMBER" },
        },
        required: ["name", "isNew", "category", "emoji", "count", "unit", "level", "confidence"],
      },
    },
    notes: { type: "STRING" },
  },
  required: ["items", "notes"],
};

function buildPrompt(existingItems, mode) {
  const list = existingItems.length ? existingItems.join(", ") : "(none yet)";
  return `You are counting food on a college food pantry shelf from one photo.
This photo is a ${mode === "restock" ? "RESTOCK (a delivery or donation coming in)" : "SHELF CHECK (what is on the shelf right now)"}.
Existing item names in our system: ${list}.

For every distinct food item you can see, return:
- name: if it is the same thing as an existing item, use that existing name EXACTLY. Otherwise give a short, general, singular, title-case name (e.g. "Banana", "Canned Corn", "Peanut Butter"). Do not include brands or sizes.
- isNew: true if the name is not in the existing list.
- category: one of ${CATEGORIES.join(", ")}.
- emoji: one emoji that best shows the item.
- count: a whole number ONLY if every unit is clearly visible and countable. If some could be hidden, stacked behind, or you are unsure, use null. Count individual units (eggs, bananas, cans, jugs, boxes). For a closed egg carton, use null.
- unit: what you counted (eggs, cans, jugs, boxes, bunches, bags...).
- level: out, low, some, or plenty, judging by how full that shelf space looks.
- confidence: 0 to 1.

Do not invent items you cannot see. Do not count people, shelves, signs or labels as food.
Put anything uncertain (blurry photo, hidden rows) in notes.`;
}

function clean(item) {
  const name = String(item.name || "").trim().slice(0, 40);
  if (!name) return null;
  let count = item.count;
  count = Number.isInteger(count) && count >= 0 ? count : null;
  return {
    name,
    isNew: Boolean(item.isNew),
    category: CATEGORIES.includes(item.category) ? item.category : "Other",
    emoji: String(item.emoji || "📦").slice(0, 4),
    count,
    unit: String(item.unit || "").slice(0, 20),
    level: LEVELS.includes(item.level) ? item.level : "some",
    confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ items: [], error: "Use POST" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ items: [], error: "GEMINI_API_KEY is not set on the server" });

  const { image, mode = "shelf", existingItems = [] } = req.body || {};
  if (typeof image !== "string" || image.length < 100) {
    return res.status(400).json({ items: [], error: "No image received" });
  }
  const names = Array.isArray(existingItems) ? existingItems.map(String).slice(0, 200) : [];

  const body = {
    contents: [{
      parts: [
        { text: buildPrompt(names, mode) },
        { inline_data: { mime_type: "image/jpeg", data: image } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || `Gemini error ${r.status}`;
      return res.status(502).json({ items: [], error: msg });
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ items: [], error: "Empty answer from Gemini" });

    const parsed = JSON.parse(text);
    const items = (parsed.items || []).map(clean).filter(Boolean);
    return res.status(200).json({ items, notes: String(parsed.notes || "") });
  } catch (err) {
    const msg = err.name === "AbortError" ? "Gemini took too long, try again" : String(err.message || err);
    return res.status(502).json({ items: [], error: msg });
  } finally {
    clearTimeout(timer);
  }
}
