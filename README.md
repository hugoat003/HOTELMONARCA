# POS Monarca

Sistema de punto de venta y gestión hotelera para **Monarca Hotel Boutique** (Antigua Guatemala): restaurante, hotel, eventos, tienda de recepción, inventario, caja y reportes.

## Estructura

```
frontend/   App web (React + Vite). Hoy funciona sola, con datos guardados en el navegador.
backend/    Servidor y base de datos. Pendiente — ver backend/README.md.
docs/
  cotizacion/  Cotización para el hotel (HTML editable + PDF).
  diseno/      Exportación original del diseño de Claude Design.
```

## Uso

```bash
npm run install:frontend   # primera vez
npm run dev                # abre en http://localhost:5173
npm run dev:red            # visible en la red local (para ver el resumen en el teléfono)
npm run build              # genera frontend/dist
```

Usuarios de demostración (PIN): Gerente 1111 · Recepción 2222 · Juan 3333 · Ana 4444.

## Cotización

Editar `docs/cotizacion/cotizacion.html` y regenerar el PDF con Chrome:

```bash
cd docs/cotizacion
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --allow-file-access-from-files --print-to-pdf=Cotizacion-POS-Monarca.pdf "file://$PWD/cotizacion.html"
```
