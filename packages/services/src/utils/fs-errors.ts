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
