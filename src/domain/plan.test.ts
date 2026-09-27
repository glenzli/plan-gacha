import { describe, expect, it } from 'vitest';
import {
  formatStopTransfer,
  formatStopTransferDeparture,
  getPlanWeatherLocations,
  getWeatherLocationKey,
  hasCoordinates,
  normalizeExternalLinkUrl,
  normalizeLocation,
  normalizePlan,
  normalizePlanReminders,
  normalizeStopTransfer,
} from './plan';

const tripDates = [
  { id: '2026-07-10' },
  { id: '2026-07-11' },
];

describe('location normalization', () => {
  it('normalizes explicit weather location metadata for geocoding', () => {
    expect(normalizeLocation({
      label: '京都铁道博物馆',
      address: '京都府京都市下京区观喜寺町',
      weather_location: {
        query: 'Kyoto',
        country: 'Japan',
        prefecture: 'Kyoto',
        city: 'Kyoto',
      },
    })).toMatchObject({
      label: '京都铁道博物馆',
      query: 'Kyoto',
      countryCode: 'JP',
      admin1: 'Kyoto',
      admin2: 'Kyoto',
      address: '京都府京都市下京区观喜寺町',
    });
  });

  it('uses inherited weather source for stop display-only location strings', () => {
    const plan = normalizePlan({
      id: 'rainy-museum',
      name: '室内博物馆',
      location: { label: '京都市', query: 'Kyoto', weatherLabel: '京都市' },
      stops: ['京都铁道博物馆'],
    }, 0, tripDates);

    expect(plan.stops[0].location).toMatchObject({
      label: '京都铁道博物馆',
      query: '京都市',
      weatherLabel: '京都市',
    });
  });

  it('treats 0,0 imported coordinates as empty placeholders', () => {
    const location = normalizeLocation({
      label: '奈良市及周边',
      query: 'Nara, Nara, Japan',
      weatherLabel: 'Nara, Nara, Japan',
      latitude: 0,
      longitude: 0,
      countryCode: 'JP',
      admin1: 'Nara',
      address: '奈良県奈良市',
    });

    expect(hasCoordinates(location)).toBe(false);
    expect(getWeatherLocationKey(location)).not.toBe('0,0');
    expect(getWeatherLocationKey(location)).toContain('jp');
  });
});

describe('transit normalization', () => {
  it('normalizes transfer aliases and estimates departure from arrival time', () => {
    const transfer = normalizeStopTransfer({
      method: '近铁电车',
      travel_time: '５０分钟',
      arrival_time: '13:00',
    });

    expect(formatStopTransfer(transfer)).toBe('近铁电车 · ５０分钟');
    expect(formatStopTransferDeparture(transfer, '', 'zh')).toBe('约 12:10');
    expect(normalizeStopTransfer({ mode: '出租车', preferred_route_mode: 'walking' })?.preferredRouteMode).toBe('walking');
    expect(normalizeStopTransfer({ mode: '出租车', preferred_route_mode: 'teleport' })?.preferredRouteMode).toBeNull();
  });
});

describe('link normalization', () => {
  it('unwraps markdown links and google search url wrappers', () => {
    expect(normalizeExternalLinkUrl('[https://www.kobe-anu-k.jp/](https://www.google.com/search?q=https://www.kobe-anu-k.jp/)'))
      .toBe('https://www.kobe-anu-k.jp/');
  });

  it('extracts reminder links and strips raw url noise from text', () => {
    expect(normalizePlanReminders([
      '出门前查看官网（[运营状态](https://example.com/status)）避免白跑。',
    ])).toEqual([
      {
        id: 'reminder-1',
        time: '',
        text: '出门前查看官网（运营状态）避免白跑。',
        links: [{ label: '运营状态', url: 'https://example.com/status' }],
      },
    ]);
  });
});

