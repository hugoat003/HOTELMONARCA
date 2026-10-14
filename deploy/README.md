# Mini PC del hotel: instalación, actualizaciones y soporte remoto

La mini PC (NUC) con **Windows 11 Pro** es el servidor del hotel y también la caja. Las tablets la
abren por la red del hotel (`http://<IP de la mini PC>:3000`). Desde fuera se entra por un túnel de
Cloudflare, sin abrir puertos en el router.

```
Tu computadora ──► GitHub ──► mini PC (descarga, compila, cambia de versión)
       │                         ▲
       └── ssh monarca-soporte.hassistemas.com ──┘   (túnel de Cloudflare + código al correo + tu llave SSH)
```

## Cómo queda la mini PC

| Ruta                                 | Qué es                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `C:\Monarca\repo`                    | Copia del repositorio (solo para descargar versiones).                 |
| `C:\Monarca\versiones\<commit>`      | Cada versión instalada, completa. Se guardan la actual y 3 anteriores. |
| `C:\Monarca\app`                     | Enlace a la versión en uso (el servicio corre desde aquí).             |
| `C:\Monarca\servicio`                | Servicio de Windows "POS Monarca" (WinSW).                             |
| `C:\ProgramData\Monarca\monarca.db`  | La base de datos.                                                      |
| `C:\ProgramData\Monarca\respaldos`   | Respaldos (antes de cada actualización; los nocturnos llegan en B4).   |
| `C:\ProgramData\Monarca\monarca.env` | Configuración del servidor.                                            |
| `C:\ProgramData\Monarca\logs`        | Registro del servidor.                                                 |

**Por qué una carpeta por versión:** Windows no deja reemplazar archivos que un programa tiene
abiertos. La versión nueva se arma completa en su carpeta mientras la anterior sigue atendiendo.
Luego solo se cambia el enlace y se reinicia (unos segundos). Regresar a la anterior es volver a
apuntar a su carpeta: unos 3 segundos.

## 1 · Instalación (una vez)

