/**
 * Turn a filesystem permissions failure into something a user can act on.
 *
 * The bare `EACCES: permission denied, unlink /libraries/…` that Node throws
 * says nothing about *who* was denied, and the answer is nearly always that a
 * library bind mount belongs to a different uid than the one the container
 * runs as. Name both, and the fix.
 *
 * `directory` is the folder whose permissions govern the operation — for a
 * delete that is the file's parent, not the file itself.
 */
export function describeWriteFailure(
  directory: string,
  error: unknown,
  action = 'write to'
): Error {
  const code = (error as NodeJS.ErrnoException).code;

  // A stale handle means the filesystem that was mounted here has gone: the
  // host unmounted or replaced it under the running container, so every
  // operation on the path fails until it is mounted again. libuv has no name
  // for ESTALE, so Node reports it as `Unknown system error -116` (Linux's
  // errno for it) with code `UNKNOWN`, which tells nobody anything.
  if (code === 'ESTALE' || (error as NodeJS.ErrnoException).errno === -116) {
    return new Error(
      `Cannot ${action} ${directory}: the filesystem mounted there has gone stale. ` +
        'Whatever the host had mounted at that path is no longer there — fix the ' +
        'mount and restart the container.'
    );
  }

  if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EROFS') {
    return error instanceof Error ? error : new Error(String(error));
  }

  const uid = process.getuid?.();
  const gid = process.getgid?.();
  const who = uid === undefined ? 'this process' : `uid ${uid}:${gid}`;
  const remedy =
    code === 'EROFS'
      ? 'the mount is read-only — mount it `:rw`'
      : `grant ${who} write access to that folder, or set PUID/PGID to the ` +
        'user that owns your library';

  return new Error(`Cannot ${action} ${directory} as ${who}: ${remedy}.`);
}
