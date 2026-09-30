import { getWeatherLocationLabel } from './weather';
import { planOutputShape, lodgingOutputShape, historyRules, planRules, locationRules, lodgingRules } from './aiPromptContract';
import { addDays } from './date';
import { resolveNightLodging, type NormalizedLodging } from './lodging';
import type { NormalizedPlan } from './plan';
import type { NormalizedSchedule } from './trip';

export type Language = 'zh' | 'en' | string;
export type AiPlannerMode = 'generate' | 'replan';

export function getPlanJsonSchema(language: Language = 'zh') {
  return JSON.stringify({ plans: [planOutputShape(language)], lodgings: [lodgingOutputShape()], warnings: [] });
}

export function getSinglePlanJsonSchema(language: Language = 'zh') {
  return JSON.stringify(planOutputShape(language));
}

export function pruneEmptyAiValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value
      .map(pruneEmptyAiValue)
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, pruneEmptyAiValue(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

function compactMapPointForAi(point: any) {
  return point && ['GCJ-02', 'WGS84'].includes(point.coordinateSystem) ? {
    longitude: point.longitude,
    latitude: point.latitude,
    coordinate_system: point.coordinateSystem,
  } : undefined;
}

export function compactLocationForAi(location: any) {
  if (!location) return undefined;

  return pruneEmptyAiValue({
    label: location.label,
    address: location.address,
    map_point: compactMapPointForAi(location.mapPoint),
    weather_location: {
      query: location.query || getWeatherLocationLabel(location),
      country_code: location.countryCode,
      admin1: location.admin1,
      admin2: location.admin2,
      latitude: location.latitude,
      longitude: location.longitude,
    },
  });
}

export function compactLodgingForAi(lodging: any) {
  if (!lodging) return undefined;

  return pruneEmptyAiValue({
    id: lodging.id,
    name: lodging.name,
    location: compactLocationForAi(lodging.location),
    default_for_trip: lodging.defaultForTrip !== false,
    reservations: lodging.reservations?.map((reservation: any) => ({ id: reservation.id, check_in: reservation.checkIn, check_out: reservation.checkOut, status: reservation.status, cancel_by: reservation.cancelBy, note: reservation.note })),
    check_in: lodging.checkIn,
    check_out: lodging.checkOut,
    note: lodging.note,
    booking_url: lodging.bookingUrl,
    map_url: lodging.mapUrl,
  });
}

export function compactTransferForAi(transfer: any) {
  if (!transfer) return undefined;

  return pruneEmptyAiValue({
    depart_at: transfer.departAt,
    mode: transfer.mode,
    preferred_route_mode: transfer.preferredRouteMode,
    via: transfer.via?.map((place: any) => ({
      label: place.label,
      address: place.address,
      country_code: place.countryCode,
      map_point: compactMapPointForAi(place.mapPoint),
    })),
    duration: transfer.duration,
    note: transfer.note,
  });
}

export function compactStopRouteForAi(stop: any) {
  return pruneEmptyAiValue({
    id: stop.id,
    time: stop.time,
    title: stop.title,
    lodging_anchor: stop.lodgingAnchor,
    lodging_id: stop.lodgingId,
    location: {
      label: stop.location?.label,
      address: stop.location?.address,
      map_point: compactMapPointForAi(stop.location?.mapPoint),
    },
    transfer_from_previous: compactTransferForAi(stop.transferFromPrevious),
    opening_hours: stop.openingHours,
    note: stop.note,
  });
}

export function getLodgingContextForDate(lodgings: NormalizedLodging[], dateId: string, schedule: NormalizedSchedule = {}, plans: Map<string, NormalizedPlan> = new Map()) {
  const tonight = resolveNightLodging(dateId, schedule, plans, lodgings);
  const previous = resolveNightLodging(addDays(dateId, -1), schedule, plans, lodgings);
  return pruneEmptyAiValue({ departure_lodging_id: previous.selected?.id, tonight_lodging_id: tonight.selected?.id,
    status: tonight.status, option_ids: tonight.options.map((hotel) => hotel.id), fixed: tonight.locked || undefined, conflict: tonight.conflict || undefined });
}

export function compactPlanForAi(plan: any, assignedDay: string | null) {
  if (!plan) return null;
  const planLocation = compactLocationForAi(plan.location) as Record<string, unknown> | undefined;
  const stopLocation = (location: any) => {
    const compact = compactLocationForAi(location) as Record<string, unknown> | undefined;
    if (compact && JSON.stringify(compact.weather_location) === JSON.stringify(planLocation?.weather_location)) delete compact.weather_location;
    return compact;
  };

  return pruneEmptyAiValue({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priority: plan.priority,
    lodging: plan.lodging && { mode: plan.lodging.mode, option_ids: plan.lodging.optionIds, preferred_id: plan.lodging.preferredId },
    location: planLocation,
    stops: plan.stops.map((stop: any) => ({
      id: stop.id,
      time: stop.time,
      title: stop.title,
      lodging_anchor: stop.lodgingAnchor,
      lodging_id: stop.lodgingId,
      location: stopLocation(stop.location),
      transfer_from_previous: compactTransferForAi(stop.transferFromPrevious),
      opening_hours: stop.openingHours,
      note: stop.note,
      weather_relevant: stop.weatherRelevant,
    })),
    available_dates: plan.available_dates,
    closed_dates: plan.closed_dates,
    weather_rules: plan.weather_rules,
    conflicts: plan.conflicts,
    bookings: plan.bookings.map((booking: any) => ({
      id: booking.id,
      type: booking.type,
      title: booking.title,
      status: booking.status,
      address: booking.address,
      url: booking.url,
      cancel_url: booking.cancelUrl,
      note: booking.note,
    })),
    reminders: plan.reminders.map((item: any) => ({ id: item.id, time: item.time, text: item.text, links: item.links || [] })),
    tips: plan.tips,
    assigned_day: assignedDay,
  });
}

export interface AiPlanningPromptOptions {
  mode: AiPlannerMode;
  language: Language;
  tripContext: Record<string, any>;
  hasInitializedPlans: boolean;
  plannerQuestion?: string;
  unplannedDates: any[];
  fixedDates: any[];
  adjustableDates: any[];
  remainingPlans: any[];
  normalizedPlans: any[];
  summarizeScheduleDate: (date: any) => any;
  summarizePlan: (plan: any) => any;
}

export function buildAiPlanningPrompt(options: AiPlanningPromptOptions) {
  const { mode, language, tripContext, plannerQuestion, fixedDates, adjustableDates, normalizedPlans, summarizeScheduleDate, summarizePlan } = options;
  const en = language === 'en';
  const context = { ...tripContext };
  delete context.existing_schedule;
  delete context.existing_plans;
  context.schedule = [...fixedDates.map((date) => ({ ...summarizeScheduleDate(date), fixed: true })), ...adjustableDates.map(summarizeScheduleDate)];
  context.plans = (normalizedPlans.length ? normalizedPlans : options.remainingPlans).map(summarizePlan);
  const request = plannerQuestion?.trim() || (en ? (mode === 'generate' ? 'Add suitable travel plans and lodging options.' : 'Replan the remaining dates and lodging.') : (mode === 'generate' ? '补充适合本次旅行的计划及住宿选项。' : '按当前约束调整剩余日期及住宿。'));
  const rules = mode === 'generate'
    ? (en ? 'Use new plan ids when adding candidates. Return complete changed plans; assigned_day is optional.' : '补充候选使用新 id；修改时返回完整计划，assigned_day 可选。') + '\n' + planRules(language)
    : (en ? 'This is a schedule-and-lodging-only response: do not rewrite existing plans. Respect map_point and transfer_from_previous.via constraints. Return only changed dates; select lodging_id for each changed night. New hotels may be added to lodgings.' : '本次只重排日期和住宿，不改写已有计划；评估交通时保留 map_point 和 transfer_from_previous.via 约束。只输出变动日期，当晚选择放 lodging_id，新增酒店放 lodgings。') + '\n' + lodgingRules(language) + '\n' + locationRules(language);
  const schema = mode === 'generate' ? getPlanJsonSchema(language) : JSON.stringify({ schedule: [{ date: 'YYYY-MM-DD', plan_id: 'existing_plan_id', lodging_id: 'optional_hotel_id', reason: '' }], lodgings: [lodgingOutputShape()], warnings: [] });
  return (en ? 'You are a travel planning assistant. Only output importable JSON. Put unresolved issues in warnings.' : '你是旅行规划助手。仅输出可导入 JSON，需要确认的事项放 warnings。') +
    '\n\n' + (en ? 'User request, prioritize this:' : '用户需求，请优先处理：') + '\n' + request +
    '\n\n' + (en ? 'Rules:' : '规则：') + '\n' + historyRules(language) + '\n' + rules +
    '\n\n' + (en ? 'Data (once per id):' : '数据（每个 id 仅一份）：') + '\n' + JSON.stringify(pruneEmptyAiValue(context) || {}) +
    '\n\n' + (en ? 'Output shape (omit unused optional fields; never copy placeholder ids):' : '输出结构（无用的可选字段可省略，不照抄占位 id）：') + '\n' + schema;
}

export interface SinglePlanPromptOptions {
  language: Language;
  isCreatingPlan: boolean;
  planContext: Record<string, any>;
  userRequest: string;
}

export function buildSinglePlanPrompt({ language, isCreatingPlan, planContext, userRequest }: SinglePlanPromptOptions) {
  const en = language === 'en';
  return (en ? 'Edit one travel plan and its lodging. Output JSON: {plan, lodgings?, warnings?}; lodgings contains only added/changed hotels.' : '编辑单个旅行计划及其住宿。只输出 JSON：{plan, lodgings?, warnings?}；lodgings 仅放新增/修改酒店。') +
    '\n\n' + (en ? 'User request, prioritize this:' : '用户需求，请优先处理：') + '\n' + userRequest +
    '\n\n' + (en ? 'Rules:' : '规则：') + '\n' + (isCreatingPlan ? (en ? 'Use a new id distinct from existing_plan_ids.' : '新增计划 id 不得与 existing_plan_ids 重复。') : (en ? 'Keep the current plan id; return the complete edited plan.' : '保留当前计划 id，返回完整修改后计划。')) +
    '\n' + historyRules(language) + '\n' + planRules(language) +
    '\n\n' + (en ? 'Context:' : '上下文：') + '\n' + JSON.stringify(pruneEmptyAiValue(planContext) || {}) +
    '\n\n' + (en ? 'Output shape (omit unused optional fields; never copy placeholder ids):' : '输出结构（无用的可选字段可省略，不照抄占位 id）：') + '\n' + JSON.stringify({ plan: planOutputShape(language), lodgings: [lodgingOutputShape()], warnings: [] });
}
