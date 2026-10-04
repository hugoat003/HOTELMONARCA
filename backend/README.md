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

## Impresión (B2)

Dos impresoras térmicas **3nstar RPT004** (80 mm, 48 columnas, ESC/POS, corte automático). Las dos
se conectan por red:

| Impresora | Qué imprime                                                                       | Cuándo                      |
| --------- | --------------------------------------------------------------------------------- | --------------------------- |
| Cocina    | Comandas por tiempos, "marchar", avisos de anulación                              | Solo, al enviar a cocina    |
| Caja      | Comprobantes y devoluciones (abre la gaveta si hubo efectivo), resumen del cierre | Solo, al cobrar y al cerrar |
| Caja      | Precuenta, estado de cuenta, copia de un comprobante                              | A pedido, con "Imprimir"    |

- **El servidor arma los tickets** con los datos guardados (`shared/tickets.js`) y los envía en
  ESC/POS (`src/printing/escpos.js`). Los envía al puerto 9100 de la impresora, o a `/dev/usb/lp0`
  si va por USB. Usa la página de códigos PC850 para acentos y ñ.
- **Cola** (`src/printing/queue.js`, tabla `print_jobs`):
  - Cada ticket se guarda antes de enviarse.
  - Si la impresora no responde (sin papel, apagada, cable suelto), el ticket espera y se reintenta
    a los 2 s, 5 s, 15 s, 30 s y luego cada minuto. Mientras tanto, todas las pantallas muestran un aviso con "Reintentar".
  - Los tickets en espera sobreviven a un reinicio del NUC.
  - Se guardan 30 días.
- **Modos de cada impresora:** Red, USB, Simulada o Apagada.
  - Simulada guarda el texto del ticket para verlo en Configuración → Impresoras. Es la opción para la demostración.
- **Configuración → Impresoras:**
  - IP y puerto de cada impresora, con "Imprimir prueba".
  - Comprobante automático, abrir la gaveta, copias de comanda y logo guardado en la impresora.
  - Lista de los últimos tickets: ver, reimprimir y descartar.

**Al instalar:**

1. Imprime la hoja de configuración de cada impresora para ver su IP actual. En la mayoría de las
   impresoras ESC/POS se imprime al encenderla con el botón FEED presionado.
2. Asigna a cada una una IP fija dentro de la red del hotel con la utilidad de 3nstar, por ejemplo
   `192.168.1.50` para caja y `192.168.1.51` para cocina. Resérvalas también en el router.
3. Conecta la gaveta al puerto RJ11 de la impresora de **caja**.
4. Captura las IP en Configuración → Impresoras, guarda e imprime la prueba de cada una. La prueba
   incluye acentos y ñ.
5. Opcional: carga el logo del hotel en la memoria de la impresora de caja con la utilidad de 3nstar
   (posición 1) y activa "Usar el logo guardado".

## Pendiente (siguientes fases)

- **B3:** Cloudflare Tunnel y Access para entrar desde fuera.
- **B4:** respaldos automáticos (local y externo cifrado) y restauración probada.
- **B5:**
  - Instalación en el NUC con Ubuntu, `systemd` y la caja en modo kiosco.
  - Carga de los datos reales.
  - Archivado de historial viejo: hoy cada pantalla carga todo el historial al iniciar, lo cual está bien para meses, pero conviene archivar al pasar de un año.
