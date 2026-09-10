import { describe, expect, it } from "vitest";
import { parseVdf, dig, children, VdfError } from "./vdf.js";

describe("parseVdf", () => {
  it("reads pairs and nesting", () => {
    expect(parseVdf(`"AppState" { "appid" "440" "name" "Team Fortress 2" }`)).toEqual({
      AppState: { appid: "440", name: "Team Fortress 2" },
    });
  });

  it("nests to any depth", () => {
    const v = parseVdf(`"a" { "b" { "c" { "d" "1" } } }`);
    expect(dig(v, "a", "b", "c", "d")).toBe("1");
  });

  it("ignores comments and platform conditionals", () => {
    const v = parseVdf(`
      // a whole line
      "root" {
        "kept"    "yes"
        "windows" "1" [$WIN32]
      }`);
    expect(v).toEqual({ root: { kept: "yes", windows: "1" } });
  });

  it("keeps a Windows path intact", () => {
    // \\s is not an escape. Swallowing the backslash silently corrupts every install
    // path in the file, and the result still parses, so nothing complains.
    const v = parseVdf(`"path" "C:\\\\Program Files\\steamapps"`);
    expect(v.path).toBe("C:\\Program Files\\steamapps");
  });

  it("understands the escapes that are real", () => {
    expect(parseVdf(`"k" "a\\tb\\nc\\"d"`).k).toBe('a\tb\nc"d');
  });

  it("takes bare tokens as well as quoted ones", () => {
    expect(parseVdf(`root { kept yes }`)).toEqual({ root: { kept: "yes" } });
  });

  it("a repeated key keeps the last, the way the client does", () => {
    // Rejecting this would refuse files Steam itself reads without complaint.
    expect(parseVdf(`"a" "1" "a" "2"`)).toEqual({ a: "2" });
  });

  it("an empty block is an empty object, not a missing key", () => {
    expect(parseVdf(`"tags" { }`)).toEqual({ tags: {} });
  });

  it("survives an empty document", () => {
    expect(parseVdf("")).toEqual({});
    expect(parseVdf("  \n // just a comment \n ")).toEqual({});
  });

  it("reports the line an unterminated string started on", () => {
    let caught: unknown;
    try { parseVdf(`"a" "1"\n"b" "no closing quote`); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(VdfError);
    expect((caught as VdfError).line).toBe(2);
  });

  it("refuses an unclosed block rather than returning half a file", () => {
    // Half a library silently looks like a small library.
    expect(() => parseVdf(`"a" { "b" "1"`)).toThrow(VdfError);
  });

  it("refuses a stray closing brace", () => {
    expect(() => parseVdf(`"a" "1" }`)).toThrow(VdfError);
  });

  it("refuses a key with nothing after it", () => {
    expect(() => parseVdf(`"a" "1" "b"`)).toThrow(/no value/);
  });
});

describe("dig", () => {
  const v = parseVdf(`"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" { "440" { "playTime" "120" } } } } } }`);

  it("walks the documented path", () => {
    expect(dig(v, "UserLocalConfigStore", "Software", "Valve", "Steam", "apps", "440", "playTime")).toBe("120");
  });

  it("ignores case at every step", () => {
    // Steam writes `apps` and `Apps`, `Steam` and `steam`, from the same client. A
    // case-sensitive walk works on one machine and reports an empty library on the next.
    expect(dig(v, "userlocalconfigstore", "software", "valve", "STEAM", "Apps", "440", "PLAYTIME")).toBe("120");
  });

  it("returns undefined for a path that is not there", () => {
    expect(dig(v, "UserLocalConfigStore", "nope")).toBeUndefined();
    expect(dig(v, "UserLocalConfigStore", "Software", "Valve", "Steam", "apps", "440", "playTime", "deeper")).toBeUndefined();
    expect(dig(undefined, "anything")).toBeUndefined();
  });
});

describe("children", () => {
  it("returns only the entries that are blocks", () => {
    const v = parseVdf(`"apps" { "440" { "playTime" "12" } "570" { "playTime" "3" } "count" "2" }`);
    expect(children(dig(v, "apps")).map(([id]) => id)).toEqual(["440", "570"]);
  });

  it("is empty for a string or a missing node", () => {
    expect(children("440")).toEqual([]);
    expect(children(undefined)).toEqual([]);
  });
});
