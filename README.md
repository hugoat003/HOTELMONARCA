# POS Monarca

Sistema de punto de venta y gestión hotelera para **Monarca Hotel Boutique** (Antigua Guatemala): restaurante, hotel, eventos, tienda de recepción, inventario, caja y reportes.

## Estructura

```
frontend/   App web (React + Vite) que usan la caja, las tablets y recepción.
backend/    Servidor del hotel (Node + Fastify + SQLite + WebSocket). Ver backend/README.md.
shared/     Operaciones y cálculos que usan igual el servidor y las pantallas.
docs/
  diseno/      Exportación original del diseño de Claude Design.
```

## Uso

```bash
npm run install:all   # primera vez
npm run dev           # servidor (:3000) + frontend con recarga (:5173, visible en la red)
npm run demo          # compila y arranca como en el hotel, con datos de ejemplo: http://<IP>:3000
npm start             # igual, sin opciones de demostración
npm test              # pruebas del servidor y de punta a punta (Playwright)
npm run lint
```

Usuarios de demostración (PIN): Gerente 1111 · Recepción 2222 · Juan 3333 · Ana 4444.

## Cotización

Editar `docs/cotizacion/cotizacion.html` y regenerar el PDF con Chrome:

```bash
cd docs/cotizacion
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --allow-file-access-from-files --print-to-pdf=Cotizacion-POS-Monarca.pdf "file://$PWD/cotizacion.html"
```
