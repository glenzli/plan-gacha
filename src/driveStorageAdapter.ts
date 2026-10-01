import { writeStoredValue } from './domain/appStorage';
import type {
  DriveFileLocator,
  DriveStorageConflictDetails,
  DriveStorageError,
  DriveStorageFile,
  DriveStorageStatus,
  ExternalDriveStorageApi,
  PlanGachaDriveStorage,
} from './types/driveStorage';

const DRIVE_STORAGE_SCRIPT = '/drive-storage/driveStorage.js';
const APP_ID = 'plan-gacha';
const FILE_NAME = 'plan-gacha.state.json';
const JSON_MIME = 'application/json';
const FILE_RECORD_KEY = `driveStorage:${APP_ID}:file`;
const APP_PROPERTIES = { appId: APP_ID };

declare global {
  interface Window {
    driveStorage?: ExternalDriveStorageApi;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isDriveStorageApi(api: unknown): api is ExternalDriveStorageApi {
  return Boolean(
    api
      && typeof api === 'object'
      && typeof (api as ExternalDriveStorageApi).connect === 'function'
      && typeof (api as ExternalDriveStorageApi).getFile === 'function'
      && typeof (api as ExternalDriveStorageApi).findFile === 'function'
      && typeof (api as ExternalDriveStorageApi).createFile === 'function'
      && typeof (api as ExternalDriveStorageApi).readJson === 'function'
      && typeof (api as ExternalDriveStorageApi).writeJson === 'function',
  );
}

function getDriveStatus(api: ExternalDriveStorageApi): DriveStorageStatus {
  if (typeof api.status === 'function') return api.status();
  return {
    provider: 'google-drive',
    configured: typeof api.isConfigured === 'function' ? api.isConfigured() : true,
    connected: false,
  };
}

function getConfigured(api: ExternalDriveStorageApi) {
  if (typeof api.isConfigured === 'function') return api.isConfigured();
  return getDriveStatus(api).configured !== false;
}

function normalizeFileRecord(file: unknown): DriveStorageFile | null {
  if (!isRecord(file) || !file.id) return null;
  return {
    id: String(file.id),
    name: file.name == null ? null : String(file.name),
    mimeType: file.mimeType == null ? null : String(file.mimeType),
    resourceKey: file.resourceKey == null ? null : String(file.resourceKey),
    modifiedTime: file.modifiedTime == null ? null : String(file.modifiedTime),
    version: typeof file.version === 'string' || typeof file.version === 'number' ? file.version : null,
    appProperties: isRecord(file.appProperties) ? file.appProperties : {},
    webViewLink: file.webViewLink == null ? null : String(file.webViewLink),
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

export function getStoredDriveStorageFile() {
  return getStoredFile();
}

export function hasStoredDriveStorageFile() {
  return Boolean(getStoredFile()?.id);
}

function setStoredFile(file: unknown) {
  const record = normalizeFileRecord(file);
  if (!record) return null;
  writeStoredValue(FILE_RECORD_KEY, JSON.stringify(record));
  return record;
}

function clearStoredFile() {
  writeStoredValue(FILE_RECORD_KEY, null);
}

function clearStoredFileIfMatches(file: DriveStorageFile | null | undefined) {
  const stored = getStoredFile();
  if (!file?.id || stored?.id === file.id) clearStoredFile();
}

function asDriveStorageError(error: unknown): DriveStorageError {
  if (error && typeof error === 'object') return error as DriveStorageError;
  return new Error(String(error));
}

function isFileNotFoundError(error: unknown) {
  const errorLike = asDriveStorageError(error);
  return errorLike.code === 'file_not_found' || errorLike.name === 'DriveStorageFileNotFoundError';
}

function createLocator(): DriveFileLocator {
  return {
    name: FILE_NAME,
    mimeType: JSON_MIME,
    appProperties: APP_PROPERTIES,
  };
}

function unwrapLegacyEnvelope(data: unknown) {
  if (
    isRecord(data)
    && (data.format === 'driveStorage/v1' || data.format === 'jsonStorage/v1')
    && Object.prototype.hasOwnProperty.call(data, 'payload')
  ) {
    return data.payload;
  }
  return data;
}

function createConflictError(
  api: ExternalDriveStorageApi,
  message: string,
  details: DriveStorageConflictDetails = {},
) {
  if (typeof api.DriveStorageConflictError === 'function') {
    return new api.DriveStorageConflictError(message, details);
  }

  const error = new Error(message) as DriveStorageError;
  error.name = 'DriveStorageConflictError';
  error.remote = details.remote ?? null;
  error.local = details.local ?? null;
  return error;
}

let scriptLoad: Promise<void> | null = null;
let scriptAttempt = 0;
const failedScripts = new WeakSet<HTMLScriptElement>();

function loadScript(src: string) {
  if (scriptLoad) return scriptLoad;
  const pending = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('Drive storage is browser-only')); return; }
    const absoluteSrc = new URL(src, window.location.href).href;
    const attempt = ++scriptAttempt;
    const existing = Array.from(document.scripts).find((script) => script.src.split('?')[0] === absoluteSrc.split('?')[0] && !failedScripts.has(script));
    const script = existing || document.createElement('script');
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', finish);
      if (isDriveStorageApi(window.driveStorage)) resolve();
      else {
        failedScripts.add(script);
        if (!existing) script.remove();
        reject(new Error(`Failed to load ${src}`));
      }
    };
    const timer = window.setTimeout(finish, 5000);
    script.addEventListener('load', finish);
    script.addEventListener('error', finish);
    if (!existing) {
      const retrySrc = new URL(absoluteSrc);
      if (attempt > 1) retrySrc.searchParams.set('pg_sync_retry', String(attempt));
      script.src = retrySrc.href;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });
  scriptLoad = pending.finally(() => { scriptLoad = null; });
  return scriptLoad;
}