describe('plan normalization', () => {
  it('normalizes weather rules, booking aliases, reminders, and ignores unused tags', () => {
    const plan = normalizePlan({
      id: 'nara',
      name: '奈良亲子线',
      must: true,
      tags: ['AI 自作主张'],
      weather_rules: {
        best: ['sunny', 'heavy_rain'],
        ok: ['cloudy'],
        blocked: ['rain'],
      },
      stops: [
        {
          time: '10:00',
          title: '迷你铁道公园',
          location: {
            label: '迷你铁道公园',
            weather_location: '大和郡山市',
          },
          weather_relevant: true,
          opening_hours: '10:00-16:00',
        },
      ],
      reservations: [
        {
          title: '入馆券',
          kind: 'ticket',
          booked: true,
          link: 'https://example.com/ticket',
        },
      ],
    }, 0, tripDates);

    expect(plan.priority).toBe('must');
    expect(plan).not.toHaveProperty('tags');
    expect(plan.weather_rules).toEqual({
      best: ['sunny'],
      ok: ['cloudy', 'heavy_rain'],
      blocked: ['rain', 'storm'],
    });
    expect(plan.bookings).toEqual([
      {
        id: 'booking-1',
        type: 'ticket',
        title: '入馆券',
        status: 'done',
        address: '',
        url: 'https://example.com/ticket',
        cancelUrl: '',
        note: '',
      },
    ]);
    expect(plan.stops[0].openingHours).toBe('10:00-16:00');
  });

  it('defaults available dates to the full trip range', () => {
    expect(normalizePlan({ id: 'p1', name: 'Plan' }, 0, tripDates).available_dates)
      .toEqual(['2026-07-10', '2026-07-11']);
  });

  it('deduplicates weather locations and skips weather-irrelevant stops', () => {
    const plan = normalizePlan({
      id: 'mixed',
      name: '混合行程',
      location: { label: '大阪市', query: 'Osaka', weatherLabel: '大阪市' },
      stops: [
        { title: '酒店出发', location: { label: '酒店', query: 'Osaka' }, weatherRelevant: false },
        { title: '大阪城', location: { label: '大阪城', query: 'Osaka' }, weatherRelevant: true },
      ],
    }, 0, tripDates);

    expect(getPlanWeatherLocations(plan).map((location) => location.weatherLabel || location.label))
      .toEqual(['大阪市']);
  });

  it('inherits plan weather source for stop map queries in the same city', () => {
    const plan = normalizePlan({
      id: 'kyoto-classics',
      name: '京都经典线',
      location: {
        label: '京都市',
        query: 'Kyoto, Japan',
        weather_location: {
          query: 'Kyoto, Japan',
          country_code: 'JP',
          admin1: 'Kyoto',
          city: 'Kyoto',
        },
      },
      stops: [
        {
          title: '鸭川三角洲',
          location: {
            label: '鸭川三角洲',
            query: 'Kamogawa',
            address: '京都府京都市左京区',
          },
        },
      ],
    }, 0, tripDates);

    expect(getPlanWeatherLocations(plan).map((location) => location.query)).toEqual(['Kyoto, Japan']);
    expect(plan.stops[0].location).toMatchObject({
      label: '鸭川三角洲',
      query: 'Kyoto, Japan',
      weatherLabel: 'Kyoto',
    });
  });

  it('prefers administrative stop fields over plain map query for weather', () => {
    const plan = normalizePlan({
      id: 'kyoto-admin-stop',
      name: '京都行政字段',
      location: {
        label: '京都市',
        weather_location: {
          query: 'Kyoto, Japan',
          country_code: 'JP',
          admin1: 'Kyoto',
          city: 'Kyoto',
        },
      },
      stops: [
        {
          title: '鸭川三角洲',
          location: {
            label: '鸭川三角洲',
            query: 'Kamogawa',
            city: 'Kyoto',
            country: 'Japan',
          },
        },
      ],
    }, 0, tripDates);

    expect(plan.stops[0].location.query).toBe('Kyoto');
    expect(getPlanWeatherLocations(plan).map((location) => location.query))
      .toEqual(['Kyoto']);
  });

  it('keeps explicit cross-city stop weather locations', () => {
    const plan = normalizePlan({
      id: 'kyoto-to-otsu',
      name: '京都和大津',
      location: {
        label: '京都市',
        weather_location: {
          query: 'Kyoto, Japan',
          country_code: 'JP',
          admin1: 'Kyoto',
          city: 'Kyoto',
        },
      },
      stops: [
        {
          title: '琵琶湖露台',
          location: {
            label: '琵琶湖露台',
            address: '滋賀県大津市木戸',
            weather_location: {
              query: 'Otsu, Shiga, Japan',
              country_code: 'JP',
              admin1: 'Shiga',
              city: 'Otsu',
            },
          },
        },
      ],
    }, 0, tripDates);

    expect(getPlanWeatherLocations(plan).map((location) => location.query))
      .toEqual(['Otsu, Shiga, Japan', 'Kyoto, Japan']);
  });
});
