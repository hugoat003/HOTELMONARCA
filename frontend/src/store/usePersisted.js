import { useEffect, useState } from 'react';
import { useStore } from './store.jsx';

// Como useState, pero recuerda el valor por usuario en este navegador
// (pestaña elegida, filtros, habitación seleccionada…). Si no hay almacenamiento, funciona en memoria.
export function usePersisted(key, initial) {
  const { user } = useStore();
  const storageKey = `monarca-ui:${user?.id || 'anon'}:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* sin almacenamiento: se recuerda solo mientras la pantalla está abierta */
    }
  }, [storageKey, value]);
  return [value, setValue];
}

// Deja preparada la selección de otra pantalla antes de navegar a ella (ej. abrir una reserva en Reservas)
export function setPersisted(userId, key, value) {
  try {
    localStorage.setItem(`monarca-ui:${userId || 'anon'}:${key}`, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: la otra pantalla abre sin selección */
  }
}
