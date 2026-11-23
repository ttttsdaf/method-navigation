// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 ttttsdaf and contributors. See LICENSE and NOTICE.md.
const STORAGE_KEY = 'method-navigation.records.v1';
const CONTENT_CREDIT = '预设场景与行动卡：© 2026 ttttsdaf 与贡献者，下一步 / Method Navigation，CC BY-SA 4.0（https://creativecommons.org/licenses/by-sa/4.0/）。用户自行填写的内容不自动适用此许可；外部资料保留原权利。';
const FEEDBACK = { helpful: '有帮助', ineffective: '试了没解决', blocked: '缺少条件', not_started: '还没做', changed_goal: '目标变了' };
const $ = id => document.getElementById(id);
const app = { methods: [], scenarios: [], records: [], drafts: new Map(), current: null, feedback: null, storageBlocked: false, ready: false };

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, onClick, className = 'button secondary') {
  const node = el('button', text, className);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function paragraph(parent, label, text) {
  const p = el('p');
  p.append(el('strong', `${label} `), document.createTextNode(text || '暂未填写'));
  parent.append(p);
}
function scenario() { return app.scenarios.find(item => item.id === app.current?.scenario_id); }
function route() { return scenario()?.routes.find(item => item.id === app.current.selected_route_id); }
function methodName(id) { return app.methods.find(item => item.id === id)?.title || id; }
function now() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fresh(s) {
  const selected = s.routes.find(r => r.id === s.default_route_id);
  return { schema_version: 1, id: crypto.randomUUID(), mode: 'demo', record_kind: 'demo_session',
    data_notice: '建议为预设场景内容；用户填写的尝试与反馈未经核实，不作为已验证案例。',
    scenario_id: s.id, title: s.title, problem: s.input, selected_route_id: selected.id,
    current_action: clone(selected), feedback_history: [], created_at: now(), updated_at: now(), dirty: false };
}
function captureInput() {
  if (!app.current) return;
  const problem = $('problem-input').value;
  if (problem !== app.current.problem) { app.current.problem = problem; app.current.dirty = true; }
  const note = $('feedback-note').value;
  if (note !== (app.current.pending_note || '')) app.current.dirty = true;
  app.current.pending_note = note;
}
function showView(view) {
  if (!['workspace', 'library', 'records'].includes(view)) return;
  captureInput();
  for (const name of ['workspace', 'library', 'records']) $('view-' + name).hidden = name !== view;
  document.querySelectorAll('[data-view]').forEach(node => {
    node.classList.toggle('active', node.dataset.view === view);
    node.setAttribute('aria-current', node.dataset.view === view ? 'page' : 'false');
  });
  if (view === 'records') renderRecords();
}
function selectScenario(id) {
  captureInput();
  const s = app.scenarios.find(item => item.id === id);
  if (!s) return;
  if (app.current) app.drafts.set(app.current.scenario_id, app.current);
  app.current = app.drafts.get(id) || fresh(s);
  app.feedback = null;
  renderWorkspace();
  status('已打开场景演示。建议是预设内容；你的描述与反馈可单独保存。');
}
function renderTabs() {
  const nodes = app.scenarios.map(s => {
    const node = button(s.title, () => selectScenario(s.id), 'scenario-tab');
    node.classList.toggle('active', s.id === app.current.scenario_id);
    node.setAttribute('aria-pressed', String(s.id === app.current.scenario_id));
    return node;
  });
  $('scenario-tabs').replaceChildren(...nodes);
}
function methodDetails(ids) {
  const wrapper = el('div');
  for (const id of [...new Set(ids || [])]) {
    const method = app.methods.find(m => m.id === id);
    if (!method) continue;
    const detail = el('details');
    detail.append(el('summary', method.title), el('p', method.summary));
    paragraph(detail, '适合', method.when_to_use.join('；'));
    paragraph(detail, '限制', method.not_for.join('；'));
    const list = el('ol');
    method.steps.forEach(step => list.append(el('li', step)));
    detail.append(list);
    paragraph(detail, '带走什么', method.output);
    const sources = el('p', '研究来源与延伸阅读（外部原文）：', 'muted');
    method.source_refs.forEach((source, index) => {
      if (index) sources.append(document.createTextNode(' · '));
      const link = el('a', source.title);
      if (/^https:\/\//.test(source.url)) link.href = source.url;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      sources.append(link);
    });
    detail.append(sources, el('p', '项目新编写的场景行动卡 · CC BY-SA 4.0。外部链接保留前期研究来源，当前文字不是原方法翻译；尚无本项目用户实践验证。', 'muted'));
    wrapper.append(detail);
  }
  return wrapper;
}
function renderAction() {
  const current = app.current.current_action;
  const box = el('article', null, 'action-card');
  box.append(el('span', '现在可以试试', 'eyebrow'), el('h2', current.title), el('p', current.action, 'action-text'));
  paragraph(box, '本次带走', current.output);
  if (current.review_prompt) paragraph(box, '回来看看', current.review_prompt);
  const explanation = el('details');
  explanation.append(el('summary', '为什么选这个方法'), el('p', current.reason));
  if (current.person) paragraph(explanation, '可以找谁', current.person);
  explanation.append(methodDetails(current.method_ids));
  box.append(explanation);
  $('current-action').replaceChildren(box);
}
function chooseRoute(id) {
  captureInput();
  const selected = scenario().routes.find(r => r.id === id);
  if (!selected) return;
  app.current.selected_route_id = id;
  app.current.current_action = clone(selected);
  app.current.feedback_history.push({ kind: 'route', label: '换路线', title: selected.title, method_ids: [...selected.method_ids], note: '', at: now() });
  app.current.dirty = true; app.feedback = null;
  renderWorkspace();
  status('已切换路线，之前的选择和反馈保留在本次记录中。');
}
function renderRoutes() {
  const nodes = scenario().routes.map(r => {
    const node = button('', () => chooseRoute(r.id), 'route-option');
    node.append(el('strong', r.title), el('span', r.reason, 'muted'));
    node.classList.toggle('active', r.id === app.current.selected_route_id);
    node.setAttribute('aria-pressed', String(r.id === app.current.selected_route_id));
    return node;
  });
  $('route-options').replaceChildren(...nodes);
}
function renderFeedbackButtons() {
  $('feedback-buttons').replaceChildren(...Object.entries(FEEDBACK).map(([key, label]) => {
    const node = button(label, () => { app.feedback = key; renderFeedbackButtons(); }, 'feedback-choice');
    node.classList.toggle('active', app.feedback === key);
    node.setAttribute('aria-pressed', String(app.feedback === key));
    return node;
  }));
}
function applyFeedback() {
  if (!app.feedback) return status('先选择一种情况，再记录发生了什么。');
  captureInput();
  const outcome = (route().feedback || scenario().feedback)[app.feedback];
  if (!outcome) return status('此路线没有对应的预设分支，请换一个场景或查看方法。', true);
  app.current.feedback_history.push({ kind: 'feedback', type: app.feedback, label: FEEDBACK[app.feedback],
    note: $('feedback-note').value.trim(), title: outcome.title, action: outcome.action, method_ids: [...outcome.method_ids], at: now() });
  app.current.current_action = clone(outcome);
  app.current.updated_at = now(); app.current.dirty = true; app.current.pending_note = '';
  app.feedback = null;
  renderWorkspace();
  status('已展示这条路线对应的预设后续。你的补充已记录，未由 AI 分析。');
}
function renderHistory() {
  const history = app.current.feedback_history;
  $('history-list').replaceChildren(...(history.length ? history.map(item => {
    const row = el('li');
    row.append(el('strong', `${item.label} · ${item.title}`));
    if (item.note) row.append(el('p', item.note));
    if (item.action) row.append(el('p', item.action, 'muted'));
    return row;
  }) : [el('li', '还没有尝试或反馈记录。准备做的事不会自动记作已经完成。', 'muted')]));
  const last = [...history].reverse().find(item => item.kind === 'feedback');
  $('feedback-result').textContent = last ? `上一次记录的反馈是“${last.label}”，当时展示的预设后续为“${last.title}”。当前选择见上方行动卡。` : '';
}
function renderWorkspace() {
  const s = scenario();
  if (!s) return;
  renderTabs();
  $('problem-input').value = app.current.problem;
  $('feedback-note').value = app.current.pending_note || '';
  $('understanding').textContent = s.understanding;
  $('context-note').textContent = '以下理解对应预设场景。修改文字可留下你的处境；当前演示不会据此自动生成新建议。';
  renderAction(); renderRoutes(); renderFeedbackButtons(); renderHistory();
}
function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.schema_version !== 1 || !Array.isArray(data.records)) throw new Error('schema');
    for (const record of data.records) {
      const s = app.scenarios.find(item => item.id === record.scenario_id);
      if (!record.id || !s || !s.routes.some(r => r.id === record.selected_route_id) || !Array.isArray(record.feedback_history) || !record.current_action) throw new Error('record');
    }
    app.records = data.records;
  } catch {
    app.storageBlocked = true;
    status('无法读取原有记录，已保留原存储。当前草稿仍可编辑和导出；本次不会覆盖原数据。', true);
  }
}
function persist(nextRecords) {
  if (app.storageBlocked) { status('当前存储不可用或原数据需要恢复，请先导出草稿。没有覆盖原数据。', true); return false; }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema_version: 1, records: nextRecords }));
    app.records = nextRecords;
    return true;
  } catch {
    status('保存没有成功，草稿仍在当前页面。请先导出，避免关闭后丢失。', true);
    return false;
  }
}
function snapshot() {
  captureInput();
  const result = clone(app.current);
  delete result.dirty;
  result.updated_at = now();
  return result;
}
function saveRecord() {
  const record = snapshot();
  const next = app.records.filter(item => item.id !== record.id).concat(record);
  if (persist(next)) {
    app.current.dirty = false;
    status('已保存到当前浏览器的本地记录。可在“我的记录”恢复、导出或删除。');
    renderRecords();
  }
}
function restoreRecord(id) {
  const record = app.records.find(item => item.id === id);
  if (!record) return;
  captureInput();
  if (app.current) app.drafts.set(app.current.scenario_id, app.current);
  app.current = clone(record); app.current.dirty = false;
  app.drafts.set(app.current.scenario_id, app.current); app.feedback = null;
  renderWorkspace(); showView('workspace');
  status('已恢复这条本地记录。继续修改后可再次保存。');
}
function deleteRecord(id) {
  const next = app.records.filter(item => item.id !== id);
  if (!persist(next)) return;
  if (app.current?.id === id) {
    app.drafts.delete(app.current.scenario_id);
    app.current = fresh(scenario());
    renderWorkspace();
  }
  for (const [key, draft] of app.drafts.entries()) if (draft.id === id) app.drafts.delete(key);
  renderRecords(); status('这条记录已从当前浏览器的保存数据中删除。之前导出的文件不受影响。');
}
function renderRecords() {
  const list = $('records-list');
  list.replaceChildren();
  if (app.storageBlocked) list.append(el('p', '原有存储无法读取，未展示或覆盖它。当前草稿仍可导出。', 'notice'));
  if (!app.records.length) list.append(el('p', '还没有已保存的记录。先走一遍场景，写下自己的反馈，再保存。', 'empty-state'));
  for (const record of [...app.records].reverse()) {
    const card = el('article', null, 'record-card');
    card.append(el('span', '场景演示记录', 'badge'), el('h3', record.title), el('p', record.problem));
    paragraph(card, '当前行动', record.current_action.title);
    card.append(el('p', `${record.feedback_history.filter(h => h.kind === 'feedback').length} 条反馈 · ${new Date(record.updated_at).toLocaleString('zh-CN')}`, 'muted'));
    const actions = el('div', null, 'button-row');
    actions.append(button('继续这条记录', () => restoreRecord(record.id)), button('预览分享草稿', () => previewShare(record)), button('删除记录', () => deleteRecord(record.id), 'button danger'));
    card.append(actions); list.append(card);
  }
}
function renderLibrary() {
  const search = $('method-search').value.trim().toLocaleLowerCase();
  const matches = app.methods.filter(m => [m.title, m.summary, ...m.when_to_use].join(' ').toLocaleLowerCase().includes(search));
  $('method-list').replaceChildren(...matches.map(m => {
    const card = el('article', null, 'method-card');
    card.append(el('span', m.id, 'badge'), el('h3', m.title), el('p', m.summary));
    paragraph(card, '什么时候用', m.when_to_use.join('；'));
    paragraph(card, '能带走什么', m.output);
    card.append(methodDetails([m.id]));
    return card;
  }));
  if (!matches.length) $('method-list').append(el('p', '没有对应条目。试试更短的词，或清空搜索查看六条方法。', 'empty-state'));
}
function asMarkdown(record, forShare = false) {
  const lines = [`# ${record.title}`, '', '> 场景演示记录：建议为预设内容。用户反馈未经独立核实，不代表方法效果已验证。', '',
    '## 我的处境', record.problem || '未填写', '', '## 当前行动', record.current_action.title,
    record.current_action.action, '', '带走什么：' + record.current_action.output, '',
    '关联方法：' + (record.current_action.method_ids || []).map(methodName).join('、'), '', '## 已记录的反馈'];
  const feedback = record.feedback_history.filter(item => item.kind === 'feedback');
  if (!feedback.length) lines.push('尚未记录实际尝试或反馈。');
  for (const item of feedback) lines.push(`- ${item.label}：${item.note || '未补充具体观察。'}`, `  演示建议：${item.action}`);
  if (record.pending_note) lines.push('', '## 尚未提交的补充', record.pending_note);
  lines.push('', '## 来源与限制');
  const usedIds = new Set([...(record.current_action.method_ids || []),
    ...(scenarioForRecord(record)?.routes.find(r => r.id === record.selected_route_id)?.method_ids || []),
    ...record.feedback_history.flatMap(item => item.method_ids || [])]);
  for (const id of usedIds) {
    const m = app.methods.find(item => item.id === id);
    if (m) for (const source of m.source_refs) lines.push(`- ${m.title} 的研究来源与延伸阅读：${source.url}`);
  }
  lines.push('', CONTENT_CREDIT, '', forShare ? '分享草稿尚未发布。请在导出前删除不希望公开的姓名、联系方式和私人内容。' : '记录保存在当前浏览器；导出文件由你保管。');
  return lines.join('\n');
}
function scenarioForRecord(record) { return app.scenarios.find(s => s.id === record.scenario_id); }
function previewShare(record) {
  $('share-text').value = asMarkdown(record, true);
  $('share-dialog').showModal();
  status('已生成可编辑的分享预览，未自动脱敏，也未上传或公开。');
}
function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = el('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportRecords(format) {
  if (!app.current) return;
  const draft = snapshot();
  const rows = app.current.dirty || !app.records.length || app.records.some(r => r.id === draft.id)
    ? app.records.filter(r => r.id !== draft.id).concat(draft) : [...app.records];
  if (format === 'json') download(JSON.stringify({ schema_version: 1, mode: 'demo', preset_content_credit: CONTENT_CREDIT, records: rows.map(row => ({ ...row, feedback_history: [] })) }, null, 2), '下一步-我的记录.json', 'application/json;charset=utf-8');
  else download(rows.map(row => asMarkdown(row)).join('\n\n---\n\n'), '下一步-我的记录.md', 'text/markdown;charset=utf-8');
  status('已发起下载，包含已保存记录及当前草稿。导出没有上传或公开任何内容。');
}
async function getData(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}
function validate(methods, scenarios) {
  if (methods.schema_version !== 1 || scenarios.schema_version !== 1 || !Array.isArray(methods.methods) || !Array.isArray(scenarios.scenarios)) throw new Error('数据格式不匹配');
  const ids = new Set(methods.methods.map(m => m.id));
  if (ids.size !== methods.methods.length || !ids.size) throw new Error('方法编号无效');
  for (const m of methods.methods) {
    if (!m.title || !m.summary || !m.output) throw new Error('方法内容缺失');
    for (const key of ['when_to_use', 'not_for', 'steps', 'source_refs']) if (!Array.isArray(m[key])) throw new Error('方法字段无效');
  }
  if (!scenarios.scenarios.length || new Set(scenarios.scenarios.map(s => s.id)).size !== scenarios.scenarios.length) throw new Error('场景编号无效');
  for (const s of scenarios.scenarios) {
    if (!Array.isArray(s.routes) || !s.routes.some(r => r.id === s.default_route_id)) throw new Error('场景路线无效');
    for (const r of s.routes) {
      if (!Array.isArray(r.method_ids) || r.method_ids.some(id => !ids.has(id))) throw new Error('路线方法引用无效');
      const feedback = r.feedback || s.feedback;
      for (const key of Object.keys(FEEDBACK)) {
        const f = feedback?.[key];
        if (!f?.title || !f.action || !f.output || !f.reason || !Array.isArray(f.method_ids) || f.method_ids.some(id => !ids.has(id))) throw new Error('反馈分支无效');
      }
    }
  }
}
document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click', () => showView(node.dataset.view)));
$('method-search').addEventListener('input', renderLibrary);
$('save-context').addEventListener('click', () => { if (app.ready) { captureInput(); status('描述已更新到当前草稿。预设建议没有因新文字自动改变，持久保存请点“保存草稿”。'); } });
$('apply-feedback').addEventListener('click', () => app.ready && applyFeedback());
$('save-record').addEventListener('click', () => app.ready && saveRecord());
$('export-json').addEventListener('click', () => exportRecords('json'));
$('export-markdown').addEventListener('click', () => exportRecords('markdown'));
$('close-share').addEventListener('click', () => $('share-dialog').close());
$('download-share').addEventListener('click', () => {
  download($('share-text').value, '下一步-分享草稿.md', 'text/markdown;charset=utf-8');
  status('已发起分享草稿下载，未发布到任何平台。');
});
$('clear-draft')?.addEventListener('click', () => {
  if (!app.current) return;
  app.current = fresh(scenario()); app.drafts.set(app.current.scenario_id, app.current); app.feedback = null;
  renderWorkspace(); status('已重开这个示例。已保存的记录仍保留在“我的记录”。');
});
window.addEventListener('beforeunload', event => {
  captureInput();
  if (app.current?.dirty || [...app.drafts.values()].some(draft => draft.dirty)) {
    event.preventDefault(); event.returnValue = '';
  }
});

try {
  const [methods, scenarios] = await Promise.all([getData('/data/methods.json'), getData('/data/scenarios.json')]);
  validate(methods, scenarios);
  app.methods = methods.methods; app.scenarios = scenarios.scenarios;
  loadRecords(); app.ready = true;
  selectScenario(app.scenarios[0].id); renderLibrary(); renderRecords();
  if (app.storageBlocked) status('本地存储未能读取，原数据未覆盖。当前场景可体验，草稿可导出。', true);
} catch (error) {
  $('current-action').replaceChildren(el('p', '方法或场景内容未加载。请保留输入，检查本地服务后再刷新；当前没有生成建议。', 'notice'));
  status('加载失败：' + error.message, true);
  ['save-record', 'apply-feedback', 'save-context'].forEach(id => { $(id).disabled = true; });
}
