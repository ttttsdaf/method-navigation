import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const recordFiles = new Set([
  'app/app.js',
  'app/consultation.js',
  'app/scenarios.json',
  'content/example-record.json',
  'content/methods.json',
]);

const exportFiles = new Set(['app/app.js', 'app/consultation.js', 'content/example-record.json']);

const acceptanceFiles = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.prettierignore',
  'CODEOWNERS',
  'eslint-suppressions.json',
  'package-lock.json',
  'package.json',
  'npm-shrinkwrap.json',
  'quality-diff.mjs',
  'verify_baseline.py',
]);

function isAcceptance(path) {
  return (
    acceptanceFiles.has(path) ||
    path.startsWith('tests/') ||
    path.startsWith('.github/') ||
    /(^|\/)(?:AGENTS|CONTRIBUTING|REVIEW)\.md$/.test(path) ||
    /(^|\/)(?:\.editorconfig|\.gitattributes|\.npmrc|\.prettierignore|\.prettierrc.*|(?:eslint|playwright|prettier)\.config\.[^/]+)$/.test(
      path,
    )
  );
}

const rules = [
  {
    id: 'storage',
    reason: '记录字段、场景引用或恢复逻辑可能影响已保存的数据',
    match: path => recordFiles.has(path),
    checks: ['test:browser'],
    manual: '涉及字段、场景 ID 或保存格式时，用旧记录核对恢复。',
  },
  {
    id: 'export',
    reason: '导出序列化可能丢失记录的字段与上下文',
    match: path => exportFiles.has(path),
    checks: ['test:browser'],
    manual: '涉及格式契约时，检查实际下载文件及已批准的行为变化。',
  },
  {
    id: 'ui',
    reason: '页面状态和交互需要在两个视口走真实流程',
    match: path => recordFiles.has(path) || (path.startsWith('app/') && /\.(css|html)$/.test(path)),
    checks: ['test:browser'],
  },
  {
    id: 'preview',
    reason: '预览或发布源包可能改变 HTTP 契约与可访问文件范围',
    match: path =>
      ['serve.py', 'start-preview.cmd', 'build_static.py', 'LICENSE', 'NOTICE.md'].includes(path) ||
      path.startsWith('LICENSES/'),
    checks: ['test:python'],
    manual: '涉及启动脚本、绑定地址或路径白名单时，在目标平台另核对。',
  },
  {
    id: 'consultation',
    reason: '咨询候选的请求契约、并发额度或重试行为可能变化',
    match: (path, hasConsultation) =>
      path === 'consult_api.py' || (hasConsultation && path === 'serve.py'),
    checks: ['test:python'],
    manual: '使用模拟上游核对错误、并发和重启后的额度。真实线上入口需另验。',
  },
  {
    id: 'consultation-ui',
    reason: '咨询候选前端可能改变请求或响应处理与 Markdown 输出',
    match: path => path === 'app/consultation.js',
    checks: ['test:unit'],
    manual: '对照服务端字段契约检查请求、失败提示与导出的变化。',
  },
  {
    id: 'acceptance',
    reason: '测试、执行入口或验收规则发生变动',
    match: isAcceptance,
    checks: [],
    manual: '用可信基线核对删除、跳过、断言、阈值和 CI 范围。合理的标准变更需说明依据。',
  },
  {
    id: 'documentation',
    reason: '文档变化需要核对内容和引用',
    match: path =>
      ['README.md', 'ROADMAP.md', 'VISION.md', 'content/README.md'].includes(path) ||
      (path.startsWith('docs/') && path.endsWith('.md') && !isAcceptance(path)),
    checks: [],
  },
];

const isRootMjs = path => !path.includes('/') && path.endsWith('.mjs');
const isTestMjs = path => path.startsWith('tests/') && path.endsWith('.mjs');

