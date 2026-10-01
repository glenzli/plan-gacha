import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DriveSyncPanel } from './DriveSyncPanel';
import type { ComponentProps } from 'react';

function render(overrides: Partial<ComponentProps<typeof DriveSyncPanel>> = {}) {
  return renderToStaticMarkup(<DriveSyncPanel
    driveStorage={{ available: true }} driveStatus={{ configured: true, connected: false }}
    driveBusy="" driveError="" driveOffline={false} driveConflict={false} driveAutoSync={false}
    setDriveAutoSync={vi.fn()} loadDriveFile={vi.fn()} mergeDriveFile={vi.fn()} overwriteDriveFile={vi.fn()}
    syncDrive={vi.fn()} redetectDriveStorage={vi.fn()} exportLocalBackup={vi.fn()} reloadSite={vi.fn()}
    t={(key) => key} language="en" {...overrides}
  />);
}

function button(markup: string, label: string) {
  return markup.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];
}

describe('sync recovery actions', () => {
  it('keeps retry, site reload and backup usable when the host is not configured', () => {
    const html = render({ driveStorage: { available: false }, driveStatus: { configured: false, file: { id: 'remembered', name: 'saved.json', modifiedTime: '2026-10-01T00:27:00Z' } } });
    expect(html).toContain('driveNotConfiguredHelp');
    expect(html).toContain('driveStoredFile');
    expect(html).toContain('driveLastKnownUpdatedAt');
    expect(button(html, 'driveConnectAndSync')).toContain('disabled');
    for (const label of ['driveRedetect', 'driveReloadSite', 'driveExportLocalBackup']) {
      expect(button(html, label)).toBeDefined();
      expect(button(html, label)).not.toContain('disabled');
    }
  });

  it('shows a recovery panel even if the SDK is missing, and distinguishes offline from missing configuration', () => {
    const missing = render({ driveStorage: null, driveStatus: null });
    expect(missing).toContain('driveUnavailableHelp');
    expect(button(missing, 'driveRedetect')).not.toContain('disabled');
    const offline = render({ driveStorage: null, driveStatus: null, driveOffline: true });
    expect(offline).toContain('driveOfflineHelp');
    expect(offline).not.toContain('driveNotConfiguredHelp');
  });

  it('offers actual connect-and-sync for signed-out users and keeps the last known file separate', () => {
    const html = render({ driveStatus: { configured: true, connected: false, file: { id: 'remembered' } } });
    expect(html).toContain('driveNotConnectedHelp');
    expect(html).toContain('driveStoredFile');
    expect(button(html, 'driveConnectAndSync')).not.toContain('disabled');
    expect(html).not.toContain('driveReloadSite');
  });

  it('disables concurrent checks while detecting but leaves local backup available', () => {
    const html = render({ driveBusy: 'detect', driveError: 'driveDetectionFailed' });
    expect(button(html, 'driveDetecting')).toContain('disabled');
    expect(button(html, 'driveConnectAndSync')).toContain('disabled');
    expect(button(html, 'driveExportLocalBackup')).not.toContain('disabled');
    expect(html).toContain('role="alert"');
  });
});
