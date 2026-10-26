import { SPECIES, type SpeciesId } from '../data/species';
import MushroomIcon from './MushroomIcon';
import { useModal } from './useModal';

interface Props {
  id: SpeciesId;
  found: boolean;
  onRegister: () => void;
  onClose: () => void;
}

export default function SpeciesCard({ id, found, onRegister, onClose }: Props) {
  const s = SPECIES[id];
  const ref = useModal<HTMLDivElement>(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="card-title" ref={ref} tabIndex={-1}>
        <div className="card-head" style={{ ['--sp' as string]: s.color }}>
          <MushroomIcon color={s.color} size={64} />
          <div>
            <h2 id="card-title">{s.commonName}</h2>
            <p className="sci">{s.scientificName}</p>
          </div>
        </div>
        <div className="chips">
          <span className="chip">{s.habitat}</span>
          <span className="chip alt">Familia {s.family}</span>
        </div>
        <p>{s.description}</p>
        <p>
          <strong>Su papel en el bosque:</strong> {s.role}
        </p>
        <p>
          <strong>Distribución:</strong> {s.distribution}
        </p>
        {s.fact && <p className="fact">💡 {s.fact}</p>}
        {s.caution && <p className="caution">⚠ {s.caution}</p>}
        <p className="note">
          Fuente: <a href={s.source.url} target="_blank" rel="noopener noreferrer">{s.source.label}</a>. El modelo 3D es una
          representación estilizada: no sirve para identificar hongos ni para decidir su consumo.
        </p>
        <div className="actions">
          <button className="primary" onClick={onRegister} disabled={found}>
            {found ? '✔ Ya registrado' : 'Registrar hallazgo'}
          </button>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
