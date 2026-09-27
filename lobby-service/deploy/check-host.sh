#!/bin/sh
# Read-only prerequisite check; does not install packages or start containers.
set -eu
if [ "$(uname -s)" != Linux ]; then
  echo 'Linux host networking is required.' >&2
  exit 1
fi
if [ -r /etc/os-release ]; then
  . /etc/os-release
  printf 'Host: %s\n' "$PRETTY_NAME"
fi
command -v python3 >/dev/null
command -v docker >/dev/null
command -v systemctl >/dev/null
docker compose version
docker info --format '{{.ServerVersion}}'
python3 -c 'import ssl, ipaddress, fcntl; print("Python prerequisites available")'
printf 'Prerequisites available. Inspect ports with: sudo ss -lntup\n'
