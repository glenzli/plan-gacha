import { constants } from 'node:fs';
import { open, readFile, rename, unlink, copyFile, stat, lstat, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { apply, canonical, hash, parseState } from './engine';
import { TripError, type TripState } from './schema';
const MAX_BYTES = 16 * 1024 * 1024;
export async function loadState(path: string) {
  const info = await lstat(path); if (!info.isFile() || info.size > MAX_BYTES) throw new TripError('invalid_file', 'State must be a regular file smaller than 16 MiB');
  try { return parseState(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) { if (error instanceof TripError) throw error; throw new TripError('invalid_state', 'Unable to parse journey state'); }
}
/** Atomic local replacement + fsync. External durability still needs an acknowledged versioned backup. */
export async function atomicWrite(path: string, state: TripState) {
  const bytes = `${JSON.stringify(parseState(state), null, 2)}\n`;
  if (Buffer.byteLength(bytes) > MAX_BYTES) throw new TripError('state_too_large', 'State exceeds prototype size limit');
  const temporary = `${path}.${randomUUID()}.tmp`; const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary, path); const directory = await open(dirname(path), 'r'); try { await directory.sync(); } finally { await directory.close(); } }
  finally { await unlink(temporary).catch(() => {}); }
}
async function withLock<T>(path: string, body: () => Promise<T>) {
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
    return { ...result.receipt, saved: true, durability: 'local_filesystem', externalCheckpointVerified: false, stateHash: hash(result.state) };
  });
}
export async function stageStore(path: string, output: string, mutation: unknown) {
  if (resolve(path) === resolve(output)) throw new TripError('invalid_output', 'Stage output must differ from the authoritative working file');
  const base = await loadState(path); const result = await apply(base, mutation);
  await createStore(output, result.state);
  return { ...result.receipt, saved: false, durability: 'candidate_only', baseRevision: base.revision, baseStateHash: hash(base), candidateStateHash: hash(result.state), candidate: resolve(output) };
}
