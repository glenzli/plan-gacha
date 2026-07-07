import { describe, expect, it } from 'vitest';
import {
  formatStopTransfer,
  formatStopTransferDeparture,
  getPlanWeatherLocations,
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
      query: 'Kyoto',
      weatherLabel: '京都市',
    });
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
      .toEqual(['Osaka']);
  });
});
