import { readFile } from 'node:fs/promises';
import { expect, test as base } from '@playwright/test';

const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    const origin = new URL(baseURL).origin;
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:\/\//, route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.origin === origin) {
        return route.continue();
      }
      errors.push(`Unexpected offline request: ${request.method()} ${url.pathname}`);
      return route.abort();
    });
    await use(page);
    expect(errors).toEqual([]);
  },
});

async function downloadText(page, buttonName, extension) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(extension);
  return readFile(await download.path(), 'utf8');
}

async function expectLayoutToFit(page) {
  const width = await page.locator('html').evaluate(root => root.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize().width);
}

test('示例选择路线与反馈后，可恢复记录并导出完整内容', async ({ page }) => {
  const note = '当前只能用现成工具整理 <示例> 资料';
  const routeTitle = '让现成工具做同一个找回任务';
  const outcome = '记录候选的进入条件';
  await page.goto('/');
  await page.getByRole('button', { name: '先弄清资料工具要补哪一步' }).click();
  await expect(page.getByRole('heading', { name: '先做十条资料的小索引' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(routeTitle) }).click();
  await expect(page.getByRole('heading', { name: routeTitle })).toBeVisible();
  await page.getByRole('button', { name: '缺少条件' }).click();
  await page.getByLabel('补充发生的事').fill(note);
  await page.getByRole('button', { name: '看看下一步怎么调' }).click();
  await expect(page.getByRole('heading', { name: outcome })).toBeVisible();
  await page.getByRole('button', { name: '保存为我的记录' }).click();

  await page.reload();
  const records = page.getByRole('button', { name: '我的记录', exact: true });
  await records.click();
  await page.getByRole('button', { name: '继续这条记录' }).click();
  await expect(page.getByRole('heading', { name: outcome })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expectLayoutToFit(page);
  await records.click();
  const json = JSON.parse(await downloadText(page, '导出完整记录 · JSON', /\.json$/));
  expect(json.records).toHaveLength(1);
  expect(json.records[0]).toMatchObject({
    scenario_id: 'S03',
    selected_route_id: 'S03-R2',
    current_action: { title: outcome },
  });
  const markdown = await downloadText(page, '导出阅读版 · Markdown', /\.md$/);
  expect(markdown).toContain(outcome);
  expect(markdown).toContain(note);
});
