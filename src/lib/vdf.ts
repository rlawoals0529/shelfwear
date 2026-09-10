/**
 * Valve's KeyValues text format, which is what every file in a Steam install is written in.
 *
 * The grammar is small: quoted or bare tokens, `"key" "value"` pairs, `"key" { ... }` for
 * nesting, `//` comments, and platform conditionals like `[$WIN32]` that a reader is meant
 * to skip. There is no published specification, so this is written against the shape the
 * files actually have.
 */

export type VdfValue = string | VdfNode;
export interface VdfNode { [key: string]: VdfValue }

export class VdfError extends Error {
  constructor(message: string, readonly line: number) {
    super(`line ${line}: ${message}`);
    this.name = "VdfError";
  }
}

interface Token { kind: "open" | "close" | "string"; value: string; line: number }

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"' };

function tokenise(src: string): Token[] {
  const out: Token[] = [];
  let i = 0, line = 1;

  while (i < src.length) {
    const c = src[i]!;

    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }

    // Comments run to the end of the line. Both `//` and a bare `/` appear in the wild.
    if (c === "/" ) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    // A platform conditional applies to the pair before it and is not a value of its own.
    if (c === "[") {
      while (i < src.length && src[i] !== "]" && src[i] !== "\n") i++;
      i++;
      continue;
    }

    if (c === "{") { out.push({ kind: "open", value: "{", line }); i++; continue; }
    if (c === "}") { out.push({ kind: "close", value: "}", line }); i++; continue; }

    if (c === '"') {
      const start = line;
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          const next = src[i + 1]!;
          // An unrecognised escape keeps both characters. Windows paths are full of
          // sequences like \s that are not escapes at all, and swallowing the backslash
          // silently corrupts every install path in the file.
          s += ESCAPES[next] ?? "\\" + next;
          i += 2;
          continue;
        }
        if (src[i] === "\n") line++;
        s += src[i];
        i++;
      }
      if (i >= src.length) throw new VdfError("unterminated string", start);
      i++;
      out.push({ kind: "string", value: s, line: start });
      continue;
    }

    // A bare token: everything up to whitespace or a structural character.
    let s = "";
    while (i < src.length && !' \t\r\n{}"'.includes(src[i]!)) { s += src[i]; i++; }
    if (s) out.push({ kind: "string", value: s, line });
    else i++;  // a character we do not understand, stepped over rather than looped on
  }
  return out;
}

/**
 * Parse a KeyValues document into plain objects.
 *
 * A repeated key keeps the last one, which is what Steam itself does. A duplicate is not
 * an error, so throwing on one would reject files the client reads happily.
 */
export function parseVdf(src: string): VdfNode {
  const tokens = tokenise(src);
  let at = 0;

  const parseBody = (depth: number): VdfNode => {
    const node: VdfNode = {};
    while (at < tokens.length) {
      const t = tokens[at]!;
      if (t.kind === "close") {
        if (depth === 0) throw new VdfError("unexpected }", t.line);
        at++;
        return node;
      }
      if (t.kind === "open") throw new VdfError("a block needs a key in front of it", t.line);

      at++;
      const next = tokens[at];
      if (!next) throw new VdfError(`key "${t.value}" has no value`, t.line);

      if (next.kind === "open") {
        at++;
        node[t.value] = parseBody(depth + 1);
      } else if (next.kind === "string") {
        at++;
        node[t.value] = next.value;
      } else {
        throw new VdfError(`key "${t.value}" is followed by }`, next.line);
      }
    }
    if (depth !== 0) throw new VdfError("unclosed block", tokens[tokens.length - 1]?.line ?? 1);
    return node;
  };

  return parseBody(0);
}

/**
 * Walk a path of keys, ignoring case at every step.
 *
 * Steam is not consistent about capitalisation in its own files: the same client writes
 * `apps` and `Apps`, `Steam` and `steam`, in the same format. A case-sensitive lookup
 * works on one machine and silently returns nothing on the next, which is worse than
 * failing, because the page just says you have no games.
 */
export function dig(node: VdfValue | undefined, ...path: string[]): VdfValue | undefined {
  let cur = node;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    const found = Object.keys(cur).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found === undefined) return undefined;
    cur = cur[found];
  }
  return cur;
}

/** A node's entries as [key, node] pairs, skipping any whose value is a bare string. */
export function children(node: VdfValue | undefined): [string, VdfNode][] {
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).filter((e): e is [string, VdfNode] => typeof e[1] === "object");
}
