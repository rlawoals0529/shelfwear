import { hours, type Game } from "./library.js";
import type { LibraryComparison } from "./compare.js";
import type { Familiar } from "./profile.js";
import { steamApiUrl } from "./steam.js";
import type { CuratedTopGames } from "./top-games.js";

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

export interface FamiliarCardInput {
  familiar: Familiar;
  profileName?: string | null;
  theme?: Partial<ShareCardTheme>;
}

export interface ComparisonCardInput {
  leftName: string;
  rightName: string;
  comparison: LibraryComparison;
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

export function proxiedSteamCover(appid: string, iconHash?: string | null): string {
  const path = `/api/steam/cover/${encodeURIComponent(appid)}`;
  return steamApiUrl(iconHash ? `${path}?icon=${encodeURIComponent(iconHash)}` : path);
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

  // A near-square response is Steam's app icon fallback, not poster art. Keep it intact and
  // let the caller's paper/gradient tile frame it instead of blowing a tiny logo up to a crop.
  if (sourceRatio >= .82 && sourceRatio <= 1.18) {
    const inset = size * .3;
    ctx.drawImage(image, x + inset, y + inset, size - inset * 2, size - inset * 2);
    return;
  }

  // Wide Steam capsules/headers are useful official fallbacks for manually curated AppIDs,
  // but cropping them into a square makes logos huge and blurry. Letterbox them instead.
  if (sourceRatio > 1.18) {
    const targetWidth = size * .88;
    const targetHeight = targetWidth / sourceRatio;
    ctx.drawImage(
      image,
      x + (size - targetWidth) / 2,
      y + (size - targetHeight) / 2 - size * .04,
      targetWidth,
      targetHeight,
    );
    return;
  }

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
    ? await Promise.all(input.games.slice(0, 9).map((game) => loadImage(proxiedSteamCover(game.appid, game.iconHash))))
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

  // Keep the footer clean: the previous free-floating familiar glyph/string at the lower
  // right read like a misplaced game icon in exported cards. Use one aligned text block
  // instead, on the same baseline as the familiar details.
  ctx.fillStyle = theme.dim;
  ctx.font = "500 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("playtime pattern · not a personality test", WIDTH - PAD, footerY + 78);
  ctx.fillStyle = theme.accent;
  ctx.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("shelfwear ♡", WIDTH - PAD, footerY + 106);
  ctx.textAlign = "left";

  return canvasBlob(canvas);
}


export function curatedCardFilename(title: string): string {
  const stem = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44) || "shelf-story";
  return `shelfwear-${stem}.png`;
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * .2, -size * .2, size, 0);
  ctx.quadraticCurveTo(size * .2, size * .2, 0, size);
  ctx.quadraticCurveTo(-size * .2, size * .2, -size, 0);
  ctx.quadraticCurveTo(-size * .2, -size * .2, 0, -size);
  ctx.fill();
  ctx.restore();
}

