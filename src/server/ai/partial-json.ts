const ESCAPES: Record<string, string> = {
  '"': '"',
  "/": "/",
  "\\": "\\",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

export function readPartialJsonStringField(
  snapshot: string,
  key: string,
): string | null | undefined {
  const marker = JSON.stringify(key);
  const markerIndex = snapshot.indexOf(marker);
  if (markerIndex < 0) return undefined;

  let cursor = markerIndex + marker.length;
  while (/\s/.test(snapshot[cursor] ?? "")) cursor += 1;
  if (snapshot[cursor] !== ":") return undefined;
  cursor += 1;
  while (/\s/.test(snapshot[cursor] ?? "")) cursor += 1;

  if (snapshot.slice(cursor, cursor + 4) === "null") return null;
  if (snapshot[cursor] !== '"') return undefined;
  cursor += 1;

  let output = "";
  while (cursor < snapshot.length) {
    const character = snapshot[cursor];
    if (character === '"') return output;
    if (character !== "\\") {
      output += character;
      cursor += 1;
      continue;
    }

    const escape = snapshot[cursor + 1];
    if (!escape) return output;
    if (escape === "u") {
      const hex = snapshot.slice(cursor + 2, cursor + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return output;
      output += String.fromCharCode(Number.parseInt(hex, 16));
      cursor += 6;
      continue;
    }
    const decoded = ESCAPES[escape];
    if (decoded === undefined) return output;
    output += decoded;
    cursor += 2;
  }

  return output;
}
