import { expect, test, type Browser, type Page } from '@playwright/test';

/** Two isolated browser contexts = two independent users with separate storage. */
async function openRoomPair(browser: Browser): Promise<{ alice: Page; bob: Page }> {
  const alice = await (await browser.newContext()).newPage();
  await alice.goto('/');
  await alice.getByRole('button', { name: 'Create a room' }).click();
  await alice.waitForURL(/\/room\/[\w-]+#key=/);

  const bob = await (await browser.newContext()).newPage();
  await bob.goto(alice.url());

  // Both sides must see each other over a live data channel before we start editing.
  for (const page of [alice, bob]) {
    await expect(page.getByText(/In this room · 2\/6/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('status').getByText(/Live · 1 peer/)).toBeVisible({
      timeout: 20_000,
    });
  }
  return { alice, bob };
}

test('notes typed by one peer appear for the other', async ({ browser }) => {
  const { alice, bob } = await openRoomPair(browser);
  for (const page of [alice, bob]) await page.getByRole('radio', { name: 'Notes' }).click();

  const editor = alice.getByLabel('Shared notes');
  await editor.click();
  await alice.keyboard.type('Hello from Alice');
  await expect(bob.getByLabel('Shared notes')).toContainText('Hello from Alice');

  // Concurrent typing at the same time must keep every character from both users.
  await bob.getByLabel('Shared notes').click();
  await bob.keyboard.press('End');
  await Promise.all([alice.keyboard.type(' A1A2A3'), bob.keyboard.type(' B1B2B3')]);
  for (const page of [alice, bob]) {
    const notes = page.getByLabel('Shared notes');
    await expect(notes).toContainText('A1A2A3');
    await expect(notes).toContainText('B1B2B3');
  }
  expect(await alice.getByLabel('Shared notes').textContent()).toBe(
    await bob.getByLabel('Shared notes').textContent(),
  );
});

test('whiteboard shapes drawn by one peer render for the other', async ({ browser }) => {
  const { alice, bob } = await openRoomPair(browser);
  await alice.getByRole('button', { name: 'Rectangle (R)' }).click();

  const canvas = alice.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await alice.mouse.move(box.x + 200, box.y + 200);
  await alice.mouse.down();
  await alice.mouse.move(box.x + 400, box.y + 320, { steps: 8 });
  await alice.mouse.up();

  // Read pixels from Bob's canvas at a point on the rectangle's top edge.
  await expect
    .poll(
      () =>
        bob.evaluate(() => {
          const c = document.querySelector('canvas')!;
          const ratio = c.width / c.clientWidth;
          const px = c.getContext('2d')!.getImageData(300 * ratio, 200 * ratio, 1, 1).data;
          return px[3]!;
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
});

test('measures end-to-end sync latency between two peers', async ({ browser }) => {
  const { alice, bob } = await openRoomPair(browser);
  for (const page of [alice, bob]) await page.getByRole('radio', { name: 'Notes' }).click();
  // The editor is a lazily loaded chunk; both must be mounted before timing starts.
  await expect(bob.getByLabel('Shared notes')).toBeVisible();
  await alice.getByLabel('Shared notes').click();

  const samples: number[] = [];
  for (let i = 0; i < 25; i++) {
    const token = `t${i}x`;
    // Bob timestamps the moment the token lands in his DOM (same machine clock as Alice).
    const arrived = bob.evaluate(
      (t) =>
        new Promise<number>((resolve) => {
          const root = document.querySelector('[aria-label="Shared notes"]')!;
          const check = () =>
            root.textContent?.includes(t) && (observer.disconnect(), resolve(Date.now()));
          const observer = new MutationObserver(check);
          observer.observe(root, { childList: true, subtree: true, characterData: true });
          check();
        }),
      token,
    );
    const sentAt = await alice.evaluate((t) => {
      const now = Date.now();
      document.execCommand('insertText', false, t);
      return now;
    }, token);
    samples.push((await arrived) - sentAt);
  }

  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  const p95 = samples[Math.floor(samples.length * 0.95)]!;
  console.log(`sync latency (2 peers, localhost): median ${median}ms, p95 ${p95}ms`);
  test
    .info()
    .annotations.push({ type: 'sync-latency', description: `median=${median}ms p95=${p95}ms` });
  expect(median).toBeLessThan(500);
});

test('offline edits persist locally and merge after reconnecting', async ({ browser }) => {
  const { alice, bob } = await openRoomPair(browser);
  const url = alice.url();
  for (const page of [alice, bob]) await page.getByRole('radio', { name: 'Notes' }).click();
  await alice.getByLabel('Shared notes').click();
  await alice.keyboard.type('base');
  await expect(bob.getByLabel('Shared notes')).toContainText('base');

  // Bob goes offline: his signaling socket is refused, so no peer connection can form.
  const bobContext = bob.context();
  let offline = true;
  await bobContext.routeWebSocket(/socket\.io/, (ws) => {
    if (offline) void ws.close();
    else ws.connectToServer();
  });
  await bob.close();

  await alice.keyboard.type(' alice-online');

  const bobOffline = await bobContext.newPage();
  await bobOffline.goto(url);
  await bobOffline.getByRole('radio', { name: 'Notes' }).click();
  // Loaded from encrypted IndexedDB without any peer.
  await expect(bobOffline.getByLabel('Shared notes')).toContainText('base');
  await expect(bobOffline.getByLabel('Shared notes')).not.toContainText('alice-online');
  await bobOffline.getByLabel('Shared notes').click();
  await bobOffline.keyboard.press('Control+End');
  await bobOffline.keyboard.type(' bob-offline');

  // Back online: reload, reconnect, and both sides converge on both edits.
  offline = false;
  await bobOffline.reload();
  await bobOffline.getByRole('radio', { name: 'Notes' }).click();
  for (const page of [alice, bobOffline]) {
    const notes = page.getByLabel('Shared notes');
    await expect(notes).toContainText('alice-online', { timeout: 20_000 });
    await expect(notes).toContainText('bob-offline', { timeout: 20_000 });
  }
});

test('a link without the key is rejected', async ({ page }) => {
  await page.goto('/room/abcdefghijklmnopqrstu');
  await expect(page.getByRole('heading', { name: 'This link is missing its key' })).toBeVisible();
});
