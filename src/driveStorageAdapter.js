const DRIVE_STORAGE_SCRIPT = '/drive-storage/driveStorage.js';

function isDriveStorageApi(api) {
  return typeof api?.forApp === 'function';
}

function isDriveStorage(storage) {
  return storage
    && typeof storage.status === 'function'
    && typeof storage.connect === 'function'
    && typeof storage.create === 'function'
    && typeof storage.load === 'function'
    && typeof storage.save === 'function';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Drive storage is browser-only'));
      return;
    }

    const absoluteSrc = new URL(src, window.location.href).href;
    const existing = Array.from(document.scripts).find((script) => script.src === absoluteSrc);
    if (existing) {
      if (window.driveStorage) {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      window.setTimeout(() => {
        if (window.driveStorage) resolve();
        else reject(new Error(`Failed to load ${src}`));
      }, 5000);
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(script);
  });
}

export async function getDriveStorageApi() {
  if (typeof window === 'undefined') return null;

  if (window.driveStorage) return window.driveStorage;

  try {
    if (window.parent?.driveStorage) return window.parent.driveStorage;
  } catch {
    // Cross-origin parent, ignore.
  }

  try {
    await loadScript(DRIVE_STORAGE_SCRIPT);
    return window.driveStorage || null;
  } catch {
    return null;
  }
}

export async function createPlanGachaDriveStorage() {
  const api = await getDriveStorageApi();
  if (!isDriveStorageApi(api)) return null;

  const storage = api.forApp({
    appId: 'plan-gacha',
    fileName: 'plan-gacha.state.json',
    schemaVersion: 1,
  });

  return isDriveStorage(storage) ? storage : null;
}
