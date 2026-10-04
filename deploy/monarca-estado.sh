#!/usr/bin/env bash
# Resumen del estado de POS Monarca en la mini PC (para soporte).
ENV_FILE=${ENV_FILE:-/etc/monarca/monarca.env}
if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
PORT=${PORT:-3000}
DB=${MONARCA_DB:-/var/lib/monarca/monarca.db}
APP_DIR=${APP_DIR:-/opt/monarca}

echo "== Servicio"
systemctl is-active monarca >/dev/null 2>&1 && echo "Funcionando desde $(systemctl show monarca -p ActiveEnterTimestamp --value)" || echo "DETENIDO"
echo
echo "== Versión"
(cd "$APP_DIR" && git log -1 --format='%h · %s · %cd' --date=format:'%Y-%m-%d %H:%M')
curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" && echo || echo "El servidor no responde en el puerto $PORT"
echo
echo "== Túnel de Cloudflare"
systemctl is-active cloudflared >/dev/null 2>&1 && echo "Conectado" || echo "Sin túnel (no se puede entrar desde fuera)"
echo
echo "== Base de datos"
ls -lh "$DB" 2>/dev/null | awk '{print $5, $6, $7, $8, $9}'
echo "Últimos respaldos:"
ls -1t "$(dirname "$DB")"/respaldos/*.db 2>/dev/null | head -3 | sed 's/^/  /'
echo
echo "== Disco"
df -h "$(dirname "$DB")" | tail -1 | awk '{print $4 " libres de " $2 " (" $5 " usado)"}'
echo
echo "== Últimos errores del servidor"
journalctl -u monarca -p warning -n 10 --no-pager 2>/dev/null || echo "(sin acceso al registro)"
