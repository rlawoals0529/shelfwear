import { hours, type Game } from "./library.js";
import type { Familiar } from "./profile.js";
import { steamApiUrl } from "./steam.js";

export interface ShareCardTheme {
  bg: string;
  panel: string;
  raised: string;
  fg: string;
  dim: string;
  accent: string;
  accent2: string;
  edge: string;
}

export interface ShareCardInput {
  games: Game[];
  familiar: Familiar;
  profileName?: string | null;
  useSteamCovers?: boolean;
  theme?: Partial<ShareCardTheme>;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 54;
const GRID_GAP = 12;
const GRID_TOP = 198;
const GRID_SIZE = WIDTH - PAD * 2;
const TILE = (GRID_SIZE - GRID_GAP * 2) / 3;

const DEFAULT_THEME: ShareCardTheme = {
  bg: "#141113",
  panel: "#1b1719",
  raised: "#292326",
  fg: "#f7f0f3",
  dim: "#af9da4",
  accent: "#d65f7d",
  accent2: "#7aa7b3",
  edge: "#4e4147",
};

export function proxiedSteamCover(appid: string): string {
  return steamApiUrl(`/api/steam/cover/${encodeURIComponent(appid)}`);
}

export function shareCardFilename(profileName?: string | null): string {
  const stem = (profileName ?? "my")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "my";
  return `shelfwear-${stem}-nine.png`;
}

export function currentShareCardTheme(): ShareCardTheme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const styles = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    bg: pick("--bg", DEFAULT_THEME.bg),
    panel: pick("--panel", DEFAULT_THEME.panel),
    raised: pick("--raised", DEFAULT_THEME.raised),
    fg: pick("--fg", DEFAULT_THEME.fg),
    dim: pick("--dim", DEFAULT_THEME.dim),
    accent: pick("--accent", DEFAULT_THEME.accent),
    accent2: pick("--accent-2", DEFAULT_THEME.accent2),
    edge: pick("--edge", DEFAULT_THEME.edge),
  };
}

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

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, size: number): void {
  const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth : (image as ImageBitmap).width;
  const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight : (image as ImageBitmap).height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > 1) {
    sw = sourceHeight;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth;
    sy = (sourceHeight - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, size, size);
}

function wrapByMeasure(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = words.shift()!;
  for (const word of words) {
    const test = `${line} ${word}`;
    if (ctx.measureText(test).width <= maxWidth || lines.length >= maxLines - 1) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;

  const last = lines.length - 1;
  if (last >= 0 && ctx.measureText(lines[last]!).width > maxWidth) {
    let clipped = lines[last]!;
    while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
    lines[last] = `${clipped.trimEnd()}…`;
  }
  return lines;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(url, { credentials: "omit" });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.toLowerCase().startsWith("image/")) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      return image;
    } finally {
      // The decoded image keeps its pixels after the object URL is released.
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode the share card.")), "image/png");
  });
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Share cards require a browser.");
  const theme = { ...DEFAULT_THEME, ...currentShareCardTheme(), ...input.theme };
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A quiet paper-like field rather than a decorative dashboard background.
  const wash = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  wash.addColorStop(0, theme.panel);
  wash.addColorStop(0.72, theme.bg);
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;

  ctx.fillStyle = theme.accent;
  ctx.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SHELFWEAR", PAD, 64);

  ctx.fillStyle = theme.fg;
  ctx.font = "700 54px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const heading = input.profileName ? `${input.profileName}'s nine` : "my nine";
  const headingLines = wrapByMeasure(ctx, heading, 760, 1);
  ctx.fillText(headingLines[0] ?? heading, PAD, 127);

  ctx.fillStyle = theme.dim;
  ctx.font = "400 22px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("the games with the most recorded playtime", PAD, 163);

  const coverImages = input.useSteamCovers
    ? await Promise.all(input.games.slice(0, 9).map((game) => loadImage(proxiedSteamCover(game.appid))))
    : input.games.slice(0, 9).map(() => null);

  for (let index = 0; index < 9; index++) {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = PAD + col * (TILE + GRID_GAP);
    const y = GRID_TOP + row * (TILE + GRID_GAP);
    const game = input.games[index];
    const cover = coverImages[index] ?? null;

    ctx.save();
    roundedRect(ctx, x, y, TILE, TILE, 18);
    ctx.clip();
    ctx.fillStyle = index % 2 === 0 ? theme.raised : theme.panel;
    ctx.fillRect(x, y, TILE, TILE);

    if (game && cover) {
      drawCover(ctx, cover, x, y, TILE);
    } else if (game) {
      const tileWash = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
      tileWash.addColorStop(0, theme.raised);
      tileWash.addColorStop(1, index % 2 === 0 ? theme.accent2 : theme.accent);
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = tileWash;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.globalAlpha = 1;
    }

    if (game) {
      const shade = ctx.createLinearGradient(0, y + TILE * 0.36, 0, y + TILE);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(0.62, "rgba(0,0,0,0.52)");
      shade.addColorStop(1, "rgba(0,0,0,0.88)");
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, TILE, TILE);

      ctx.fillStyle = "rgba(0,0,0,.58)";
      ctx.beginPath();
      ctx.arc(x + 33, y + 33, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 18px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), x + 33, y + 33);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      ctx.fillStyle = "#fff";
      ctx.font = "650 25px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      const titleLines = wrapByMeasure(ctx, game.name ?? `app ${game.appid}`, TILE - 42, 2);
      const titleStart = y + TILE - 68 - (titleLines.length - 1) * 30;
      titleLines.forEach((line, lineIndex) => ctx.fillText(line, x + 21, titleStart + lineIndex * 30));
      ctx.fillStyle = "rgba(255,255,255,.74)";
      ctx.font = "500 18px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(`${hours(game.minutes)}h`, x + 21, y + TILE - 24);
    } else {
      ctx.fillStyle = theme.edge;
      ctx.font = "500 18px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("empty shelf", x + TILE / 2, y + TILE / 2);
      ctx.textAlign = "left";
    }
    ctx.restore();
  }

  const footerY = GRID_TOP + GRID_SIZE + 38;
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, footerY);
  ctx.lineTo(WIDTH - PAD, footerY);
  ctx.stroke();

  ctx.fillStyle = theme.dim;
  ctx.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SHELF FAMILIAR", PAD, footerY + 39);
  ctx.fillStyle = theme.fg;
  ctx.font = "700 31px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(input.familiar.name, PAD, footerY + 79);
  ctx.fillStyle = theme.dim;
  ctx.font = "400 19px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const description = wrapByMeasure(ctx, input.familiar.description, 720, 2);
  description.forEach((line, index) => ctx.fillText(line, PAD, footerY + 111 + index * 25));

  ctx.fillStyle = theme.accent2;
  ctx.font = "600 18px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(input.familiar.animal, WIDTH - PAD, footerY + 77);
  ctx.fillStyle = theme.dim;
  ctx.font = "400 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("playtime, not a personality test", WIDTH - PAD, footerY + 108);
  ctx.textAlign = "left";

  return canvasBlob(canvas);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
