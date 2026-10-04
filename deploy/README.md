# Mini PC del hotel: instalación, actualizaciones y soporte remoto

El sistema vive en la mini PC (NUC) con Ubuntu 24.04. Las tablets y la caja lo abren por la red del
hotel (`http://<IP de la mini PC>:3000`). Desde fuera se entra por un túnel de Cloudflare, sin abrir
puertos en el router.

```
Tu computadora ──► GitHub ──► mini PC (git pull, compila, reinicia)
       │                         ▲
       └── ssh soporte.DOMINIO ──┘   (túnel de Cloudflare + código al correo + tu llave SSH)
```

| Archivo                 | Para qué                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| `instalar.sh`           | Instalación inicial en la mini PC (una vez).                               |
| `monarca-actualizar.sh` | Instala una versión nueva, con respaldo y regreso automático si falla.     |
| `monarca-estado.sh`     | Resumen para soporte: servicio, versión, túnel, respaldos, disco, errores. |
| `monarca.service`       | Servicio de systemd: arranca solo con la mini PC y se reinicia si se cae.  |
| `monarca.env.example`   | Configuración del servidor (`/etc/monarca/monarca.env`).                   |
| `sudoers-monarca`       | Permite al usuario `monarca` reiniciar solo su servicio.                   |

## 1 · Instalación (una vez)

```bash
sudo bash deploy/instalar.sh
```

El script hace todo esto:

1. Instala Node 22 y crea el usuario `monarca`, con el código en `/opt/monarca` y los datos en `/var/lib/monarca`.
2. Genera una **llave de despliegue**: la mini PC solo puede **leer** el repositorio, nunca escribir en él. Te pide pegarla en GitHub, en el repositorio → Settings → Deploy keys.
3. Compila la aplicación, instala el servicio y deja los comandos `monarca-actualizar` y `monarca-estado`.

Después se ajusta `/etc/monarca/monarca.env` si hace falta. Por defecto una base nueva arranca con
los catálogos de ejemplo y sin movimientos (`MONARCA_SEED=vacio`).

## 2 · Actualizar

Programa y prueba en tu computadora (`npm test`), luego sube a GitHub (`git push`). En la mini PC
corre:

```bash
monarca-actualizar              # lo último de main
monarca-actualizar 5123b14      # una versión específica (también sirve para regresar)
```

| Paso                                  | Si falla                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Respaldo de la base                   | No se toca nada.                                                              |
| Descarga e instalación                | Regresa al código anterior. El sistema nunca se detuvo.                       |
| Compilación (aparte, en `dist-nueva`) | Igual: la versión en uso sigue sirviendo.                                     |
| Pruebas del servidor                  | Igual.                                                                        |
| Reinicio y revisión                   | Regresa al código, a la aplicación y a la base de antes, y vuelve a arrancar. |

- Solo hay unos segundos sin servicio, durante el reinicio. Conviene actualizar fuera de las horas de mayor movimiento.
- Las tablets muestran **"Hay una versión nueva del sistema · Actualizar ahora"**. No se recargan solas mientras alguien trabaja, para no cortar un pedido. La pantalla de ingreso sí se actualiza sola.
- El historial queda en `/var/lib/monarca/actualizaciones.log` y los respaldos en `/var/lib/monarca/respaldos/`. Se guardan los últimos 20.

Probado en una copia local con cinco casos: versión nueva normal, versión que no arranca (regresa
sola y conserva los datos), pruebas rotas (ni siquiera reinicia), "ya está al día" y regreso a una
versión anterior.

## 3 · Soporte

```bash
monarca-estado                      # resumen rápido
journalctl -u monarca -f            # registro del servidor en vivo
sudo systemctl restart monarca      # reiniciar el servidor
```

## 4 · Acceso remoto con Cloudflare (B3)

Todo vive en **tu** cuenta de Cloudflare: el dominio, el túnel y quién puede entrar.

### a) Dominio

En el panel de Cloudflare, ve a **Domain Registration → Register Domains** y compra el dominio, por
ejemplo `hotelmonarca.com`. Si el dominio ya existe en otro proveedor, **Add a domain** y cambia los
nameservers donde se compró.

### b) Zero Trust (control de acceso, gratis hasta 50 usuarios)

En **Zero Trust**, elige un nombre de equipo (por ejemplo, tu nombre o el de tu negocio) y el plan
**Free**. Cloudflare puede pedir una tarjeta aunque el plan sea gratis.

### c) Túnel

En **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, llámalo `monarca-nuc`.

1. Cloudflare muestra un comando con un token: `sudo cloudflared service install …`. Se corre en la
   mini PC, después de instalar `cloudflared` con las instrucciones que aparecen en esa misma página.
2. En **Public hostnames** del túnel:
   - `sistema.DOMINIO` → tipo **HTTP** → `localhost:3000`
   - `soporte.DOMINIO` → tipo **SSH** → `localhost:22`

### d) Quién puede entrar (Access)

En **Zero Trust → Access → Applications → Add an application → Self-hosted**:

| Aplicación      | Dominio           | Política (Allow · Emails)      | Sesión |
| --------------- | ----------------- | ------------------------------ | ------ |
| Sistema Monarca | `sistema.DOMINIO` | tu correo + correo de la dueña | 24 h   |
| Soporte Monarca | `soporte.DOMINIO` | solo tu correo                 | 12 h   |

Al entrar, Cloudflare manda un código al correo. Después, el sistema pide el PIN como siempre.

### e) Terminal de la mini PC desde tu computadora

En la mini PC, la terminal acepta solo llaves, sin contraseñas:

```bash
sudo apt install -y openssh-server
# pega tu llave pública (~/.ssh/id_ed25519.pub de tu computadora) en ~/.ssh/authorized_keys
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

En tu computadora:

```bash
brew install cloudflared
cat >> ~/.ssh/config <<'EOF'
Host soporte.DOMINIO
  User <tu usuario en la mini PC>
  ProxyCommand cloudflared access ssh --hostname %h
EOF
ssh soporte.DOMINIO          # abre el navegador para el código; luego entra con tu llave
monarca-actualizar
```

### f) Camino de respaldo (recomendado): Tailscale

Si algún día el túnel de Cloudflare falla, Tailscale da un segundo acceso a la terminal. Es gratis
para uso personal:

```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
```

Inicia sesión con tu cuenta e instala Tailscale también en tu computadora.

### Límite

Si se va el internet del hotel o se apaga la mini PC, nadie puede entrar desde fuera. El hotel sigue
operando en su red local.
