import { constants } from 'node:fs';
import { open, rename, unlink, copyFile, stat, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { apply, canonical, hash, parseState } from './engine';
import { TripError, type TripState } from './schema';
import { storageIdentity } from './storage2';
import { MAX_STORE_BYTES } from './limits';
export const fileHash = (bytes: string | Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const serializeState = (state: TripState) => {
  const bytes = `${JSON.stringify(parseState(state), null, 2)}\n`;
  if (Buffer.byteLength(bytes) > MAX_STORE_BYTES) throw new TripError('state_too_large', 'Serialized container exceeds 16 MiB');
  return bytes;
};
export async function loadStore(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size > MAX_STORE_BYTES) throw new TripError('invalid_file', 'State must be a regular file at most 16 MiB');
    const raw = await handle.readFile(); if (raw.length > MAX_STORE_BYTES) throw new TripError('state_too_large', 'File grew beyond 16 MiB');
    try { const state = parseState(JSON.parse(raw.toString('utf8'))); return { state, raw, fileHash: fileHash(raw), ...storageIdentity(state) }; }
    catch (error) { if (error instanceof TripError) throw error; throw new TripError('invalid_state', 'Unable to parse journey state'); }
  } finally { await handle.close(); }
}
export async function loadState(path: string) { return (await loadStore(path)).state; }
export async function syncDirectory(path: string) { const handle = await open(dirname(path), 'r'); try { await handle.sync(); } finally { await handle.close(); } }
/** Exact bytes, exclusive creation; clean up only the file this invocation created. */
export async function exclusiveWrite(path: string, bytes: string | Buffer) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await handle.close(); await unlink(path); throw error; }
  await handle.close(); await syncDirectory(path);
}
export async function atomicWriteBytes(path: string, bytes: string | Buffer) {
  if (Buffer.byteLength(bytes) > MAX_STORE_BYTES) throw new TripError('state_too_large', 'Container exceeds 16 MiB');
  const temporary = `${path}.${randomUUID()}.tmp`; let renamed = false;
  try {
    await exclusiveWrite(temporary, bytes); await rename(temporary, path); renamed = true; await syncDirectory(path);
  } catch (error) {
    if (renamed) throw new TripError('save_outcome_unknown', 'Replacement occurred but durability acknowledgment failed; verify fileHash and retained backup before retrying');
    throw error;
  } finally { await unlink(temporary).catch(() => {}); }
}
/** Atomic local replacement; external durability still needs acknowledged same-identity CAS. */
export async function atomicWrite(path: string, state: TripState) { await atomicWriteBytes(path, serializeState(state)); }
export async function withLock<T>(path: string, body: () => Promise<T>) {
  const lock = `${path}.lock`; let handle;
  try { handle = await open(lock, 'wx', 0o600); } catch { throw new TripError('store_busy', 'Another writer or retained recovery lock owns this path; do not delete its lock automatically'); }
  try { await handle.writeFile(`${process.pid}\n`); return await body(); }
  finally { await handle.close(); await unlink(lock); }
}
export async function createStore(path: string, state: TripState) {
  const absolute = resolve(path); await mkdir(dirname(absolute), { recursive: true });
  return withLock(absolute, async () => {
    try { await stat(absolute); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { await atomicWrite(absolute, state); return; } throw error; }
    throw new TripError('already_exists', 'Initialize never overwrites an existing journey');
  });
}
export async function commitStore(path: string, mutation: unknown) {
  const absolute = resolve(path);
  return withLock(absolute, async () => {
    const before = await loadState(absolute); const result = await apply(before, mutation);
    if (!result.receipt.replayed) {
      const backup = `${absolute}.rev-${before.revision}.json`;
      try { await copyFile(absolute, backup, constants.COPYFILE_EXCL); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (canonical(await loadState(backup)) !== canonical(before)) throw new TripError('backup_conflict', 'Existing checkpoint differs; retain files for recovery'); }
      const checkpoint = await open(backup, 'r'); try { await checkpoint.sync(); } finally { await checkpoint.close(); }
      await atomicWrite(absolute, result.state);
    }
    if (result.receipt.replayed) {
      const currentFile = await open(absolute, 'r'); try { await currentFile.sync(); } finally { await currentFile.close(); }
      const directory = await open(dirname(absolute), 'r'); try { await directory.sync(); } finally { await directory.close(); }
    }
    return { ...result.receipt, saved: true, durability: 'local_filesystem', externalCheckpointVerified: false, ...storageIdentity(result.state), fileHash: (await loadStore(absolute)).fileHash };
  });
}
export async function stageStore(path: string, output: string, mutation: unknown) {
  if (resolve(path) === resolve(output)) throw new TripError('invalid_output', 'Stage output must differ from the authoritative working file');
  const loaded = await loadStore(path); const base = loaded.state; const result = await apply(base, mutation);
  await createStore(output, result.state);
  return { ...result.receipt, saved: false, durability: 'candidate_only', baseRevision: base.revision, baseStateHash: hash(base), candidateStateHash: hash(result.state), candidate: resolve(output), baseFileHash: loaded.fileHash, baseIdentity: storageIdentity(base), candidateIdentity: storageIdentity(result.state), candidateFileHash: (await loadStore(output)).fileHash };
}
