import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import * as Y from 'yjs';

/**
 * Whiteboard rendering benchmark. Opt-in (BENCH=1) because absolute numbers depend on the
 * machine. Builds a .peerboard file with N shapes in Node, imports it through the UI, then
 * measures frame rate while continuously panning (which re-runs viewport culling every frame).
 */
test.skip(!process.env.BENCH, 'set BENCH=1 to run rendering benchmarks');

function boardFile(count: number): string {
  const doc = new Y.Doc();
  const shapes = doc.getMap('shapes');
  const colors = ['#0f172a', '#2c4cd9', '#0f766e', '#be123c'];
  doc.transact(() => {
    for (let i = 0; i < count; i++) {
      const x = (i % 100) * 60;
      const y = Math.floor(i / 100) * 60;
      const base = { id: `s${i}`, x, y, rotation: 0, stroke: colors[i % 4], strokeWidth: 2, z: i };
      if (i % 3 === 0) {
        const points = Array.from({ length: 24 }, (_, k) => (k % 2 ? Math.sin(k) * 15 : k * 2));
        shapes.set(base.id, { ...base, type: 'pen', points });
      } else if (i % 3 === 1) {
        shapes.set(base.id, { ...base, type: 'rect', width: 44, height: 30 });
      } else {
        shapes.set(base.id, { ...base, type: 'ellipse', width: 40, height: 40 });
      }
    }
  });
  const update = Y.encodeStateAsUpdate(doc);
  const bytes = new Uint8Array(5 + update.byteLength);
  bytes.set([0x50, 0x42, 0x52, 0x44, 1]);
  bytes.set(update, 5);
  const file = join(tmpdir(), `peerboard-bench-${count}.peerboard`);
  writeFileSync(file, bytes);
  return file;
}

for (const count of [1_000, 5_000]) {
  test(`pans smoothly with ${count} shapes`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create a room' }).click();
    await page.waitForURL(/#key=/);
    await page.locator('input[type=file][accept=".peerboard"]').setInputFiles(boardFile(count));
    await expect(page.getByText('Pick a tool and start drawing')).toBeHidden();

    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const measuring = page.evaluate(
      () =>
        new Promise<{ fps: number; p95: number }>((resolve) => {
          const frames: number[] = [];
          let last = performance.now();
          const end = last + 3000;
          const tick = (now: number) => {
            frames.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(tick);
            else {
              frames.sort((a, b) => a - b);
              resolve({
                fps: Math.round((frames.length / 3000) * 1000),
                p95: Math.round(frames[Math.floor(frames.length * 0.95)]! * 10) / 10,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    // Pan diagonally across the board for the whole measurement window.
    for (let i = 0; i < 180; i++) await page.mouse.wheel(12, 8);
    const result = await measuring;

    console.log(`board ${count} shapes: ${result.fps} fps, p95 frame ${result.p95}ms`);
    test
      .info()
      .annotations.push({ type: 'fps', description: `${count} shapes: ${result.fps} fps` });
    expect(result.fps).toBeGreaterThan(30);
  });
}
