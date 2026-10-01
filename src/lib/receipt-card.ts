import { gb, hours, type Game } from "./library.js";
import { currentShareCardTheme, type ShareCardTheme } from "./share-card.js";
import { buildShelfReceipt, type ShelfReceiptSource } from "./receipt.js";

export interface ShelfReceiptCardInput {
  games: Game[];
  source: ShelfReceiptSource;
  sourceLabel: string;
  profileName?: string | null;
  generatedAt: number;
  theme?: Partial<ShareCardTheme>;
}

const WIDTH = 1080;
const HEIGHT = 1350;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode the shelf receipt.")), "image/png");
  });
}

function clipLine(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(clipped + "…").width > maxWidth) clipped = clipped.slice(0, -1);
  return clipped.trimEnd() + "…";
}

function row(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  y: number,
  theme: ShareCardTheme,
  strong = false,
): void {
  const left = 224;
  const right = 856;
  ctx.fillStyle = strong ? theme.fg : theme.dim;
  ctx.font = strong
    ? "800 24px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    : "650 20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const safeLabel = clipLine(ctx, label.toUpperCase(), 390);
  ctx.fillText(safeLabel, left, y);

  const valueWidth = ctx.measureText(value).width;
  const dotsStart = left + ctx.measureText(safeLabel).width + 14;
  const dotsEnd = right - valueWidth - 14;
  if (dotsEnd > dotsStart) {
    ctx.save();
    ctx.strokeStyle = theme.edge;
    ctx.globalAlpha = .58;
    ctx.setLineDash([2, 7]);
    ctx.beginPath();
    ctx.moveTo(dotsStart, y - 6);
    ctx.lineTo(dotsEnd, y - 6);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = theme.fg;
  ctx.textAlign = "right";
  ctx.fillText(value, right, y);
  ctx.textAlign = "left";
}

const sourceHeading = (source: ShelfReceiptSource): string => {
  if (source === "steam") return "PUBLIC STEAM DATA";
  if (source === "local") return "LOCAL STEAM FILES · THIS PC";
  return "SYNTHETIC DEMO DATA";
};

const sourceBoundary = (source: ShelfReceiptSource): string => {
  if (source === "steam") return "No local install, disk, or last-played fields are inferred.";
  if (source === "local") return "Install and disk lines refer only to the Steam files loaded from this PC.";
  return "Demo values are examples bundled with Shelfwear, not observations from this PC.";
};

export function shelfReceiptFilename(profileName?: string | null): string {
  const stem = (profileName ?? "my")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "my";
  return `shelfwear-${stem}-receipt.png`;
}

export async function renderShelfReceipt(input: ShelfReceiptCardInput): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Shelf receipts require a browser.");
  const theme = { ...currentShareCardTheme(), ...input.theme };
  const summary = buildShelfReceipt(input.games, input.source);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const paperX = 154;
  const paperY = 54;
  const paperW = 772;
  const paperH = 1242;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.18)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;
  roundedRect(ctx, paperX, paperY, paperW, paperH, 18);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, paperX, paperY, paperW, paperH, 18);
  ctx.clip();
  ctx.globalAlpha = .16;
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = 1;
  for (let y = paperY + 24; y < paperY + paperH; y += 34) {
    ctx.beginPath();
    ctx.moveTo(paperX + 18, y);
    ctx.lineTo(paperX + paperW - 18, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.fillStyle = theme.accent;
  ctx.font = "900 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText("SHELFWEAR / SHELF RECEIPT", 224, 112);

  ctx.fillStyle = theme.fg;
  ctx.font = "850 44px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const title = input.profileName ? input.profileName + "'s shelf" : "current shelf";
  ctx.fillText(clipLine(ctx, title, 620), 224, 169);

  ctx.fillStyle = theme.dim;
  ctx.font = "750 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(sourceHeading(input.source), 224, 205);

  ctx.strokeStyle = theme.edge;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(224, 238);
  ctx.lineTo(856, 238);
  ctx.stroke();
  ctx.setLineDash([]);

  row(ctx, "Games represented", String(summary.gameCount), 292, theme);
  row(ctx, "Untouched titles", String(summary.untouchedCount), 342, theme);
  row(ctx, "Total recorded", hours(summary.totalMinutes).toFixed(1) + " HOURS", 406, theme, true);

  ctx.fillStyle = theme.accent2;
  ctx.font = "900 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText("TOP RECORDED HOURS", 224, 478);

  let y = 526;
  if (summary.topPlayed.length) {
    summary.topPlayed.forEach((game, index) => {
      row(ctx, String(index + 1).padStart(2, "0") + " " + (game.name ?? "app " + game.appid), hours(game.minutes).toFixed(1) + "h", y, theme);
      y += 48;
    });
  } else {
    ctx.fillStyle = theme.dim;
    ctx.font = "650 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("No recorded playtime on this shelf.", 224, y);
    y += 48;
  }

  if (input.source === "local" && summary.biggestKnownInstalls.length) {
    y += 30;
    ctx.fillStyle = theme.accent2;
    ctx.font = "900 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("BIGGEST KNOWN INSTALLS", 224, y);
    y += 48;
    summary.biggestKnownInstalls.forEach((game) => {
      row(ctx, game.name ?? "app " + game.appid, gb(game.bytes ?? 0).toFixed(1) + " GB", y, theme);
      y += 48;
    });
  }

  const footerTop = 1015;
  ctx.strokeStyle = theme.edge;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(224, footerTop);
  ctx.lineTo(856, footerTop);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = theme.dim;
  ctx.font = "650 16px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(sourceBoundary(input.source), 224, 1064);

  ctx.fillStyle = theme.fg;
  ctx.font = "850 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText("OBSERVED VALUES ONLY", 224, 1130);

  const generated = new Date(input.generatedAt);
  ctx.fillStyle = theme.dim;
  ctx.font = "650 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText("GENERATED " + generated.toISOString().slice(0, 10), 224, 1175);
  ctx.fillText(clipLine(ctx, input.sourceLabel, 430), 224, 1212);

  ctx.fillStyle = theme.accent;
  ctx.font = "900 18px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("shelfwear ♡", 856, 1212);
  ctx.textAlign = "left";

  return canvasBlob(canvas);
}
