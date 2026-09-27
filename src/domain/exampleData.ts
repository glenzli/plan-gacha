import { addDays, getTodayId } from './date';
import { inferMapRouteMode } from './locationLinks';
import {
  QINGDAO_LOCATION,
  WEIHAI_LOCATION,
  YANTAI_LOCATION,
  type NormalizedLocation,
} from './plan';

export const DEFAULT_TRIP_DAYS = 5;

function isMonday(dateId: string) {
  return new Date(`${dateId}T00:00:00`).getDay() === 1;
}

// Public AMap POI results checked on 2026-09-28. Each tuple is label, address, POI ID,
// GCJ-02 longitude, latitude. Keep the POI ID so a changed or ambiguous point can be rechecked.
const EXAMPLE_POIS = {
  zhanqiao: ['栈桥景区', '青岛市市南区太平路12号', 'B0FFG19SSX', 120.319300, 36.061736],
  tuandaoMarket: ['馨大众团岛农贸市场', '青岛市市南区四川路31号', 'B021412FQ2', 120.298243, 36.061199],
  badaxia: ['八大峡广场', '青岛市市南区巫峡路2号', 'B021406QHO', 120.309569, 36.053030],
  qingdaoStation: ['青岛站', '青岛市市南区泰安路2号', 'B0214082PH', 120.312786, 36.064812],
  weihaiStation: ['威海站', '威海市环翠区疏站路', 'B0FFH5C7H7', 122.144181, 37.426026],
  huojuStreet: ['火炬八街', '威海市环翠区火炬八街', 'B0FFGQITM0', 122.031336, 37.522713],
  weihaiBeach: ['威海国际海水浴场', '威海市环翠区北环海路178号', 'B02770ISI3', 122.042078, 37.527543],
  haiyuanPark: ['海源公园', '威海市环翠区环海路', 'B027700479', 122.150815, 37.518995],
  maotouViewpoint: ['猫头山一号观景台', '威海市环翠区环海路128-1号', 'B0JAGUASX7', 122.162113, 37.537149],
  qingdaoMuseum: ['青岛市博物馆', '青岛市崂山区梅岭东路51号', 'B021406HP0', 120.473116, 36.101532],
  shilaorenBeach: ['青岛石老人海水浴场', '青岛市崂山区海口路287号', 'B021406PJ6', 120.468010, 36.091680],
  sculpturePark: ['中国雕塑院·青岛雕塑园', '青岛市崂山区东海东路66号', 'B021406QLK', 120.454678, 36.079683],
  universityIntersection: ['大学路与鱼山路交叉口', '青岛市市南区大学路与鱼山路交叉口', 'B0M2ANX2LM', 120.331339, 36.061376],
  signalHill: ['信号山公园', '青岛市市南区龙山路16号甲', 'B021401767', 120.331561, 36.066446],
  huangxianRoad: ['黄县路', '青岛市市南区黄县路', 'B0FFGQGUHI', 120.332276, 36.063144],
  taidongNightMarket: ['台东海鲜夜市一条街', '青岛市市北区台东五路与大名路交叉口', 'B0FFHUF58I', 120.353493, 36.085464],
  beerStreet: ['青岛啤酒街(登州路店)', '青岛市市北区登州路56号', 'B0FFF2LPBI', 120.350806, 36.080149],
  xiaomaiIsland: ['小麦岛公园', '青岛市崂山区麦岛', 'B0FFK8OQLY', 120.431045, 36.054245],
  bookstore: ['西西弗书店(青岛万象城店)', '青岛市市南区山东路23号', 'B0K3XS03EC', 120.378574, 36.066076],
  mixc: ['青岛万象城', '青岛市市南区山东路6号甲', 'B0214110TT', 120.377704, 36.067152],
  qingdaoNorth: ['青岛北站', '青岛市李沧区静乐路1号', 'B0FFF6PXF2', 120.375693, 36.168977],
  yantaiStation: ['烟台站', '烟台市芝罘区北马路135号', 'B021704P1D', 121.383327, 37.548407],
  penglaiPavilion: ['蓬莱阁景区', '烟台市蓬莱区北关路1号', 'B0FFF4XX51', 120.752923, 37.824795],
  baxianScenic: ['八仙过海景区', '烟台市蓬莱区仙境路9号', 'B021704KQ3', 120.775595, 37.825198],
  seafoodProcessing: ['海辰海鲜加工(团岛市场)', '青岛市市南区四川路31号馨大众团岛农贸市场餐饮区', 'B0LA3ZESUB', 120.298514, 36.060766],
} as const;