En la mini PC, abre **Terminal (Administrador)** y corre:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\instalar.ps1 -Caja
```

`-Caja` hace que, al iniciar sesión, Chrome abra el sistema a pantalla completa (Alt+F4 para salir).

`deploy\windows\instalar.ps1` hace esto:

1. Instala con `winget`: Git, Node.js LTS, PowerShell 7, `cloudflared` y Chrome.
2. Genera una **llave de despliegue**: la mini PC solo puede **leer** el repositorio. Te pide pegarla
   en GitHub → repositorio → Settings → Deploy keys.
3. Registra el servicio **POS Monarca**:
   - arranca solo con Windows y se reinicia si se cae;
   - corre con la cuenta "Servicio local", sin permisos de administrador;
   - solo puede escribir en `C:\ProgramData\Monarca`.
4. Abre el puerto 3000 solo en la red privada del hotel y configura la energía: nunca se suspende.
5. **Actualizaciones de Windows:**
   - se descargan solas y se instalan a las 3:00;
   - las horas de operación son de 6:00 a 23:00;
   - nunca reinicia con una sesión abierta.
6. Activa la terminal remota (OpenSSH): solo con llave, y la terminal es PowerShell 7.
7. Instala la primera versión del sistema y deja los comandos `monarca-actualizar` y `monarca-estado`.

Revisa `C:\ProgramData\Monarca\monarca.env` si hace falta. Por defecto una base nueva arranca con los
catálogos de ejemplo y sin movimientos (`MONARCA_SEED=vacio`).

## 2 · Actualizar

Programa y prueba en tu computadora (`npm test`), luego sube a GitHub (`git push`). En la mini PC
(en persona o por SSH) corre:

```powershell
monarca-actualizar              # lo último de main
monarca-actualizar 5123b14      # una versión específica (también sirve para regresar)
monarca-actualizar -Forzar      # reinstalar la misma
```

| Paso                                                 | Si falla                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Respaldo de la base                                  | No se toca nada.                                                         |
| Descarga, instalación y compilación en carpeta nueva | La versión en uso nunca se detuvo; se borra la carpeta nueva.            |
| Pruebas del servidor                                 | Igual.                                                                   |
| Cambio de versión, reinicio y revisión               | Regresa a la carpeta anterior y a la base de antes, y vuelve a arrancar. |

- Las tablets muestran **"Hay una versión nueva del sistema · Actualizar ahora"**. No se recargan solas mientras alguien trabaja; la pantalla de ingreso sí se actualiza sola.
- El historial queda en `C:\ProgramData\Monarca\actualizaciones.log`.

Probado en una copia simulada con seis casos: primera instalación, versión normal, versión que no
arranca (regresa sola y conserva los datos), pruebas rotas (no toca nada), "ya está al día" y regreso
a una versión instalada (3 s).

**Lista paso a paso para instalar y revisar (oficina, llegada al hotel y apertura):
[GUIA-INSTALACION.md](GUIA-INSTALACION.md).**

## 3 · Soporte

```powershell
monarca-estado                         # servicios, versión, base, respaldos, disco, Windows, errores
Restart-Service monarca                # reiniciar el servidor
Get-Content C:\ProgramData\Monarca\logs\monarca.out.log -Tail 50 -Wait   # registro en vivo
monarca-limpiar-pruebas                # borra los datos de prueba antes de abrir (pide confirmar)
monarca-respaldo                       # respaldo inmediato (también fuera del hotel, si está configurado)
monarca-restaurar                      # lista los respaldos; con un nombre, lo restaura (pide confirmar)
monarca-acceso                         # gerencia: nueva contraseña o alta de administración general
```

**Acceso de gerencia** (olvidó la contraseña, o hay que crear a alguien de administración general):

```powershell
monarca-acceso --correo dueña@hotel.com --contrasena "clave nueva"
monarca-acceso --nombre "Soporte HAS" --correo soporte@hassistemas.com --contrasena "clave"
```

El personal con PIN no lo necesita: el gerente lo cambia en Configuración → Usuarios.

## 3b · Respaldos

- **Cada noche a las 3:00** (`MONARCA_RESPALDO_HORA`) el servidor copia la base a
  `C:\ProgramData\Monarca\respaldos\diario-….db`, sin detener nada. Se conservan los últimos 30.
- **Fuera del hotel:** sube la misma copia **comprimida y cifrada** (AES-256) a Cloudflare R2. Allá se
  conservan los últimos 30 días y uno por mes del último año. Si no hay internet, la sube en cuanto
  vuelve (lo reintenta cada hora).
- **Dónde se ve:** `monarca-estado` y, para la dueña, Configuración → Respaldo, con avisos si algo falla.
- **Además** quedan copias automáticas antes de cada actualización, de cada migración de datos,
  de limpiar los datos de prueba y de cada restauración.

### Configurar Cloudflare R2 (una vez, desde tu Mac)

1. dash.cloudflare.com → **R2 Object Storage** → activar el plan gratuito (pide una tarjeta, pero
   no cobra mientras se use menos de 10 GB y 1 millón de operaciones al mes).
2. **Create bucket** → nombre `monarca-respaldos`, ubicación automática.
3. R2 → **Manage API tokens** → **Create API token**:
   - permiso **Object Read & Write**;
   - solo el bucket `monarca-respaldos`;
   - copia el **Access Key ID**, el **Secret Access Key** y el **endpoint** (`https://<id>.r2.cloudflarestorage.com`).
4. En la mini PC, agrega a `C:\ProgramData\Monarca\monarca.env`:

   ```
   MONARCA_S3_ENDPOINT=https://<id>.r2.cloudflarestorage.com
   MONARCA_S3_BUCKET=monarca-respaldos
   MONARCA_S3_KEY_ID=…
   MONARCA_S3_SECRET=…
   ```

5. `Restart-Service monarca` y `monarca-respaldo`: debe decir "Copia fuera del hotel: … (cifrada)".

**La clave de cifrado** (`MONARCA_RESPALDO_CLAVE`) la genera `instalar.ps1` y la muestra una vez.
Guárdala en tu gestor de contraseñas: **sin ella, la copia de R2 no se puede abrir**. Si la cambias,
los respaldos anteriores siguen necesitando la clave vieja.

### Si la mini PC se daña o se pierde

1. En una mini PC nueva: `instalar.ps1` como la primera vez.
2. Pon en `monarca.env` la **misma** clave de respaldo y los datos de R2.
3. `monarca-restaurar` (muestra la lista) y `monarca-restaurar diario-AAAAMMDD-030000.db`.
4. Túnel de Cloudflare: el mismo comando del conector. Las tablets solo cambian de dirección si cambió la IP.

Se pierde lo registrado desde el último respaldo (como máximo, lo del día). Para no perder ni eso,
también se puede correr `monarca-respaldo` al cerrar caja.

