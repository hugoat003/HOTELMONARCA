#!/usr/bin/env bash
# Instalación de POS Monarca en la mini PC (Ubuntu 24.04). Se corre una vez, como administrador:
#   curl -fsSL https://raw.githubusercontent.com/.../deploy/instalar.sh -o instalar.sh   (o copiarlo)
#   sudo bash instalar.sh
# Se puede volver a correr: lo que ya está hecho no se repite.
set -Eeuo pipefail

REPO=${REPO:-git@github.com:hugoat003/HOTELMONARCA.git}
APP_DIR=/opt/monarca
DATA_DIR=/var/lib/monarca
ETC_DIR=/etc/monarca

[[ $EUID -eq 0 ]] || {
  echo "Corre este script con sudo."
  exit 1
}
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "Paquetes del sistema"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates sqlite3 build-essential >/dev/null
if ! command -v node >/dev/null || [[ $(node -p 'process.versions.node.split(".")[0]') -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

step "Usuario del sistema y carpetas"
id monarca >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --create-home --shell /bin/bash monarca
usermod -aG lp monarca
install -d -o monarca -g monarca -m 750 "$DATA_DIR" "$DATA_DIR/respaldos"
install -d -o monarca -g monarca -m 755 "$APP_DIR"
install -d -m 755 "$ETC_DIR"

step "Acceso de solo lectura a GitHub (llave de despliegue)"
KEY="$DATA_DIR/.ssh/id_ed25519"
if [[ ! -f "$KEY" ]]; then
  sudo -H -u monarca mkdir -p "$DATA_DIR/.ssh"
  sudo -H -u monarca ssh-keygen -q -t ed25519 -N '' -C "monarca-nuc" -f "$KEY"
  sudo -H -u monarca ssh-keyscan -t ed25519 github.com >>"$DATA_DIR/.ssh/known_hosts" 2>/dev/null
fi
if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Agrega esta llave en GitHub → repositorio → Settings → Deploy keys → Add deploy key"
  echo "(solo lectura, sin marcar 'Allow write access'):"
  echo
  cat "$KEY.pub"
  echo
  read -rp "Cuando esté agregada, presiona Enter… "
  sudo -H -u monarca git clone --quiet "$REPO" "$APP_DIR"
fi

step "Instalando y compilando"
cd "$APP_DIR"
sudo -H -u monarca bash -c 'cd backend && npm ci --omit=dev --no-audit --no-fund --loglevel=error'
sudo -H -u monarca bash -c 'cd frontend && npm ci --no-audit --no-fund --loglevel=error && npx vite build --logLevel warn'

step "Configuración"
[[ -f "$ETC_DIR/monarca.env" ]] || install -m 640 -g monarca deploy/monarca.env.example "$ETC_DIR/monarca.env"
install -m 440 deploy/sudoers-monarca /etc/sudoers.d/monarca
visudo -cq
install -m 644 deploy/monarca.service /etc/systemd/system/monarca.service
ln -sf "$APP_DIR/deploy/monarca-actualizar.sh" /usr/local/bin/monarca-actualizar
ln -sf "$APP_DIR/deploy/monarca-estado.sh" /usr/local/bin/monarca-estado

step "Arrancando el servicio"
systemctl daemon-reload
systemctl enable --now monarca
for _ in $(seq 1 30); do
  curl -fsS --max-time 2 http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS http://127.0.0.1:3000/api/health && echo

IP=$(hostname -I | awk '{print $1}')
printf '\n\033[32m✓ POS Monarca instalado.\033[0m Ábrelo en las tablets: http://%s:3000\n' "$IP"
echo "Siguiente: túnel de Cloudflare (deploy/README.md → Acceso remoto)."
