import { useEffect, useState } from 'react';

// Pantalla completa (tablets): oculta la barra del navegador para ganar espacio.
// Safari en iPad usa los nombres con prefijo webkit.
const doc = typeof document !== 'undefined' ? document : null;
const supported = !!(doc && (doc.fullscreenEnabled || doc.webkitFullscreenEnabled));
const current = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;

function toggle() {
  if (current()) return (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
  const el = doc.documentElement;
  return (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
}

export default function FullscreenButton({ className = 'pill' }) {
  const [on, setOn] = useState(() => supported && !!current());
  useEffect(() => {
    if (!supported) return;
    const sync = () => setOn(!!current());
    doc.addEventListener('fullscreenchange', sync);
    doc.addEventListener('webkitfullscreenchange', sync);
    return () => {
      doc.removeEventListener('fullscreenchange', sync);
      doc.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);
  if (!supported) return null;
  const label = on ? 'Salir de pantalla completa' : 'Pantalla completa';
  return (
    <button
      type="button"
      className={className + ' fullscreen-btn'}
      aria-label={label}
      title={label}
      onClick={() => Promise.resolve(toggle()).catch(() => {})}
    >
      <span aria-hidden="true">{on ? '⤡' : '⤢'}</span> {on ? 'Salir' : 'Pantalla completa'}
    </button>
  );
}