type ExamplePoiKey = keyof typeof EXAMPLE_POIS;

function place(baseLocation: NormalizedLocation, poiKey: ExamplePoiKey) {
  const [label, address, , longitude, latitude] = EXAMPLE_POIS[poiKey];
  return {
    ...baseLocation,
    label,
    address,
    mapPoint: { longitude, latitude, coordinateSystem: 'GCJ-02' as const },
  };
}

function transfer(mode: string, departAt: string, duration: string, note = '') {
  return { mode, preferred_route_mode: inferMapRouteMode(mode), depart_at: departAt, duration, note };
}

const PENGLAI_LOCATION: NormalizedLocation = {
  label: '蓬莱区',
  query: 'Penglai, Shandong, China',
  weatherLabel: '蓬莱区',
  countryCode: 'CN',
  admin1: '山东省',
  admin2: '烟台市',
  // Approximate district center (WGS84) for weather; route points above stay GCJ-02.
  latitude: 37.817,
  longitude: 120.733,
  address: '',
};

export function createExamplePlans(startDate: string) {
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
        { time: '05:00', title: '栈桥看日出', location: place(QINGDAO_LOCATION, 'zhanqiao'), note: '提前看潮汐和云量，适合天气好时执行' },
        { time: '07:10', title: '团岛早市早餐', location: place(QINGDAO_LOCATION, 'tuandaoMarket'), transfer_from_previous: transfer('步行', '06:30', '约 35 分钟', '沿海边步行，按实际天气调整'), note: '海鲜馄饨、甜沫或烧饼，作为早起奖励' },
        { time: '09:00', title: '八大峡海岸散步', location: place(QINGDAO_LOCATION, 'badaxia'), transfer_from_previous: transfer('步行', '08:35', '约 20 分钟'), note: '慢慢走回酒店，上午结束前留休息时间' },
      ],
      available_dates: dates.slice(0, 2),
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['rain', 'heavy_rain', 'storm', 'fog', 'windy'],
      },
      conflicts: ['lazy-beach'],
      reminders: [{ time: '前一晚', text: '确认日出时间、潮汐和云量，太晚睡就不要硬上' }],
      tips: ['早市现金和纸巾提前备好'],
    },
    {
      id: 'weihai-coast-day',
      name: '青岛到威海海岸线',
      description: '早上从青岛出发，高铁到威海串联海边公园和观景台，跨城天气要一起看。',
      priority: 'must',
      location: { ...WEIHAI_LOCATION, label: '威海海岸线' },
      stops: [
        { time: '07:20', title: '青岛站出发', location: place(QINGDAO_LOCATION, 'qingdaoStation'), note: '车次和时间仅作示意，出发前核对车票并预留进站时间' },
        { time: '09:10', title: '威海站到达', location: place(WEIHAI_LOCATION, 'weihaiStation'), transfer_from_previous: transfer('高铁', '07:20', '约 1 小时 50 分钟', '以实际车次为准'), note: '先确认返程车次，避免晚上太被动' },
        { time: '10:20', title: '火炬八街拍照', location: place(WEIHAI_LOCATION, 'huojuStreet'), transfer_from_previous: transfer('出租车', '09:35', '约 35 分钟'), note: '风大或雨大体验会明显下降' },
        { time: '11:30', title: '国际海水浴场', location: place(WEIHAI_LOCATION, 'weihaiBeach'), transfer_from_previous: transfer('步行', '11:05', '约 20 分钟'), note: '海边短逛，留意风浪' },
        { time: '13:00', title: '海源公园附近午餐', location: place(WEIHAI_LOCATION, 'haiyuanPark'), transfer_from_previous: transfer('出租车', '12:15', '约 30 分钟'), note: '以公园作为定位点，餐厅到时再选' },
        { time: '15:30', title: '猫头山观景台', location: place(WEIHAI_LOCATION, 'maotouViewpoint'), transfer_from_previous: transfer('出租车', '15:00', '约 15 分钟'), note: '看风和能见度，雾天直接降级为市区轻量版' },
        { time: '18:20', title: '威海站返程', location: place(WEIHAI_LOCATION, 'weihaiStation'), transfer_from_previous: transfer('出租车', '17:20', '约 40 分钟', '为进站预留缓冲'), note: '返程后不再叠加夜市，避免当天过载' },
      ],
      available_dates: dates.slice(1, 4),
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['drizzle', 'rain', 'heavy_rain', 'storm', 'windy', 'fog'],
      },
      conflicts: ['night-market', 'old-town-walk'],
      reminders: [
        { time: '前一晚', text: '确认高铁票和返程班次，必要时先买返程票' },
        { time: '18:00', text: '开始往威海站收束，避免错过返程' },
      ],
      bookings: [
        {
          id: 'weihai-train-ticket',
          type: 'ticket',
          title: '青岛往返威海高铁票',
          status: 'pending',
          address: '青岛站 / 威海站',
          url: 'https://www.12306.cn/index/',
          cancel_url: 'https://www.12306.cn/index/',
          note: '跨城当天交通约束强，建议至少前一晚确认车次',
        },
      ],
      tips: ['跨城当天不要再叠加夜市或高体力计划'],
    },
    {
      id: 'museum-day',
      name: '市区博物馆和咖啡',
      description: '把雨天或高温天留给室内，逛完博物馆附近找咖啡店休息。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛市博物馆' },
      stops: [
        { time: '10:30', title: '青岛市博物馆', location: place(QINGDAO_LOCATION, 'qingdaoMuseum'), note: '闭馆日需要避开，适合雨天或高温' },
        { time: '13:00', title: '石老人海边咖啡午休', location: place(QINGDAO_LOCATION, 'shilaorenBeach'), transfer_from_previous: transfer('步行', '12:25', '约 25 分钟'), note: '以海水浴场作为定位点，在附近选午餐和咖啡' },
        { time: '15:00', title: '雕塑园短逛', location: place(QINGDAO_LOCATION, 'sculpturePark'), transfer_from_previous: transfer('步行', '14:25', '约 30 分钟'), note: '天气可接受时加一段轻量户外' },
      ],
      available_dates: dates,
      closed_dates: museumClosed,
      weather_rules: {
        best: ['rain', 'drizzle', 'hot', 'cold'],
        ok: ['cloudy', 'partly_cloudy', 'sunny'],
        blocked: [],
      },
      conflicts: [],
      reminders: [{ time: '出发前', text: '确认预约、开放时间和临时展闭展信息' }],
      bookings: [
        {
          id: 'qingdao-museum-reservation',
          type: 'reservation',
          title: '青岛市博物馆预约',
          status: 'pending',
          address: '青岛市崂山区梅岭东路51号',
          url: 'https://www.qingdaomuseum.com/',
          note: '闭馆日和临时展预约入口可能变化，出发前再确认',
        },
      ],
    },
    {
      id: 'old-town-walk',
      name: '老城漫步和小店',
      description: '走老街、拍照、找小店，天气太热或下雨时可以换成室内备用。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛老城' },
      stops: [
        { time: '15:00', title: '大学路和鱼山路', location: place(QINGDAO_LOCATION, 'universityIntersection'), note: '拍照和小店，太阳太强会比较累' },
        { time: '16:40', title: '信号山看城市线', location: place(QINGDAO_LOCATION, 'signalHill'), transfer_from_previous: transfer('步行', '16:20', '约 15 分钟', '上山有坡'), note: '有爬坡，雨天或高温体验会明显下降' },
        { time: '18:30', title: '黄县路晚餐', location: place(QINGDAO_LOCATION, 'huangxianRoad'), transfer_from_previous: transfer('步行', '18:15', '约 10 分钟'), note: '以黄县路街区作为定位点，餐厅可现场选择' },
      ],
      available_dates: dates.slice(2, 5),
      weather_rules: {
        best: ['partly_cloudy', 'cloudy'],
        ok: ['sunny'],
        blocked: ['rain', 'heavy_rain', 'hot', 'storm'],
      },
      conflicts: [],
      tips: ['信号山有坡，鞋子不舒服时直接跳过'],
    },
    {
      id: 'night-market',
      name: '夜市海鲜和烤肉',
      description: '最后一晚安排海鲜和烤肉，适合接在白天较轻松的安排后面。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛夜市' },
      stops: [
        { time: '18:00', title: '台东夜市小吃', location: place(QINGDAO_LOCATION, 'taidongNightMarket'), note: '先垫肚子，避开太晚排队' },
        { time: '20:00', title: '啤酒街烤肉', location: place(QINGDAO_LOCATION, 'beerStreet'), transfer_from_previous: transfer('步行', '19:40', '约 15 分钟'), note: '雨不大也能执行，暴雨就换室内' },
      ],
      available_dates: dates.slice(3, 5),
      weather_rules: {
        best: ['cloudy', 'partly_cloudy', 'sunny'],
        ok: ['hot', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
      reminders: [{ time: '21:00', text: '控制收尾时间，第二天有早起计划就别拖太晚' }],
    },
    {
      id: 'lazy-beach',
      name: '慢速海滩躺平',
      description: '睡到自然醒，下午去海滩喝饮料，晚点再看落日。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛海边' },
      stops: [
        { time: '14:30', title: '石老人海滩躺平', location: place(QINGDAO_LOCATION, 'shilaorenBeach'), note: '低体力备用，不抢早上时间' },
        { time: '17:00', title: '小麦岛看落日', location: place(QINGDAO_LOCATION, 'xiaomaiIsland'), transfer_from_previous: transfer('出租车', '16:25', '约 25 分钟'), note: '适合晴天或少云，大风就取消' },
      ],
      available_dates: dates.slice(1, 5),
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy', 'hot'],
        blocked: ['rain', 'heavy_rain', 'storm', 'windy'],
      },
      conflicts: ['sunrise-sea'],
    },
    {
      id: 'rainy-cafe',
      name: '雨天咖啡和书店',
      description: '下雨或太累时切换到室内，留出空白给临时调整。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛市区' },
      stops: [
        { time: '13:30', title: '书店和咖啡', location: place(QINGDAO_LOCATION, 'bookstore'), note: '恢复体力，适合雨天或临时调整' },
        { time: '16:00', title: '商场补给', location: place(QINGDAO_LOCATION, 'mixc'), transfer_from_previous: transfer('步行', '15:55', '约 5 分钟', '同一商场内'), note: '买伞、防晒、药品等旅行补给' },
      ],
      available_dates: dates,
      weather_rules: {
        best: ['rain', 'drizzle', 'cold'],
        ok: ['cloudy', 'hot', 'heavy_rain'],
        blocked: [],
      },
      conflicts: [],
    },
    {
      id: 'yantai-penglai-backup',
      name: '烟台蓬莱跨城备用',
      description: '如果天气特别好且体力在线，可以临时升级成烟台蓬莱一日线，否则不要硬排。',
      priority: 'backup',
      location: { ...YANTAI_LOCATION, label: '烟台蓬莱' },
      stops: [
        { time: '07:00', title: '青岛北站出发', location: place(QINGDAO_LOCATION, 'qingdaoNorth'), note: '车次和时间仅作示意，跨城备用须前一晚核对车票' },
        { time: '09:30', title: '烟台站换乘', location: place(YANTAI_LOCATION, 'yantaiStation'), transfer_from_previous: transfer('高铁', '07:00', '约 2 小时 30 分钟', '以实际车次为准'), note: '交通不确定性高，必须留缓冲' },
        { time: '12:00', title: '蓬莱阁海边', location: place(PENGLAI_LOCATION, 'penglaiPavilion'), transfer_from_previous: transfer('公共交通', '10:00', '约 1 小时 45 分钟', '跨城接驳以当天班次为准'), note: '户外主体验，阴雨和大风直接不选' },
        { time: '14:30', title: '八仙过海景区外圈', location: place(PENGLAI_LOCATION, 'baxianScenic'), transfer_from_previous: transfer('步行', '14:00', '约 25 分钟'), note: '根据体力选择走完整圈或只看海边' },
        { time: '18:00', title: '烟台站返程', location: place(YANTAI_LOCATION, 'yantaiStation'), transfer_from_previous: transfer('出租车', '16:00', '约 1 小时 30 分钟', '跨城返程预留缓冲并核对车次'), note: '当天结束较晚，后续计划需要降强度' },
      ],
      available_dates: dates.slice(2, 5),
      weather_rules: {
        best: ['sunny'],
        ok: ['partly_cloudy'],
        blocked: ['cloudy', 'drizzle', 'rain', 'heavy_rain', 'storm', 'windy', 'fog', 'hot'],
      },
      conflicts: ['weihai-coast-day', 'old-town-walk', 'night-market'],
      bookings: [
        {
          id: 'yantai-train-ticket',
          type: 'ticket',
          title: '青岛到烟台往返车票',
          status: 'pending',
          address: '青岛北站 / 烟台站',
          url: 'https://www.12306.cn/index/',
          cancel_url: 'https://www.12306.cn/index/',
          note: '备用跨城线，确定执行后再订，避免退改',
        },
      ],
    },
    {
      id: 'seafood-market',
      name: '海鲜市场临时加餐',
      description: '按当天距离和排队情况决定，适合插在交通顺路的时候。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛海鲜市场' },
      stops: [
        { time: '11:00', title: '团岛市场买海鲜', location: place(QINGDAO_LOCATION, 'tuandaoMarket'), note: '看当天人流，顺路才安排' },
        { time: '12:30', title: '附近加工店午餐', location: place(QINGDAO_LOCATION, 'seafoodProcessing'), transfer_from_previous: transfer('步行', '12:25', '约 5 分钟', '市场餐饮区内'), note: '店铺营业情况出发前核对，用餐时间可压缩' },
      ],
      available_dates: dates,
      weather_rules: {
        best: ['cloudy', 'rain', 'hot'],
        ok: ['sunny', 'partly_cloudy', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
    },
  ];
}

