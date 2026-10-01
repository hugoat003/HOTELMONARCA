// Modo demostración: muestra los PIN de prueba en el login y permite restaurar los datos de ejemplo.
// Se activa con VITE_DEMO=1 (ver .env.development); la versión que se instala en el hotel no lo trae.
export const DEMO = import.meta.env.VITE_DEMO === '1';
