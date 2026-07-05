const DRIVE_STORAGE_SCRIPT = '/drive-storage/driveStorage.js';
const APP_ID = 'plan-gacha';
const FILE_NAME = 'plan-gacha.state.json';
const JSON_MIME = 'application/json';
const FILE_RECORD_KEY = `driveStorage:${APP_ID}:file`;
const APP_PROPERTIES = { appId: APP_ID };

function isDriveStorageApi(api) {
  return api
    && typeof api.connect === 'function'
    && typeof api.getFile === 'function'
    && typeof api.findFile === 'function'
    && typeof api.createFile === 'function'
    && typeof api.readJson === 'function'
    && typeof api.writeJson === 'function';
}

function getDriveStatus(api) {
  if (typeof api.status === 'function') return api.status();
  return {
    provider: 'google-drive',
    configured: typeof api.isConfigured === 'function' ? api.isConfigured() : true,
    connected: false,
  };
}

function getConfigured(api) {
  if (typeof api.isConfigured === 'function') return api.isConfigured();
  return getDriveStatus(api).configured !== false;
}

function normalizeFileRecord(file) {
  if (!file?.id) return null;
  return {
    id: String(file.id),
    name: file.name ?? null,
    mimeType: file.mimeType ?? null,
    resourceKey: file.resourceKey ?? null,
    modifiedTime: file.modifiedTime ?? null,
    version: file.version ?? null,
    appProperties: file.appProperties && typeof file.appProperties === 'object' ? file.appProperties : {},
    webViewLink: file.webViewLink ?? null,
    canEdit: typeof file.canEdit === 'boolean' ? file.canEdit : null,
  };
}

function getStoredFile() {
  try {
    return normalizeFileRecord(JSON.parse(localStorage.getItem(FILE_RECORD_KEY) || 'null'));
  } catch {
    return null;
  }
}

export function hasStoredDriveStorageFile() {
  return Boolean(getStoredFile()?.id);
}

function setStoredFile(file) {
  const record = normalizeFileRecord(file);
  if (!record) return null;
  localStorage.setItem(FILE_RECORD_KEY, JSON.stringify(record));
  return record;
}

function clearStoredFile() {
  localStorage.removeItem(FILE_RECORD_KEY);
}

function createLocator() {
  return {
    name: FILE_NAME,
    mimeType: JSON_MIME,
    appProperties: APP_PROPERTIES,
  };
}

function unwrapLegacyEnvelope(data) {
  if (
    data
    && typeof data === 'object'
    && !Array.isArray(data)
    && (data.format === 'driveStorage/v1' || data.format === 'jsonStorage/v1')
    && Object.prototype.hasOwnProperty.call(data, 'payload')
  ) {
    return data.payload;
  }
  return data;
}

function createConflictError(api, message, details = {}) {
  if (typeof api.DriveStorageConflictError === 'function') {
    return new api.DriveStorageConflictError(message, details);
  }

  const error = new Error(message);
  error.name = 'DriveStorageConflictError';
  error.remote = details.remote ?? null;
  error.local = details.local ?? null;
  return error;
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

  const findFile = async () => {
    const file = await api.findFile(createLocator());
    if (file?.id) setStoredFile(file);
    return file ? { file: normalizeFileRecord(file) } : null;
  };

  const getCurrentFile = async (file) => {
    if (!file?.id) return file;
    try {
      return normalizeFileRecord(await api.getFile(file.id)) || file;
    } catch {
      return file;
    }
  };

  const resolveFile = async () => {
    const stored = getStoredFile();
    if (stored?.id) return stored;

    const found = await findFile();
    if (found?.file?.id) return found.file;
    return null;
  };

  return {
    provider: 'google-drive',
    get available() {
      return getConfigured(api);
    },
    status() {
      const status = getDriveStatus(api);
      return {
        ...status,
        provider: status.provider || 'google-drive',
        configured: status.configured ?? getConfigured(api),
        connected: Boolean(status.connected),
        file: getStoredFile(),
      };
    },
    async connect(options = {}) {
      await api.connect(options);
      return this.status();
    },
    async disconnect(options = {}) {
      if (options.forgetFile) clearStoredFile();
      if (typeof api.disconnect === 'function') await api.disconnect(options);
      return this.status();
    },
    forgetFile() {
      clearStoredFile();
      return this.status();
    },
    findFile,
    async create(payload = {}) {
      const existing = await findFile();
      if (existing?.file?.id) {
        throw createConflictError(api, 'An existing Drive file matched the app locator.', {
          remote: existing.file,
          local: getStoredFile(),
        });
      }

      const file = await api.createFile({
        ...createLocator(),
        content: JSON.stringify(payload, null, 2),
      });
      setStoredFile(file);
      return { file: normalizeFileRecord(file), payload };
    },
    async load() {
      const file = await resolveFile();
      if (!file?.id) {
        const error = new Error('No Drive file is selected or discoverable.');
        error.name = 'DriveStorageError';
        error.code = 'file_not_found';
        throw error;
      }

      const payload = await api.readJson(file.id);
      setStoredFile(await getCurrentFile(file));
      return unwrapLegacyEnvelope(payload);
    },
    async save(payload, options = {}) {
      let file = await resolveFile();
      if (!file?.id) {
        const created = await this.create(payload);
        return { ...created, skipped: false };
      }

      const local = getStoredFile();
      const current = await getCurrentFile(file);
      if (!options.force && local?.version && current?.version && local.version !== current.version) {
        throw createConflictError(api, 'The Drive file changed after the last local load.', {
          remote: current,
          local,
        });
      }

      file = await api.writeJson(file.id, payload, {
        mimeType: JSON_MIME,
        appProperties: APP_PROPERTIES,
        space: 2,
      });
      setStoredFile(file);
      return { file: normalizeFileRecord(file), payload, skipped: false };
    },
  };
}
