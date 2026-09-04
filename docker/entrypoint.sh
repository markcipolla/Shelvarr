#!/bin/sh
# Run Shelvarr as the user that owns your library.
#
# The image ships a `shelvarr` user, but a bind-mounted library belongs to
# whatever uid created it on the host — and a container user that does not match
# cannot write to it, so every comic import dies with EACCES. Follow the *arr
# convention instead: start as root, move the `shelvarr` user onto PUID/PGID,
# then drop privileges for the app itself.
set -e

umask "${UMASK:-022}"

# Someone set `user:` in their compose file: they have already picked the uid,
# and we have no privileges left to change anything anyway.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

PUID="${PUID:-1001}"
PGID="${PGID:-1001}"

if [ "$(id -g shelvarr)" != "$PGID" ]; then
  # -o allows sharing an id with a user the base image already defines.
  groupmod -o -g "$PGID" shelvarr
fi
if [ "$(id -u shelvarr)" != "$PUID" ]; then
  usermod -o -u "$PUID" -g "$PGID" shelvarr
fi

echo "[shelvarr] running as ${PUID}:${PGID} (umask ${UMASK:-022})"

# The data volume was created under the build-time uid, or by Docker as root,
# and `.next` holds the render cache the server writes to. The library mounts
# are deliberately left alone — they are the host's, not ours to re-own.
for dir in /app/data /app/apps/web/.next; do
  [ -d "$dir" ] || continue
  chown -R shelvarr:shelvarr "$dir" 2>/dev/null ||
    echo "[shelvarr] warning: could not take ownership of $dir"
done

exec su-exec shelvarr "$@"
