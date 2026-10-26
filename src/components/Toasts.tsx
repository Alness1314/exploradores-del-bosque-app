import Icon from './Icon';

export interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

interface Props {
  items: ToastItem[];
  onClose: (id: number) => void;
}

/** Avisos flotantes: cristal oscuro con texto blanco; se cierran solos a los 3 s o con la ✕. */
export default function Toasts({ items, onClose }: Props) {
  return (
    <div className="toasts" role="region" aria-label="Avisos" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} role="status">
          <span className="toast-bar" aria-hidden="true" />
          <p>{t.text}</p>
          <button className="toast-close" onClick={() => onClose(t.id)} aria-label="Cerrar aviso">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
