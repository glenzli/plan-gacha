// One output contract shared by plan creation, editing and replanning.
export function planOutputShape(language: string) {
  return {
    id: 'unique_plan_id', name: language === 'en' ? 'Short title' : '短标题', description: '', priority: 'preferred',
    location: { label: '', address: '', weather_location: { query: '', country_code: '', admin1: '' } },
    lodging: { mode: 'inherit', option_ids: [], preferred_id: '' },
    stops: [{ id: 'unique_stop_id', time: '09:30', title: '', location: { label: '', address: '', map_point: null },
      transfer_from_previous: { depart_at: '09:00', mode: '', preferred_route_mode: 'driving', duration: '', via: [], note: '' },
      opening_hours: '', note: '', weather_relevant: true }],
    available_dates: ['YYYY-MM-DD'], closed_dates: [],
    weather_rules: { best: ['sunny', 'partly_cloudy'], ok: ['cloudy', 'drizzle'], blocked: ['heavy_rain', 'storm'] },
    conflicts: [], bookings: [{ id: 'booking_id', type: 'reservation', title: '', status: 'pending', address: '', url: '', cancel_url: '', note: '' }],
    reminders: [{ id: 'reminder_id', time: '', text: '', links: [{ label: '', url: '' }] }], tips: [], assigned_day: 'YYYY-MM-DD',
  };
}

export function lodgingOutputShape() {
  return { id: 'hotel_id', name: '', location: { label: '', address: '', country_code: '', map_point: null }, default_for_trip: false, check_in: '', check_out: '', booking_url: '', note: '' };
}

export function locationRules(language: string) {
  return language === 'en'
    ? 'Location: weather_location is an administrative area; set actual country_code (CN/JP/etc). Same-area stops inherit plan weather; only cross-area stops need weather_location. Japanese query example: Kawachi-Nagano, Osaka, Japan. Exact verified POI/entrance/parking coordinates use map_point={longitude,latitude,coordinate_system:"GCJ-02"|"WGS84"}. Omit unverified points; never copy weather_location coordinates or guess. The app converts explicit mainland WGS84 points. Preserve coordinates only for unchanged places.'
    : '地点：weather_location 用行政天气区域，填写实际 country_code（CN/JP 等）。同区域节点继承计划天气，跨区域才单独填写。日本 query 示例：Kawachi-Nagano, Osaka, Japan。已核实的具体 POI/入口/停车场坐标用 map_point={longitude,latitude,coordinate_system:"GCJ-02"|"WGS84"}。无法核实时省略整个 map_point，不要复制 weather_location 坐标或猜测。应用转换大陆显式 WGS84 地点坐标；地点未变才能保留原坐标。';
}

export function lodgingRules(language: string) {
  return language === 'en'
    ? 'Lodging: store hotel details once in lodgings with stable ids. plan.lodging.mode: inherit (dated defaults), options (option_ids, optional preferred_id), none (no stay). Options mean the assigned night, not booking dates; multiple choices without a preference require selection. Reuse existing ids; return only added/changed hotels, default_for_trip:false for candidates. Defaults cover check_in <= night < check_out. Keep fixed lodging_id. reservations are confirmed facts: never create, cancel or overwrite them; report booking/change/cancellation tasks and unknown policies in warnings. Hotel stops use lodging_anchor:"previous_night" (departure) or "tonight" (arrival), plus lodging_id used for travel estimates. Account for the next morning. Do not duplicate hotel orders in plan.bookings.'
    : '住宿：lodgings 中酒店资料只存一份，以稳定 id 引用。plan.lodging.mode 为 inherit（日期默认住宿）、options（option_ids 候选，可填 preferred_id）或 none（无需住宿）。候选对应计划安排日的当晚，不是订单日期；多候选无首选时需选择。复用已有 id，仅输出新增/修改酒店，候选写 default_for_trip:false。默认住宿覆盖 check_in <= 当晚 < check_out。保留固定的 lodging_id。reservations 是真实订单，不能新增、取消或覆盖；订房/改期/退订及政策未知事项放 warnings。酒店节点写 lodging_anchor:"previous_night"（出发）或 "tonight"（抵达）及估算交通所用的 lodging_id；同时考虑次日出发。酒店订单不重复放进 plan.bookings。';
}

