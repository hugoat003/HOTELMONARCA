// Tablets y pantalla de recepción: el zoom accidental (pellizco, Ctrl+rueda, Ctrl +/−) hacía que Chrome
// guardara la página al 67 %, con letra diminuta y el diseño de pantalla grande. Ctrl+0 sigue
// devolviendo el zoom al 100 %. En el teléfono (resumen de gerencia) el zoom se deja libre.
const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

export function blockAccidentalZoom() {
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey && !isPhone()) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_'].includes(e.key) && !isPhone()) e.preventDefault();
  });
}
