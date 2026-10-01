# Backend (pendiente)

Hoy el frontend guarda todo en el navegador (`localStorage`). El backend reemplaza eso para que
todos los dispositivos del hotel (caja, tablets de meseros, recepción y el teléfono de la gerencia)
vean y modifiquen los mismos datos.

## Qué debe resolver

- **Datos compartidos:** una sola fuente de verdad en el Mini PC NUC del hotel.
- **API** para lo que hoy hace `frontend/src/store/actions.js`: órdenes, cobros, reservas, eventos,
  tienda, inventario, caja y configuración.
- **Usuarios y PIN:** validar el PIN en el servidor, no en el navegador.
- **Impresión:** enviar comandas a la impresora de cocina y tickets a la de caja (3nstar RPT006S por red).
- **Dashboard remoto:** publicar el resumen en el dominio del hotel para verlo desde el teléfono.
- **Respaldos** automáticos de la base de datos.
- **Facturación electrónica (FEL)** con un certificador autorizado por la SAT.

## Punto de partida en el frontend

- `frontend/src/store/seed.js` describe la forma de todos los datos (sirve como modelo de la base).
- `frontend/src/store/actions.js` lista cada operación que la API debe ofrecer.
- `frontend/src/lib/` tiene los cálculos (impuestos, folio, eventos, reporte) que conviene
  repetir o mover al servidor para que los totales no dependan del navegador.

Stack por decidir.
