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
