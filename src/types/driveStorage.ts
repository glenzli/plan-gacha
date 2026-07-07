export interface DriveStorageFile {
  id: string;
  name?: string | null;
  mimeType?: string | null;
  resourceKey?: string | null;
  modifiedTime?: string | null;
  version?: string | number | null;
  appProperties?: Record<string, unknown>;
  webViewLink?: string | null;
  canEdit?: boolean | null;
}

export interface DriveStorageStatus {
  provider?: string;
  configured?: boolean;
  connected?: boolean;
  file?: DriveStorageFile | null;
}

export interface DriveFileLocator {
  name: string;
  mimeType: string;
  appProperties: Record<string, string>;
}

export interface DriveFileCreateOptions extends DriveFileLocator {
  content: string;
}

export interface DriveJsonWriteOptions {
  mimeType: string;
  appProperties: Record<string, string>;
  space?: number;
}

export interface DriveStorageConflictDetails {
  remote?: DriveStorageFile | null;
  local?: DriveStorageFile | null;
}

export interface DriveStorageError extends Error {
  code?: string;
  remote?: DriveStorageFile | null;
  local?: DriveStorageFile | null;
}

export interface ExternalDriveStorageApi {
  connect: (options?: Record<string, unknown>) => Promise<unknown>;
  disconnect?: (options?: Record<string, unknown>) => Promise<unknown>;
  getFile: (fileId: string) => Promise<unknown>;
  findFile: (locator: DriveFileLocator) => Promise<unknown>;
  createFile: (options: DriveFileCreateOptions) => Promise<unknown>;
  readJson: (fileId: string) => Promise<unknown>;
  writeJson: (
    fileId: string,
    payload: unknown,
    options: DriveJsonWriteOptions,
  ) => Promise<unknown>;
  status?: () => DriveStorageStatus;
  isConfigured?: () => boolean;
  DriveStorageConflictError?: new (
    message: string,
    details?: DriveStorageConflictDetails,
  ) => Error;
}

export interface PlanGachaDriveStorage {
  provider: 'google-drive';
  readonly available?: boolean;
  status: () => DriveStorageStatus;
  connect: (options?: Record<string, unknown>) => Promise<DriveStorageStatus>;
  disconnect: (options?: { forgetFile?: boolean }) => Promise<DriveStorageStatus>;
  forgetFile: () => DriveStorageStatus;
  findFile: () => Promise<{ file: DriveStorageFile | null } | null>;
  create: (
    payload?: unknown,
    options?: { reuseExisting?: boolean },
  ) => Promise<{ file: DriveStorageFile | null; payload: unknown }>;
  load: () => Promise<unknown>;
  save: (
    payload: unknown,
    options?: { force?: boolean },
  ) => Promise<{ file: DriveStorageFile | null; payload: unknown; skipped: boolean }>;
}
