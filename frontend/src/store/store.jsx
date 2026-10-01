import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { makeFmt } from '../lib/money.js';
import { seed, VERSION } from './seed.js';

const KEY = 'monarca-pos-v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.version === VERSION) return s;
    }
  } catch {
    /* sin almacenamiento: usar datos de ejemplo */
  }
  return seed();
}

// Cada actualización recibe una "receta" que modifica una copia del estado
function reducer(state, action) {
  if (action.replace) return action.replace;
  const draft = structuredClone(state);
  action.recipe(draft);
  return draft;
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignorar: la demo sigue funcionando en memoria */
    }
  }, [state]);

  const api = useMemo(
    () => ({
      update: (recipe) => dispatch({ recipe }),
      replace: (next) => dispatch({ replace: next }),
      resetDemo: () => dispatch({ replace: seed() }),
    }),
    []
  );

  const value = useMemo(() => {
    const user = state.session ? state.users.find((u) => u.id === state.session.userId) : null;
    return { state, user, fmt: makeFmt(state.config.currency), ...api };
  }, [state, api]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

export { VERSION };
