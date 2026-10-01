export type ShareOutcome = "shared" | "copied" | "cancelled";

export interface ShelfwearShareData {
  title: string;
  text: string;
  url: string;
}

interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    writeText: (text: string) => Promise<void>;
  };
}

const errorName = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : null;

/**
 * Prefer the browser's native share sheet when it exists. A deliberate user cancel is
 * respected; platform/share failures fall back to copying the same stateless URL.
 */
export async function shareOrCopyLink(
  data: ShelfwearShareData,
  target: ShareNavigator = navigator,
): Promise<ShareOutcome> {
  if (typeof target.share === "function") {
    try {
      await target.share({
        title: data.title,
        text: data.text,
        url: data.url,
      });
      return "shared";
    } catch (error) {
      if (errorName(error) === "AbortError") return "cancelled";
    }
  }

  if (!target.clipboard?.writeText) {
    throw new Error("Sharing is unavailable in this browser.");
  }
  await target.clipboard.writeText(data.url);
  return "copied";
}
