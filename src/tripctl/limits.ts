/** Existing format-1 limits; diagnostics do not increase or bypass them. */
export const MAX_STORE_BYTES = 16 * 1024 * 1024;
export const MAX_HISTORY_EVENTS = 200;

/** Format2 bounds are independent of legacy full-snapshot history. Physical limit stays 16 MiB. */
export const MAX_STORAGE2_EVENTS = 2048;
export const MAX_STORAGE2_EVENT_BYTES = 2 * 1024 * 1024;
export const MAX_STORAGE2_REPLAY_BYTES = 512 * 1024 * 1024;
export const MAX_STORAGE2_PATCHES_PER_EVENT = 4096;
export const MAX_STORAGE2_PATH_DEPTH = 64;
