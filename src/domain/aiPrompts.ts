import { getWeatherLocationLabel } from './weather';

export type Language = 'zh' | 'en' | string;
export type AiPlannerMode = 'generate' | 'replan';

const DEFAULT_LANGUAGE = 'zh';

export function getPlanJsonSchema(language: Language = DEFAULT_LANGUAGE) {
  if (language === 'en') {
    return `{
  "plans": [
    {
      "id": "unique_plan_id",
      "name": "Short title",
      "description": "What to do and when this plan is suitable",
      "priority": "must | preferred | backup | optional",
      "location": { "label": "Display location", "address": "Detailed address, optional", "weather_location": { "query": "City/Ward, Prefecture, Country for weather lookup", "country_code": "JP", "admin1": "Prefecture/state", "latitude": "", "longitude": "" } },
      "stops": [
        {
          "time": "09:30",
          "title": "Stop title",
          "location": { "label": "Specific place", "address": "Detailed address, optional", "weather_location": { "query": "Only fill an administrative city/ward when this stop is in a different city/ward from the plan location; never use scenic spot, station, river, shop, or museum names", "country_code": "JP", "admin1": "Prefecture/state", "latitude": "", "longitude": "" } },
          "transfer_from_previous": { "depart_at": "09:00", "duration": "About 20 min", "mode": "walk | transit | train | bus | taxi | car | sightseeing_walk", "note": "Default to walk for normal point-to-point walking. Use sightseeing_walk only when the walk itself is a planned scenic activity." },
          "opening_hours": "Only the opening/business hours relevant to the planned arrival time, e.g. 10:00-17:00; leave empty if unknown or unreliable",
          "note": "What happens at this stop",
          "weather_relevant": true
        }
      ],
      "available_dates": ["YYYY-MM-DD"],
      "closed_dates": ["YYYY-MM-DD"],
      "weather_rules": {
        "best": ["sunny", "partly_cloudy"],
        "ok": ["cloudy", "drizzle"],
        "blocked": ["heavy_rain", "storm"]
      },
      "conflicts": ["other_plan_id"],
      "bookings": [
        {
          "id": "booking_id",
          "type": "reservation | ticket | confirmation | restaurant_reservation",
          "title": "Reservation/ticket item",
          "status": "pending | done | none",
          "address": "Service or arrival address",
          "url": "Reservation or booking link, optional",
          "cancel_url": "Cancellation/change/manage link, optional",
          "note": "Lead time, ID requirements, cancellation rules, restaurant reservation or queue notes, etc."
        }
      ],
      "reminders": [{"time": "HH:mm or text time", "text": "Important reminder", "links": [{"label": "Official site", "url": "https://example.com"}]}],
      "tips": ["General tip"],
      "assigned_day": "YYYY-MM-DD"
    }
  ]
}`;
  }

  return `{
  "plans": [
    {
      "id": "unique_plan_id",
      "name": "短标题",
      "description": "当天做什么，适合什么情况",
      "priority": "must | preferred | backup | optional",
      "location": { "label": "地点展示名", "address": "详细地址，可空", "weather_location": { "query": "天气查询用行政地点，例如 Kawachi-Nagano, Osaka, Japan", "country_code": "JP", "admin1": "都道府县/省州", "latitude": "", "longitude": "" } },
      "stops": [
        {
          "time": "09:30",
          "title": "节点标题",
          "location": { "label": "具体地点", "address": "详细地址，可空", "weather_location": { "query": "仅在跨城或明显不同区县时填写行政地点；同计划地点留空；不要写景点、车站、河流、商场、博物馆名", "country_code": "JP", "admin1": "都道府县/省州", "latitude": "", "longitude": "" } },
          "transfer_from_previous": { "depart_at": "09:00", "duration": "约 20 分钟", "mode": "步行 | 地铁 | 电车 | 巴士 | 出租车 | 自驾 | 游玩型步行", "note": "普通点到点步行默认写步行。只有这段步行本身就是独立观景/逛街/散步项目时，才写游玩型步行。" },
          "opening_hours": "只写和计划到达时间相关的开放/营业时间，例如 10:00-17:00；不确定或不可靠时留空",
          "note": "这个节点做什么",
          "weather_relevant": true
        }
      ],
      "available_dates": ["YYYY-MM-DD"],
      "closed_dates": ["YYYY-MM-DD"],
      "weather_rules": {
        "best": ["sunny", "partly_cloudy"],
        "ok": ["cloudy", "drizzle"],
        "blocked": ["heavy_rain", "storm"]
      },
      "conflicts": ["other_plan_id"],
      "bookings": [
        {
          "id": "booking_id",
          "type": "reservation | ticket | confirmation | restaurant_reservation",
          "title": "需要预约/订票的项目",
          "status": "pending | done | none",
          "address": "办理或到达地址",
          "url": "预约或订票链接，可空",
          "cancel_url": "退订/改签/管理链接，可空",
          "note": "提前多久、证件要求、退改规则、餐厅预约或排队说明等"
        }
      ],
      "reminders": [{"time": "HH:mm 或文字时间", "text": "必须注意的事项", "links": [{"label": "官网", "url": "https://example.com"}]}],
      "tips": ["普通提示"],
      "assigned_day": "YYYY-MM-DD"
    }
  ]
}`;
}

