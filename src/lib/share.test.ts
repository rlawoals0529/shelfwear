import { describe, expect, it, vi } from "vitest";
import { shareOrCopyLink, shareOrCopyText } from "./share.js";

const data = {
  title: "Shelfwear shelf",
  text: "See this public Steam shelf on Shelfwear.",
  url: "https://example.com/?steam=76561198000000000",
};

describe("shareOrCopyLink", () => {
  it("uses native sharing when available", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);

    await expect(shareOrCopyLink(data, { share, clipboard: { writeText } })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("respects a user-cancelled native share without copying behind their back", async () => {
    const error = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const share = vi.fn(async () => { throw error; });
    const writeText = vi.fn(async () => undefined);

    await expect(shareOrCopyLink(data, { share, clipboard: { writeText } })).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when native sharing is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(shareOrCopyLink(data, { clipboard: { writeText } })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it("falls back to the clipboard if the platform share call fails", async () => {
    const share = vi.fn(async () => { throw new Error("platform failure"); });
    const writeText = vi.fn(async () => undefined);

    await expect(shareOrCopyLink(data, { share, clipboard: { writeText } })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(data.url);
  });
});


describe("shareOrCopyText", () => {
  const textData = {
    title: "Comfort games",
    text: "Comfort games\n\n1. Hades\n\nMade with Shelfwear",
  };

  it("uses native text sharing without inventing a URL", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);

    await expect(shareOrCopyText(textData, { share, clipboard: { writeText } })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(textData);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying the full authored text", async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(shareOrCopyText(textData, { clipboard: { writeText } })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(textData.text);
  });
});
