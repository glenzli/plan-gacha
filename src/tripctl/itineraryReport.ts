import { analyseItinerary } from './itinerary';
import type { Itinerary } from './itinerarySchema';
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const plain = (s: string) => escape(s.replace(/\r?\n/g, ' ')).replace(/\|/g, '\\|');
/** Read-only, self-contained output. No script, write control, remote resource or implicit clock. */
export function renderItineraryReport(i: Itinerary, input: unknown) {
  const report = analyseItinerary(i, input);
  const lines = ['# 行程预览', '', `时区：${i.timeZone} · 证据检查时间：${report.asOf}`, '', '**可行性尚未证实。以下安排、估计和实际报告分别展示；没有执行预约或退订。**', '', '## 需要核对', ''];
  for (const c of report.clockConstraints) lines.push(`- ${plain(c.text)}：${c.status}${c.clock ? `（${c.kind === 'end_before' ? '严格早于' : c.kind === 'start_at' ? '固定开始' : '不晚于'} ${c.clock}）` : ''}`);
  for (const r of report.requirements.filter((r) => !r.canUseForComparison || r.estimateFit === 'estimate_exceeds_slot' || ['adverse', 'blocked'].includes(r.risk || ''))) lines.push(`- ${r.dateId} ${r.activityId} / ${r.kind}：${r.status}；${r.reasonCodes.join(', ') || r.estimateFit}`);
  for (const d of i.current.filter((d) => !('dateId' in (input as object)) || (input as { dateId?: string }).dateId === undefined || d.dateId === (input as { dateId?: string }).dateId)) {
    lines.push('', `## ${d.dateId} · ${plain(d.title)}`, '', '| 原计划 | 当前安排 |', '| --- | --- |');
    const original = i.baseline.days.find((x) => x.dateId === d.dateId)?.activities || [];
    const describe = (a: typeof d.activities[number] | undefined) => a ? `${a.timing.start || '时间未知'}${a.timing.end ? `–${a.timing.end}${a.timing.endDayOffset ? '（次日）' : ''}` : ''} ${plain(a.title)}${a.route ? `（${plain(a.route.from.label)} → ${plain(a.route.to.label)}；${a.route.mode}）` : ''}` : '—';
    for (let index = 0; index < Math.max(original.length, d.activities.length); index++) lines.push(`| ${describe(original[index])} | ${describe(d.activities[index])} |`);
    const actual = report.actual.filter((a) => a.dateId === d.dateId);
    lines.push('', '实际报告：'); if (!actual.length) lines.push('- 尚无报告；不推断完成或入住。');
    for (const r of actual) lines.push(`- ${plain(r.text)}${r.at ? `（明确时间 ${r.at}）` : r.bounds ? `（${r.bounds.after ? `${r.bounds.after} 之后` : ''}${r.bounds.before ? ` ${r.bounds.before} 之前` : ''}；确切时间未知）` : '（时间未知）'}`);
  }
  lines.push('', '## 条件方案与待决事项', '');
  for (const o of report.options) lines.push(`- 条件：${plain(o.condition)}。方案：${plain(o.proposal)}。待核对：${o.uncertainties.map(plain).join('、') || '未提供'}。`);
  for (const d of report.decisions.filter((d) => d.status !== 'completed' && d.status !== 'withdrawn')) lines.push(`- ${plain(d.text)}：${d.deadline ? `截止 ${d.deadline}` : '截止时间未知'}；${d.status}。${d.choice ? `记录选择 ${d.choice.optionId}，尚未改排或退订。` : ''}`);
  const closed = report.decisions.filter((d) => d.status === 'completed' || d.status === 'withdrawn');
  if (closed.length) {
    lines.push('', '## 已完成或撤回的事项（不再提示）', '');
    for (const d of closed) lines.push(`- ${plain(d.text)}：${d.status}；${plain(d.lifecycle!.reason)}；来源 ${plain(d.lifecycle!.source.reference)}（${d.lifecycle!.source.observedAt}）。事项状态已记录，退款与订单结果未由工具核实。`);
  }
  lines.push('', '本报告只读。修改需先预览，再由原有保存流程确认；网页与此文件的数据传递仍需显式导出/导入。');
  const markdown = lines.join('\n');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>行程只读预览</title><style>body{margin:0;background:#f1f3ef;color:#243128;font:16px/1.65 system-ui,sans-serif}main{max-width:1080px;margin:28px auto;padding:32px;background:white;border-radius:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}header{color:#286347;border-bottom:1px solid #dde5dc;font-size:26px;font-weight:650;padding-bottom:18px}</style><main><header>行程只读预览 · 尚待证实</header><pre>${escape(markdown)}</pre></main></html>`;
  return { schemaVersion: 1, readOnly: true, saved: false, markdown, html, analysis: report };
}
