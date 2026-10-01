import { useEffect } from 'react';

export default function Modal({ title, aside, onClose, width = 480, children, footer, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal ' + className} style={{ width }}>
        {(title || aside) && (
          <div className="modal-head">
            <div className="panel-title">{title}</div>
            {aside && <div className="modal-amount">{aside}</div>}
          </div>
        )}
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

// as="div" cuando el contenido son botones (chips, stepper) y no un solo input
export function Field({ label, hint, children, style, className = '', as: Tag = 'label' }) {
  return (
    <Tag className={'field ' + className} style={style}>
      <span>{label}{hint && <span className="field-hint"> · {hint}</span>}</span>
      {children}
    </Tag>
  );
}
