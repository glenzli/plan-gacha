import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

const APP_SCHEMA_VERSION = '11';
const DEFAULT_TRIP_DAYS = 5;

const STORAGE_KEYS = {
  schemaVersion: 'pg_schemaVersion',
  trips: 'pg_trips',
  currentTrip: 'pg_currentTripId',
};

const WEATHER_OPTIONS = [
  { id: 'unknown', label: '未知', short: '未' },
  { id: 'sunny', label: '晴', short: '晴' },
  { id: 'partly_cloudy', label: '少云', short: '少云' },
  { id: 'cloudy', label: '阴', short: '阴' },
  { id: 'drizzle', label: '小雨', short: '小雨' },
  { id: 'rain', label: '雨', short: '雨' },
  { id: 'heavy_rain', label: '大雨', short: '大雨' },
  { id: 'storm', label: '雷雨', short: '雷雨' },
  { id: 'fog', label: '雾', short: '雾' },
  { id: 'hot', label: '热', short: '热' },
  { id: 'cold', label: '冷', short: '冷' },
  { id: 'windy', label: '大风', short: '风' },
];

const INTENSITY_META = {
  easy: { label: '轻松', rank: 1 },
  normal: { label: '正常', rank: 2 },
  hard: { label: '费体力', rank: 3 },
};

const PRIORITY_META = {
  must: { label: '必去', rank: 4 },
  preferred: { label: '想去', rank: 3 },
  backup: { label: '备用', rank: 2 },
  optional: { label: '可放弃', rank: 1 },
};

const LEGACY_INTENSITY_MAP = {
  relaxed: 'easy',
  normal: 'normal',
  full: 'hard',
};

function formatDateId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateId(dateId) {
  const [year, month, day] = dateId.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateId, offset) {
  const date = parseDateId(dateId);
  date.setDate(date.getDate() + offset);
  return formatDateId(date);
}

function getTodayId() {
  return formatDateId(new Date());
}

function formatTripRange(startDateStr, tripDays) {
  const start = parseDateId(startDateStr);
  const endId = addDays(startDateStr, Math.max(tripDays - 1, 0));
  const end = parseDateId(endId);
  const startText = start.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  const endText = end.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  return `${startText} - ${endText}`;
}

function safeJsonRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function clampTripDays(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TRIP_DAYS;
  return Math.min(Math.max(parsed, 1), 30);
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function createTripDates(startDateStr, tripDays) {
  if (!startDateStr || tripDays < 1) return [];

  return Array.from({ length: tripDays }, (_, index) => {
    const id = addDays(startDateStr, index);
    const date = parseDateId(id);
    const display = date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    });
    return { id, display, dayNumber: index + 1 };
  });
}

function formatAssignedDate(dateId, tripDates) {
  const matchedDate = tripDates.find((date) => date.id === dateId);
  return matchedDate ? `D${matchedDate.dayNumber} · ${matchedDate.display}` : dateId;
}

function formatMiniDate(dateId) {
  const date = parseDateId(dateId);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function isMonday(dateId) {
  return parseDateId(dateId).getDay() === 1;
}

const QINGDAO_LOCATION = {
  label: '青岛市',
  query: 'Qingdao',
  weatherLabel: '青岛市',
  latitude: 36.0671,
  longitude: 120.3826,
};

const WEIHAI_LOCATION = {
  label: '威海市',
  query: 'Weihai',
  weatherLabel: '威海市',
  latitude: 37.5135,
  longitude: 122.1217,
};

const YANTAI_LOCATION = {
  label: '烟台市',
  query: 'Yantai',
  weatherLabel: '烟台市',
  latitude: 37.4638,
  longitude: 121.4479,
};

const HANGZHOU_LOCATION = {
  label: '杭州市',
  query: 'Hangzhou',
  weatherLabel: '杭州市',
  latitude: 30.2741,
  longitude: 120.1551,
};

function place(baseLocation, label) {
  return { ...baseLocation, label };
}

function createInitialPlans(startDate) {
  const dates = Array.from({ length: DEFAULT_TRIP_DAYS }, (_, index) => addDays(startDate, index));
  const museumClosed = dates.filter(isMonday);

  return [
    {
      id: 'sunrise-sea',
      name: '海边日出和早市',
      description: '早起看日出，顺路去早市吃早餐，上午留给海边散步。',
      priority: 'must',
      location: { ...QINGDAO_LOCATION, label: '青岛海边' },
      stops: [
        { time: '05:00', title: '栈桥看日出', location: place(QINGDAO_LOCATION, '栈桥海边'), note: '提前看潮汐和云量，适合天气好时执行' },
        { time: '07:10', title: '团岛早市早餐', location: place(QINGDAO_LOCATION, '团岛农贸市场'), note: '海鲜馄饨、甜沫或烧饼，作为早起奖励' },
        { time: '09:00', title: '八大峡海岸散步', location: place(QINGDAO_LOCATION, '八大峡广场'), note: '慢慢走回酒店，上午结束前留休息时间' },
      ],
      available_dates: dates.slice(0, 2),
      time_window: '05:00-11:00',
      duration: '半天',
      intensity: 'normal',
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['rain', 'heavy_rain', 'storm', 'fog', 'windy'],
      },
      conflicts: ['lazy-beach'],
      tags: ['户外', '清晨'],
    },
    {
      id: 'weihai-coast-day',
      name: '青岛到威海海岸线',
      description: '早上从青岛出发，高铁到威海串联海边公园和观景台，跨城天气要一起看。',
      priority: 'must',
      location: { ...WEIHAI_LOCATION, label: '威海海岸线' },
      stops: [
        { time: '07:20', title: '青岛站出发', location: place(QINGDAO_LOCATION, '青岛站'), note: '预留早餐和进站时间，车票约束强' },
        { time: '09:10', title: '威海站到达', location: place(WEIHAI_LOCATION, '威海站'), note: '先确认返程车次，避免晚上太被动' },
        { time: '10:20', title: '火炬八街和海水浴场', location: place(WEIHAI_LOCATION, '火炬八街'), note: '主拍照点，风大或雨大体验会明显下降' },
        { time: '13:00', title: '环海路午餐', location: place(WEIHAI_LOCATION, '环海路'), note: '中午不赶路，给下午海岸线留体力' },
        { time: '15:30', title: '猫头山观景台', location: place(WEIHAI_LOCATION, '猫头山'), note: '看风和能见度，雾天直接降级为市区轻量版' },
        { time: '18:20', title: '威海站返程', location: place(WEIHAI_LOCATION, '威海站'), note: '返程后不再叠加夜市，避免当天过载' },
      ],
      available_dates: dates.slice(1, 4),
      time_window: '07:20-21:00',
      duration: '全天跨城',
      intensity: 'hard',
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['drizzle', 'rain', 'heavy_rain', 'storm', 'windy', 'fog'],
      },
      conflicts: ['night-market', 'old-town-walk'],
      tags: ['跨城', '高铁', '户外多点'],
    },
    {
      id: 'museum-day',
      name: '市区博物馆和咖啡',
      description: '把雨天或高温天留给室内，逛完博物馆附近找咖啡店休息。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛市博物馆' },
      stops: [
        { time: '10:30', title: '青岛市博物馆', location: place(QINGDAO_LOCATION, '青岛市博物馆'), note: '闭馆日需要避开，适合雨天或高温' },
        { time: '13:00', title: '石老人咖啡午休', location: place(QINGDAO_LOCATION, '石老人咖啡街区'), note: '午餐和休息，不把下午排满' },
        { time: '15:00', title: '雕塑园短逛', location: place(QINGDAO_LOCATION, '青岛雕塑园'), note: '天气可接受时加一段轻量户外' },
      ],
      available_dates: dates,
      closed_dates: museumClosed,
      time_window: '10:00-16:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['rain', 'drizzle', 'hot', 'cold'],
        ok: ['cloudy', 'partly_cloudy', 'sunny'],
        blocked: [],
      },
      conflicts: [],
      tags: ['室内', museumClosed.length ? '周一闭馆' : '闭馆日留意'],
    },
    {
      id: 'old-town-walk',
      name: '老城漫步和小店',
      description: '走老街、拍照、找小店，天气太热或下雨时可以换成室内备用。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛老城' },
      stops: [
        { time: '15:00', title: '大学路和鱼山路', location: place(QINGDAO_LOCATION, '大学路'), note: '拍照和小店，太阳太强会比较累' },
        { time: '16:40', title: '信号山看城市线', location: place(QINGDAO_LOCATION, '信号山公园'), note: '有爬坡，雨天或高温不推荐' },
        { time: '18:30', title: '黄县路晚餐', location: place(QINGDAO_LOCATION, '黄县路'), note: '晚饭后可以顺路散步回酒店' },
      ],
      available_dates: dates.slice(2, 5),
      time_window: '15:00-20:00',
      duration: '半天',
      intensity: 'hard',
      weather_rules: {
        best: ['partly_cloudy', 'cloudy'],
        ok: ['sunny'],
        blocked: ['rain', 'heavy_rain', 'hot', 'storm'],
      },
      conflicts: [],
      tags: ['步行', '街区'],
    },
    {
      id: 'night-market',
      name: '夜市海鲜和烤肉',
      description: '最后一晚安排海鲜和烤肉，适合接在白天较轻松的安排后面。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛夜市' },
      stops: [
        { time: '18:00', title: '台东夜市小吃', location: place(QINGDAO_LOCATION, '台东夜市'), note: '先垫肚子，避开太晚排队' },
        { time: '20:00', title: '啤酒街烤肉', location: place(QINGDAO_LOCATION, '登州路啤酒街'), note: '雨不大也能执行，暴雨就换室内' },
      ],
      available_dates: dates.slice(3, 5),
      time_window: '18:00-22:00',
      duration: '晚上',
      intensity: 'normal',
      weather_rules: {
        best: ['cloudy', 'partly_cloudy', 'sunny'],
        ok: ['hot', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
      tags: ['美食', '夜间'],
    },
    {
      id: 'lazy-beach',
      name: '慢速海滩躺平',
      description: '睡到自然醒，下午去海滩喝饮料，晚点再看落日。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛海边' },
      stops: [
        { time: '14:30', title: '石老人海滩躺平', location: place(QINGDAO_LOCATION, '石老人海水浴场'), note: '低体力备用，不抢早上时间' },
        { time: '17:00', title: '小麦岛看落日', location: place(QINGDAO_LOCATION, '小麦岛公园'), note: '适合晴天或少云，大风就取消' },
      ],
      available_dates: dates.slice(1, 5),
      time_window: '14:00-19:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy', 'hot'],
        blocked: ['rain', 'heavy_rain', 'storm', 'windy'],
      },
      conflicts: ['sunrise-sea'],
      tags: ['低体力', '户外'],
    },
    {
      id: 'rainy-cafe',
      name: '雨天咖啡和书店',
      description: '下雨或太累时切换到室内，留出空白给临时调整。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛市区' },
      stops: [
        { time: '13:30', title: '书店和咖啡', location: place(QINGDAO_LOCATION, '万象城书店'), note: '恢复体力，适合雨天或临时调整' },
        { time: '16:00', title: '商场补给', location: place(QINGDAO_LOCATION, '青岛万象城'), note: '买伞、防晒、药品等旅行补给' },
      ],
      available_dates: dates,
      time_window: '13:00-18:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['rain', 'drizzle', 'cold'],
        ok: ['cloudy', 'hot', 'heavy_rain'],
        blocked: [],
      },
      conflicts: [],
      tags: ['室内', '恢复'],
    },
    {
      id: 'yantai-penglai-backup',
      name: '烟台蓬莱跨城备用',
      description: '如果天气特别好且体力在线，可以临时升级成烟台蓬莱一日线，否则不要硬排。',
      priority: 'backup',
      location: { ...YANTAI_LOCATION, label: '烟台蓬莱' },
      stops: [
        { time: '07:00', title: '青岛北站出发', location: place(QINGDAO_LOCATION, '青岛北站'), note: '跨城备用，前一晚再决定是否执行' },
        { time: '09:30', title: '烟台站换乘', location: place(YANTAI_LOCATION, '烟台站'), note: '交通不确定性高，必须留缓冲' },
        { time: '11:00', title: '蓬莱阁海边', location: place(YANTAI_LOCATION, '蓬莱阁'), note: '户外主体验，阴雨和大风直接不选' },
        { time: '14:30', title: '八仙过海景区外圈', location: place(YANTAI_LOCATION, '八仙过海景区'), note: '根据体力选择走完整圈或只看海边' },
        { time: '17:40', title: '返程回青岛', location: place(YANTAI_LOCATION, '烟台南站'), note: '当天结束较晚，后续计划需要降强度' },
      ],
      available_dates: dates.slice(2, 5),
      time_window: '07:00-22:00',
      duration: '全天跨城',
      intensity: 'hard',
      weather_rules: {
        best: ['sunny'],
        ok: ['partly_cloudy'],
        blocked: ['cloudy', 'drizzle', 'rain', 'heavy_rain', 'storm', 'windy', 'fog', 'hot'],
      },
      conflicts: ['weihai-coast-day', 'old-town-walk', 'night-market'],
      tags: ['跨城备用', '交通约束', '高体力'],
    },
    {
      id: 'seafood-market',
      name: '海鲜市场临时加餐',
      description: '按当天距离和排队情况决定，适合插在交通顺路的时候。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛海鲜市场' },
      stops: [
        { time: '11:00', title: '团岛市场买海鲜', location: place(QINGDAO_LOCATION, '团岛农贸市场'), note: '看当天人流，顺路才安排' },
        { time: '12:30', title: '附近加工店午餐', location: place(QINGDAO_LOCATION, '团岛市场周边'), note: '用餐时间可压缩，作为插入型计划' },
      ],
      available_dates: dates,
      time_window: '11:00-14:00',
      duration: '2小时',
      intensity: 'easy',
      weather_rules: {
        best: ['cloudy', 'rain', 'hot'],
        ok: ['sunny', 'partly_cloudy', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
      tags: ['美食', '可插入'],
    },
  ];
}