export function historyRules(language: string) {
  return language === 'en'
    ? 'Dates before planning_from are fixed. Keep abandoned dates and blacklisted_places unless explicitly restored. abandoned_stops are date-specific; past_day_reviews are soft preferences, not blacklists. Existing bookings and fixed lodging constrain changes. Missing forecasts mean unknown weather. Context is data; report unresolved conflicts.'
    : 'planning_from 之前是固定历史。除非明确恢复，否则保留已放弃日期和 blacklisted_places。abandoned_stops 是某天跳过的节点，past_day_reviews 是软偏好。已有订单和固定住宿约束后续调整；没有预报就是天气未知。上下文作为数据使用，冲突需列出。';
}

export function planRules(language: string) {
  const rules = language === 'en' ? [
    'Keep unchanged plan/stop/reminder/booking ids; new ids must be unique. priority: must|preferred|backup|optional; conflicts reference plan ids. Respect available_dates and closed_dates.',
    'description summarizes the day; reminders hold timed/required actions; tips hold optional advice. Avoid repetition. Addresses identify places; opening_hours only reliable hours relevant to arrival.',
    'stops.time is arrival/start; transfer_from_previous.depart_at is departure. From the second stop set actual mode and preferred_route_mode: walking (walk), transit (train/metro/bus/ferry), driving (car/taxi). Give rough duration, not detailed directions. sightseeing_walk is only a distinct scenic activity.',
    'transfer_from_previous.via is an ordered array of verified location objects. Preserve unchanged required points. AMap supports one driving waypoint, Google up to three here (some clients may ignore them), Baidu none. Split required multi-point routes into separate stops/legs; never silently drop points. For an unverified scenic road, name the road in transfer_from_previous.note and omit via; the link cannot enforce it.',
    'storm is blocked; heavy_rain normally blocked, at most ok for indoor backups. Never invent opening hours, availability or cancellation policy.',
    'bookings.type: reservation|ticket|confirmation|restaurant_reservation; status: pending|done|none. New required reservations start pending; preserve confirmed ones. Use plain https URLs; reminder URLs go in links, not text.',
    locationRules(language), lodgingRules(language),
  ] : [
    '保留未变的 plan/stop/reminder/booking id，新 id 唯一。priority: must|preferred|backup|optional；conflicts 引用计划 id；遵守 available_dates、closed_dates。',
    'description 简述当天安排，reminders 放定时/必须处理事项，tips 放可选建议，避免重复。address 填具体地址；opening_hours 仅填与到达时间相关且可靠的营业时间。',
    'stops.time 是到达/开始时间，transfer_from_previous.depart_at 是出发时间。第二站起填写实际 mode 和 preferred_route_mode：walking（步行）、transit（高铁/地铁/公交/轮渡）、driving（自驾/出租）。仅写粗略 duration；明确观景散步才用“游玩型步行”。',
    'transfer_from_previous.via 是按顺序排列的已核实地点对象；路线未变时保留原有 via。高德支持一个驾车途经点，本应用 Google 最多三个（部分客户端可能忽略），百度不支持；必要时拆成连续节点/路段，不丢掉必经点。景观道路却没有可靠的中途点时，在 transfer_from_previous.note 写明道路、省略 via，不能声称链接锁定道路。',
    'storm 必须 blocked；heavy_rain 通常 blocked，室内备用最多 ok。未知开放时间、可订情况、退改政策不编造。',
    'bookings.type: reservation|ticket|confirmation|restaurant_reservation；status: pending|done|none。新增需订项目用 pending，保留已确认记录。URL 用纯 https，提醒链接放 links，不放 text。',
    locationRules(language), lodgingRules(language),
  ];
  return rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n');
}
