import MushroomIcon from './MushroomIcon';
import { SPECIES, SPECIES_ORDER } from '../data/species';

interface Props {
  onStart: () => void;
  onStartList: () => void;
  onQr: () => void;
}

const STEPS = [
  { n: '1', title: 'Explora', text: 'Camina con W A S D, las flechas o el joystick; A y D (o ← →) giran la cámara y ambos botones del ratón avanzan.' },
  { n: '2', title: 'Descubre', text: 'Toca un hongo para leer su ficha y ver dónde vive.' },
  { n: '3', title: 'Registra', text: 'Completa tu cuaderno con las 20 especies y responde una pregunta final.' },
];

export default function Welcome({ onStart, onStartList, onQr }: Props) {
  return (
    <main className="welcome">
      <div className="welcome-inner">
        <div className="welcome-logo" aria-hidden="true">
          {SPECIES_ORDER.slice(0, 5).map((id) => (
            <MushroomIcon key={id} color={SPECIES[id].color} size={46} />
          ))}
        </div>
        <h1>Exploradores del bosque</h1>
        <p className="lead">
          Tu misión: encontrar <strong>veinte especies de hongos</strong> escondidas en un bosque de coníferas y descubrir qué
          papel cumplen en él.
        </p>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="step-n" aria-hidden="true">{s.n}</span>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
        <div className="welcome-actions">
          <button className="primary big" onClick={onStart} autoFocus>
            Comenzar la exploración
          </button>
          <button className="link" onClick={onStartList}>
            Prefiero la vista de lista, sin 3D
          </button>
          <button className="link" onClick={onQr}>
            Mostrar código QR
          </button>
        </div>
        <p className="fine">
          Actividad de observación: no se recolecta nada y las fichas no sirven para identificar hongos ni decidir su
          consumo.
        </p>
      </div>
    </main>
  );
}