export async function renderCuratedCard(input: CuratedTopGames): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Share cards require a browser.");
  const theme = currentShareCardTheme();
  const style = input.style ?? "scrapbook";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (style === "scrapbook") {
    const sheetX = 30;
    const sheetY = 28;
    const sheetW = WIDTH - 60;
    const sheetH = HEIGHT - 56;
    roundedRect(ctx, sheetX, sheetY, sheetW, sheetH, 28);
    ctx.fillStyle = theme.panel;
    ctx.fill();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    roundedRect(ctx, sheetX, sheetY, sheetW, sheetH, 28);
    ctx.clip();
    ctx.strokeStyle = theme.edge;
    ctx.globalAlpha = .16;
    ctx.lineWidth = 1;
    for (let y = 78; y < HEIGHT - 40; y += 36) {
      ctx.beginPath();
      ctx.moveTo(sheetX + 18, y);
      ctx.lineTo(sheetX + sheetW - 18, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const spine = ctx.createLinearGradient(sheetX, sheetY, sheetX, sheetY + sheetH);
    spine.addColorStop(0, theme.accent);
    spine.addColorStop(1, theme.accent2);
    ctx.fillStyle = spine;
    ctx.fillRect(sheetX, sheetY + 30, 8, sheetH - 60);
    ctx.restore();

    drawSparkle(ctx, WIDTH - 93, 86, 15, theme.accent);
    drawSparkle(ctx, WIDTH - 128, 112, 7, theme.accent2);
  } else {
    const paper = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    if (style === "poster") {
      paper.addColorStop(0, theme.bg);
      paper.addColorStop(.45, theme.panel);
      paper.addColorStop(1, theme.raised);
    } else {
      paper.addColorStop(0, theme.panel);
      paper.addColorStop(.7, theme.panel);
      paper.addColorStop(1, theme.bg);
    }
    ctx.globalAlpha = style === "poster" ? .95 : .82;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = theme.accent;
  ctx.font = "900 16px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SHELFWEAR / SHELF STORY", PAD, 58);

  ctx.fillStyle = theme.dim;
  ctx.font = "800 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(input.games.length).padStart(2, "0") + " PICKS · HAND-PICKED", WIDTH - PAD, 58);
  ctx.textAlign = "left";

  if (style === "scrapbook") {
    ctx.save();
    ctx.translate(PAD + 115, 85);
    ctx.rotate(-.045);
    ctx.fillStyle = theme.raised;
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 1.5;
    roundedRect(ctx, 0, 0, 136, 30, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.accent;
    ctx.font = "900 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("HAND-PICKED ♡", 15, 20);
    ctx.restore();
  }

  ctx.fillStyle = theme.fg;
  ctx.font = "800 50px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const heading = wrapByMeasure(ctx, input.title || "shelf story", WIDTH - PAD * 2 - 100, 1)[0] ?? "shelf story";
  ctx.fillText(heading, PAD, 134);

  ctx.fillStyle = theme.dim;
  ctx.font = "500 19px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const caption = input.caption || "a little collection from my shelf";
  const captionLines = wrapByMeasure(ctx, caption, WIDTH - PAD * 2, 2);
  captionLines.forEach((line, index) => ctx.fillText(line, PAD, 168 + index * 24));

  const gridTop = captionLines.length > 1 ? 218 : 200;
  const gridSize = WIDTH - PAD * 2;
  const tile = (gridSize - GRID_GAP * 2) / 3;
  const tileRadius = style === "poster" ? 6 : style === "polaroid" ? 10 : 8;
  const images = await Promise.all(
    input.games.slice(0, 9).map((game) =>
      game.appid ? loadImage(proxiedSteamCover(game.appid, game.iconHash)) : Promise.resolve(null)
    ),
  );
  const scrapbookAngles = [-.012, .006, -.004, .008, -.006, .011, -.008, .004, -.003];

  for (let index = 0; index < 9; index++) {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = PAD + col * (tile + GRID_GAP);
    const y = gridTop + row * (tile + GRID_GAP);
    const game = input.games[index];
    const cover = images[index] ?? null;

    ctx.save();
    if (style === "scrapbook") {
      const cx = x + tile / 2;
      const cy = y + tile / 2;
      ctx.translate(cx, cy);
      ctx.rotate(scrapbookAngles[index] ?? 0);
      ctx.translate(-cx, -cy);
      ctx.shadowColor = "rgba(0,0,0,.20)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 7;
    }

    roundedRect(ctx, x, y, tile, tile, tileRadius);
    ctx.fillStyle = style === "scrapbook" ? theme.raised : theme.panel;
    ctx.fill();
    ctx.shadowColor = "transparent";

    ctx.save();
    roundedRect(ctx, x, y, tile, tile, tileRadius);
    ctx.clip();

    const fallback = ctx.createLinearGradient(x, y, x + tile, y + tile);
    fallback.addColorStop(0, index % 2 ? theme.raised : theme.panel);
    fallback.addColorStop(1, index % 2 ? theme.accent2 : theme.accent);
    ctx.globalAlpha = cover ? 1 : .48;
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, tile, tile);
    ctx.globalAlpha = 1;

    if (game && cover) drawCover(ctx, cover, x, y, tile);

    if (game) {
      const shade = ctx.createLinearGradient(0, y + tile * .34, 0, y + tile);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(.58, "rgba(0,0,0,.45)");
      shade.addColorStop(1, "rgba(0,0,0,.88)");
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, tile, tile);

      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.beginPath();
      ctx.arc(x + 32, y + 32, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#231d20";
      ctx.font = "800 17px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), x + 32, y + 32);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      if (!cover) {
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.font = "800 66px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        const initial = game.name.trim().charAt(0).toUpperCase() || "♡";
        ctx.fillText(initial, x + 22, y + 95);
      }

      ctx.fillStyle = "#fff";
      ctx.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      const titleLines = wrapByMeasure(ctx, game.name, tile - 42, 2);
      const hasNote = Boolean(game.note);
      const start = y + tile - (hasNote ? 58 : 34) - (titleLines.length - 1) * 29;
      titleLines.forEach((line, lineIndex) => ctx.fillText(line, x + 21, start + lineIndex * 29));

      if (game.note) {
        ctx.fillStyle = "rgba(255,255,255,.78)";
        ctx.font = "600 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        const note = wrapByMeasure(ctx, game.note, tile - 42, 1)[0] ?? game.note;
        ctx.fillText(note, x + 21, y + tile - 20);
      }
    } else {
      ctx.globalAlpha = .8;
      ctx.strokeStyle = theme.edge;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 9]);
      roundedRect(ctx, x + 8, y + 8, tile - 16, tile - 16, 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.dim;
      ctx.font = "600 17px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("little empty spot", x + tile / 2, y + tile / 2);
      ctx.textAlign = "left";
    }
    ctx.restore();

    if (style === "scrapbook" && game) {
      ctx.save();
      ctx.translate(x + tile / 2, y + 7);
      ctx.rotate(index % 2 ? .035 : -.035);
      ctx.fillStyle = "rgba(239,226,214,.78)";
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 1;
      ctx.fillRect(-25, -5, 50, 14);
      ctx.strokeRect(-25, -5, 50, 14);
      ctx.restore();
    } else if (style === "polaroid" && game) {
      ctx.strokeStyle = "rgba(255,255,255,.34)";
      ctx.lineWidth = 8;
      roundedRect(ctx, x + 4, y + 4, tile - 8, tile - 8, Math.max(4, tileRadius - 3));
      ctx.stroke();
    } else if (style === "poster") {
      ctx.strokeStyle = theme.edge;
      ctx.lineWidth = 2;
      roundedRect(ctx, x + 1, y + 1, tile - 2, tile - 2, tileRadius);
      ctx.stroke();
    }
    ctx.restore();
  }

  const footerY = gridTop + gridSize + 28;
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = style === "scrapbook" ? 1.5 : 2;
  if (style === "scrapbook") ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(PAD, footerY);
  ctx.lineTo(WIDTH - PAD, footerY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = theme.fg;
  ctx.font = "800 22px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("made with shelfwear", PAD, footerY + 42);
  ctx.fillStyle = theme.dim;
  ctx.font = "500 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("a hand-picked story · " + style + " card · not ranked by playtime", PAD, footerY + 70);

  ctx.save();
  ctx.translate(WIDTH - PAD - 66, footerY + 51);
  ctx.rotate(-.025);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  roundedRect(ctx, -64, -20, 128, 40, 5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = theme.accent;
  ctx.font = "900 9px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ARCHIVE COPY", 0, 4);
  ctx.restore();
  ctx.textAlign = "left";

  return canvasBlob(canvas);
}

