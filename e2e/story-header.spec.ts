import { expect, test } from '@playwright/test';

for (const width of [1920, 1366, 768, 320]) {
  test(`Shelf Story header stays separated and contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Shelf stories', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.getByLabel('Shelf story card caption').fill('A long caption about the games that stayed with me, the friends I played with, and the stories I still remember today.');
    for (const title of ['games that shaped me', 'the games that shaped my very long gaming history', 'W'.repeat(48)]) {
      await page.getByLabel('Shelf story card title').fill(title);
      const boxes = await page.locator('.curated-preview-heading').evaluate(header => {
        const card = header.closest('.curated-card-preview')!;
        const rect = (e: Element) => e.getBoundingClientRect().toJSON();
        return { card: rect(card), header: rect(header), badge: rect(header.querySelector('.curated-sticker')!), title: rect(header.querySelector('h3')!), caption: rect(header.querySelector('p')!), grid: rect(card.querySelector('.curated-nine-grid')!), decorations: [...header.querySelectorAll('.curated-doodle')].map(rect), overflow: card.scrollWidth - card.clientWidth };
      });
      expect(boxes.badge.bottom).toBeLessThan(boxes.title.top);
      expect(boxes.title.bottom).toBeLessThan(boxes.caption.top);
      expect(boxes.caption.bottom).toBeLessThan(boxes.grid.top);
      expect(boxes.overflow).toBeLessThanOrEqual(1);
      for (const box of [boxes.badge, boxes.title, boxes.caption, ...boxes.decorations]) {
        expect(box.left).toBeGreaterThanOrEqual(boxes.card.left);
        expect(box.right).toBeLessThanOrEqual(boxes.card.right);
        expect(box.top).toBeGreaterThanOrEqual(boxes.header.top);
        expect(box.bottom).toBeLessThanOrEqual(boxes.header.bottom);
      }
      for (const box of boxes.decorations) expect(box.bottom).toBeLessThan(boxes.title.top);
    }
  });
}

test('exported Shelf Story flows from paper badge to wrapped title, caption and grid', async ({ page }) => {
  await page.addInitScript(() => {
    const records: { text: string; top: number; bottom: number }[] = [];
    Object.assign(window, { __storyBounds: records });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      const metrics = this.measureText(text);
      const matrix = this.getTransform();
      const paper = text === 'HAND-PICKED ♡';
      const top = paper ? 0 : y - metrics.actualBoundingBoxAscent;
      const bottom = paper ? 30 : y + metrics.actualBoundingBoxDescent;
      const points = [new DOMPoint(paper ? 0 : x, top), new DOMPoint(paper ? 136 : x + metrics.width, top), new DOMPoint(paper ? 0 : x, bottom), new DOMPoint(paper ? 136 : x + metrics.width, bottom)].map(p => p.matrixTransform(matrix));
      records.push({ text, top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) });
      return original.call(this, text, x, y, ...rest);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Shelf stories', exact: true }).click();
  await page.getByLabel('Game name to add').fill('Hades');
  await page.getByRole('button', { name: 'Add game', exact: true }).click();
  for (const title of ['games that shaped me', 'the games that shaped my very long gaming history']) {
    await page.getByLabel('Shelf story card title').fill(title);
    await page.evaluate(() => { (window as unknown as { __storyBounds: unknown[] }).__storyBounds.length = 0; });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download 1080×1350 card' }).click();
    await download;
    const records = await page.evaluate(() => (window as unknown as { __storyBounds: { text: string; top: number; bottom: number }[] }).__storyBounds);
    const badge = records.find(r => r.text === 'HAND-PICKED ♡')!;
    const heading = records.filter(r => r.top > badge.top && r.text !== 'HAND-PICKED ♡');
    expect(heading[0].top).toBeGreaterThan(badge.bottom);
    const captionIndex = heading.findIndex(r => r.text.startsWith('the games that became'));
    expect(captionIndex).toBe(title === 'games that shaped me' ? 1 : 2);
    for (let i = 1; i <= captionIndex + 1; i++) expect(heading[i].top).toBeGreaterThan(heading[i - 1].bottom);
    expect(Math.max(...records.map(r => r.bottom))).toBeLessThan(1350);
    await page.getByLabel('Shelf story card caption').fill('the games that became part of my gaming history, including the friends I played with and the stories I still remember.');
  }
});
