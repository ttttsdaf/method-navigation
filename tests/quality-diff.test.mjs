import assert from 'node:assert/strict';
import test from 'node:test';
import { planDiff } from '../quality-diff.mjs';

function ruleIds(plan) {
  return plan.matches.map(match => match.id);
}

test('普通文档变更只选内容核对', () => {
  const plan = planDiff(['README.md', 'docs/SOURCES.md']);
  assert.deepEqual(ruleIds(plan), ['documentation']);
  assert.deepEqual(plan.checks, []);
});

test('保存、导出和窄屏样式变更共享一次浏览器检查', () => {
  const plan = planDiff(['app/app.js', 'app/style.css']);
  assert.deepEqual(ruleIds(plan), ['storage', 'export', 'ui']);
  assert.deepEqual(plan.checks, ['lint', 'test:browser']);
});

test('单改公开版 CSS 只选浏览器检查', () => {
  const plan = planDiff(['app/style.css']);
  assert.deepEqual(ruleIds(plan), ['ui']);
  assert.deepEqual(plan.checks, ['test:browser']);
});

test('单改公开版应用脚本选 lint 和浏览器检查', () => {
  assert.deepEqual(planDiff(['app/app.js']).checks, ['lint', 'test:browser']);
});

test('场景与方法数据不在公开版 Prettier 检查范围', () => {
  assert.deepEqual(planDiff(['app/scenarios.json', 'content/methods.json']).checks, [
    'test:browser',
  ]);
});

test('公开版预览变动选择 HTTP 权限边界而非咨询额度', () => {
  const plan = planDiff(['serve.py', 'start-preview.cmd']);
  assert.deepEqual(ruleIds(plan), ['preview']);
  assert.deepEqual(plan.checks, ['test:python']);
  assert.match(plan.matches[0].manual, /启动/);
});

test('咨询版本的服务变动提示额度和接口契约', () => {
  const plan = planDiff(['serve.py'], { hasConsultation: true });
  assert.deepEqual(ruleIds(plan), ['preview', 'consultation']);
  assert.deepEqual(plan.checks, ['test:python']);
  assert.match(plan.matches[1].reason, /额度/);
});

test('测试和工作流改动触发可信基线复核', () => {
  const plan = planDiff(['tests/browser.spec.mjs', '.github/workflows/quality.yml']);
  assert.deepEqual(ruleIds(plan), ['acceptance']);
  assert.deepEqual(plan.checks, ['format:check', 'lint', 'test:browser']);
  assert.deepEqual(plan.matches[0].files, [
    'tests/browser.spec.mjs',
    '.github/workflows/quality.yml',
  ]);
  assert.match(plan.matches[0].manual, /可信基线/);
});

test('未知新入口与文档并改时仍需人工判断', () => {
  const plan = planDiff(['README.md', 'app/new-entry.mjs']);
  assert.deepEqual(ruleIds(plan), ['documentation', 'unclassified']);
  assert.deepEqual(plan.checks, []);
  assert.deepEqual(plan.matches[1].files, ['app/new-entry.mjs']);
  assert.match(plan.matches[1].manual, /人工/);
});

test('相同提交没有待跑检查', () => {
  assert.deepEqual(planDiff([]), { matches: [], checks: [] });
});

test('能够识别会改变测试工具行为的替代配置', () => {
  const paths = [
    '.editorconfig',
    'npm-shrinkwrap.json',
    'app/.prettierrc.yaml',
    'playwright.config.ts',
  ];
  const plan = planDiff(paths);
  assert.deepEqual(ruleIds(plan), ['acceptance']);
  assert.deepEqual(plan.matches[0].files, paths);
});