const checkMatchers = [
  ['format:check', path => path === 'package.json' || isRootMjs(path) || isTestMjs(path)],
  [
    'lint',
    path => isRootMjs(path) || (/^(app|tests)\//.test(path) && /\.(js|mjs|cjs)$/.test(path)),
  ],
  ['test:python', path => path.startsWith('tests/') && path.endsWith('.py')],
  ['test:unit', path => path.startsWith('tests/') && path.endsWith('.test.mjs')],
  [
    'test:browser',
    path =>
      (path.startsWith('tests/') && path.endsWith('.spec.mjs')) || path === 'playwright.config.mjs',
  ],
];

export function planDiff(paths, { hasConsultation = false } = {}) {
  const matches = [];
  const recognized = new Set();
  const selected = new Set();

  for (const { id, reason, match, checks, manual } of rules) {
    const files = paths.filter(path => match(path, hasConsultation));
    if (!files.length) continue;
    matches.push({ id, reason, files, manual });
    for (const file of files) recognized.add(file);
    for (const check of checks) selected.add(check);
  }

  const unknown = paths.filter(path => !recognized.has(path));
  if (unknown.length) {
    matches.push({
      id: 'unclassified',
      reason: '现有路径规则未识别这些文件',
      files: unknown,
      manual: '人工核对新增入口、调用方和数据边界后补选检查。',
    });
  }

  const checks = checkMatchers.flatMap(([check, match]) =>
    selected.has(check) || [...recognized].some(match) ? [check] : [],
  );
  return { matches, checks };
}

function git(...args) {
  return execFileSync('git', ['--no-optional-locks', '--no-replace-objects', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commit(ref) {
  return git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
}

function changesBetween(base, head) {
  const fields = git(
    'diff',
    '--no-renames',
    '--no-ext-diff',
    '--name-status',
    '-z',
    base,
    head,
    '--',
  ).split('\0');
  fields.pop();
  const changes = new Map();
  for (let i = 0; i < fields.length; i += 2) changes.set(fields[i + 1], fields[i]);
  return changes;
}

function hasFile(sha, path) {
  return Boolean(git('ls-tree', '-z', sha, '--', path));
}

const usage = '用法 node quality-diff.mjs <base> [head=HEAD] [--run]';

function runChecks(checks, head) {
  if (commit('HEAD') !== head || git('status', '--porcelain=v1', '-z')) {
    throw new Error('--run 需要当前 checkout 正好在候选提交且工作树干净。');
  }
  let exit = 0;
  for (const script of checks) {
    console.log(`\n执行 npm run ${script}`);
    const result =
      process.platform === 'win32'
        ? spawnSync('cmd.exe', ['/d', '/c', 'npm.cmd', 'run', script], { stdio: 'inherit' })
        : spawnSync('npm', ['run', script], { stdio: 'inherit' });
    if (result.error) console.error(result.error.message);
    console.log(`npm run ${script} 退出 ${result.status ?? result.signal ?? '启动失败'}`);
    exit ||= result.status ?? 1;
  }
  return exit;
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return 0;
  }
  const run = args.at(-1) === '--run';
  const refs = run ? args.slice(0, -1) : args;
  if (refs.length < 1 || refs.length > 2 || refs.some(ref => !ref || ref.startsWith('-'))) {
    throw new Error(usage);
  }

  const base = commit(refs[0]);
  const head = commit(refs[1] ?? 'HEAD');
  const changes = changesBetween(base, head);
  const hasConsultation = hasFile(base, 'consult_api.py') || hasFile(head, 'consult_api.py');
  const { matches, checks } = planDiff([...changes.keys()], {
    hasConsultation,
  });

  console.log(`差异基线 ${base}\n候选提交 ${head}`);
  if (hasConsultation) {
    console.log('历史咨询候选的风险单独提示。命令选择采用当前公开试点的覆盖范围。');
  }
  for (const { id, reason, files, manual } of matches) {
    console.log(`\n[${id}] ${reason}`);
    for (const path of files) console.log(`  ${changes.get(path)} ${JSON.stringify(path)}`);
    if (manual) console.log(`  ${manual}`);
  }
  if (matches.some(match => match.id === 'acceptance')) {
    if (hasFile(base, 'verify_baseline.py')) {
      console.log(`\n从可信基线 ${base} 提取核验器再执行以下命令`);
      console.log(
        `python <可信副本>/verify_baseline.py --base ${base} --head ${head} --mode changed`,
      );
    } else {
      console.log('\n该基线尚无核验器。从已审查的标准版本取 verify_baseline.py，再按其基准复验。');
    }
  }
  console.log(`\n已选择的候选检查 ${checks.map(check => `npm run ${check}`).join('，') || '无'}`);
  if (!run) {
    console.log('观察模式仅记录选择，未执行检查。');
    return 0;
  }
  if (!checks.length) return 0;
  return runChecks(checks, head);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.stderr?.trim() || error.message);
    process.exitCode = 1;
  }
}