## 4 · Acceso remoto con Cloudflare (B3)

Todo vive en **tu** cuenta de Cloudflare: el dominio, el túnel y quién puede entrar. Los pasos a–d se
hacen desde el navegador, sin la mini PC.

### a) Dominio

**hassistemas.com** (de HAS Sistemas, en la cuenta de Cloudflare de Hugo). Cada cliente tiene su
propio subdominio de un solo nivel: el certificado gratis de Cloudflare cubre `cliente.hassistemas.com`,
no `algo.cliente.hassistemas.com`.

| Cliente | Sistema                   | Terminal de soporte               |
| ------- | ------------------------- | --------------------------------- |
| Monarca | `monarca.hassistemas.com` | `monarca-soporte.hassistemas.com` |

Atajo opcional (Rules → Redirect Rules): `hassistemas.com/monarca` → `https://monarca.hassistemas.com`.

> **Estado (14 oct 2026):** dominio, Zero Trust (plan Free, equipo `hassistemas`), túnel `monarca`
> con sus dos direcciones y DNS, y las aplicaciones de Access ("Sistema Monarca" y "Soporte Monarca
> (terminal)", código por correo) ya están configurados y probados: sin autorización, ambas
> direcciones llevan a la pantalla de ingreso. **Falta** solo lo que va en la mini PC: correr el
> comando del conector (guardado en la Mac de Hugo, `~/.config/hassistemas/monarca-conector.txt`)
> y el paso e). Para agregar a la dueña: Access controls → Policies → "Monarca · sistema" → agregar
> su correo.

### b) Zero Trust (control de acceso, gratis hasta 50 usuarios)

En **Zero Trust**, elige un nombre de equipo y el plan **Free**. Cloudflare puede pedir una tarjeta
aunque el plan sea gratis.

### c) Túnel

En **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, llámalo `monarca`.

1. Cloudflare muestra un comando con un token. En la mini PC, en Terminal (Administrador):
   `cloudflared service install <TOKEN>`. `cloudflared` ya lo instaló `instalar.ps1`.
2. En **Public hostnames** del túnel:
   - `monarca.hassistemas.com` → **HTTP** → `localhost:3000`
   - `monarca-soporte.hassistemas.com` → **SSH** → `localhost:22`

### d) Quién puede entrar (Access)

En **Zero Trust → Access → Applications → Add an application → Self-hosted**:

| Aplicación      | Dominio                           | Política (Allow · Emails)      | Sesión |
| --------------- | --------------------------------- | ------------------------------ | ------ |
| Sistema Monarca | `monarca.hassistemas.com`         | tu correo + correo de la dueña | 24 h   |
| Soporte Monarca | `monarca-soporte.hassistemas.com` | solo tu correo                 | 12 h   |

Al entrar, Cloudflare manda un código al correo. Después, el sistema pide el correo y la contraseña de gerencia (o el PIN, para el personal).

### e) Terminal de la mini PC desde tu Mac

En la mini PC, pega tu llave pública (`~/.ssh/id_ed25519.pub` de tu Mac) en
`C:\ProgramData\ssh\administrators_authorized_keys`. Para los administradores, Windows usa ese
archivo y no `~\.ssh\authorized_keys`.

En tu Mac:

```bash
brew install cloudflared
cat >> ~/.ssh/config <<'EOF'
Host monarca-soporte.hassistemas.com
  User <usuario administrador de Windows>
  ProxyCommand cloudflared access ssh --hostname %h
EOF
ssh monarca-soporte.hassistemas.com           # abre el navegador para el código; entra con tu llave
monarca-actualizar
```

### f) Camino de respaldo (recomendado): Tailscale

Si algún día el túnel de Cloudflare falla, Tailscale da un segundo acceso a la terminal. Es gratis
para uso personal. Instálalo con `winget install Tailscale.Tailscale`, inicia sesión con tu cuenta y
haz lo mismo en tu Mac.

### Límite

Si se va el internet del hotel o se apaga la mini PC, nadie puede entrar desde fuera. El hotel sigue
operando en su red local.

## Alternativa: Ubuntu

Si algún día la mini PC usa Ubuntu en lugar de Windows, están los equivalentes en `deploy/`:
`instalar.sh`, `monarca-actualizar.sh` (probado en copia simulada con cinco casos),
`monarca-estado.sh`, `monarca.service` (systemd) y `sudoers-monarca`.
