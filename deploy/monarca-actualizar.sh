#!/usr/bin/env bash
# Actualiza POS Monarca en la mini PC del hotel.
#
#   monarca-actualizar              instala lo último de GitHub (origin/main)
#   monarca-actualizar v1.2         instala una etiqueta, rama o commit (también sirve para regresar)
#   monarca-actualizar --forzar     reinstala aunque ya esté en esa versión
#
# Pasos: respaldo de la base → descarga → instalación y compilación → pruebas del servidor →
# reinicio → revisión. Si algo falla, regresa solo a la versión anterior (código, aplicación y base).
set -Eeuo pipefail

APP_USER=${APP_USER:-monarca}
APP_DIR=${APP_DIR:-/opt/monarca}
ENV_FILE=${ENV_FILE:-/etc/monarca/monarca.env}
# Corre siempre como el usuario del sistema, dueño del código y de la base
if [[ "$(id -un)" != "$APP_USER" ]]; then
  exec sudo -H -u "$APP_USER" env APP_DIR="$APP_DIR" ENV_FILE="$ENV_FILE" bash "$(realpath "$0")" "$@"
fi
# Se ejecuta desde una copia: git puede cambiar este mismo archivo a mitad de la actualización
if [[ "${MONARCA_COPIA:-}" != 1 ]]; then
  tmp=$(mktemp "${TMPDIR:-/tmp}/monarca-actualizar.XXXXXX")
  cp "$0" "$tmp"
  MONARCA_COPIA=1 exec bash "$tmp" "$@"
fi
trap 'rm -f "$0"' EXIT
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
DB=${MONARCA_DB:-/var/lib/monarca/monarca.db}
BACKUPS=${BACKUP_DIR:-$(dirname "$DB")/respaldos}
PORT=${PORT:-3000}
LOG=${UPDATE_LOG:-$(dirname "$DB")/actualizaciones.log}
SERVICE=${SERVICE:-monarca}
RESTART_CMD=${RESTART_CMD:-sudo systemctl restart $SERVICE}
STOP_CMD=${STOP_CMD:-sudo systemctl stop $SERVICE}
START_CMD=${START_CMD:-sudo systemctl start $SERVICE}

TARGET=origin/main
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --forzar) FORCE=1 ;;
    -h | --ayuda)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) TARGET=$arg ;;
  esac
done

mkdir -p "$BACKUPS" "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[31m✗ %s\033[0m\n' "$*"
  exit 1
}
echo
echo "===== $(date '+%Y-%m-%d %H:%M:%S') · monarca-actualizar $* ====="

cd "$APP_DIR"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
  fail "Hay cambios hechos a mano en $APP_DIR. Revísalos con 'git status' antes de actualizar."

PREV=$(git rev-parse HEAD)
say "1/6 · Descargando de GitHub…"
git fetch --quiet --tags --force origin
# Una rama se toma de GitHub (origin/<rama>); si no, etiqueta o commit
NEW=$(git rev-parse --verify --quiet "origin/$TARGET^{commit}" || git rev-parse --verify --quiet "$TARGET^{commit}") ||
  fail "No existe la versión '$TARGET'."
if [[ "$NEW" == "$PREV" && $FORCE == 0 ]]; then
  echo "Ya está instalada la versión ${NEW:0:7}. Nada que hacer (usa --forzar para reinstalar)."
  exit 0
fi
echo "Versión instalada: ${PREV:0:7} · nueva: ${NEW:0:7}"
if git merge-base --is-ancestor "$PREV" "$NEW"; then
  echo "Cambios:"
  git log --oneline --no-decorate "$PREV..$NEW" | sed 's/^/  · /' | head -40
else
  echo "(Es una versión anterior o de otra rama: se regresa a ${NEW:0:7})"
fi

say "2/6 · Respaldando la base de datos…"
STAMP=$(date '+%Y%m%d-%H%M%S')
BACKUP="$BACKUPS/antes-de-actualizar-$STAMP-${PREV:0:7}.db"
MONARCA_DB="$DB" node backend/scripts/respaldo.js "$BACKUP" >/dev/null
echo "Respaldo: $BACKUP"

# --- Si algo falla de aquí en adelante, se regresa a la versión anterior ---
DIST_OLD=frontend/dist-anterior
RESTARTED=0
health() {
  # Espera hasta 40 s a que el servidor responda con la compilación esperada
  local want=$1
  for _ in $(seq 1 40); do
    got=$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).build||"")}catch{}})' || true)
    [[ -n "$got" && "$got" == "$want" ]] && return 0
    sleep 1
  done
  return 1
}
rollback() {
  trap - ERR
  printf '\n\033[31m✗ Falló la actualización. Regresando a %s…\033[0m\n' "${PREV:0:7}"
  git checkout --quiet --force --detach "$PREV"
  if [[ -d "$DIST_OLD" ]]; then
    rm -rf frontend/dist
    mv "$DIST_OLD" frontend/dist
  fi
  (cd backend && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
  if [[ $RESTARTED == 1 ]]; then
    # La versión nueva no llegó a atender: se devuelve la base exacta de antes
    $STOP_CMD || true
    cp "$BACKUP" "$DB"
    rm -f "$DB-wal" "$DB-shm"
    $START_CMD
  fi
  if health "$(node -p 'require("./frontend/dist/version.json").build')"; then
    echo "Se regresó a la versión ${PREV:0:7}. El sistema sigue funcionando como antes."
  else
    echo "¡ATENCIÓN! El sistema no responde después de regresar. Revisa: journalctl -u $SERVICE -n 80"
  fi
  echo "===== Actualización fallida · ${PREV:0:7} → ${NEW:0:7} ====="
  exit 1
}
trap rollback ERR

say "3/6 · Instalando ${NEW:0:7}…"
git checkout --quiet --force --detach "$NEW"
(cd backend && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
(cd frontend && npm ci --no-audit --no-fund --loglevel=error)

say "4/6 · Compilando la aplicación…"
# Se compila aparte: la versión en uso no se toca hasta que la nueva esté lista
rm -rf frontend/dist-nueva
(cd frontend && npx vite build --outDir dist-nueva --emptyOutDir --logLevel warn)
WANT=$(node -p 'require("./frontend/dist-nueva/version.json").build')

say "5/6 · Probando el servidor…"
(cd backend && npm test --silent >/dev/null) || {
  echo "Las pruebas del servidor fallaron."
  false
}

say "6/6 · Reiniciando (unos segundos sin servicio)…"
rm -rf "$DIST_OLD"
[[ -d frontend/dist ]] && mv frontend/dist "$DIST_OLD"
mv frontend/dist-nueva frontend/dist
RESTARTED=1
$RESTART_CMD
health "$WANT" || {
  echo "El servidor no respondió con la versión nueva."
  false
}
trap - ERR

printf '\n\033[32m✓ Listo: versión %s funcionando.\033[0m Las tablets verán el aviso "Hay una versión nueva".\n' "${NEW:0:7}"
echo "Para regresar: monarca-actualizar ${PREV:0:7}"
echo "===== Actualización correcta · ${PREV:0:7} → ${NEW:0:7} ====="
# Se conservan los últimos 20 respaldos de actualización
ls -1t "$BACKUPS"/antes-de-actualizar-*.db 2>/dev/null | tail -n +21 | while read -r old; do rm -f "$old"; done
