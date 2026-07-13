import { describe, expect, it } from 'vitest';
import { mergeAppSnapshots } from './sync';
import { PlaceFeedbackStatus, StopOutcomeStatus } from './trip';

function createSnapshot(
  placeFeedback: Record<string, unknown>,
  stopOutcomes: Record<string, unknown> = {},
) {
  return {
    appSchemaVersion: '1.0',
    snapshotVersion: 1,
    activeTripId: 'trip-1',
    trips: [{
      id: 'trip-1',
      name: 'Trip',
      startDateStr: '2026-07-10',
      tripDays: 1,
      plans: [{ id: 'plan-1', name: 'Plan' }],
      schedule: { '2026-07-10': { planId: 'plan-1' } },
      lodgings: [],
      placeFeedback,
      stopOutcomes,
      archived: false,
    }],
    checklistText: '',
    checklistState: {},
  };
}

describe('trip outcome sync', () => {
  it('uses the latest place feedback when blacklist state changed on another device', () => {
    const local = createSnapshot({
      museum: {
        key: 'museum',
        label: 'Museum',
        status: 'blacklisted',
        updatedAt: '2026-07-12T09:00:00.000Z',
      },
    });
    const remote = createSnapshot({
      museum: {
        key: 'museum',
        label: 'Museum',
        status: 'allowed',
        updatedAt: '2026-07-12T10:00:00.000Z',
      },
    });

    const merged = mergeAppSnapshots(local, remote);

    const mergedTrip = merged.trips[0] as { placeFeedback: Record<string, { status: string }> };
    expect(mergedTrip.placeFeedback.museum.status).toBe(PlaceFeedbackStatus.Allowed);
  });

  it('uses the latest stop outcome without turning it into a global blacklist', () => {
    const key = '2026-07-10:plan-1:stop-1';
    const local = createSnapshot({}, {
      [key]: {
        key,
        dateId: '2026-07-10',
        planId: 'plan-1',
        stopId: 'stop-1',
        stopTitle: 'Museum',
        status: 'abandoned',
        updatedAt: '2026-07-12T10:00:00.000Z',
      },
    });
    const remote = createSnapshot({}, {
      [key]: {
        key,
        dateId: '2026-07-10',
        planId: 'plan-1',
        stopId: 'stop-1',
        stopTitle: 'Museum',
        status: 'active',
        updatedAt: '2026-07-12T11:00:00.000Z',
      },
    });

    const merged = mergeAppSnapshots(local, remote);
    const mergedTrip = merged.trips[0] as {
      placeFeedback: Record<string, unknown>;
      stopOutcomes: Record<string, { status: string }>;
    };

    expect(mergedTrip.stopOutcomes[key].status).toBe(StopOutcomeStatus.Active);
    expect(mergedTrip.placeFeedback).toEqual({});
  });
});