function createInitialSchedule(startDate) {
  return {
    [addDays(startDate, 0)]: { planId: 'sunrise-sea' },
    [addDays(startDate, 1)]: { planId: 'weihai-coast-day' },
    [addDays(startDate, 2)]: { planId: 'museum-day' },
    [addDays(startDate, 3)]: { planId: 'old-town-walk' },
    [addDays(startDate, 4)]: { planId: 'night-market' },
  };
}

function createHangzhouPlans(startDate) {
  const dates = Array.from({ length: 3 }, (_, index) => addDays(startDate, index));
  const museumClosed = dates.filter(isMonday);

  return [
    {
      id: 'west-lake-walk',
      name: '西湖环线和日落',
      description: '从湖滨慢慢走到孤山，天气好时把日落留给湖边。',
      priority: 'must',
      location: { ...HANGZHOU_LOCATION, label: '杭州西湖' },
      stops: [
        { time: '15:00', title: '湖滨码头出发', location: place(HANGZHOU_LOCATION, '湖滨码头'), note: '下午开始走，避开正午暴晒' },
        { time: '16:30', title: '孤山和白堤', location: place(HANGZHOU_LOCATION, '孤山'), note: '主步行段，阴天或少云最舒服' },
        { time: '18:20', title: '断桥附近看日落', location: place(HANGZHOU_LOCATION, '断桥残雪'), note: '天气好时保留，雨天切室内' },
      ],
      available_dates: dates,
      time_window: '15:00-20:00',
      duration: '半天',
      intensity: 'normal',
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['rain', 'heavy_rain', 'storm', 'hot', 'windy'],
      },
      conflicts: ['canal-night'],
      tags: ['户外', '日落'],
    },
    {
      id: 'lingyin-temple',
      name: '灵隐寺和飞来峰',
      description: '需要早出发，避开午后人流，雨天石阶湿滑时不建议去。',
      priority: 'must',
      location: { ...HANGZHOU_LOCATION, label: '杭州灵隐寺' },
      stops: [
        { time: '08:00', title: '灵隐寺入园', location: place(HANGZHOU_LOCATION, '灵隐寺'), note: '早到减少排队和人流压力' },
        { time: '10:00', title: '飞来峰石刻', location: place(HANGZHOU_LOCATION, '飞来峰'), note: '石阶和山路，雨天风险更高' },
        { time: '12:00', title: '法云安缦周边午餐', location: place(HANGZHOU_LOCATION, '法云村'), note: '中午收束，下午留恢复时间' },
      ],
      available_dates: dates.slice(0, 2),
      time_window: '08:00-13:00',
      duration: '半天',
      intensity: 'hard',
      weather_rules: {
        best: ['cloudy', 'partly_cloudy'],
        ok: ['sunny'],
        blocked: ['rain', 'heavy_rain', 'storm', 'hot'],
      },
      conflicts: [],
      tags: ['户外', '早出发'],
    },
    {
      id: 'museum-tea',
      name: '博物馆和茶馆',
      description: '雨天或太热时切到室内，下午找茶馆慢慢休息。',
      priority: 'preferred',
      location: { ...HANGZHOU_LOCATION, label: '杭州博物馆' },
      stops: [
        { time: '10:30', title: '浙江省博物馆', location: place(HANGZHOU_LOCATION, '浙江省博物馆'), note: '闭馆日避开，雨天优先级上升' },
        { time: '13:30', title: '中国茶叶博物馆', location: place(HANGZHOU_LOCATION, '中国茶叶博物馆'), note: '室内和轻量步行结合' },
        { time: '16:00', title: '茶馆休息', location: place(HANGZHOU_LOCATION, '龙井路茶馆'), note: '为晚上留体力' },
      ],
      available_dates: dates,
      closed_dates: museumClosed,
      time_window: '10:00-17:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['rain', 'drizzle', 'hot', 'cold'],
        ok: ['cloudy', 'partly_cloudy'],
        blocked: [],
      },
      conflicts: [],
      tags: ['室内', museumClosed.length ? '周一闭馆' : '闭馆日留意'],
    },
    {
      id: 'canal-night',
      name: '运河夜游和小吃',
      description: '晚上坐船或沿河散步，和西湖日落二选一更从容。',
      priority: 'preferred',
      location: { ...HANGZHOU_LOCATION, label: '杭州运河' },
      stops: [
        { time: '18:00', title: '小河直街晚餐', location: place(HANGZHOU_LOCATION, '小河直街'), note: '先吃饭，避免夜游太赶' },
        { time: '19:30', title: '拱宸桥散步', location: place(HANGZHOU_LOCATION, '拱宸桥'), note: '沿河夜景，雨大时取消' },
        { time: '20:30', title: '运河游船', location: place(HANGZHOU_LOCATION, '武林门码头'), note: '看当天船班和排队情况' },
      ],
      available_dates: dates.slice(1, 3),
      time_window: '18:00-22:00',
      duration: '晚上',
      intensity: 'easy',
      weather_rules: {
        best: ['cloudy', 'partly_cloudy'],
        ok: ['sunny', 'drizzle'],
        blocked: ['rain', 'heavy_rain', 'storm'],
      },
      conflicts: ['west-lake-walk'],
      tags: ['夜间', '美食'],
    },
    {
      id: 'mall-reset',
      name: '商场补给和休整',
      description: '留给暴雨、高温或临时疲惫时用，顺便补给和吃饭。',
      priority: 'backup',
      location: { ...HANGZHOU_LOCATION, label: '杭州湖滨商圈' },
      stops: [
        { time: '12:00', title: '湖滨银泰午餐', location: place(HANGZHOU_LOCATION, '湖滨银泰 in77'), note: '室内备用，适合高温或雨天' },
        { time: '15:00', title: '嘉里中心补给', location: place(HANGZHOU_LOCATION, '杭州嘉里中心'), note: '补给和休息，给后续计划回血' },
      ],
      available_dates: dates,
      time_window: '12:00-20:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['rain', 'heavy_rain', 'hot', 'cold'],
        ok: ['cloudy', 'drizzle'],
        blocked: [],
      },
      conflicts: [],
      tags: ['室内', '恢复'],
    },
  ];
}

function createHangzhouSchedule(startDate) {
  return {
    [addDays(startDate, 0)]: { planId: 'lingyin-temple' },
    [addDays(startDate, 1)]: { planId: 'west-lake-walk' },
    [addDays(startDate, 2)]: { planId: 'canal-night' },
  };
}