export function getSinglePlanJsonSchema(language: Language = DEFAULT_LANGUAGE) {
  if (language === 'en') {
    return `{
  "id": "unique_plan_id",
  "name": "Short title",
  "description": "What to do",
  "priority": "must | preferred | backup | optional",
  "location": { "label": "Display place", "address": "", "weather_location": { "query": "City/Ward, Prefecture, Country", "country_code": "JP", "admin1": "Prefecture/state", "latitude": "", "longitude": "" } },
  "stops": [{ "time": "09:30", "title": "Stop", "location": { "label": "Place", "address": "", "weather_location": { "query": "Leave empty unless this stop needs a different administrative weather city/ward", "country_code": "", "admin1": "", "latitude": "", "longitude": "" } }, "transfer_from_previous": { "depart_at": "", "duration": "", "mode": "walk | transit | train | bus | taxi | car | sightseeing_walk", "note": "" }, "opening_hours": "", "note": "", "weather_relevant": true }],
  "available_dates": ["YYYY-MM-DD"],
  "closed_dates": ["YYYY-MM-DD"],
  "weather_rules": {
    "best": ["sunny", "partly_cloudy"],
    "ok": ["cloudy", "drizzle"],
    "blocked": ["heavy_rain", "storm"]
  },
  "conflicts": ["other_plan_id"],
  "bookings": [{ "id": "booking_id", "type": "reservation | ticket | confirmation | restaurant_reservation", "title": "", "status": "pending | done | none", "address": "", "url": "", "cancel_url": "", "note": "" }],
  "reminders": [{ "time": "", "text": "", "links": [{ "label": "", "url": "" }] }],
  "tips": [],
  "assigned_day": "YYYY-MM-DD"
}`;
  }

  return `{
  "id": "unique_plan_id",
  "name": "短标题",
  "description": "当天做什么",
  "priority": "must | preferred | backup | optional",
  "location": { "label": "地点展示名", "address": "", "weather_location": { "query": "行政地点，例如 Kawachi-Nagano, Osaka, Japan", "country_code": "JP", "admin1": "都道府县/省州", "latitude": "", "longitude": "" } },
  "stops": [{ "time": "09:30", "title": "节点标题", "location": { "label": "具体地点", "address": "", "weather_location": { "query": "除非该节点需要不同的行政天气城市/区县，否则留空", "country_code": "", "admin1": "", "latitude": "", "longitude": "" } }, "transfer_from_previous": { "depart_at": "", "duration": "", "mode": "步行 | 地铁 | 电车 | 巴士 | 出租车 | 自驾 | 游玩型步行", "note": "" }, "opening_hours": "", "note": "", "weather_relevant": true }],
  "available_dates": ["YYYY-MM-DD"],
  "closed_dates": ["YYYY-MM-DD"],
  "weather_rules": {
    "best": ["sunny", "partly_cloudy"],
    "ok": ["cloudy", "drizzle"],
    "blocked": ["heavy_rain", "storm"]
  },
  "conflicts": ["other_plan_id"],
  "bookings": [{ "id": "booking_id", "type": "reservation | ticket | confirmation | restaurant_reservation", "title": "", "status": "pending | done | none", "address": "", "url": "", "cancel_url": "", "note": "" }],
  "reminders": [{ "time": "", "text": "", "links": [{ "label": "", "url": "" }] }],
  "tips": [],
  "assigned_day": "YYYY-MM-DD"
}`;
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

export function compactLocationForAi(location: any) {
  if (!location) return undefined;

  return pruneEmptyAiValue({
    label: location.label,
    address: location.address,
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
    location: {
      label: lodging.location?.label || lodging.name,
      address: lodging.location?.address,
    },
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
    duration: transfer.duration,
    note: transfer.note,
  });
}

export function getLodgingContextForDate(lodgings: any[], dateId: string) {
  const checkoutFrom = lodgings.filter((lodging) => lodging.checkOut === dateId).map(compactLodgingForAi);
  const checkinTo = lodgings.filter((lodging) => lodging.checkIn === dateId).map(compactLodgingForAi);
  const stayingNight = lodgings
    .filter((lodging) => lodging.checkIn && lodging.checkOut && lodging.checkIn <= dateId && dateId < lodging.checkOut)
    .map(compactLodgingForAi);

  return pruneEmptyAiValue({
    checkout_from: checkoutFrom,
    checkin_to: checkinTo,
    staying_night: stayingNight,
  });
}

export function compactPlanForAi(plan: any, assignedDay: string | null) {
  if (!plan) return null;

  return pruneEmptyAiValue({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priority: plan.priority,
    location: compactLocationForAi(plan.location),
    stops: plan.stops.map((stop: any) => ({
      time: stop.time,
      title: stop.title,
      location: compactLocationForAi(stop.location),
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
    reminders: plan.reminders.map((item: any) => ({ time: item.time, text: item.text, links: item.links || [] })),
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
  const {
    mode,
    language,
    tripContext,
    hasInitializedPlans,
    plannerQuestion = '',
    unplannedDates,
    fixedDates,
    adjustableDates,
    remainingPlans,
    normalizedPlans,
    summarizeScheduleDate,
    summarizePlan,
  } = options;
  const planSchema = getPlanJsonSchema(language);

  if (mode === 'generate') {
    const generateRequest = plannerQuestion.trim() || (hasInitializedPlans
      ? (language === 'en'
        ? 'Add candidate plans for backups or added days; include assigned_day when useful.'
        : '请补充计划池、backup 或新增天数需要的候选计划；必要时给出 assigned_day。')
      : (language === 'en'
        ? 'Generate a travel plan pool and include an initial schedule when useful.'
        : '请生成旅行计划池；如果适合，也给出初始日程。'));

    if (language === 'en') {
      return `You are a travel plan-pool assistant. Generate or extend travel plans based on the current state.

User request, prioritize this:
${generateRequest}

Data:
${JSON.stringify({
  ...tripContext,
  mode: hasInitializedPlans ? 'extend existing plan pool' : 'generate a full plan pool from empty state',
  keep_existing_schedule_by_default: hasInitializedPlans,
  unplanned_dates: unplannedDates.map(summarizeScheduleDate),
  existing_plan_ids_should_not_duplicate: normalizedPlans.map((plan) => plan.id),
}, null, 2)}

Output rules:
1. Only output importable JSON, with no Markdown or explanation.
2. Follow the JSON format below. Use empty arrays for optional list fields when absent.
3. Fill available_dates, closed_dates, weather_rules and conflicts from the trip constraints and the user request.
4. Fill plan location.weather_location as an administrative weather lookup object, not a scenic spot. For Japan, use query like "Kawachi-Nagano, Osaka, Japan", country_code "JP", and admin1 "Osaka"; do not write concatenated romanization like "Kawachinagano". For stops in the same city/ward as the plan, leave stops.location.weather_location empty so they inherit the plan weather source. Fill stop weather_location only for cross-city or clearly different weather areas. Never use scenic spot, river, station, shop, mall or museum names as weather queries. Fill latitude/longitude only when you are confident.
5. Put storm in weather_rules.blocked. Heavy rain should usually be blocked; if it is an indoor backup, put heavy_rain in ok, not best.
6. Fill stops.location.address and bookings.address when possible. Add bookings for reservations, tickets or cancellation/change links. For restaurants that require or strongly benefit from reservation, add a restaurant_reservation booking with status pending unless already booked, plus a short note about when/why to reserve.
7. If lodging is provided for that date, include the lodging as the first stop, e.g. "Depart from lodging", using the lodging location and weather_relevant false.
8. stops.time is the arrival/start time at that stop. Do not use stops.time as the departure time of the transfer.
9. For transfer_from_previous, fill depart_at whenever possible because the UI shows the departure time. stops.time is already the arrival/start time, so do not duplicate it in transfer_from_previous. Only fill the main transport mode and rough duration. Do not write detailed turn-by-turn routes; the user will check maps later. Use mode "walk" for normal point-to-point walking, short walks between nearby stops, station walking, or ordinary pedestrian transfers. Use "sightseeing_walk" only when the transfer itself is a distinct planned scenic stroll or street-walk activity; if unsure, use "walk".
10. For stops.opening_hours, only write the hours relevant to the planned arrival time. Do not include seasonal notes, full-day schedules or long caveats; leave it empty if unsure.
11. If the day should return to lodging, add a final stop such as "Return to lodging" with the lodging location, transfer_from_previous from the previous stop, and weather_relevant false.
12. Do not call a plan a "loop" just because it starts and ends at lodging. Use loop only for a real circular sightseeing route.
13. If lodgings are provided, use them as day start/end and hotel-transfer constraints.
14. Avoid repeating the same point across description, reminders and tips. Use description for the day summary and why the flow works; use reminders only for time-sensitive or must-check actions; use tips only for optional general advice.
15. URL fields such as bookings.url, bookings.cancel_url, reminders[].links[].url, lodging booking/map URLs must be plain https URLs, never Markdown links.
16. For official sites, realtime status pages, live cameras, booking pages or other URLs in reminders, put them in reminders[].links. Do not put Markdown links or raw URLs inside reminder text.
17. Add reminders and tips only when useful; otherwise use empty arrays.
18. When an existing plan pool exists, do not duplicate existing plan_id. Unless explicitly replacing, only add or supplement.
19. If a plan should be scheduled, write assigned_day on that plan.
20. Treat abandoned days and blacklisted_places as explicit user decisions. Do not schedule an abandoned day or reintroduce a blacklisted place unless the user explicitly asks. abandoned_stops are date-specific records of places skipped on that occurrence; preserve them as history and do not treat them as a global blacklist.
21. Dates before planning_from are fixed history. In particular, a plan assigned before current_date and before planning_from has already been visited: do not schedule it again or clear that earlier record. Only rewrite planning_from and later dates.

JSON format:
${planSchema}`;
    }

    return `你是旅行计划池生成助手。请根据当前状态生成或补充旅行计划。

用户需求，请优先处理：
${generateRequest}

数据：
${JSON.stringify({
  ...tripContext,
  mode: hasInitializedPlans ? '补充现有计划池' : '从空计划池生成完整规划',
  keep_existing_schedule_by_default: hasInitializedPlans,
  unplanned_dates: unplannedDates.map(summarizeScheduleDate),
  existing_plan_ids_should_not_duplicate: normalizedPlans.map((plan) => plan.id),
}, null, 2)}

输出规范：
1. 只输出可导入 JSON，不要 Markdown 或解释。
2. 严格按下面格式补齐字段；可选数组没有内容时用空数组。
3. 根据旅行限制和用户需求填写 available_dates、closed_dates、weather_rules、conflicts。
4. 计划 location.weather_location 写成天气查询用行政地点对象，不要用景点名。日本地点用类似 "Kawachi-Nagano, Osaka, Japan" 的 query，并写 country_code "JP"、admin1 "Osaka"；不要写 "Kawachinagano" 这种无空格拼接罗马字。同城/同区县 stop 的 stops.location.weather_location 必须留空，继承计划天气；只有跨城或明显不同天气区域才填写 stop 的 weather_location。不要把景点、河流、车站、商场、店铺、博物馆名当作天气查询地点。只有确定坐标时才填 latitude/longitude。
5. storm 必须放在 weather_rules.blocked；heavy_rain 通常也应 blocked，如果是室内避雨方案，最多放 ok，不要放 best。
6. stops.location.address 和 bookings.address 尽量写清楚；需要预约、订票或退改入口时写 bookings。餐厅如果需要预约，或强烈建议预约/排队风险较高，也写 restaurant_reservation 类型的 booking；除非已订好，否则 status 用 pending，并在 note 简要说明何时/为什么要预约。
7. 如果当天有住宿信息，把住宿作为第一个 stop，例如“酒店出发/从住宿出发”，location 使用住宿地点，weather_relevant 为 false。
8. stops.time 是到达/开始当前 stop 的时间，不是从上一站出发的时间。
9. transfer_from_previous 尽量填写 depart_at，因为界面会显示出发时间。stops.time 已经是到达/开始当前 stop 的时间，不要在 transfer_from_previous 里重复。只写从上一 stop 到当前 stop 的主要交通工具和粗略耗时，不要写详细换乘路线；用户之后会看地图。普通点到点步行、相邻地点短距离步行、站内步行或普通通勤步行，mode 都写“步行”。只有这段移动本身就是一个明确安排的观景散步、街区漫步或游览项目时，才写“游玩型步行”；不确定时写“步行”。
10. stops.opening_hours 只写和计划到达时间相关的开放/营业时间，不要写季节说明、全天完整时间表或很长的注意事项；不确定就留空。
11. 如果当天应该回住宿，在 stops 最后增加“返回酒店/返回住宿”节点，location 使用住宿地点，transfer_from_previous 写上一站到住宿的移动，weather_relevant 为 false。
12. 不要因为从酒店出发、回酒店结束，就把计划命名为“环线”；只有真实闭环游览路线才可以叫环线。
13. 如果提供了 lodgings，把住宿作为每天出发、返回和换酒店约束。
14. 避免在 description、reminders、tips 里反复写同一件事。description 只写当天概览和动线为什么成立；reminders 只写有时间点、必须确认、必须执行的动作；tips 只写额外建议。
15. bookings.url、bookings.cancel_url、reminders[].links[].url、住宿 booking/map URL 等 URL 字段只能填写纯 https URL，不要写 Markdown 链接。
16. 提醒里如果涉及官网、实时状态、实时摄像头、预约页或其他 URL，放到 reminders[].links；不要把 Markdown 链接或裸 URL 写进 text。
17. 有特别提醒和 tips 就写，没有就留空数组。
18. 已有计划池时不要重复已有 plan_id；除非明确要替换，否则只新增或补充。
19. 需要安排日期时，在对应 plan 上写 assigned_day。
20. 已放弃日期和 blacklisted_places 都是用户明确做出的决定；除非用户明确要求，否则不要重新安排已放弃日期，也不要再次加入已拉黑地点。abandoned_stops 是某个日期中临时没去的地点记录，只作为历史保留，不要把它当成全局拉黑。
21. planning_from 之前的日期是固定历史。尤其是同时早于 current_date 和 planning_from 的已安排计划，视为已经去过：不要再次安排，也不要清空其历史记录；只调整 planning_from 及之后的日期。

JSON 格式：
${planSchema}`;
  }

  const replanRequest = plannerQuestion.trim() || (language === 'en'
    ? 'Replan the remaining dates based on current weather, date limits, must-go priority and day flow.'
    : '请根据当前天气、日期限制、必去优先级和当天动线，重排剩余日期。');
  const context = {
    ...tripContext,
    fixed_dates_do_not_change: fixedDates.map(summarizeScheduleDate),
    adjustable_dates: adjustableDates.map(summarizeScheduleDate),
    remaining_or_adjustable_plans: remainingPlans.map(summarizePlan),
  };

  if (language === 'en') {
    return `You are a travel itinerary replanning assistant. Only adjust the remaining itinerary based on the data below. Do not change dates listed in fixed_dates_do_not_change.

User request, prioritize this:
${replanRequest}

You need to:
1. Rearrange the dates in adjustable_dates.
2. Prioritize must-go plans and reduce weather-unsuitable or date-unsuitable choices.
3. Do not casually move reserved/ticketed plans; call out pending reservations/tickets in the reasons.
4. Consider lodging check-in/check-out, day start/end and hotel-transfer constraints.
5. Explain if a plan must be dropped.
6. Clearly list anything I need to confirm if the adjustment creates risk.
7. End with JSON so I can import or compare changes manually.
8. Keep abandoned days and blacklisted places unchanged unless I explicitly ask to restore them. abandoned_stops are date-specific skipped-place records, not global blacklists.

Data:
${JSON.stringify(context, null, 2)}

Please answer in this structure:
1. Recommended new schedule
2. Reasons for changes
3. Unassigned plans and reasons
4. Risks to confirm
5. JSON:
{
  "schedule": [
    { "date": "YYYY-MM-DD", "plan_id": "plan_id", "reason": "why this plan fits here" }
  ],
  "unassigned": [
    { "plan_id": "plan_id", "reason": "why it is not scheduled" }
  ],
  "warnings": ["items the user needs to confirm"]
}`;
  }

  return `你是旅行行程重排助手。请只基于下面的数据调整剩余行程，不要改动 fixed_dates_do_not_change 里的日期。

用户需求，请优先处理：
${replanRequest}

你需要做：
1. 重新安排 adjustable_dates 中的日期。
2. 优先保留必去计划，尽量减少天气不合适和日期不合适。
3. 已预约/已订票的计划不要随意挪动；未预约/未订票的计划需要在原因里提醒。
4. 考虑住宿入住/退房、每天出发/返回和换酒店约束。
5. 如果必须放弃计划，请说明原因。
6. 如果某个调整会带来风险，请明确列出需要我确认的事项。
7. 最后输出一个 JSON，方便我手动导入或对照修改。
8. 除非我明确要求恢复，否则保留已放弃日期和已拉黑地点，不要重新加入规划；abandoned_stops 只是具体日期中没去的地点记录，不等于全局拉黑。

数据：
${JSON.stringify(context, null, 2)}

请按这个格式回答：
1. 推荐的新日程
2. 调整原因
3. 未安排计划及原因
4. 需要确认的风险
5. JSON：
{
  "schedule": [
    { "date": "YYYY-MM-DD", "plan_id": "plan_id", "reason": "为什么这样排" }
  ],
  "unassigned": [
    { "plan_id": "plan_id", "reason": "为什么没排进去" }
  ],
  "warnings": ["需要用户确认的事项"]
}`;
}

export interface SinglePlanPromptOptions {
  language: Language;
  isCreatingPlan: boolean;
  planContext: Record<string, any>;
  userRequest: string;
}

export function buildSinglePlanPrompt(options: SinglePlanPromptOptions) {
  const { language, isCreatingPlan, planContext, userRequest } = options;
  const schema = getSinglePlanJsonSchema(language);

  return `${language === 'en'
    ? `You are a single travel-plan editing assistant. ${isCreatingPlan ? 'Add one plan' : 'Modify the current plan'} based on the user request. Only output one plan JSON object.`
    : `你是旅行单个计划编辑助手。请根据用户需求${isCreatingPlan ? '新增一个计划' : '修改当前计划'}，只输出单个计划 JSON 对象。`}

${language === 'en' ? 'Context:' : '上下文：'}
${JSON.stringify(planContext, null, 2)}

${language === 'en' ? 'User request, prioritize this:' : '用户需求，请优先处理：'}
${userRequest}

${language === 'en' ? `Requirements:
1. ${isCreatingPlan ? 'The new plan id must not duplicate existing_plan_ids.' : 'Keep the current plan id unless the user explicitly asks to change it.'}
2. Fill plan location.weather_location as an administrative weather lookup object, not a scenic spot. For Japan, use query like "Kawachi-Nagano, Osaka, Japan", country_code "JP", and admin1 "Osaka"; do not write concatenated romanization like "Kawachinagano". For stops in the same city/ward as the plan, leave stops.location.weather_location empty so they inherit the plan weather source. Fill stop weather_location only for cross-city or clearly different weather areas. Never use scenic spot, river, station, shop, mall or museum names as weather queries. Fill latitude/longitude only when you are confident.
3. Put storm in weather_rules.blocked. Heavy rain should usually be blocked; if it is an indoor backup, put heavy_rain in ok, not best.
4. Fill stops.location.address and bookings.address when possible. Add bookings for reservations, tickets or cancellation/change links. For restaurants that require or strongly benefit from reservation, add a restaurant_reservation booking with status pending unless already booked, plus a short note about when/why to reserve.
5. If lodging is provided for that date, include the lodging as the first stop, e.g. "Depart from lodging", using the lodging location and weather_relevant false.
6. stops.time is the arrival/start time at that stop. Do not use stops.time as the departure time of the transfer.
7. For transfer_from_previous, fill depart_at whenever possible because the UI shows the departure time. stops.time is already the arrival/start time, so do not duplicate it in transfer_from_previous. Only fill the main transport mode and rough duration. Do not write detailed turn-by-turn routes; the user will check maps later. Use mode "walk" for normal point-to-point walking, short walks between nearby stops, station walking, or ordinary pedestrian transfers. Use "sightseeing_walk" only when the transfer itself is a distinct planned scenic stroll or street-walk activity; if unsure, use "walk".
8. For stops.opening_hours, only write the hours relevant to the planned arrival time. Do not include seasonal notes, full-day schedules or long caveats; leave it empty if unsure.
9. If the day should return to lodging, add a final stop such as "Return to lodging" with the lodging location, transfer_from_previous from the previous stop, and weather_relevant false.
10. Do not call a plan a "loop" just because it starts and ends at lodging. Use loop only for a real circular sightseeing route.
11. If lodgings are provided, account for day start/end and hotel-transfer constraints.
12. Avoid repeating the same point across description, reminders and tips. Use description for the day summary and why the flow works; use reminders only for time-sensitive or must-check actions; use tips only for optional general advice.
13. URL fields such as bookings.url, bookings.cancel_url, reminders[].links[].url, lodging booking/map URLs must be plain https URLs, never Markdown links.
14. For official sites, realtime status pages, live cameras, booking pages or other URLs in reminders, put them in reminders[].links. Do not put Markdown links or raw URLs inside reminder text.
15. If the plan fits a specific day, include assigned_day.
16. Output one plan JSON object only, with no explanation, no array and no outer "plans" wrapper.
17. Do not add a place listed in blacklisted_places unless the user explicitly asks to restore it. Preserve ids for unchanged stops so date-specific abandoned_stops remain traceable.

Single plan JSON format:
${schema}` : `要求：
1. ${isCreatingPlan ? '新增计划 id 不要和 existing_plan_ids 重复。' : '除非用户明确要求，否则保留当前计划 id。'}
2. 计划 location.weather_location 写成天气查询用行政地点对象，不要用景点名。日本地点用类似 "Kawachi-Nagano, Osaka, Japan" 的 query，并写 country_code "JP"、admin1 "Osaka"；不要写 "Kawachinagano" 这种无空格拼接罗马字。同城/同区县 stop 的 stops.location.weather_location 必须留空，继承计划天气；只有跨城或明显不同天气区域才填写 stop 的 weather_location。不要把景点、河流、车站、商场、店铺、博物馆名当作天气查询地点。只有确定坐标时才填 latitude/longitude。
3. storm 必须放在 weather_rules.blocked；heavy_rain 通常也应 blocked，如果是室内避雨方案，最多放 ok，不要放 best。
4. stops.location.address 和 bookings.address 尽量写清楚；需要预约、订票或退改入口时写 bookings。餐厅如果需要预约，或强烈建议预约/排队风险较高，也写 restaurant_reservation 类型的 booking；除非已订好，否则 status 用 pending，并在 note 简要说明何时/为什么要预约。
5. 如果当天有住宿信息，把住宿作为第一个 stop，例如“酒店出发/从住宿出发”，location 使用住宿地点，weather_relevant 为 false。
6. stops.time 是到达/开始当前 stop 的时间，不是从上一站出发的时间。
7. transfer_from_previous 尽量填写 depart_at，因为界面会显示出发时间。stops.time 已经是到达/开始当前 stop 的时间，不要在 transfer_from_previous 里重复。只写从上一 stop 到当前 stop 的主要交通工具和粗略耗时，不要写详细换乘路线；用户之后会看地图。普通点到点步行、相邻地点短距离步行、站内步行或普通通勤步行，mode 都写“步行”。只有这段移动本身就是一个明确安排的观景散步、街区漫步或游览项目时，才写“游玩型步行”；不确定时写“步行”。
8. stops.opening_hours 只写和计划到达时间相关的开放/营业时间，不要写季节说明、全天完整时间表或很长的注意事项；不确定就留空。
9. 如果当天应该回住宿，在 stops 最后增加“返回酒店/返回住宿”节点，location 使用住宿地点，transfer_from_previous 写上一站到住宿的移动，weather_relevant 为 false。
10. 不要因为从酒店出发、回酒店结束，就把计划命名为“环线”；只有真实闭环游览路线才可以叫环线。
11. 如果提供了 lodgings，把住宿作为当天出发、返回和换酒店约束。
12. 避免在 description、reminders、tips 里反复写同一件事。description 只写当天概览和动线为什么成立；reminders 只写有时间点、必须确认、必须执行的动作；tips 只写额外建议。
13. bookings.url、bookings.cancel_url、reminders[].links[].url、住宿 booking/map URL 等 URL 字段只能填写纯 https URL，不要写 Markdown 链接。
14. 提醒里如果涉及官网、实时状态、实时摄像头、预约页或其他 URL，放到 reminders[].links；不要把 Markdown 链接或裸 URL 写进 text。
15. 如果计划适合安排到某一天，可以写 assigned_day。
16. 只输出单个计划 JSON 对象，不要解释，不要数组，不要外层 plans 包装。
17. 除非用户明确要求恢复，否则不要加入 blacklisted_places 中的地点；未改变的 stop 要保留原 id，确保具体日期的 abandoned_stops 仍能关联。

单个计划 JSON 格式：
${schema}`}
`;
}