export function createExampleSchedule(startDate: string) {
  return {
    [addDays(startDate, 0)]: { planId: 'sunrise-sea' },
    [addDays(startDate, 1)]: { planId: 'weihai-coast-day' },
    [addDays(startDate, 2)]: { planId: 'museum-day' },
    [addDays(startDate, 3)]: { planId: 'old-town-walk' },
    [addDays(startDate, 4)]: { planId: 'night-market' },
  };
}

export function createTripId() {
  return `trip-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

export function createExampleTripSnapshot(name = '青岛 5 日示例', startDate = getTodayId(), id = createTripId()) {
  return {
    id,
    name,
    startDateStr: startDate,
    tripDays: DEFAULT_TRIP_DAYS,
    plans: createExamplePlans(startDate),
    schedule: createExampleSchedule(startDate),
    lodgings: [],
    placeFeedback: {},
    stopOutcomes: {},
    dayReviews: {},
    archiveSummary: null,
    archived: false,
  };
}

export function createEmptyTripSnapshot(name = '新旅行计划', startDate = getTodayId(), id = createTripId()) {
  return {
    id,
    name,
    startDateStr: startDate,
    tripDays: DEFAULT_TRIP_DAYS,
    plans: [],
    schedule: {},
    lodgings: [],
    placeFeedback: {},
    stopOutcomes: {},
    dayReviews: {},
    archiveSummary: null,
    checklistText: '',
    checklistState: {},
    archived: false,
  };
}
