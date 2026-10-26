import { useState } from 'react';
import { SPECIES, SPECIES_ORDER, type SpeciesId } from '../data/species';
import MushroomIcon from './MushroomIcon';
import Icon from './Icon';

interface Props {
  found: SpeciesId[];
  onOpen: (id: SpeciesId) => void;
}

type Filter = 'all' | 'pending' | 'found';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'found', label: 'Registradas' },
];

/** Vista de lista sin 3D: cuadrícula de tarjetas (3 columnas en escritorio, 2 en tabletas y celulares). */
export default function SpeciesGrid({ found, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const total = SPECIES_ORDER.length;
  const ids = SPECIES_ORDER.filter((id) => (filter === 'all' ? true : filter === 'found' ? found.includes(id) : !found.includes(id)));

  return (
    <section className="guide" aria-label="Guía de especies">
      <header className="guide-head">
        <div>
          <h2>Guía de especies</h2>
          <p>Abre cada ficha para leer su información y registrar tu hallazgo.</p>
        </div>
        <div className="guide-progress" role="img" aria-label={`${found.length} de ${total} registradas`}>
          <strong>
            {found.length}
            <span>/{total}</span>
          </strong>
          <div className="bar">
            <i style={{ width: `${(found.length / total) * 100}%` }} />
          </div>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Filtrar especies">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {ids.length === 0 ? (
        <p className="empty">{filter === 'found' ? 'Aún no registras ninguna especie.' : '¡No queda ninguna pendiente!'}</p>
      ) : (
        <ul className="species-grid">
          {ids.map((id) => {
            const s = SPECIES[id];
            const ok = found.includes(id);
            return (
              <li key={id}>
                <button className={`species-card ${ok ? 'done' : ''}`} onClick={() => onOpen(id)} style={{ ['--sp' as string]: s.color }}>
                  <span className="species-art">
                    <MushroomIcon color={s.color} size={52} filled={ok} />
                  </span>
                  <span className="species-text">
                    <strong>{s.commonName}</strong>
                    <i>{s.scientificName}</i>
                    <small>{s.habitat}</small>
                  </span>
                  <span className={`species-status ${ok ? 'ok' : ''}`}>
                    {ok ? (
                      <>
                        <Icon name="check" size={14} /> Registrada
                      </>
                    ) : (
                      'Ver ficha'
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