export function familiarCardFilename(name: string): string {
  const stem = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "shelf";
  return `shelfwear-${stem}-familiar.png`;
}

export async function renderFamiliarCard(input: FamiliarCardInput): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Share cards require a browser.");
  const theme = { ...DEFAULT_THEME, ...currentShareCardTheme(), ...input.theme };
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const sheetX = 32;
  const sheetY = 28;
  const sheetW = WIDTH - 64;
  const sheetH = HEIGHT - 56;
  roundedRect(ctx, sheetX, sheetY, sheetW, sheetH, 30);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, sheetX, sheetY, sheetW, sheetH, 30);
  ctx.clip();
  ctx.strokeStyle = theme.edge;
  ctx.globalAlpha = .16;
  ctx.lineWidth = 1;
  for (let y = 78; y < HEIGHT - 46; y += 34) {
    ctx.beginPath();
    ctx.moveTo(sheetX + 20, y);
    ctx.lineTo(sheetX + sheetW - 20, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const spine = ctx.createLinearGradient(sheetX, sheetY, sheetX, sheetY + sheetH);
  spine.addColorStop(0, theme.accent2);
  spine.addColorStop(1, theme.accent);
  ctx.fillStyle = spine;
  ctx.fillRect(sheetX, sheetY + 32, 9, sheetH - 64);
  ctx.restore();

  ctx.fillStyle = theme.accent;
  ctx.font = "900 17px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SHELFWEAR / LIBRARY SPECIMEN", PAD + 8, 65);

  ctx.fillStyle = theme.dim;
  ctx.font = "800 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("OBSERVED PATTERN · EVIDENCE CATALOGED", WIDTH - PAD - 8, 65);
  ctx.textAlign = "left";

  if (input.profileName) {
    ctx.fillStyle = theme.dim;
    ctx.font = "600 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const profile = wrapByMeasure(ctx, input.profileName, WIDTH - PAD * 2 - 16, 1)[0] ?? input.profileName;
    ctx.fillText("SHELF: " + profile, PAD + 8, 94);
  } else {
    ctx.fillStyle = theme.dim;
    ctx.font = "600 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("SHELF: CURRENT LIBRARY", PAD + 8, 94);
  }

  const specimenX = PAD + 8;
  const specimenY = 132;
  const specimenW = WIDTH - (PAD + 8) * 2;
  const specimenH = 390;
  roundedRect(ctx, specimenX, specimenY, specimenW, specimenH, 16);
  ctx.fillStyle = theme.raised;
  ctx.fill();
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = 2;
  ctx.stroke();

  // The mascot is a classification mark inside the specimen plate, not a claim about the person.
  const sealX = specimenX + 168;
  const sealY = specimenY + 187;
  ctx.save();
  ctx.translate(sealX, sealY);
  ctx.rotate(-.025);
  ctx.strokeStyle = theme.accent2;
  ctx.lineWidth = 4;
  ctx.globalAlpha = .82;
  ctx.beginPath();
  ctx.arc(0, 0, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 105, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = "154px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(input.familiar.glyph, 0, -5);
  ctx.fillStyle = theme.accent2;
  ctx.font = "900 9px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SHELF FAMILIAR", 0, 99);
  ctx.restore();

  const copyX = specimenX + 332;
  const copyW = specimenW - 370;
  ctx.fillStyle = theme.dim;
  ctx.font = "900 11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("CLASSIFICATION / LIBRARY PATTERN", copyX, specimenY + 74);

  ctx.fillStyle = theme.fg;
  ctx.font = "850 48px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const familiarName = wrapByMeasure(ctx, input.familiar.name, copyW, 2);
  familiarName.forEach((line, index) => ctx.fillText(line, copyX, specimenY + 132 + index * 54));

  ctx.fillStyle = theme.dim;
  ctx.font = "500 20px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const descriptionY = specimenY + 132 + familiarName.length * 54 + 24;
  const description = wrapByMeasure(ctx, input.familiar.description, copyW, 4);
  description.forEach((line, index) => ctx.fillText(line, copyX, descriptionY + index * 27));

  ctx.fillStyle = theme.accent;
  ctx.font = "900 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("EVIDENCE FIELDS", PAD + 8, 574);

  const rowX = PAD + 8;
  const rowW = WIDTH - (PAD + 8) * 2;
  const rowH = 92;
  const rowGap = 10;
  input.familiar.signals.slice(0, 3).forEach((signal, index) => {
    const y = 596 + index * (rowH + rowGap);
    roundedRect(ctx, rowX, y, rowW, rowH, 10);
    ctx.fillStyle = index % 2 ? theme.panel : theme.raised;
    ctx.fill();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = index === 1 ? theme.accent2 : theme.accent;
    ctx.font = "900 22px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(String(index + 1).padStart(2, "0"), rowX + 18, y + 53);

    ctx.fillStyle = theme.dim;
    ctx.font = "800 12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(signal.label.toUpperCase(), rowX + 70, y + 34);

    ctx.fillStyle = theme.fg;
    ctx.font = "800 22px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const value = wrapByMeasure(ctx, signal.value, rowW - 290, 2);
    value.forEach((line, lineIndex) => ctx.fillText(line, rowX + 70, y + 63 + lineIndex * 24));

    ctx.fillStyle = theme.dim;
    ctx.font = "700 9px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("OBSERVED", rowX + rowW - 18, y + 51);
    ctx.textAlign = "left";
  });

  const noteY = 920;
  roundedRect(ctx, rowX, noteY, rowW, 174, 12);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = theme.accent;
  ctx.font = "900 12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("FIELD NOTE / WHY THIS ONE", rowX + 18, noteY + 30);

  ctx.fillStyle = theme.fg;
  ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const evidence = wrapByMeasure(ctx, input.familiar.evidence, rowW - 36, 4);
  evidence.forEach((line, index) => ctx.fillText(line, rowX + 18, noteY + 66 + index * 29));

  ctx.save();
  ctx.translate(WIDTH - PAD - 104, 1160);
  ctx.rotate(-.035);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  roundedRect(ctx, -92, -31, 184, 62, 7);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = theme.accent;
  ctx.font = "900 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CATALOGED", 0, 5);
  ctx.restore();

  ctx.fillStyle = theme.dim;
  ctx.font = "500 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const disclaimer = "Cataloged from observable library patterns only — not a personality test or a claim about you.";
  wrapByMeasure(ctx, disclaimer, 680, 2).forEach((line, index) => ctx.fillText(line, PAD + 8, 1160 + index * 23));

  ctx.fillStyle = theme.dim;
  ctx.font = "700 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SPECIMEN CARD / 1080×1350", PAD + 8, 1250);

  ctx.fillStyle = theme.accent;
  ctx.font = "900 16px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("shelfwear ♡", WIDTH - PAD - 8, 1250);
  ctx.textAlign = "left";

  return canvasBlob(canvas);
}


