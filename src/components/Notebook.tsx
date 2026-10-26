import { SPECIES, SPECIES_ORDER, type SpeciesId } from '../data/species';
import MushroomIcon from './MushroomIcon';
import Icon from './Icon';

interface Props {
  found: SpeciesId[];
  onOpen: (id: SpeciesId) => void;
  onClose: () => void;
}

export default function Notebook({ found, onOpen, onClose }: Props) {
  return (
    <aside className="notebook" aria-label="Cuaderno de hallazgos">
      <div className="row">
        <h2>Cuaderno · {found.length}/{SPECIES_ORDER.length}</h2>
        <button className="btn icon" onClick={onClose} aria-label="Cerrar cuaderno">
          <Icon name="close" size={16} />
        </button>
      </div>
      <ul>
        {SPECIES_ORDER.map((id) => {
          const ok = found.includes(id);
          return (
            <li key={id}>
              {ok ? (
                <button className="entry found" onClick={() => onOpen(id)}>
                  <MushroomIcon color={SPECIES[id].color} size={30} />
                  <span>
                    <strong>{SPECIES[id].commonName}</strong>
                    <small><i>{SPECIES[id].scientificName}</i></small>
                  </span>
                </button>
              ) : (
                <span className="entry empty">
                  <MushroomIcon color="#7f8c82" size={30} filled={false} />
                  <span>
                    <strong>Espacio vacío</strong>
                    <small>Aún sin encontrar</small>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
