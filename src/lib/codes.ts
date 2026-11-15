// Pickup codes: four characters a student reads out at the desk. The alphabet
// leaves out 0, O, 1 and I so nobody mixes them up. Random bytes are drawn
// until they land inside the alphabet, so every character is equally likely.

export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newCode(length = 4): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out;
}

export function isCode(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${CODE_ALPHABET}]{4}$`).test(value);
}
