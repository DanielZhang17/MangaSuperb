#!/bin/sh
set -eu

mkdir -p /app/logs /app/instance

rewrite_localhost_url() {
  variable_name="$1"
  eval "current_value=\${$variable_name:-}"
  if [ -z "$current_value" ]; then
    return
  fi

  rewritten_value="$(printf '%s' "$current_value" | sed \
    -e 's/@localhost:/@host.docker.internal:/g' \
    -e 's/@127\.0\.0\.1:/@host.docker.internal:/g' \
    -e 's#//localhost:#//host.docker.internal:#g' \
    -e 's#//127\.0\.0\.1:#//host.docker.internal:#g')"

  if [ "$rewritten_value" != "$current_value" ]; then
    export "$variable_name=$rewritten_value"
  fi
}

rewrite_localhost_host() {
  variable_name="$1"
  eval "current_value=\${$variable_name:-}"
  case "$current_value" in
    localhost|127.0.0.1)
      export "$variable_name=host.docker.internal"
      ;;
  esac
}

if [ "${DOCKER_REWRITE_LOCALHOST_URLS:-true}" = "true" ]; then
  rewrite_localhost_url DATABASE_URL
  rewrite_localhost_url REDIS_URL
  rewrite_localhost_host POSTGRES_HOST
  rewrite_localhost_host REDIS_HOST
fi

case "${1:-api}" in
  api)
    exec gunicorn \
      --bind "${HOST:-0.0.0.0}:${PORT:-5000}" \
      --workers "${GUNICORN_WORKERS:-2}" \
      --timeout "${GUNICORN_TIMEOUT:-600}" \
      "app:app"
    ;;
  worker)
    exec python worker.py
    ;;
  init-db)
    exec python init_db.py
    ;;
  *)
    exec "$@"
    ;;
esac
