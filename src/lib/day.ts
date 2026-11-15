// The pantry's day, in its own time zone. "Today" for counts and caps starts
// at local midnight, wherever the Worker happens to run.

function offsetMs(at: Date, timeZone: string): number {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at)) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - at.getTime();
}

// ISO time of local midnight today in the given zone.
export function dayStart(timeZone: string, now = new Date()): string {
  const local = new Date(now.getTime() + offsetMs(now, timeZone));
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const guess = new Date(midnightLocalAsUtc);
  return new Date(midnightLocalAsUtc - offsetMs(guess, timeZone)).toISOString();
}