function createTripId() {
  return `trip-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function createTripSnapshot(name = '青岛 5 日', startDate = getTodayId(), id = createTripId()) {
  return {
    id,
    name,
    startDateStr: startDate,
    tripDays: DEFAULT_TRIP_DAYS,
    plans: createInitialPlans(startDate),
    schedule: createInitialSchedule(startDate),
    dayWeather: {},
    weatherData: {},
  };
}

function createDebugTrips(baseDate = getTodayId()) {
  const hangzhouStartDate = addDays(baseDate, 3);

  return [
    createTripSnapshot('青岛 5 日', baseDate, 'trip-qingdao'),
    {
      id: 'trip-hangzhou',
      name: '杭州 3 日调试',
      startDateStr: hangzhouStartDate,
      tripDays: 3,
      plans: createHangzhouPlans(hangzhouStartDate),
      schedule: createHangzhouSchedule(hangzhouStartDate),
      dayWeather: {},
      weatherData: {},
    },
  ];
}

function normalizeTripSnapshot(trip, index = 0) {
  const startDate = trip.startDateStr || trip.startDate || getTodayId();
  const tripDays = clampTripDays(trip.tripDays || trip.days || DEFAULT_TRIP_DAYS);

  return {
    id: trip.id || `trip-${index + 1}`,
    name: trip.name || trip.title || `旅行计划 ${index + 1}`,
    startDateStr: startDate,
    tripDays,
    plans: Array.isArray(trip.plans) ? trip.plans : createInitialPlans(startDate),
    schedule: normalizeSchedule(trip.schedule || createInitialSchedule(startDate)),
    dayWeather: trip.dayWeather || {},
    weatherData: trip.weatherData || {},
  };
}

function inferWeatherLabel(location) {
  if (location.weatherLabel || location.weather_label || location.city) {
    return location.weatherLabel || location.weather_label || location.city;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const isQingdao =
    location.query === QINGDAO_LOCATION.query ||
    (Math.abs(latitude - QINGDAO_LOCATION.latitude) < 0.01 && Math.abs(longitude - QINGDAO_LOCATION.longitude) < 0.01);

  return isQingdao ? QINGDAO_LOCATION.weatherLabel : undefined;
}

function normalizeLocation(location, area) {
  if (typeof location === 'string') {
    return { label: location, query: location };
  }

  if (location && typeof location === 'object') {
    return {
      label: location.label || location.name || location.query || area || '待定地点',
      query: location.query || location.label || location.name || area || '',
      weatherLabel: inferWeatherLabel(location),
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }

  return { label: area || '待定地点', query: area || '' };
}

function hasCoordinates(location) {
  return location.latitude !== undefined && location.latitude !== null && location.longitude !== undefined && location.longitude !== null;
}

function getWeatherLocationKey(location) {
  if (location.query) return location.query;
  if (hasCoordinates(location)) return `${location.latitude},${location.longitude}`;
  return location.label;
}

function getWeatherLocationLabel(location) {
  return location.weatherLabel || location.query || location.label;
}

function normalizePlanStops(stops, fallbackLocation) {
  if (!Array.isArray(stops)) return [];

  return stops
    .filter(Boolean)
    .map((stop, index) => {
      if (typeof stop === 'string') {
        return {
          id: `stop-${index + 1}`,
          time: '',
          title: stop,
          location: fallbackLocation,
          note: '',
          weatherRelevant: true,
        };
      }

      const location = normalizeLocation(stop.location || stop.place || fallbackLocation, fallbackLocation.label);
      const time = stop.time || stop.time_window || stop.window || (stop.start && stop.end ? `${stop.start}-${stop.end}` : stop.start || '');

      return {
        id: stop.id || `stop-${index + 1}`,
        time,
        title: stop.title || stop.name || location.label,
        location,
        note: stop.note || stop.description || '',
        weatherRelevant: stop.weather_relevant !== false && stop.weatherRelevant !== false,
      };
    });
}

function uniqueLocations(locations) {
  const locationsByKey = new Map();

  locations.filter(Boolean).forEach((location) => {
    if (!location.query && !hasCoordinates(location) && !location.label) return;

    const key = getWeatherLocationKey(location);
    if (!locationsByKey.has(key)) {
      locationsByKey.set(key, {
        ...location,
        weatherLabel: getWeatherLocationLabel(location),
      });
    }
  });

  return Array.from(locationsByKey.values());
}

function getPlanWeatherLocations(plan) {
  const stopLocations = toArray(plan.stops)
    .filter((stop) => stop.weatherRelevant)
    .map((stop) => stop.location);

  return uniqueLocations([...stopLocations, plan.location]);
}

function getPlanLocationSummary(plan) {
  const stopLocations = toArray(plan.stops).map((stop) => stop.location).filter(Boolean);
  const cityLabels = uniq(stopLocations.map(getWeatherLocationLabel));
  const labels = uniq(stopLocations.map((location) => location.label));

  if (cityLabels.length > 1) return `${cityLabels.join(' / ')} · ${labels.length} 处`;
  if (labels.length > 1) return `${labels[0]}等 ${labels.length} 处`;
  return labels[0] || plan.location.label;
}

function normalizeWeatherRules(plan) {
  if (plan.weather_rules) {
    return {
      best: toArray(plan.weather_rules.best),
      ok: toArray(plan.weather_rules.ok),
      blocked: toArray(plan.weather_rules.blocked),
    };
  }

  const legacyWeather = toArray(plan.weather);
  const best = legacyWeather.filter((item) => item !== 'any');
  return {
    best: best.length ? best : ['sunny', 'partly_cloudy'],
    ok: legacyWeather.includes('any') ? ['sunny', 'partly_cloudy', 'cloudy', 'drizzle'] : ['cloudy'],
    blocked: ['heavy_rain', 'storm'],
  };
}

function normalizePlan(plan, index = 0, tripDates = []) {
  const tripDateIds = tripDates.map((date) => date.id);
  const availableDates = toArray(plan.available_dates || plan.suitable_days);
  const priority = plan.must_go || plan.must ? 'must' : plan.priority || 'preferred';
  const rawIntensity = plan.intensity || LEGACY_INTENSITY_MAP[plan.pace] || plan.pace;
  const intensity = INTENSITY_META[rawIntensity] ? rawIntensity : 'normal';
  const rawStops = Array.isArray(plan.stops) ? plan.stops : plan.itinerary;
  const firstStopWithLocation = Array.isArray(rawStops)
    ? rawStops.find((stop) => stop?.location || stop?.place)
    : null;
  const fallbackLocation = normalizeLocation(plan.location || firstStopWithLocation?.location || firstStopWithLocation?.place, plan.area);
  const stops = normalizePlanStops(rawStops, fallbackLocation);
  const primaryStop = stops.find((stop) => stop.weatherRelevant) || stops[0];
  const location = normalizeLocation(plan.location || primaryStop?.location || fallbackLocation, plan.area);

  return {
    id: plan.id || `plan-${Date.now()}-${index}`,
    name: plan.name || '未命名计划',
    description: plan.description || '暂无说明。',
    priority: PRIORITY_META[priority] ? priority : 'preferred',
    location,
    stops,
    available_dates: availableDates.length ? availableDates : tripDateIds,
    closed_dates: toArray(plan.closed_dates || plan.unavailable_days),
    time_window: plan.time_window || plan.window || '弹性',
    duration: plan.duration || '半天',
    intensity,
    weather_rules: normalizeWeatherRules(plan),
    conflicts: toArray(plan.conflicts || plan.mutually_exclusive_with),
    tags: toArray(plan.tags),
  };
}

function normalizeSchedule(schedule) {
  return Object.fromEntries(
    Object.entries(schedule || {})
      .filter(([, value]) => Boolean(value))
      .map(([dateId, value]) => {
        if (typeof value === 'string') {
          return [dateId, { planId: value }];
        }
        return [
          dateId,
          {
            planId: value.planId || value.id,
          },
        ];
      })
      .filter(([, value]) => Boolean(value.planId)),
  );
}

function getSmartSelectedDate(startDate, tripDays) {
  const tripDateIds = createTripDates(startDate, tripDays).map((date) => date.id);
  const today = getTodayId();

  if (tripDateIds.includes(today)) return today;
  return tripDateIds[0] || startDate;
}

function loadInitialState() {
  const currentVersion = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  const storedTrips = safeJsonRead(STORAGE_KEYS.trips, null);
  const trips = currentVersion === APP_SCHEMA_VERSION && Array.isArray(storedTrips) && storedTrips.length > 0
    ? storedTrips.map(normalizeTripSnapshot)
    : createDebugTrips();

  const activeTripId = localStorage.getItem(STORAGE_KEYS.currentTrip) || trips[0].id;
  const activeTrip = trips.find((trip) => trip.id === activeTripId) || trips[0];

  return {
    trips,
    activeTripId: activeTrip.id,
    tripName: activeTrip.name,
    startDate: activeTrip.startDateStr,
    tripDays: activeTrip.tripDays,
    plans: activeTrip.plans,
    schedule: activeTrip.schedule,
    selectedDate: getSmartSelectedDate(activeTrip.startDateStr, activeTrip.tripDays),
    dayWeather: activeTrip.dayWeather,
    weatherData: activeTrip.weatherData,
  };
}

function parseImportJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

function getWeatherOption(condition) {
  return WEATHER_OPTIONS.find((option) => option.id === condition);
}

function weatherLabel(condition) {
  return getWeatherOption(condition)?.label || condition || '未知';
}

function planConflicts(a, b) {
  return a.conflicts.includes(b.id) || b.conflicts.includes(a.id);
}

function classifyWeatherCode(code) {
  if (code === 0) return 'sunny';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ([61, 63, 66, 67, 80, 81].includes(code)) return 'rain';
  if (code === 65 || code === 82) return 'heavy_rain';
  if (code >= 71 && code <= 86) return 'cold';
  if (code >= 95) return 'storm';
  return 'unknown';
}

function buildWeatherSnapshot(day) {
  if (!day) return null;

  const categories = new Set([classifyWeatherCode(day.weatherCode)]);
  if (day.tempMax >= 32 || day.apparentMax >= 34) categories.add('hot');
  if (day.tempMin <= 5 || day.apparentMin <= 3) categories.add('cold');
  if (day.windMax >= 35) categories.add('windy');
  if (day.precipitationSum >= 12 || day.precipitationProbability >= 80) categories.add('heavy_rain');
  if (day.precipitationSum > 0 && day.precipitationSum < 4 && day.precipitationProbability >= 35) categories.add('drizzle');
  if (day.precipitationSum >= 4 && day.precipitationSum < 12) categories.add('rain');

  const primary = categories.has('storm')
    ? 'storm'
    : categories.has('heavy_rain')
      ? 'heavy_rain'
      : categories.has('rain')
        ? 'rain'
        : categories.has('drizzle')
          ? 'drizzle'
          : classifyWeatherCode(day.weatherCode);

  return {
    primary,
    categories: Array.from(categories),
    summary: `${weatherLabel(primary)} ${Math.round(day.tempMin)}-${Math.round(day.tempMax)}°C / 降水${Math.round(day.precipitationProbability || 0)}% / 风${Math.round(day.windMax || 0)}km/h`,
    source: 'auto',
  };
}

function pickPrimaryWeatherCategory(categories) {
  if (categories.includes('storm')) return 'storm';
  if (categories.includes('heavy_rain')) return 'heavy_rain';
  if (categories.includes('rain')) return 'rain';
  if (categories.includes('drizzle')) return 'drizzle';
  if (categories.includes('windy')) return 'windy';
  if (categories.includes('fog')) return 'fog';
  if (categories.includes('hot')) return 'hot';
  if (categories.includes('cold')) return 'cold';
  if (categories.includes('sunny')) return 'sunny';
  if (categories.includes('partly_cloudy')) return 'partly_cloudy';
  if (categories.includes('cloudy')) return 'cloudy';
  return categories[0] || 'unknown';
}

function buildAggregatedWeatherSnapshot(entries) {
  if (entries.length === 1) return entries[0].snapshot;

  const categories = uniq(entries.flatMap((entry) => entry.snapshot.categories));
  const summary = entries
    .map(({ location, snapshot }) => `${location.label} ${snapshot.summary}`)
    .join('；');

  return {
    primary: pickPrimaryWeatherCategory(categories),
    categories,
    summary,
    source: 'auto',
  };
}

function manualWeatherSnapshot(condition) {
  if (!condition || condition === 'unknown') return null;
  return {
    primary: condition,
    categories: [condition],
    summary: `手动：${weatherLabel(condition)}`,
    source: 'manual',
  };
}

function getPlanWeatherSnapshot(plan, dateId, weatherData, dayWeather) {
  const manual = manualWeatherSnapshot(dayWeather[dateId]);
  if (manual) return manual;

  const snapshots = getPlanWeatherLocations(plan)
    .map((location) => {
      const key = getWeatherLocationKey(location);
      const autoDay = weatherData[key]?.dailyByDate?.[dateId];
      const snapshot = buildWeatherSnapshot(autoDay);
      return snapshot ? { location, snapshot } : null;
    })
    .filter(Boolean);

  if (!snapshots.length) return null;
  return buildAggregatedWeatherSnapshot(snapshots);
}

function evaluateWeather(plan, dateId, weatherData, dayWeather) {
  const snapshot = getPlanWeatherSnapshot(plan, dateId, weatherData, dayWeather);
  if (!snapshot) return { level: 'unknown', label: '天气待确认', snapshot: null };

  const categories = snapshot.categories;
  const { best, ok, blocked } = plan.weather_rules;

  if (categories.some((category) => blocked.includes(category))) {
    return { level: 'blocked', label: '天气不合适', snapshot };
  }

  if (categories.some((category) => best.includes(category))) {
    return { level: 'best', label: '天气很适合', snapshot };
  }

  if (ok.includes('any') || categories.some((category) => ok.includes(category))) {
    return { level: 'ok', label: '天气可以', snapshot };
  }

  return { level: 'mismatch', label: '天气一般', snapshot };
}

function getDayInsight(plan, dateId, schedule, plansById, weatherData, dayWeather) {
  if (!plan) {
    return {
      level: 'empty',
      label: '',
      weatherText: '留给临时调整',
      riskText: '',
      issueCount: 0,
    };
  }

  const weather = evaluateWeather(plan, dateId, weatherData, dayWeather);
  const issues = getDateHardIssues(plan, dateId, schedule, plansById, weatherData, dayWeather, {
    ignoreOccupancy: true,
  });
  const hasHardIssue = issues.length > 0;
  const isCritical = hasHardIssue && plan.priority === 'must';
  const weatherText = weather.snapshot?.summary || '未查询天气';

  return {
    level: isCritical ? 'critical' : hasHardIssue ? 'danger' : weather.level,
    label: hasHardIssue ? '建议调整' : '',
    weatherText,
    riskText: issues[0] || (weather.level === 'mismatch' ? '天气不是最理想' : weather.level === 'unknown' ? '先确认天气' : ''),
    riskTone: issues.length ? 'danger' : weather.level === 'mismatch' || weather.level === 'unknown' ? 'notice' : '',
    issueCount: issues.length,
  };
}

function getCalendarDayState(plan, insight) {
  if (!plan) return { key: 'empty', label: '', ariaLabel: '未安排' };

  if (insight.issueCount > 0 || ['blocked', 'danger', 'critical'].includes(insight.level)) {
    return { key: 'adjust', label: '调整', ariaLabel: '需要调整' };
  }

  if (['unknown', 'mismatch'].includes(insight.level)) {
    return { key: 'notice', label: '', ariaLabel: '天气或条件待确认' };
  }

  return { key: 'planned', label: '', ariaLabel: '已安排' };
}

function getDateHardIssues(plan, dateId, schedule, plansById, weatherData, dayWeather, options = {}) {
  const issues = [];
  const entry = schedule[dateId];
  const currentPlanId = entry?.planId;

  if (!plan.available_dates.includes(dateId)) issues.push('不在可去日期');
  if (plan.closed_dates.includes(dateId)) issues.push('当天不可用/闭馆');

  if (!options.ignoreOccupancy && currentPlanId && currentPlanId !== plan.id) {
    issues.push('当天已有安排');
  }

  Object.entries(schedule).forEach(([otherDateId, otherEntry]) => {
    if (!otherEntry?.planId || otherDateId === dateId) return;
    const otherPlan = plansById.get(otherEntry.planId);
    if (!otherPlan) return;
    if (otherPlan.id === plan.id) issues.push(`已安排在 ${otherDateId}`);
    if (planConflicts(plan, otherPlan)) issues.push(`与 ${otherPlan.name} 互斥`);
  });

  const weather = evaluateWeather(plan, dateId, weatherData, dayWeather);
  if (weather.level === 'blocked') issues.push(weather.label);

  return uniq(issues);
}

function getFeasibleDates(plan, tripDates, schedule, plansById, weatherData, dayWeather) {
  return tripDates
    .filter((date) => getDateHardIssues(plan, date.id, schedule, plansById, weatherData, dayWeather).length === 0)
    .map((date) => date.id);
}

function getScheduledRiskTitle(issues) {
  if (issues.some((issue) => issue.includes('天气'))) return '天气不合适';
  if (issues.some((issue) => issue.includes('闭馆') || issue.includes('不可用'))) return '当天不可用';
  if (issues.some((issue) => issue.includes('可去日期') || issue.includes('日期'))) return '日期不合适';
  if (issues.some((issue) => issue.includes('互斥'))) return '和其他安排冲突';
  if (issues.some((issue) => issue.includes('已安排'))) return '已经排在别的日期';
  return '需要调整';
}

function buildRiskItems(plans, tripDates, schedule, plansById, weatherData, dayWeather) {
  const scheduledPlanIds = new Set(Object.values(schedule).map((entry) => entry.planId));

  const scheduledRisks = Object.entries(schedule)
    .map(([dateId, entry]) => {
      const plan = plansById.get(entry.planId);
      if (!plan) return null;

      const issues = getDateHardIssues(plan, dateId, schedule, plansById, weatherData, dayWeather, {
        ignoreOccupancy: true,
      });

      if (!issues.length) return null;

      return {
        plan,
        dateId,
        level: plan.priority === 'must' ? 'critical' : 'warning',
        title: getScheduledRiskTitle(issues),
        reasons: issues,
      };
    })
    .filter(Boolean);

  const unscheduledRisks = plans
    .filter((plan) => plan.priority === 'must' && !scheduledPlanIds.has(plan.id))
    .map((plan) => {
      const feasibleDates = getFeasibleDates(plan, tripDates, schedule, plansById, weatherData, dayWeather);
      if (feasibleDates.length > 0) return null;

      const reasons = uniq(
        tripDates.flatMap((date) =>
          getDateHardIssues(plan, date.id, schedule, plansById, weatherData, dayWeather).slice(0, 2),
        ),
      ).slice(0, 4);

      return {
        plan,
        level: 'critical',
        title: '必去计划没有可安排日期',
        reasons,
      };
    })
    .filter(Boolean)
    .sort((a, b) => PRIORITY_META[b.plan.priority].rank - PRIORITY_META[a.plan.priority].rank);

  return [...scheduledRisks, ...unscheduledRisks].sort((a, b) => {
    const levelRank = { critical: 3, warning: 2, info: 1 };
    const levelDiff = levelRank[b.level] - levelRank[a.level];
    if (levelDiff) return levelDiff;
    return PRIORITY_META[b.plan.priority].rank - PRIORITY_META[a.plan.priority].rank;
  });
}

function buildAssignmentPreview(schedule, dateId, targetPlan, plansById) {
  const nextSchedule = { ...schedule };
  const clearsByDate = new Map();

  Object.entries(schedule).forEach(([otherDateId, entry]) => {
    if (!entry?.planId || otherDateId === dateId) return;
    const otherPlan = plansById.get(entry.planId);
    if (!otherPlan) return;

    const isSamePlan = otherPlan.id === targetPlan.id;
    const isConflict = planConflicts(targetPlan, otherPlan);
    if (!isSamePlan && !isConflict) return;

    clearsByDate.set(otherDateId, {
      dateId: otherDateId,
      plan: otherPlan,
      reason: isSamePlan ? '同一计划被移动' : '计划互斥',
    });
    delete nextSchedule[otherDateId];
  });

  nextSchedule[dateId] = { planId: targetPlan.id };

  return {
    clears: Array.from(clearsByDate.values()),
    nextSchedule,
  };
}

function getRiskIdentity(risk) {
  return `${risk.dateId || 'unscheduled'}:${risk.plan.id}:${risk.title}`;
}

function getPlanPriorityWeight(plan) {
  return PRIORITY_META[plan.priority]?.rank || 1;
}

function getWeatherScore(level) {
  if (level === 'best') return 5;
  if (level === 'ok') return 3;
  if (level === 'mismatch') return 1;
  return 0;
}

function getClearPenalty(clears) {
  return clears.reduce((total, item) => total + getPlanPriorityWeight(item.plan) * 3, 0);
}

function getRiskPenalty(risks) {
  return risks.reduce((total, risk) => {
    const levelPenalty = risk.level === 'critical' ? 16 : 6;
    return total + levelPenalty + getPlanPriorityWeight(risk.plan) * 2;
  }, 0);
}

function getRiskGroupTitle(title) {
  if (title === '必去计划没有可安排日期') return '必去未排';
  return title;
}

function getRiskGroupLabel(risk, tripDates) {
  if (!risk.dateId) return risk.plan.name;
  return `${formatAssignedDate(risk.dateId, tripDates)} · ${risk.plan.name}`;
}

function buildRiskGroups(riskItems, tripDates) {
  const levelRank = { critical: 3, warning: 2, info: 1 };
  const groupsByTitle = new Map();

  riskItems.forEach((risk) => {
    const title = getRiskGroupTitle(risk.title);
    const existing = groupsByTitle.get(title) || {
      title,
      level: risk.level,
      items: [],
      unit: risk.dateId ? '天' : '项',
    };

    if (levelRank[risk.level] > levelRank[existing.level]) existing.level = risk.level;
    if (risk.dateId) existing.unit = '天';
    existing.items.push(getRiskGroupLabel(risk, tripDates));
    groupsByTitle.set(title, existing);
  });

  return Array.from(groupsByTitle.values())
    .map((group) => ({
      ...group,
      items: uniq(group.items),
    }))
    .sort((a, b) => {
      const levelDiff = levelRank[b.level] - levelRank[a.level];
      if (levelDiff) return levelDiff;
      return b.items.length - a.items.length;
    });
}

function parseForecastDaily(data) {
  const daily = data.daily || {};
  const times = daily.time || [];

  return Object.fromEntries(
    times.map((dateId, index) => [
      dateId,
      {
        dateId,
        weatherCode: daily.weather_code?.[index],
        tempMax: daily.temperature_2m_max?.[index],
        tempMin: daily.temperature_2m_min?.[index],
        apparentMax: daily.apparent_temperature_max?.[index],
        apparentMin: daily.apparent_temperature_min?.[index],
        precipitationSum: daily.precipitation_sum?.[index],
        precipitationProbability: daily.precipitation_probability_max?.[index],
        windMax: daily.wind_speed_10m_max?.[index],
        cloudCover: daily.cloud_cover_mean?.[index],
      },
    ]),
  );
}

async function fetchJson(url, errorPrefix) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${errorPrefix}失败`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${errorPrefix}超时`, { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr) {
  if (!tripDates.length) return {};

  const endDate = tripDates[tripDates.length - 1].id;
  const locationsByKey = new Map();

  normalizedPlans.forEach((plan) => {
    getPlanWeatherLocations(plan).forEach((location) => {
      if (!location.query && !hasCoordinates(location)) return;

      const key = getWeatherLocationKey(location);
      if (!locationsByKey.has(key)) {
        locationsByKey.set(key, {
          ...location,
          weatherLabel: getWeatherLocationLabel(location),
        });
      }
    });
  });

  const uniqueLocations = Array.from(locationsByKey.values());

  const nextWeatherData = {};

  for (const location of uniqueLocations) {
    let resolved = location;
    if (!hasCoordinates(resolved)) {
      const searchTerms = uniq([resolved.query, resolved.label, resolved.query?.split(',')[0]]);
      let first = null;

      for (const term of searchTerms) {
        const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
        geoUrl.searchParams.set('name', term);
        geoUrl.searchParams.set('count', '1');
        geoUrl.searchParams.set('language', 'zh');
        geoUrl.searchParams.set('format', 'json');
        const geoData = await fetchJson(geoUrl, `地点查询：${resolved.label}`);
        first = geoData.results?.[0] || null;
        if (first) break;
      }

      if (!first) throw new Error(`找不到地点：${resolved.label}`);
      resolved = {
        ...resolved,
        weatherLabel: resolved.weatherLabel || `${first.name}${first.admin1 ? `, ${first.admin1}` : ''}`,
        latitude: first.latitude,
        longitude: first.longitude,
        timezone: first.timezone,
      };
    }

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', String(resolved.latitude));
    forecastUrl.searchParams.set('longitude', String(resolved.longitude));
    forecastUrl.searchParams.set(
      'daily',
      [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'apparent_temperature_max',
        'apparent_temperature_min',
        'precipitation_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'cloud_cover_mean',
      ].join(','),
    );
    forecastUrl.searchParams.set('timezone', 'auto');
    forecastUrl.searchParams.set('start_date', startDateStr);
    forecastUrl.searchParams.set('end_date', endDate);

    const forecastData = await fetchJson(forecastUrl, `天气查询：${resolved.label}`);

    nextWeatherData[getWeatherLocationKey(location)] = {
      ...resolved,
      label: getWeatherLocationLabel(resolved),
      dailyByDate: parseForecastDaily(forecastData),
      fetchedAt: new Date().toISOString(),
    };
  }

  return nextWeatherData;
}

function App() {
  const [initial] = useState(loadInitialState);
  const [trips, setTrips] = useState(initial.trips);
  const [activeTripId, setActiveTripId] = useState(initial.activeTripId);
  const [tripName, setTripName] = useState(initial.tripName);
  const [startDateStr, setStartDateStr] = useState(initial.startDate);
  const [tripDays, setTripDays] = useState(initial.tripDays);
  const [plans, setPlans] = useState(initial.plans);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [selectedDateId, setSelectedDateId] = useState(initial.selectedDate);
  const [dayWeather, setDayWeather] = useState(initial.dayWeather);
  const [weatherData, setWeatherData] = useState(initial.weatherData);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [mobileRisksOpen, setMobileRisksOpen] = useState(false);
  const [openWeatherEditorDateId, setOpenWeatherEditorDateId] = useState('');
  const [pendingAssignment, setPendingAssignment] = useState(null);
  const [toast, setToast] = useState('');

  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const autoWeatherKeyRef = useRef('');
  const dayTileRefs = useRef(new Map());

  const tripDates = useMemo(
    () => createTripDates(startDateStr, tripDays),
    [startDateStr, tripDays],
  );

  const normalizedPlans = useMemo(
    () => plans.map((plan, index) => normalizePlan(plan, index, tripDates)),
    [plans, tripDates],
  );

  const plansById = useMemo(() => {
    return new Map(normalizedPlans.map((plan) => [plan.id, plan]));
  }, [normalizedPlans]);

  const smartSelectedDateId = useMemo(
    () => getSmartSelectedDate(startDateStr, tripDays),
    [startDateStr, tripDays],
  );

  const selectedDate = useMemo(
    () => tripDates.find((date) => date.id === selectedDateId) || tripDates.find((date) => date.id === smartSelectedDateId) || tripDates[0],
    [smartSelectedDateId, tripDates, selectedDateId],
  );

  const selectedDateEntry = selectedDate ? schedule[selectedDate.id] : null;
  const selectedPlan = selectedDateEntry ? plansById.get(selectedDateEntry.planId) : null;
  const selectedManualWeather = selectedDate ? dayWeather[selectedDate.id] || 'unknown' : 'unknown';
  const selectedWeatherSnapshot = selectedDate && selectedPlan
    ? getPlanWeatherSnapshot(selectedPlan, selectedDate.id, weatherData, dayWeather)
    : null;
  const weatherEditorOpen = Boolean(selectedDate && openWeatherEditorDateId === selectedDate.id);
  const selectedWeatherSummary = selectedWeatherSnapshot?.summary || (weatherLoading ? '正在更新天气' : '尚未获取天气');
  const selectedWeatherSource = selectedWeatherSnapshot?.source === 'manual'
    ? '手动修正'
    : selectedWeatherSnapshot?.source === 'auto'
      ? 'API 天气'
      : '天气待确认';
  const selectedIndex = selectedDate
    ? tripDates.findIndex((date) => date.id === selectedDate.id)
    : -1;

  const riskItems = useMemo(
    () => buildRiskItems(normalizedPlans, tripDates, schedule, plansById, weatherData, dayWeather),
    [dayWeather, normalizedPlans, plansById, schedule, tripDates, weatherData],
  );
  const riskGroups = useMemo(
    () => buildRiskGroups(riskItems, tripDates),
    [riskItems, tripDates],
  );

  const activeTripOption = trips.find((trip) => trip.id === activeTripId);
  const planAssignments = useMemo(() => {
    return new Map(
      Object.entries(schedule)
        .filter(([, entry]) => entry?.planId)
        .map(([dateId, entry]) => [entry.planId, dateId]),
    );
  }, [schedule]);

  const candidates = useMemo(() => {
    if (!selectedDate) return [];
    const currentRiskKeys = new Set(riskItems.map(getRiskIdentity));

    return normalizedPlans
      .map((plan) => {
        const hardReasons = [];
        const notes = [];
        const isCurrent = selectedPlan?.id === plan.id;
        const assignedDateId = planAssignments.get(plan.id) || '';
        const weather = evaluateWeather(plan, selectedDate.id, weatherData, dayWeather);
        const { clears, nextSchedule } = buildAssignmentPreview(schedule, selectedDate.id, plan, plansById);
        const nextRisks = buildRiskItems(normalizedPlans, tripDates, nextSchedule, plansById, weatherData, dayWeather)
          .filter((risk) => risk.level !== 'info');
        const newRisks = nextRisks.filter((risk) => !currentRiskKeys.has(getRiskIdentity(risk)));

        if (!plan.available_dates.includes(selectedDate.id)) hardReasons.push('日期不适合');
        if (plan.closed_dates.includes(selectedDate.id)) hardReasons.push('当天不可用/闭馆');
        if (weather.level === 'blocked') hardReasons.push(weather.label);
        if (weather.level === 'mismatch') notes.push('天气不是推荐条件');
        if (weather.level === 'unknown') notes.push('天气未知');

        const priorityScore = getPlanPriorityWeight(plan) * 3;
        const score = priorityScore + getWeatherScore(weather.level) - getClearPenalty(clears) - getRiskPenalty(newRisks);

        return {
          plan,
          canAssign: hardReasons.length === 0,
          hardReasons: uniq(hardReasons),
          notes: uniq(notes),
          clears,
          newRisks,
          score,
          isCurrent,
          assignedDateId,
          weather,
        };
      })
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        if (a.canAssign !== b.canAssign) return a.canAssign ? -1 : 1;
        return b.score - a.score;
      });
  }, [
    dayWeather,
    normalizedPlans,
    planAssignments,
    plansById,
    riskItems,
    schedule,
    selectedDate,
    selectedPlan,
    tripDates,
    weatherData,
  ]);

  const currentCandidate = candidates.find((candidate) => candidate.isCurrent);
  const switchCandidates = candidates.filter((candidate) => !candidate.isCurrent);
  const availableCandidateCount = switchCandidates.filter((candidate) => candidate.canAssign).length;

  useEffect(() => {
    const currentTrip = {
      id: activeTripId,
      name: tripName || '未命名旅行',
      startDateStr,
      tripDays,
      plans: normalizedPlans,
      schedule: normalizeSchedule(schedule),
      dayWeather,
      weatherData,
    };
    const persistedTrips = trips.map((trip) => (trip.id === activeTripId ? currentTrip : trip));

    localStorage.setItem(STORAGE_KEYS.schemaVersion, APP_SCHEMA_VERSION);
    localStorage.setItem(STORAGE_KEYS.trips, JSON.stringify(persistedTrips));
    localStorage.setItem(STORAGE_KEYS.currentTrip, activeTripId);
  }, [
    activeTripId,
    dayWeather,
    normalizedPlans,
    schedule,
    startDateStr,
    tripName,
    tripDays,
    trips,
    weatherData,
  ]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const notify = (message) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600);
  };

  const getCurrentTripSnapshot = () => ({
    id: activeTripId,
    name: tripName || '未命名旅行',
    startDateStr,
    tripDays,
    plans: normalizedPlans,
    schedule: normalizeSchedule(schedule),
    dayWeather,
    weatherData,
  });

  const applyTripSnapshot = (trip) => {
    const normalizedTrip = normalizeTripSnapshot(trip);
    setActiveTripId(normalizedTrip.id);
    setTripName(normalizedTrip.name);
    setStartDateStr(normalizedTrip.startDateStr);
    setTripDays(normalizedTrip.tripDays);
    setPlans(normalizedTrip.plans);
    setSchedule(normalizedTrip.schedule);
    setDayWeather(normalizedTrip.dayWeather);
    setWeatherData(normalizedTrip.weatherData);
    setSelectedDateId(getSmartSelectedDate(normalizedTrip.startDateStr, normalizedTrip.tripDays));
    setOpenWeatherEditorDateId('');
    setWeatherError('');
  };

  const saveCurrentTripInto = (tripList) => {
    const currentTrip = getCurrentTripSnapshot();
    return tripList.map((trip) => (trip.id === activeTripId ? currentTrip : trip));
  };

  const switchTrip = (nextTripId) => {
    setTripMenuOpen(false);
    if (nextTripId === activeTripId) return;
    const nextTrip = trips.find((trip) => trip.id === nextTripId);
    if (!nextTrip) return;

    setTrips(saveCurrentTripInto(trips));
    applyTripSnapshot(nextTrip);
  };

  const createNewTrip = () => {
    const nextTrip = createTripSnapshot(`旅行计划 ${trips.length + 1}`, getTodayId());
    setTripMenuOpen(false);
    setTrips([...saveCurrentTripInto(trips), nextTrip]);
    applyTripSnapshot(nextTrip);
    setEditorOpen(true);
    notify('新计划已创建');
  };

  const buildAssignmentImpact = (dateId, planId) => {
    const targetPlan = plansById.get(planId);
    if (!targetPlan) return null;

    const { clears, nextSchedule } = buildAssignmentPreview(schedule, dateId, targetPlan, plansById);

    const nextRisks = buildRiskItems(normalizedPlans, tripDates, nextSchedule, plansById, weatherData, dayWeather)
      .filter((risk) => risk.level !== 'info');

    return { clears, nextSchedule, nextRisks, targetPlan, dateId };
  };

  const applySchedule = (nextSchedule, message = '安排已更新') => {
    setSchedule(nextSchedule);
    notify(message);
  };

  const requestAssignPlan = (dateId, planId) => {
    const impact = buildAssignmentImpact(dateId, planId);
    if (!impact) return;

    if (impact.clears.length || impact.nextRisks.length) {
      setPendingAssignment(impact);
      return;
    }

    applySchedule(impact.nextSchedule, '当天方案已更新');
  };

  const confirmPendingAssignment = () => {
    if (!pendingAssignment) return;
    applySchedule(pendingAssignment.nextSchedule, pendingAssignment.clears.length ? '已更新，并清空受影响日期' : '当天方案已更新');
    setPendingAssignment(null);
  };

  const clearDay = (dateId) => {
    setSchedule((current) => {
      const next = { ...current };
      delete next[dateId];
      return next;
    });
    notify('当天安排已清空');
  };

  const pickRecommendedPlan = () => {
    if (!selectedDate) return;
    const assignable = switchCandidates.filter((candidate) => candidate.canAssign);

    if (!assignable.length) {
      notify('这一天没有可替换方案');
      return;
    }

    const selected = assignable[0];
    requestAssignPlan(selectedDate.id, selected.plan.id);
  };

  const selectNeighborDate = (step) => {
    if (selectedIndex < 0) return;
    const next = tripDates[selectedIndex + step];
    if (next) setSelectedDateId(next.id);
  };

  const scrollToScheduleDate = (dateId) => {
    if (!window.matchMedia('(max-width: 560px)').matches) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        dayTileRefs.current.get(dateId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });
  };

  const selectScheduleDate = (dateId, options = {}) => {
    setSelectedDateId(dateId);
    if (options.scroll) scrollToScheduleDate(dateId);
  };

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify('复制失败，请手动选中文本');
    }
  };

  const refreshWeather = async () => {
    if (!tripDates.length) return;
    setWeatherLoading(true);
    setWeatherError('');
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      setWeatherLoading(false);
      setWeatherError('天气更新超时，可稍后重试或先手动设置天气。');
    }, 12000);

    try {
      const nextWeatherData = await fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr);
      if (!timedOut) {
        setWeatherData(nextWeatherData);
        notify('天气已更新');
      }
    } catch (error) {
      if (!timedOut) {
        setWeatherError(error.message);
        notify(error.message);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (!timedOut) setWeatherLoading(false);
    }
  };

  useEffect(() => {
    if (!tripDates.length || !normalizedPlans.length || !window.navigator.onLine) return undefined;

    const lastDateId = tripDates[tripDates.length - 1]?.id;
    const locationKey = normalizedPlans
      .flatMap((plan) => getPlanWeatherLocations(plan))
      .map((location) => `${location.query || location.label}:${location.latitude || ''}:${location.longitude || ''}`)
      .sort()
      .join('|');
    const autoWeatherKey = `${startDateStr}|${lastDateId}|${locationKey}`;

    if (autoWeatherKeyRef.current === autoWeatherKey) return undefined;
    autoWeatherKeyRef.current = autoWeatherKey;

    let cancelled = false;
    let timedOut = false;
    let settled = false;
    setWeatherLoading(true);
    setWeatherError('');
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      if (!cancelled) {
        setWeatherLoading(false);
        setWeatherError('自动天气更新超时，可稍后重试或先手动设置天气。');
      }
    }, 12000);

    fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr)
      .then((nextWeatherData) => {
        if (!cancelled && !timedOut) setWeatherData(nextWeatherData);
      })
      .catch((error) => {
        if (!cancelled && !timedOut) setWeatherError(`自动天气更新失败：${error.message}`);
      })
      .finally(() => {
        settled = true;
        window.clearTimeout(timeoutId);
        if (!cancelled && !timedOut) setWeatherLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (!settled && autoWeatherKeyRef.current === autoWeatherKey) autoWeatherKeyRef.current = '';
      setWeatherLoading(false);
    };
  }, [normalizedPlans, startDateStr, tripDates]);

  const copySystemPrompt = () => {
    const prompt = `你是旅行动态规划助手。请只输出 JSON，不要输出解释文字。
JSON 格式如下：
{
  "plans": [
    {
      "id": "unique_plan_id",
      "name": "短标题",
      "description": "当天做什么，适合什么情况",
      "priority": "must | preferred | backup | optional",
      "location": { "label": "地点展示名", "query": "可被天气 API 搜索的城市/地点" },
      "stops": [
        {
          "time": "09:30",
          "title": "节点标题",
          "location": { "label": "具体地点", "query": "可被天气 API 搜索的城市/地点" },
          "note": "这个节点做什么",
          "weather_relevant": true
        }
      ],
      "available_dates": ["YYYY-MM-DD"],
      "closed_dates": ["YYYY-MM-DD"],
      "time_window": "10:00-16:00",
      "duration": "半天",
      "intensity": "easy | normal | hard",
      "weather_rules": {
        "best": ["sunny", "partly_cloudy", "cloudy", "drizzle", "rain", "heavy_rain", "hot", "cold", "windy"],
        "ok": ["..."],
        "blocked": ["..."]
      },
      "conflicts": ["other_plan_id"],
      "tags": ["标签"],
      "assigned_day": "YYYY-MM-DD"
    }
  ]
}`;
    copyText(prompt, 'AI 规则已复制');
  };

  const copyDayPrompt = () => {
    if (!selectedDate) return;
    const availablePlans = switchCandidates
      .filter((candidate) => candidate.canAssign)
      .map(({ plan, score, notes, weather, assignedDateId }) => ({
        ...plan,
        assigned_day: assignedDateId || null,
        recommendation_score: score,
        notes,
        weather_status: weather.label,
      }));

    const prompt = `我正在旅行中调整 ${selectedDate.display} (${selectedDate.id}) 的安排。
当天状态：
- 天气：${selectedWeatherSummary}（${selectedWeatherSource}）
- 已安排计划：${selectedPlan?.name || '无'}

当前可选计划：
${JSON.stringify(availablePlans, null, 2)}

当前风险：
${JSON.stringify(riskItems.slice(0, 6).map((risk) => ({
  plan: risk.plan.name,
  priority: risk.plan.priority,
  reasons: risk.reasons,
})), null, 2)}

请返回可直接导入的 JSON。如果建议安排某个计划，请在该 plan 上写 assigned_day: "${selectedDate.id}"。`;

    copyText(prompt, '当天上下文已复制');
  };

  const handleImport = () => {
    try {
      const parsed = parseImportJson(importText);
      if (Array.isArray(parsed.plans)) {
        setPlans((current) => {
          const next = [...current];
          parsed.plans.forEach((incomingPlan, index) => {
            const normalized = normalizePlan(incomingPlan, index, tripDates);
            const existingIndex = next.findIndex((plan) => plan.id === normalized.id);
            if (existingIndex >= 0) {
              next[existingIndex] = { ...next[existingIndex], ...normalized };
            } else {
              next.push(normalized);
            }
          });
          return next;
        });

        const assigned = parsed.plans.reduce((accumulator, plan) => {
          if (plan.assigned_day && plan.id) {
            accumulator[plan.assigned_day] = { planId: plan.id };
          }
          return accumulator;
        }, {});

        if (Object.keys(assigned).length) {
          setSchedule((current) => ({ ...current, ...assigned }));
        }
      }

      setImportModalOpen(false);
      setImportText('');
      notify('JSON 已导入');
    } catch (error) {
      notify(`导入失败：${error.message}`);
    }
  };

  const handleExportState = () => {
    const data = { schemaVersion: APP_SCHEMA_VERSION, startDateStr, tripDays, plans: normalizedPlans, schedule, dayWeather, weatherData };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `travel-gacha-${getTodayId()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('备份已下载');
  };

  const handleFileImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const data = JSON.parse(readerEvent.target.result);
        if (data.startDateStr) setStartDateStr(data.startDateStr);
        if (data.tripDays) setTripDays(clampTripDays(data.tripDays));
        if (Array.isArray(data.plans)) setPlans(data.plans);
        if (data.schedule) setSchedule(normalizeSchedule(data.schedule));
        if (data.dayWeather) setDayWeather(data.dayWeather);
        if (data.weatherData) setWeatherData(data.weatherData);
        notify('备份已恢复');
      } catch (error) {
        notify(`恢复失败：${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleClearData = () => {
    if (!window.confirm('把当前旅行计划重置为默认青岛样例？')) return;

    const nextStartDate = getTodayId();
    setTripName('青岛 5 日');
    setStartDateStr(nextStartDate);
    setTripDays(DEFAULT_TRIP_DAYS);
    setPlans(createInitialPlans(nextStartDate));
    setSchedule(createInitialSchedule(nextStartDate));
    setDayWeather({});
    setWeatherData({});
    setSelectedDateId(nextStartDate);
    notify('数据已重置');
  };

  const renderPlanStops = (plan) => {
    if (!plan?.stops.length) return null;

    return (
      <ol className="stop-list" aria-label={`${plan.name} 行程节点`}>
        {plan.stops.map((stop) => (
          <li className="stop-item" key={stop.id}>
            <span className="stop-time">{stop.time || '弹性'}</span>
            <span className="stop-detail">
              <strong>{stop.title}</strong>
              <span>{stop.location.label}</span>
              {stop.note && <em>{stop.note}</em>}
            </span>
          </li>
        ))}
      </ol>
    );
  };

  const renderPlanMeta = (plan) => {
    if (!plan) return null;

    return (
      <div className="meta-grid" aria-label="计划信息">
        <span>{getPlanLocationSummary(plan)}</span>
        <span>{plan.time_window}</span>
      </div>
    );
  };

  const renderCandidateSignals = (candidate) => {
    if (!candidate) return null;

    const { hardReasons, notes, weather } = candidate;
    const visibleHardReasons = hardReasons.filter(
      (reason) => !(weather.level === 'blocked' && reason.includes('天气')),
    );

    return (
      <>
        <div className={`weather-line ${weather.level}`}>
          <strong>{weather.label}</strong>
          <span>{weather.snapshot?.summary || '未查询天气，使用手动条件或先更新天气'}</span>
        </div>

        {(visibleHardReasons.length > 0 || notes.length > 0) && (
          <div className="reason-row">
            {visibleHardReasons.map((reason) => (
              <span className="is-danger" key={reason}>{reason}</span>
            ))}
            {notes.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        )}
      </>
    );
  };

  const renderCurrentPlanBody = () => (
    <div>
      <p className="eyebrow">当前方案</p>
      <div className="title-row current-title-row">
        <h2>{selectedPlan?.name || '当天未安排'}</h2>
        {selectedPlan && (
          <span className={`priority-badge ${selectedPlan.priority}`}>
            {PRIORITY_META[selectedPlan.priority].label}
          </span>
        )}
      </div>
      <p>{selectedPlan?.description || '从下面的候选里换一个，系统会先评估是否影响后续计划。'}</p>
      {renderPlanMeta(selectedPlan)}
      {renderPlanStops(selectedPlan)}
      {renderCandidateSignals(currentCandidate)}
    </div>
  );

  const renderCurrentPlanActions = () => (
    <div className="current-actions">
      <button className="btn btn-primary" type="button" onClick={pickRecommendedPlan}>
        <span className="recommend-icon" aria-hidden="true" />
        推荐
      </button>
      {selectedDate && (
        <button className="btn btn-outline" type="button" onClick={copyDayPrompt}>
          问 AI
        </button>
      )}
      {selectedDate && selectedPlan && (
        <button className="btn btn-ghost" type="button" onClick={() => clearDay(selectedDate.id)}>
          清空
        </button>
      )}
    </div>
  );

  const renderRiskGroup = (group) => (
    <div className={`risk-item risk-group ${group.level}`} key={group.title}>
      <div className="risk-group-head">
        <strong>{group.title}</strong>
        <span>{group.items.length} {group.unit}</span>
      </div>
      <ul>
        {group.items.slice(0, 6).map((item) => (
          <li key={item}>{item}</li>
        ))}
        {group.items.length > 6 && <li>还有 {group.items.length - 6} 项</li>}
      </ul>
    </div>
  );

  const renderMobileRiskPanel = () => {
    const primaryRisk = riskGroups[0];
    const summaryTitle = primaryRisk
      ? mobileRisksOpen
        ? '预警详情'
        : `${primaryRisk.title} · ${primaryRisk.items.length} ${primaryRisk.unit}`
      : '当前安排没有明显冲突';

    return (
      <div className={`mobile-risk-panel ${primaryRisk ? `level-${primaryRisk.level}` : 'is-clear'}`}>
        <button
          className="mobile-risk-summary"
          type="button"
          aria-expanded={mobileRisksOpen}
          onClick={() => setMobileRisksOpen((current) => !current)}
        >
          <span>{riskGroups.length ? `${riskGroups.length} 类预警` : '暂无预警'}</span>
          <strong>{summaryTitle}</strong>
          <em>{mobileRisksOpen ? '收起' : '展开'}</em>
        </button>

        {mobileRisksOpen && (
          <div className="risk-list mobile-risk-list">
            {riskGroups.length === 0 && <div className="empty-state">当前安排没有把未排计划卡死。</div>}
            {riskGroups.slice(0, 6).map(renderRiskGroup)}
          </div>
        )}
      </div>
    );
  };

  const renderWeatherConditionCard = (compact = false) => (
    <div className={`condition-card ${compact ? 'compact-card' : ''}`}>
      <div className="condition-top">
        <div>
          <h2>当天条件</h2>
          <div className="weather-current">
            <span>{selectedWeatherSource}</span>
            <strong>{selectedWeatherSummary}</strong>
          </div>
        </div>
        <button
          className={`icon-btn weather-edit-btn ${weatherEditorOpen ? 'is-active' : ''}`}
          type="button"
          aria-label={weatherEditorOpen ? '收起天气修正' : '修正天气'}
          title={weatherEditorOpen ? '收起天气修正' : '修正天气'}
          onClick={() =>
            setOpenWeatherEditorDateId((current) => (current === selectedDate?.id ? '' : selectedDate?.id || ''))
          }
        />
      </div>

      {weatherEditorOpen && (
        <div className="weather-editor">
          <div className="chip-group" aria-label="修正天气">
            {WEATHER_OPTIONS.map((option) => (
              <button
                className={`chip ${selectedManualWeather === option.id ? 'is-active' : ''}`}
                key={option.id}
                type="button"
                onClick={() =>
                  selectedDate &&
                  setDayWeather((current) => ({ ...current, [selectedDate.id]: option.id }))
                }
              >
                {option.id === 'unknown' ? '用 API' : option.short}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderMobileDayWorkspace = () => (
    <div className="mobile-workspace">
      <div className="mobile-workspace-header">
        <span>D{selectedDate?.dayNumber || 1} 当天</span>
        <span>{availableCandidateCount} 个可切换</span>
      </div>

      {renderWeatherConditionCard(true)}

      <div className="section-title compact-section-title">
        <h2>候选</h2>
        <span>{availableCandidateCount} 可用</span>
      </div>

      <div className="plan-grid mobile-plan-grid">
        {switchCandidates.map(({ plan, canAssign, assignedDateId, ...candidate }) => (
          <article
            className={`plan-card ${!canAssign ? 'is-disabled is-mobile-collapsed' : ''} priority-${plan.priority}`}
            key={plan.id}
          >
            <div className="plan-card-header">
              <div>
                <div className="title-row">
                  <h3>{plan.name}</h3>
                  <span className={`priority-badge ${plan.priority}`}>{PRIORITY_META[plan.priority].label}</span>
                  {assignedDateId && (
                    <span className="assigned-badge">
                      已排 {formatAssignedDate(assignedDateId, tripDates)}
                    </span>
                  )}
                </div>
                <p>{plan.description}</p>
              </div>
            </div>

            {renderPlanMeta(plan)}
            {renderPlanStops(plan)}
            {renderCandidateSignals({ plan, canAssign, assignedDateId, ...candidate })}

            <button
              className="btn btn-card"
              type="button"
              disabled={!canAssign || !selectedDate}
              onClick={() => selectedDate && requestAssignPlan(selectedDate.id, plan.id)}
            >
              选择
            </button>
          </article>
        ))}
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="trip-header">
        <div className="trip-brand">
          <p className="eyebrow">Travel Gacha</p>
          <h1>行程扭蛋</h1>
        </div>
        <div className="trip-switcher" aria-label="切换旅行计划">
          <div
            className="trip-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setTripMenuOpen(false);
            }}
          >
            <button
              className={`trip-menu-trigger ${tripMenuOpen ? 'is-open' : ''}`}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={tripMenuOpen}
              onClick={() => setTripMenuOpen((current) => !current)}
            >
              <span>{activeTripOption?.id === activeTripId ? tripName : activeTripOption?.name || tripName}</span>
              <em>{formatTripRange(startDateStr, tripDays)} · {tripDays} 天</em>
            </button>
            {tripMenuOpen && (
              <div className="trip-menu-popover" role="listbox" aria-label="旅行计划">
                {trips.map((trip) => {
                  const isCurrentTrip = trip.id === activeTripId;
                  const displayName = isCurrentTrip ? tripName : trip.name;
                  const displayRange = isCurrentTrip
                    ? formatTripRange(startDateStr, tripDays)
                    : formatTripRange(trip.startDateStr, trip.tripDays);

                  return (
                    <button
                      className={`trip-menu-option ${isCurrentTrip ? 'is-selected' : ''}`}
                      key={trip.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrentTrip}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => switchTrip(trip.id)}
                    >
                      <span>{displayName}</span>
                      <em>{displayRange} · {isCurrentTrip ? tripDays : trip.tripDays} 天</em>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            className="icon-btn trip-edit-btn"
            type="button"
            onClick={() => { setTripMenuOpen(false); setEditorOpen(true); }}
            aria-label="编辑计划"
            title="编辑计划"
          >
            <span className="edit-icon" aria-hidden="true" />
          </button>
          <button className="icon-btn" type="button" onClick={createNewTrip} aria-label="新建旅行计划">
            +
          </button>
        </div>
      </header>

      <main className="app-layout">
        <aside className="side-panel schedule-panel">
          <div className="panel-header">
            <h2>行程</h2>
          </div>

          <div className="mini-calendar" aria-label="每日状态速览">
            {tripDates.map((date) => {
              const entry = schedule[date.id];
              const plan = entry ? plansById.get(entry.planId) : null;
              const selected = selectedDate?.id === date.id;
              const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, dayWeather);
              const calendarState = getCalendarDayState(plan, insight);

              return (
                <button
                  className={`mini-day state-${calendarState.key} ${selected ? 'is-selected' : ''}`}
                  key={date.id}
                  type="button"
                  aria-label={`D${date.dayNumber} ${formatMiniDate(date.id)} ${calendarState.ariaLabel}`}
                  onClick={() => selectScheduleDate(date.id, { scroll: true })}
                >
                  <strong>D{date.dayNumber}</strong>
                  <em>{formatMiniDate(date.id)}</em>
                  {calendarState.label && <span>{calendarState.label}</span>}
                </button>
              );
            })}
          </div>

          {renderMobileRiskPanel()}

          <div className="day-list" aria-label="日期列表">
            {tripDates.map((date) => {
              const entry = schedule[date.id];
              const plan = entry ? plansById.get(entry.planId) : null;
              const selected = selectedDate?.id === date.id;
              const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, dayWeather);
              return (
                <Fragment key={date.id}>
                  <button
                    className={`day-tile ${selected ? 'is-selected' : ''} ${plan ? 'has-plan' : ''} status-${insight.level}`}
                    type="button"
                    ref={(node) => {
                      if (node) dayTileRefs.current.set(date.id, node);
                      else dayTileRefs.current.delete(date.id);
                    }}
                    onClick={() => selectScheduleDate(date.id)}
                  >
                    <span className="day-number">D{date.dayNumber}</span>
                    <span className="day-main">
                      <span className="day-date">{date.display}</span>
                      <span className="day-plan">
                        {plan?.name || '未安排'}
                        {plan && <span className={`day-priority priority-${plan.priority}`}>{PRIORITY_META[plan.priority].label}</span>}
                      </span>
                    </span>
                    {insight.label && (
                      <span className={`day-status status-${insight.level}`}>
                        {insight.label}
                      </span>
                    )}
                    <span className="day-weather">{insight.weatherText}</span>
                    {insight.riskText && <span className={`day-risk ${insight.riskTone}`}>{insight.riskText}</span>}
                  </button>
                  {selected && (
                    <div className="current-plan selected-day-plan">
                      {renderCurrentPlanBody()}
                      {renderCurrentPlanActions()}
                    </div>
                  )}
                  {selected && <div className="mobile-day-detail">{renderMobileDayWorkspace()}</div>}
                </Fragment>
              );
            })}
          </div>
        </aside>

        <section className="main-panel">
          <div className="date-toolbar">
            <button
              className="nav-btn"
              type="button"
              onClick={() => selectNeighborDate(-1)}
              disabled={selectedIndex <= 0}
              aria-label="上一天"
            >
              ‹
            </button>
            <div>
              <p className="eyebrow">D{selectedDate?.dayNumber || 1}</p>
              <h2>{selectedDate?.display || '选择日期'}</h2>
            </div>
            <button
              className="nav-btn"
              type="button"
              onClick={() => selectNeighborDate(1)}
              disabled={selectedIndex < 0 || selectedIndex >= tripDates.length - 1}
              aria-label="下一天"
            >
              ›
            </button>
          </div>

          {renderWeatherConditionCard()}

          <div className="current-plan">
            {renderCurrentPlanBody()}
            {renderCurrentPlanActions()}
          </div>

          <div className="section-title">
            <h2>可切换计划</h2>
            <span>{availableCandidateCount} 可用</span>
          </div>

          <div className="plan-grid">
            {switchCandidates.map(({ plan, canAssign, assignedDateId, ...candidate }) => (
              <article
                className={`plan-card ${!canAssign ? 'is-disabled is-mobile-collapsed' : ''} priority-${plan.priority}`}
                key={plan.id}
              >
                <div className="plan-card-header">
                  <div>
                    <div className="title-row">
                      <h3>{plan.name}</h3>
                      <span className={`priority-badge ${plan.priority}`}>{PRIORITY_META[plan.priority].label}</span>
                      {assignedDateId && (
                        <span className="assigned-badge">
                          已排 {formatAssignedDate(assignedDateId, tripDates)}
                        </span>
                      )}
                    </div>
                    <p>{plan.description}</p>
                  </div>
                </div>

                {renderPlanMeta(plan)}
                {renderPlanStops(plan)}
                {renderCandidateSignals({ plan, canAssign, assignedDateId, ...candidate })}

                <button
                  className="btn btn-card"
                  type="button"
                  disabled={!canAssign || !selectedDate}
                  onClick={() => selectedDate && requestAssignPlan(selectedDate.id, plan.id)}
                >
                  选择
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="side-panel status-panel">
          <div className="panel-header">
            <h2>预警</h2>
            <span className="small-stat">{riskGroups.length} 类</span>
          </div>

          <div className="risk-list">
            {riskGroups.length === 0 && <div className="empty-state">当前安排没有把未排计划卡死。</div>}
            {riskGroups.slice(0, 8).map(renderRiskGroup)}
          </div>

          <div className="workflow-panel">
            <div className="panel-header compact">
              <h2>天气</h2>
              <button className="btn btn-primary" type="button" onClick={refreshWeather} disabled={weatherLoading}>
                {weatherLoading ? '更新中' : '更新天气'}
              </button>
            </div>
            <p className="helper-text">
              使用 Open-Meteo 自动按计划地点查询。无网络或超出预报范围时，可在当天卡片里手动修正。
            </p>
            {weatherError && <div className="risk-item warning"><p>{weatherError}</p></div>}
            <div className="weather-source-list">
              {Object.entries(weatherData).length === 0 && <span>尚未获取天气</span>}
              {Object.entries(weatherData).map(([key, value]) => (
                <span key={key}>{value.label || key}</span>
              ))}
            </div>
          </div>

        </aside>
      </main>

      {editorOpen && (
        <div className="modal-overlay" onClick={() => setEditorOpen(false)}>
          <div className="modal trip-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Plan Setup</p>
                <h2>编辑计划</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setEditorOpen(false)} aria-label="关闭编辑计划">
                ×
              </button>
            </div>

            <div className="trip-editor-grid">
              <label>
                <span>计划名称</span>
                <input
                  className="input"
                  value={tripName}
                  onChange={(event) => setTripName(event.target.value)}
                />
              </label>
              <label>
                <span>出发</span>
                <input
                  className="input"
                  type="date"
                  value={startDateStr}
                  onChange={(event) => {
                    setStartDateStr(event.target.value);
                    setSelectedDateId(getSmartSelectedDate(event.target.value, tripDays));
                  }}
                />
              </label>
              <label>
                <span>天数</span>
                <input
                  className="input"
                  min="1"
                  max="30"
                  type="number"
                  value={tripDays}
                  onChange={(event) => {
                    const nextTripDays = clampTripDays(event.target.value);
                    setTripDays(nextTripDays);
                    setSelectedDateId(getSmartSelectedDate(startDateStr, nextTripDays));
                  }}
                />
              </label>
            </div>

            <div className="editor-section">
              <div className="panel-header compact">
                <h2>计划数据</h2>
                <span className="small-stat">{normalizedPlans.length} 个计划</span>
              </div>
              <div className="action-grid">
                <button className="btn btn-outline" type="button" onClick={copySystemPrompt}>
                  复制规则
                </button>
                <button className="btn btn-primary" type="button" onClick={() => setImportModalOpen(true)}>
                  导入 JSON
                </button>
                <button className="btn btn-outline" type="button" onClick={handleExportState}>
                  下载备份
                </button>
                <button className="btn btn-outline" type="button" onClick={() => fileInputRef.current?.click()}>
                  恢复备份
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleFileImport}
              />
              <button className="btn btn-danger" type="button" onClick={handleClearData}>
                重置当前计划
              </button>
            </div>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>导入 JSON</h2>
              <button className="icon-btn" type="button" onClick={() => setImportModalOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <textarea
              className="textarea"
              rows={12}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='{"plans":[]}'
            />
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setImportModalOpen(false)}>
                取消
              </button>
              <button className="btn btn-primary" type="button" onClick={handleImport}>
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAssignment && (
        <div className="modal-overlay" onClick={() => setPendingAssignment(null)}>
          <div className="modal impact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>调整影响预览</h2>
              <button className="icon-btn" type="button" onClick={() => setPendingAssignment(null)} aria-label="关闭">
                ×
              </button>
            </div>

            <div className="impact-summary">
              <strong>{pendingAssignment.targetPlan.name}</strong>
              <span>安排到 {pendingAssignment.dateId}</span>
            </div>

            {pendingAssignment.clears.length > 0 && (
              <div className="impact-section">
                <h3>会清空这些日期</h3>
                {pendingAssignment.clears.map((item) => (
                  <div className="impact-row" key={`${item.dateId}-${item.plan.id}`}>
                    <span>{item.dateId}</span>
                    <strong>{item.plan.name}</strong>
                    <em>{item.reason}</em>
                  </div>
                ))}
              </div>
            )}

            {pendingAssignment.nextRisks.length > 0 && (
              <div className="impact-section">
                <h3>继续后产生的风险</h3>
                {pendingAssignment.nextRisks.map((risk) => (
                  <div className={`risk-item ${risk.level}`} key={risk.plan.id}>
                    <strong>{risk.plan.name}</strong>
                    <p>{risk.title}{risk.reasons.length ? `：${risk.reasons.join(' / ')}` : ''}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setPendingAssignment(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={confirmPendingAssignment}
              >
                继续调整
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
