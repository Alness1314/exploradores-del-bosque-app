import { useModal } from './useModal';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  const ref = useModal<HTMLDivElement>(onCancel);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="card confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" ref={ref} tabIndex={-1}>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-text">{message}</p>
        <div className="actions">
          <button className="primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
