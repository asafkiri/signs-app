import fs from 'node:fs';
import path from 'node:path';

// The price-tag tab must not touch the sign editor's workspace or saved signs.
export async function checkPriceTags({ page, name, out, ok, eq, load }) {
  await page.evaluate(() => localStorage.removeItem('signs-app:v1:price-tags'));
  await load();
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k !== 'signs-app:v1:price-tags').map(k => [k, localStorage.getItem(k)])));
  const activeType = await page.locator('.header-nav [data-type][aria-pressed=true]').getAttribute('data-type');
  const editorPng = await page.evaluate(() => document.querySelector('#signPages canvas')?.toDataURL() || '');
  await page.locator('#open-price-tags').click();
  ok(await page.locator('#price-view').isVisible()); ok(await page.locator('#editor-view').isHidden()); ok(await page.locator('#action-bar').isHidden());
  eq(await page.locator('#open-price-tags').getAttribute('aria-pressed'), 'true');
  eq(await page.locator('.header-nav [data-type][aria-pressed=true]').count(), 0);
  const row = i => page.locator('.pt-row').nth(i);
  await row(0).locator('[data-k=name]').fill('במבה אסם');
  await row(0).locator('[data-k=name]').press('Enter');
  await page.keyboard.type('4,5'); await page.keyboard.press('Enter');
  eq(await page.locator('.pt-row').count(), 2);
  await page.keyboard.type('גבינה צהובה');
  await row(1).locator('[data-k=price]').fill('54.90');
  await row(1).locator('[data-k=per]').selectOption('kg');
  await row(0).locator('[data-k=amount]').fill('80');
  await row(0).locator('[data-k=copies]').fill('3');
  await page.locator('[data-size="9"]').click();
  eq(await page.locator('#pt-count').textContent(), '4 שלטים · 1 דף');
  eq(await page.locator('#pt-pages canvas').evaluateAll(c => c.map(x => [x.width, x.height])), [[1860, 2631]]);
  await page.locator('#pt-add').click(); await row(2).locator('[data-k=name]').fill('בלי מחיר'); await page.locator('[data-size="9"]').click();
  eq(await row(2).locator('.pt-row-error').textContent(), 'חסר מחיר'); ok(await page.locator('#pt-error').isVisible());
  await row(2).locator('[data-k=print]').uncheck(); ok(await page.locator('#pt-error').isHidden());
  for (let i = 0; i < 25; i++) { await page.locator('#pt-add').click(); await row(3 + i).locator('[data-k=name]').fill(`מוצר ${i + 1}`); await row(3 + i).locator('[data-k=price]').fill(String(i + 1)); }
  await page.locator('[data-size="24"]').click();
  eq(await page.locator('#pt-pages canvas').count(), 2);
  const png = await page.evaluate(() => document.querySelector('#pt-pages canvas').toDataURL());
  fs.writeFileSync(path.join(out, `${name}-price-tags.png`), Buffer.from(png.split(',')[1], 'base64'));
  await load(); await page.locator('#open-price-tags').click();
  eq(await page.locator('.pt-row').count(), 28); eq(await page.locator('[data-size][aria-pressed=true]').textContent(), '24 בדף');
  eq(await row(1).locator('[data-k=per]').inputValue(), 'kg'); eq(await row(2).locator('[data-k=print]').isChecked(), false);
  await page.locator('#pt-print').click(); ok(await page.locator('#pt-print-dialog').isVisible());
  eq(await page.locator('#pt-print-pages .print-sheet').count(), 2); ok(await page.evaluate(() => document.documentElement.classList.contains('pt-printing')));
  // The dialog's close event is dispatched as a separate task.
  await page.locator('#pt-close-print').click(); await page.waitForFunction(() => !document.documentElement.classList.contains('pt-printing')); ok(await page.locator('#pt-print-dialog').isHidden());
  await page.locator('#open-library').click(); ok(await page.locator('#library-view').isVisible()); ok(await page.locator('#price-view').isHidden());
  await page.locator('#library-back').click();
  await page.locator('#open-price-tags').click(); await page.locator(`[data-type=${activeType}]`).click();
  ok(await page.locator('#editor-view').isVisible()); ok(await page.locator('#action-bar').isVisible()); eq(await page.locator(`[data-type=${activeType}]`).getAttribute('aria-pressed'), 'true');
  eq(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k !== 'signs-app:v1:price-tags').map(k => [k, localStorage.getItem(k)]))), before);
  eq(await page.evaluate(() => document.querySelector('#signPages canvas')?.toDataURL() || ''), editorPng);
  await page.evaluate(() => localStorage.removeItem('signs-app:v1:price-tags'));
}