const comparisonGlyph = (object: string): string =>
  ({ bookends: "📚", campfire: "🔥", bookmarks: "🔖", shelves: "🪵" } as Record<string, string>)[object] ?? "♡";

export function comparisonCardFilename(leftName: string, rightName: string): string {
  const stem = (value: string) => value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "player";
  return "shelfwear-" + stem(leftName) + "-x-" + stem(rightName) + "-comparison.png";
}

export async function renderComparisonCard(input: ComparisonCardInput): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Share cards require a browser.");
  const theme = { ...DEFAULT_THEME, ...currentShareCardTheme(), ...input.theme };
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  // Shelfwear's comparison card is intentionally a physical object: part old library
  // checkout card, part game shelf. It should still read as Shelfwear with the art removed.
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const cardX = 32;
  const cardY = 28;
  const cardW = WIDTH - 64;
  const cardH = HEIGHT - 56;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 34);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Quiet ruled-paper texture.
  ctx.save();
  roundedRect(ctx, cardX, cardY, cardW, cardH, 34);
  ctx.clip();
  ctx.strokeStyle = theme.edge;
  ctx.globalAlpha = .18;
  ctx.lineWidth = 1;
  for (let y = 76; y < HEIGHT - 48; y += 34) {
    ctx.beginPath();
    ctx.moveTo(cardX + 24, y);
    ctx.lineTo(cardX + cardW - 24, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const spine = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  spine.addColorStop(0, theme.accent);
  spine.addColorStop(1, theme.accent2);
  ctx.fillStyle = spine;
  ctx.fillRect(cardX, cardY + 34, 9, cardH - 68);

  // Tiny punched holes sell the card-object metaphor without adding semantic noise.
  ctx.fillStyle = theme.bg;
  ctx.beginPath();
  ctx.arc(cardX + cardW - 31, cardY + 31, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cardX + cardW - 31, cardY + cardH - 31, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = theme.accent;
  ctx.font = "900 17px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SHELFWEAR / SHARED SHELF", PAD + 8, 68);

  ctx.fillStyle = theme.dim;
  ctx.font = "800 11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("LIBRARY CARD  ·  PUBLIC STEAM DATA", PAD + 8, 91);

  ctx.fillStyle = theme.fg;
  ctx.font = "850 45px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const heading = wrapByMeasure(ctx, input.leftName + " × " + input.rightName, WIDTH - (PAD + 8) * 2, 1)[0] ?? "Two shelves";
  ctx.fillText(heading, PAD + 8, 144);

  ctx.fillStyle = theme.dim;
  ctx.font = "500 16px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("two public shelves, rebuilt live", PAD + 8, 174);

  const tagY = 202;
  const sideW = 318;
  const sideH = 104;
  const leftX = PAD + 8;
  const rightX = WIDTH - PAD - 8 - sideW;

  const drawShelfTag = (x: number, name: string, total: number, unique: number, accent: string): void => {
    roundedRect(ctx, x, tagY, sideW, sideH, 11);
    ctx.fillStyle = theme.raised;
    ctx.fill();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(x, tagY, 7, sideH);

    ctx.fillStyle = theme.dim;
    ctx.font = "800 11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("SHELF LABEL", x + 20, tagY + 27);

    ctx.fillStyle = theme.fg;
    ctx.font = "800 21px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const display = wrapByMeasure(ctx, name, sideW - 40, 1)[0] ?? name;
    ctx.fillText(display, x + 20, tagY + 56);

    ctx.fillStyle = theme.dim;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(String(total) + " games · " + String(unique) + " only here", x + 20, tagY + 82);
  };

  drawShelfTag(leftX, input.leftName, input.comparison.leftCount, input.comparison.leftOnlyCount, theme.accent);
  drawShelfTag(rightX, input.rightName, input.comparison.rightCount, input.comparison.rightOnlyCount, theme.accent2);

  // Overlap stamp: the one large number on the card.
  const stampX = WIDTH / 2;
  const stampY = tagY + sideH / 2;
  ctx.save();
  ctx.translate(stampX, stampY);
  ctx.rotate(-.035);
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = .82;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 73, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 63, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.fg;
  ctx.textAlign = "center";
  ctx.font = "900 34px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(Math.round(input.comparison.overlapPercent) + "%", 0, 3);
  ctx.fillStyle = theme.accent;
  ctx.font = "900 9px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("OVERLAP", 0, 24);
  ctx.textAlign = "left";
  ctx.restore();

  const pillY = 326;
  const pillW = 206;
  const pillGap = 12;
  const pillStart = (WIDTH - (pillW * 2 + pillGap)) / 2;
  [
    ["OWNED BY BOTH", String(input.comparison.sharedCount)],
    ["PLAYED BY BOTH", String(input.comparison.mutuallyPlayedCount)],
  ].forEach(([label, value], index) => {
    const x = pillStart + index * (pillW + pillGap);
    roundedRect(ctx, x, pillY, pillW, 55, 10);
    ctx.fillStyle = theme.raised;
    ctx.fill();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = index ? theme.accent2 : theme.accent;
    ctx.font = "900 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(label!, x + 13, pillY + 22);
    ctx.fillStyle = theme.fg;
    ctx.font = "850 20px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(value!, x + 13, pillY + 44);
  });

  ctx.fillStyle = theme.fg;
  ctx.font = "850 24px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("Games checked out by both shelves", PAD + 8, 430);
  ctx.fillStyle = theme.dim;
  ctx.font = "500 14px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("ordered by the lower of the two recorded playtimes", PAD + 8, 455);

  const games = input.comparison.mutuallyPlayed.slice(0, 6);
  const images = await Promise.all(games.map((game) =>
    loadImage(proxiedSteamCover(game.appid, game.iconHash))
  ));

  const cols = 2;
  const gameGap = 12;
  const gameW = (WIDTH - (PAD + 8) * 2 - gameGap) / cols;
  const gameH = 142;
  const gamesTop = 480;

  for (let index = 0; index < 6; index++) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = PAD + 8 + col * (gameW + gameGap);
    const y = gamesTop + row * (gameH + 10);
    const game = games[index];
    const cover = images[index] ?? null;

    roundedRect(ctx, x, y, gameW, gameH, 11);
    ctx.fillStyle = theme.raised;
    ctx.fill();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Little checkout tab.
    ctx.fillStyle = col ? theme.accent2 : theme.accent;
    roundedRect(ctx, x + 11, y + 10, 39, 19, 5);
    ctx.fill();
    ctx.fillStyle = theme.bg;
    ctx.font = "900 9px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(String(index + 1).padStart(2, "0"), x + 20, y + 23);

    if (!game) {
      ctx.fillStyle = theme.dim;
      ctx.font = "600 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(index === 0 ? "No shared played game in the public data." : "—", x + 65, y + 75);
      continue;
    }

    const artX = x + 12;
    const artY = y + 39;
    const artSize = 90;
    ctx.save();
    roundedRect(ctx, artX, artY, artSize, artSize, 8);
    ctx.clip();
    const artBg = ctx.createLinearGradient(artX, artY, artX + artSize, artY + artSize);
    artBg.addColorStop(0, theme.panel);
    artBg.addColorStop(1, col ? theme.accent2 : theme.accent);
    ctx.globalAlpha = cover ? 1 : .35;
    ctx.fillStyle = artBg;
    ctx.fillRect(artX, artY, artSize, artSize);
    ctx.globalAlpha = 1;
    if (cover) drawCover(ctx, cover, artX, artY, artSize);
    if (!cover) {
      ctx.fillStyle = theme.fg;
      ctx.font = "800 40px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText((game.name ?? ("app " + game.appid)).trim().charAt(0).toUpperCase(), artX + 25, artY + 59);
    }
    ctx.restore();

    const copyX = artX + artSize + 15;
    const copyW = gameW - (copyX - x) - 14;
    ctx.fillStyle = theme.fg;
    ctx.font = "800 17px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const gameName = game.name ?? ("app " + game.appid);
    wrapByMeasure(ctx, gameName, copyW, 2)
      .forEach((line, lineIndex) => ctx.fillText(line, copyX, y + 54 + lineIndex * 22));

    ctx.strokeStyle = theme.edge;
    ctx.globalAlpha = .55;
    ctx.beginPath();
    ctx.moveTo(copyX, y + 91);
    ctx.lineTo(x + gameW - 14, y + 91);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = theme.dim;
    ctx.font = "650 12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const leftLine = wrapByMeasure(ctx, input.leftName + "  " + hours(game.leftMinutes) + "h", copyW, 1)[0] ?? "";
    const rightLine = wrapByMeasure(ctx, input.rightName + "  " + hours(game.rightMinutes) + "h", copyW, 1)[0] ?? "";
    ctx.fillText(leftLine, copyX, y + 112);
    ctx.fillText(rightLine, copyX, y + 130);
  }

  const signatureTop = 950;
  const signatureW = WIDTH - (PAD + 8) * 2;
  roundedRect(ctx, PAD + 8, signatureTop, signatureW, 180, 13);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.setLineDash([9, 7]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "76px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(comparisonGlyph(input.comparison.signature.object), PAD + 84, signatureTop + 92);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = theme.accent;
  ctx.font = "900 11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("SHARED SHELF SIGNATURE / STAMPED", PAD + 150, signatureTop + 35);
  ctx.fillStyle = theme.fg;
  ctx.font = "850 28px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(input.comparison.signature.name, PAD + 150, signatureTop + 72);
  ctx.fillStyle = theme.dim;
  ctx.font = "500 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const evidence = input.comparison.signature.description + " " + input.comparison.signature.evidence;
  wrapByMeasure(ctx, evidence, signatureW - 185, 3)
    .forEach((line, index) => ctx.fillText(line, PAD + 150, signatureTop + 103 + index * 22));

  const handoff = input.comparison.oneSidedPlayed[0];
  const noteTop = 1153;
  if (handoff) {
    const leftPlayed = handoff.leftMinutes > 0;
    const playedName = leftPlayed ? input.leftName : input.rightName;
    const unplayedName = leftPlayed ? input.rightName : input.leftName;
    const playedMinutes = leftPlayed ? handoff.leftMinutes : handoff.rightMinutes;
    ctx.save();
    ctx.translate(PAD + 16, noteTop + 8);
    ctx.rotate(.008);
    roundedRect(ctx, 0, 0, WIDTH - (PAD + 16) * 2, 82, 8);
    ctx.fillStyle = theme.raised;
    ctx.fill();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = theme.accent2;
    ctx.font = "900 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("HANDOFF NOTE", 15, 24);
    ctx.fillStyle = theme.fg;
    ctx.font = "800 17px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const handoffName = wrapByMeasure(ctx, handoff.name ?? ("app " + handoff.appid), 360, 1)[0] ?? "";
    ctx.fillText(handoffName, 15, 50);
    ctx.fillStyle = theme.dim;
    ctx.font = "600 12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const handoffLine = playedName + " " + hours(playedMinutes) + "h · " + unplayedName + " 0h recorded";
    ctx.fillText(wrapByMeasure(ctx, handoffLine, 520, 1)[0] ?? handoffLine, 420, 49);
    ctx.restore();
  } else {
    ctx.fillStyle = theme.dim;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("CHECKED OUT BY TWO LIBRARIES", PAD + 8, noteTop + 48);
  }

  ctx.fillStyle = theme.dim;
  ctx.font = "500 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("A comparison of public library data, not a compatibility score.", PAD + 8, 1297);
  ctx.fillStyle = theme.accent;
  ctx.font = "900 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("shelfwear ♡", WIDTH - PAD - 8, 1297);
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
