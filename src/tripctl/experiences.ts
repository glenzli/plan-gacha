import { parseState, hash } from './engine';
import { TripError, type TripState } from './schema';
import { experienceSearchSchema, guideDraftSchema } from './experienceSchema';
const timeSensitive = new Set(['weather', 'crowds', 'booking', 'opening', 'transport', 'prices']);
const parseQuery = (input: unknown) => { const p = experienceSearchSchema.safeParse(input); if (!p.success) throw new TripError('invalid_experience_query', 'Experience search requires explicit asOf and valid filters'); return p.data; };
function rows(state: TripState, asOf: string) {
  const stateHash = hash(state); const history = new Map(state.history.map((h) => [h.id, h]));
  const originalPlans = new Map<string, TripState['content']['snapshot']['trip']['plans'][number]>();
  for (const event of state.history) for (const plan of event.before.snapshot.trip.plans) if (!originalPlans.has(plan.id)) originalPlans.set(plan.id, plan);
  const superseded = new Set(state.content.memory.facts.flatMap((f) => f.experience?.supersedesFactId ? [f.experience.supersedesFactId] : []));
  return state.content.memory.facts.flatMap((fact) => {
    const e = fact.experience; if (!e) return [];
    const baseline = state.content.itinerary?.baseline.days.find((d) => d.planId === e.planId);
    const current = state.content.itinerary?.current.find((d) => d.planId === e.planId);
    const oldPlan = e.planId ? originalPlans.get(e.planId) : undefined;
    const currentPlan = state.content.snapshot.trip.plans.find((p) => p.id === e.planId);
    const review = [...new Set([...e.reviewBeforeReuse, ...e.topics.filter((t) => timeSensitive.has(t))])];
    const future = Date.parse(fact.source.observedAt) > Date.parse(asOf);
    return [{ journeyId: state.content.snapshot.trip.id, revision: state.revision, stateHash, factId: fact.id, superseded: superseded.has(fact.id), source: fact.source, certainty: fact.certainty,
      ...e, reuseStatus: future ? 'future_observation' : review.length ? 'recheck_required' : 'conditions_required', reviewBeforeReuse: review, personalPreferenceEstablished: false,
      recap: { originalPlan: baseline ? { title: baseline.title, activities: baseline.activities.map((a) => ({ id: a.id, title: a.title, timing: a.timing })) } : oldPlan ? { title: oldPlan.name, activities: null } : null,
        observation: fact.text, changes: e.changeCommitIds.map((id) => { const h = history.get(id)!; return { commitId: id, at: h.at, reason: h.reason, operationType: h.operation.type }; }),
        currentPlan: current ? { title: current.title, activities: current.activities.map((a) => ({ id: a.id, title: a.title, timing: a.timing })) } : currentPlan ? { title: currentPlan.name, activities: null } : null,
        outcome: e.outcome || null, userEvaluation: e.userEvaluation || null, actualReports: state.content.itinerary?.actual.filter((a) => e.activityId ? a.activityId === e.activityId : e.planId ? [...(baseline?.activities || []), ...(current?.activities || [])].some((x) => x.id === a.activityId) : false) || [] },
    }];
  });
}
/** Reads only explicitly supplied snapshots; no index, provider calls or persistent preference learning. */
export function searchExperiences(stateInputs: unknown[], input: unknown) {
  if (!Array.isArray(stateInputs) || !stateInputs.length || stateInputs.length > 10) throw new TripError('invalid_experience_query', 'Supply 1..10 explicit journey states');
  const query = parseQuery(input); const states = stateInputs.map(parseState);
  if (new Set(states.map((s) => s.content.snapshot.trip.id)).size !== states.length) throw new TripError('duplicate_journey', 'Supply one current version per journey ID');
  const terms = (query.query || '').normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const candidates = states.flatMap((state) => rows(state, query.asOf)).filter((r) => (query.includeSuperseded || !r.superseded) && (!query.kind || r.kind === query.kind) && (!query.topics?.length || query.topics.some((t) => r.topics.includes(t)))).map((r) => {
    const searchable = JSON.stringify([r.recap.observation, r.draftLesson, r.conditions, r.unknowns, r.topics, r.recap.originalPlan?.title, r.recap.currentPlan?.title]).normalize('NFKC').toLowerCase();
    return { ...r, matchedTerms: terms.filter((term) => searchable.includes(term)) };
  }).filter((r) => !terms.length || r.matchedTerms.length).sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || Date.parse(b.source.observedAt) - Date.parse(a.source.observedAt) || `${a.journeyId}:${a.factId}`.localeCompare(`${b.journeyId}:${b.factId}`));
  const limit = query.limit || 10;
  return { ok: true, saved: false, asOf: query.asOf, matchMethod: 'explicit_topics_and_lexical_terms', total: candidates.length, truncated: candidates.length > limit, results: candidates.slice(0, limit),
    unstructuredFactCount: states.reduce((n, s) => n + s.content.memory.facts.filter((f) => !f.experience).length, 0), limitations: ['Sources and evaluations are caller supplied', 'Conditions must be checked for the new trip; temporary observations are not permanent preferences', 'Only explicitly supplied journey states were searched'] };
}
const plain = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/[\\`*_{}[\]()#+.!|~-]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');
/** Conservative allowlist: raw facts, source references, plans, order/contacts and lodging data never enter a guide. */
export function createGuideDraft(stateInput: unknown, input: unknown) {
  const parsed = guideDraftSchema.safeParse(input); if (!parsed.success) throw new TripError('invalid_guide_request', 'Select explicit experience IDs and an asOf timestamp');
  const state = parseState(stateInput); const q = parsed.data; const all = rows(state, q.asOf);
  const selected = q.experienceIds.map((id) => { const row = all.find((r) => r.factId === id); if (!row) throw new TripError('unknown_id', 'Guide references an unknown experience'); return row; });
  if (selected.some((r) => r.superseded)) throw new TripError('superseded_experience', 'Choose the latest experience correction for a guide');
  const lodgingLabels = [...new Set([state.content, ...state.history.flatMap((h) => [h.before, h.after])].flatMap((content) => [
    ...content.snapshot.trip.lodgings.flatMap((l) => [l.name, typeof l.location === 'string' ? l.location : l.location?.label || '', typeof l.location === 'object' ? l.location.address || '' : '']),
    ...[...(content.itinerary?.baseline.days || []), ...(content.itinerary?.current || [])].flatMap((d) => d.activities.filter((a) => a.kind === 'lodging').flatMap((a) => [a.title, a.location?.label || ''])),
  ]).filter((s) => s.length > 1))];
  let omittedLessons = 0;
  const cards = selected.map((r, n) => {
    const lesson = r.draftLesson;
    const sensitive = lesson && (/@|https?:|\b\d[\d +()-]{5,}\d\b|(?:订单|预订号|联系人|房间号|order|confirmation|contact|room)\s*[:：#]/i.test(lesson) || lodgingLabels.some((label) => lesson.toLowerCase().includes(label.toLowerCase())));
    if (!lesson || sensitive || r.reuseStatus === 'future_observation') omittedLessons++;
    return { number: n + 1, origin: r.kind, eventDateId: r.eventDateId, sourceDate: r.source.observedAt.slice(0, 10), certainty: r.certainty, topics: r.topics,
      lesson: lesson && !sensitive && r.reuseStatus !== 'future_observation' ? lesson : null, reviewBeforeReuse: r.reviewBeforeReuse, unknownCount: r.unknowns.length, conditionsMustBeReviewed: true };
  });
  const lines = ['# 旅行经验攻略草稿', '', '供用户审阅；导出不代表公开分享。经验不构成开放、预约或交通保证，也不自动成为永久偏好。', '原始观察、联系人、订单、住宿、计划明细及来源引用默认省略；仅展示单独撰写的经验草稿。仍需检查草稿中的自由文本。', ''];
  for (const c of cards) lines.push(`## 经验 ${c.number}`, '', `来源类别：${c.origin === 'firsthand' ? '用户亲历报告' : '外部攻略'}；事件日期：${c.eventDateId || '未知'}；记录日期：${c.sourceDate}；确定性：${c.certainty}`, `主题：${c.topics.join('、')}`, c.lesson ? plain(c.lesson) : '此条尚无可纳入的经验草稿，或含需核对内容；请在私有复盘中审阅后补写。', `适用条件需复核；${c.unknownCount} 项未知。再次使用前核查：${c.reviewBeforeReuse.join('、') || '与本次旅行的条件是否相符'}。`, '');
  return { ok: true, saved: false, published: false, needsUserReview: true, privacyMode: 'dedicated_lesson_allowlist', omittedLessons, cards, markdown: lines.join('\n'), limitations: ['Free-text lessons still require user privacy and accuracy review', 'No implicit sharing, network request or external write occurred'] };
}
