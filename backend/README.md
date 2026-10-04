# Backend · servidor del hotel

Corre en el Mini PC (NUC) del hotel. Todos los dispositivos (caja, tablets de meseros, pantalla de
recepción y teléfono de gerencia) se conectan a él por la red local y ven los mismos datos al instante.

**Stack:** Node 22 + Fastify + SQLite (`better-sqlite3`) + WebSocket.

## Cómo funciona

- **Mismo código en servidor y pantallas.** Las operaciones (`shared/actions.js`) y los cálculos
  (`shared/*.js`) son los mismos en los dos lados. La tablet aplica cada cambio al instante y lo envía
  como `{ name, args, ids }`. El servidor lo valida, lo repite con el mismo código, lo guarda y lo
  reparte a los demás dispositivos por WebSocket (como _patches_ de immer).
- **Si el servidor rechaza un cambio** (permiso, caja cerrada, otro dispositivo ganó la mesa o ya
  cobró la cuenta), la pantalla lo deshace y muestra el motivo.
- **Sin WiFi:** la tablet sigue funcionando y guarda los cambios como pendientes, con un aviso.
  Al reconectar se envían en orden. Cada envío lleva un `aid` único, así un reintento nunca se
  aplica dos veces.
- **Guardado:** cada registro (venta, reserva, mesa…) es una fila de SQLite y solo se escribe lo que
  cambió. La tabla `actions` guarda el historial de cada operación: quién, cuándo y qué.
- **Tickets:** el número lo asigna el servidor. Dos cajas cobrando a la vez nunca repiten número.

## Seguridad

- **PIN:**
  - Nunca se guarda ni viaja a las pantallas. Solo existe su hash (scrypt con sal) en la tabla `credentials`.
  - Tras 5 intentos fallidos se bloquea 2 minutos, en el servidor.
- **Sesión:** un token por dispositivo, que vence tras 12 h sin uso. Un usuario desactivado pierde la sesión al instante.
- **Permisos por rol** (`src/policy.js`): mesero, recepción y gerencia. Se validan en el servidor,
  así que llamar a la API directamente no salta las reglas.
- **Autorización de gerente:**
  - Para anular platillos enviados, cortesías, descuentos, mermas, ajustes, cambios de precio, quitar cargos y cerrar caja.
  - El gerente teclea su PIN, el servidor lo valida y deja una autorización de un solo uso, que vence en 10 min.
  - Quién hizo cada operación lo pone la sesión, no la tablet.

## Uso

```bash
npm install                 # primera vez (en backend/)
npm run dev                 # servidor en :3000 con recarga (el frontend en dev usa el proxy de Vite)
npm start                   # producción: sirve también la app compilada (frontend/dist)
npm test                    # pruebas del servidor (node:test)
```

Desde la raíz del repositorio:

- `npm run dev`: servidor y frontend juntos.
- `npm run demo`: compila y arranca con datos de ejemplo. Se abre desde las tablets en `http://<IP del equipo>:3000`.

Variables de entorno:

| Variable       | Valor por defecto         | Uso                                                                                                |
| -------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `PORT`         | `3000`                    | Puerto.                                                                                            |
| `HOST`         | `0.0.0.0`                 | Interfaz. Así queda visible en la red del hotel.                                                   |
| `MONARCA_DB`   | `backend/data/monarca.db` | Archivo de la base.                                                                                |
| `MONARCA_SEED` | `demo`                    | Con qué arranca una base nueva: `demo`, o `vacio` (catálogos sin movimientos).                     |
| `MONARCA_DEMO` | —                         | `1` permite "Restaurar datos de ejemplo".                                                          |
| `MONARCA_TEST` | —                         | `1` activa el modo de pruebas automáticas (un hotel en memoria por prueba). **Nunca en el hotel.** |
| `STATIC_DIR`   | `frontend/dist`           | Carpeta de la app compilada.                                                                       |
| `TZ`           | `America/Guatemala`       | Zona horaria. Define qué día es "hoy".                                                             |

## API

| Ruta                         | Quién         | Qué hace                                                                      |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------- |
| `GET /api/health`            | todos         | Estado del servidor.                                                          |
| `GET /api/public`            | todos         | Usuarios activos para la pantalla de ingreso (sin PIN).                       |
| `POST /api/login`            | todos         | `{ userId, pin }` → `{ token }`.                                              |
| `POST /api/logout`           | sesión        | Cierra la sesión.                                                             |
| `GET /api/state`             | sesión        | Estado completo y su versión (`rev`).                                         |
| `POST /api/authorize`        | sesión        | `{ pin }` de gerente → autorización de un solo uso.                           |
| `POST /api/actions`          | sesión        | `{ aid, calls: [{ name, args, ids }] }`. Atómico: se aplican todas o ninguna. |
| `POST /api/admin/restore`    | gerente       | Cargar un respaldo (JSON exportado desde Configuración).                      |
| `POST /api/admin/reset-demo` | gerente, demo | Volver a los datos de ejemplo.                                                |
| `GET /ws?token=`             | sesión        | Tiempo real: `hello`, `patch` (`rev`, `aid`, `patches`) y `reload`.           |

## Pendiente (siguientes fases)

- **B2:** impresión ESC/POS. Cocina por red (`IP:9100`), cliente por USB, con cola y reintento.
- **B3:** Cloudflare Tunnel y Access para entrar desde fuera.
- **B4:** respaldos automáticos (local y externo cifrado) y restauración probada.
- **B5:**
  - Instalación en el NUC con Ubuntu, `systemd` y la caja en modo kiosco.
  - Carga de los datos reales.
  - Archivado de historial viejo: hoy cada pantalla carga todo el historial al iniciar, lo cual está bien para meses, pero conviene archivar al pasar de un año.