export async function getDriveStorageApi() {
  if (typeof window === 'undefined') return null;

  if (isDriveStorageApi(window.driveStorage)) return window.driveStorage;

  try {
    if (isDriveStorageApi(window.parent?.driveStorage)) return window.parent.driveStorage;
  } catch {
    // Cross-origin parent, ignore.
  }

  try {
    await loadScript(DRIVE_STORAGE_SCRIPT);
    return isDriveStorageApi(window.driveStorage) ? window.driveStorage : null;
  } catch {
    return null;
  }
}

export async function createPlanGachaDriveStorage(): Promise<PlanGachaDriveStorage | null> {
  const api = await getDriveStorageApi();
  if (!api) return null;

  const findFile = async () => {
    const file = normalizeFileRecord(await api.findFile(createLocator()));
    if (file?.id) setStoredFile(file);
    return file ? { file } : null;
  };

  const getCurrentFile = async (file: DriveStorageFile | null) => {
    if (!file?.id) return file;
    try {
      return normalizeFileRecord(await api.getFile(file.id)) || file;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        clearStoredFileIfMatches(file);
        throw error;
      }
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

  const storage: PlanGachaDriveStorage = {
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
      return storage.status();
    },
    async disconnect(options = {}) {
      if (options.forgetFile) clearStoredFile();
      if (typeof api.disconnect === 'function') await api.disconnect(options);
      return storage.status();
    },
    forgetFile() {
      clearStoredFile();
      return storage.status();
    },
    findFile,
    async create(payload = {}, options = {}) {
      if (options.reuseExisting !== false) {
        const existing = await findFile();
        if (existing?.file?.id) {
          throw createConflictError(api, 'An existing Drive file matched the app locator.', {
            remote: existing.file,
            local: getStoredFile(),
          });
        }
      }

      const file = normalizeFileRecord(await api.createFile({
        ...createLocator(),
        content: JSON.stringify(payload, null, 2),
      }));
      setStoredFile(file);
      return { file, payload };
    },
    async load() {
      const file = await resolveFile();
      if (!file?.id) {
        const error = new Error('No Drive file is selected or discoverable.') as DriveStorageError;
        error.name = 'DriveStorageError';
        error.code = 'file_not_found';
        throw error;
      }

      const readPayload = async (targetFile: DriveStorageFile) => {
        try {
          const payload = await api.readJson(targetFile.id);
          setStoredFile(await getCurrentFile(targetFile));
          return unwrapLegacyEnvelope(payload);
        } catch (error) {
          if (isFileNotFoundError(error)) clearStoredFileIfMatches(targetFile);
          throw error;
        }
      };

      try {
        return await readPayload(file);
      } catch (error) {
        if (!isFileNotFoundError(error)) throw error;

        const recovered = await findFile();
        if (recovered?.file?.id) return readPayload(recovered.file);
        throw error;
      }
    },
    async save(payload, options = {}) {
      const file = await resolveFile();
      if (!file?.id) {
        const created = await storage.create(payload, { reuseExisting: false });
        return { ...created, skipped: false };
      }

      const writePayload = async (targetFile: DriveStorageFile) => {
        const local = getStoredFile();
        const current = await getCurrentFile(targetFile);
        if (!options.force && local?.version && current?.version && local.version !== current.version) {
          throw createConflictError(api, 'The Drive file changed after the last local load.', {
            remote: current,
            local,
          });
        }

        try {
          const updatedFile = normalizeFileRecord(await api.writeJson(targetFile.id, payload, {
            mimeType: JSON_MIME,
            appProperties: APP_PROPERTIES,
            space: 2,
          }));
          setStoredFile(updatedFile);
          return { file: updatedFile, payload, skipped: false };
        } catch (error) {
          if (isFileNotFoundError(error)) clearStoredFileIfMatches(targetFile);
          throw error;
        }
      };

      try {
        return await writePayload(file);
      } catch (error) {
        if (!isFileNotFoundError(error)) throw error;

        const recovered = await findFile();
        if (recovered?.file?.id) return writePayload(recovered.file);

        const created = await storage.create(payload, { reuseExisting: false });
        return { ...created, skipped: false };
      }
    },
  };

  return storage;
}
