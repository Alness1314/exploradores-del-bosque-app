import { QUIZ, SPECIES, SPECIES_ORDER } from '../data/species';
import MushroomIcon from './MushroomIcon';
import { useModal } from './useModal';

interface Props {
  answer: number | null;
  onAnswer: (index: number) => void;
  onReset: () => void;
  onBack: () => void;
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 7) * 0.12,
  color: ['#d6432f', '#d9a441', '#8a5fbf', '#46d36f'][i % 4],
}));

export default function Finish({ answer, onAnswer, onReset, onBack }: Props) {
  const ref = useModal<HTMLDivElement>(onBack);
  return (
    <div className="overlay">
      <div className="confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s` }} />
        ))}
      </div>
      <div className="card wide" role="dialog" aria-modal="true" aria-labelledby="finish-title" ref={ref} tabIndex={-1}>
        <h2 id="finish-title">¡Encontraste las {SPECIES_ORDER.length} especies!</h2>
        <ul className="summary grid">
          {SPECIES_ORDER.map((id) => (
            <li key={id}>
              <MushroomIcon color={SPECIES[id].color} size={26} />
              <span>
                <strong>{SPECIES[id].commonName}</strong>
                <small><i>{SPECIES[id].scientificName}</i></small>
              </span>
            </li>
          ))}
        </ul>
        <h3>{QUIZ.question}</h3>
        <div className="options" role="group" aria-label="Opciones de respuesta">
          {QUIZ.options.map((text, i) => {
            const chosen = answer === i;
            const state = answer === null ? '' : i === QUIZ.correct ? 'right' : chosen ? 'wrong' : '';
            return (
              <button key={i} className={`option ${state}`} onClick={() => onAnswer(i)} disabled={answer !== null}>
                {text}
                {answer !== null && i === QUIZ.correct ? ' ✔' : ''}
                {chosen && i !== QUIZ.correct ? ' ✘' : ''}
              </button>
            );
          })}
        </div>
        {answer !== null && (
          <p role="status" className="feedback">
            {answer === QUIZ.correct ? QUIZ.rightFeedback : QUIZ.wrongFeedback}
          </p>
        )}
        <div className="actions">
          <button className="primary" onClick={onReset}>Reiniciar recorrido</button>
          <button onClick={onBack}>Volver al bosque</button>
        </div>
      </div>
    </div>
  );
}
