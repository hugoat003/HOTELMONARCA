// Estado de existencia según el mínimo configurado
export const stockStatus = (it) => (it.stock <= 0 ? 'agotado' : it.stock < it.min ? 'bajo' : 'ok');
