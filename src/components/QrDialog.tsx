import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useModal } from './useModal';

interface Props {
  onClose: () => void;
}

const isLocal = (url: string) => /^(https?:\/\/)?(localhost|127\.|\[::1\])/i.test(url);

/** Genera un código QR de la dirección de la demo (editable, por si se abre desde otra IP o ya está publicada). */
export default function QrDialog({ onClose }: Props) {
  const ref = useModal<HTMLDivElement>(onClose);
  const canvas = useRef<HTMLCanvasElement>(null);
  // En producción se define VITE_PUBLIC_URL (ver .env.example) para que el QR apunte al dominio público.
  const configured = import.meta.env.VITE_PUBLIC_URL;
  const [url, setUrl] = useState(configured && !/tu-dominio\.example/.test(configured) ? configured : window.location.href.split('#')[0]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    QRCode.toCanvas(el, url || ' ', { width: 280, margin: 2, errorCorrectionLevel: 'M' }, (e) => setError(!!e));
  }, [url]);

  const download = () => {
    const a = document.createElement('a');
    a.download = 'exploradores-del-bosque-qr.png';
    a.href = canvas.current!.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card qr" role="dialog" aria-modal="true" aria-labelledby="qr-title" ref={ref} tabIndex={-1}>
        <h2 id="qr-title">Código QR de la demo</h2>
        <canvas ref={canvas} aria-label={`Código QR de ${url}`} />
        <label className="field">
          Dirección
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
        </label>
        {error && <p className="caution">No se pudo generar el código con esa dirección.</p>}
        {isLocal(url) && (
          <p className="note">
            Esta dirección solo funciona en este equipo. Para abrirla desde un celular o un visor, publica la demo con HTTPS o escribe
            aquí la dirección de tu red (por ejemplo https://192.168.1.20:5173).
          </p>
        )}
        <div className="actions">
          <button className="primary" onClick={download}>Descargar PNG</button>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
