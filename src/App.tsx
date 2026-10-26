import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import SpeciesCard from './components/SpeciesCard';
import Notebook from './components/Notebook';
import Finish from './components/Finish';
import Welcome from './components/Welcome';
import MushroomIcon from './components/MushroomIcon';
import Joystick from './components/Joystick';
import QrDialog from './components/QrDialog';
import Icon from './components/Icon';
import Toasts, { type ToastItem } from './components/Toasts';
import ConfirmDialog from './components/ConfirmDialog';
import SpeciesGrid from './components/SpeciesGrid';
import type { ForestHandle } from './components/ForestCanvas';
import { SPECIES, SPECIES_ORDER, VIEW_POINTS } from './data/species';
import type { SpeciesId } from './data/species';
import type { VrAction, VrCard } from './scene/forestScene';
import { initialState, reducer } from './state';
import { chime, setAmbientVolume, startAmbient, stopAmbient } from './audio';

const ForestCanvas = lazy(() =>
  import('./components/ForestCanvas').catch(() => ({
    // Si el módulo 3D no carga, se avisa para pasar a la vista de lista.
    default: ({ onError }: { onError: () => void }) => {
      useEffect(onError, [onError]);
      return null;
    },
  })) as Promise<{ default: typeof import('./components/ForestCanvas').default }>,
);

const TOTAL = SPECIES_ORDER.length;
const TOAST_MS = 3000;
const HINT_MS = 6000;

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [listMode, setListMode] = useState(false);
  const [notebook, setNotebook] = useState(false);
  const [sound, setSound] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [sceneReady, setSceneReady] = useState(false);
  const [coach, setCoach] = useState(true);
  const [qr, setQr] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  const [vrSupported, setVrSupported] = useState(false);
  const [vrActive, setVrActive] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const moveRef = useRef({ x: 0, y: 0 });
  const forest = useRef<ForestHandle>(null);
  const toastId = useRef(0);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const onSceneError = useCallback(() => setListMode(true), []);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const { phase, point, found, selected, hint, answer } = state;

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  /** Aviso que se cierra solo a los 3 s (o con la ✕). Un aviso idéntico no se duplica. */
  const pushToast = useCallback(
    (text: string, tone: ToastItem['tone'] = 'info') => {
      const id = ++toastId.current;
      setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, text, tone }]);
      window.setTimeout(() => dismissToast(id), TOAST_MS);
    },
    [dismissToast],
  );

  const nextPoint = VIEW_POINTS.findIndex((p) => p.species.some((id) => !found.includes(id)));
  const hintPoint = hint && nextPoint >= 0 ? nextPoint : -1;

  // La zona sugerida por la pista deja de parpadear a los 6 s.
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => dispatch({ type: 'clearHint' }), HINT_MS);
    return () => window.clearTimeout(t);
  }, [hint]);

  // La guía de controles se oculta tras unos segundos o con la primera acción.
  useEffect(() => {
    if (phase !== 'explore' || !coach) return;
    const t = window.setTimeout(() => setCoach(false), 9000);
    return () => window.clearTimeout(t);
  }, [phase, coach]);

  useEffect(() => {
    if (phase === 'welcome') return;
    const onKey = (e: KeyboardEvent) => {
      if (selected || phase === 'finished' || qr || confirmHome) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VIEW_POINTS.length) {
        setCoach(false);
        dispatch({ type: 'goTo', point: n - 1 });
      } else if (e.key === 'Escape') {
        setNotebook(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, selected, qr, confirmHome]);

  useEffect(() => {
    if (sound) startAmbient(volume);
    else stopAmbient();
    return stopAmbient;
    // El volumen se aplica en el efecto siguiente; aquí solo se arranca o detiene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound]);
  useEffect(() => setAmbientVolume(volume), [volume]);

  const prevFound = useRef(0);
  useEffect(() => {
    if (found.length > prevFound.current) chime();
    prevFound.current = found.length;
  }, [found.length]);

  // Contenido de la ficha flotante que se muestra dentro del visor de realidad virtual.
  const vrCard = useMemo<VrCard | null>(() => {
    if (selected) {
      const s = SPECIES[selected];
      const lines = [s.description, `Papel en el bosque: ${s.role}`, `Distribución: ${s.distribution}`];
      if (s.caution) lines.push(`Precaución: ${s.caution}`);
      return { title: s.commonName, subtitle: s.scientificName, lines, found: found.includes(selected) };
    }
    if (phase === 'finished') {
      return {
        title: `¡Encontraste las ${TOTAL} especies!`,
        subtitle: 'Misión cumplida',
        lines: [
          'Unos hongos reciclan la madera y la hojarasca; otros viven unidos a las raíces y comparten nutrientes con los árboles.',
          'Quita el visor para ver tu cuaderno completo y responder la pregunta final.',
        ],
        found: true,
        primary: 'Seguir explorando',
      };
    }
    return null;
  }, [selected, phase, found]);

  const selectedRef = useRef<SpeciesId | null>(null);
  selectedRef.current = selected;
  const onVrAction = useCallback((action: VrAction) => {
    const id = selectedRef.current;
    if (action === 'register' && id) dispatch({ type: 'register', id });
    else dispatch({ type: id ? 'close' : 'dismiss' });
  }, []);

  const toggleVr = async () => {
    if (listMode) {
      pushToast('Cambia a la vista 3D para usar la realidad virtual.', 'warn');
      return;
    }
    if (!vrSupported && !vrActive) {
      pushToast(
        window.isSecureContext
          ? 'Este navegador no ofrece realidad virtual. Abre la demo en el navegador de tu Meta Quest.'
          : 'La realidad virtual requiere HTTPS. Abre la demo con una dirección https:// en el navegador de tu Meta Quest.',
        'warn',
      );
      return;
    }
    try {
      if (vrActive) await forest.current?.exitVR();
      else await forest.current?.enterVR();
    } catch (e) {
      pushToast('No se pudo iniciar la realidad virtual. Revisa que el visor esté conectado y permite el acceso.', 'warn');
      console.warn(e);
    }
  };

  const start = (list: boolean) => {
    setListMode(list);
    dispatch({ type: 'start' });
  };

  const goHome = () => {
    setConfirmHome(false);
    setNotebook(false);
    setToasts([]);
    setCoach(true);
    setSceneReady(false);
    setVrActive(false);
    dispatch({ type: 'home' });
  };

  const showHint = () => {
    if (nextPoint < 0) return;
    dispatch({ type: 'hint' });
    pushToast(`Pista: explora cerca de «${VIEW_POINTS[nextPoint].name}» (zona ${nextPoint + 1}).`);
  };

  if (phase === 'welcome') {
    return (
      <>
        <div className="welcome-bg" aria-hidden="true">
          <Suspense fallback={null}>
            <ForestCanvas
              ambient
              point={0}
              found={[]}
              paused={false}
              moveRef={moveRef}
              vrCard={null}
              onPick={() => {}}
              onError={() => {}}
              onReady={() => {}}
              onVrSupport={() => {}}
              onVrChange={() => {}}
              onVrAction={() => {}}
            />
          </Suspense>
        </div>
        <Welcome onStart={() => start(false)} onStartList={() => start(true)} onQr={() => setQr(true)} />
        {qr && <QrDialog onClose={() => setQr(false)} />}
      </>
    );
  }

  const onPick = (id: SpeciesId, near: boolean) => {
    setCoach(false);
    if (!near) pushToast('Acércate a menos de 5 m para observarlo y registrarlo.', 'warn');
    else dispatch({ type: 'select', id });
  };

  return (
    <div className="app">
      <main className="stage">
        {listMode ? (
          <SpeciesGrid found={found} onOpen={(id) => dispatch({ type: 'select', id })} />
        ) : (
          <>
            <Suspense fallback={null}>
              <ForestCanvas
                point={point}
                found={found}
                paused={!!selected || phase === 'finished'}
                moveRef={moveRef}
                vrCard={vrCard}
                handle={forest}
                onPick={onPick}
                onError={onSceneError}
                onReady={onSceneReady}
                onVrSupport={setVrSupported}
                onVrChange={setVrActive}
                onVrAction={onVrAction}
              />
            </Suspense>
            {!sceneReady && (
              <div className="loading" role="status">
                <span className="spinner" aria-hidden="true" />
                Cargando el bosque…
              </div>
            )}
          </>
        )}

        <header className="hud">
          <div className="hud-left">
            <button className="btn icon" onClick={() => (found.length ? setConfirmHome(true) : goHome())} aria-label="Volver al inicio" title="Volver al inicio">
              <Icon name="home" />
            </button>
            <div className="brand">
              <Icon name="leaf" size={18} />
              <h1>Exploradores del bosque</h1>
            </div>
            <div className="progress" role="img" aria-label={`Hallazgos: ${found.length} de ${TOTAL}`}>
              <span className="slots">
                {SPECIES_ORDER.map((id) => (
                  <span key={id} className={found.includes(id) ? 'slot on' : 'slot'}>
                    <MushroomIcon color={SPECIES[id].color} size={14} filled={found.includes(id)} />
                  </span>
                ))}
              </span>
              <strong>
                {found.length}
                <span>/{TOTAL}</span>
              </strong>
            </div>
          </div>

          <nav className="toolbar" aria-label="Herramientas">
            <div className="tool-group">
              <button className="btn tool" onClick={() => setNotebook((v) => !v)} aria-pressed={notebook} title="Cuaderno de hallazgos">
                <Icon name="book" />
                <span>Cuaderno</span>
              </button>
              {nextPoint >= 0 && !listMode && (
                <button className="btn tool" onClick={showHint} title="Pista">
                  <Icon name="bulb" />
                  <span>Pista</span>
                </button>
              )}
              <button className="btn tool" onClick={() => setListMode((v) => !v)} aria-pressed={listMode} title={listMode ? 'Ver el bosque en 3D' : 'Ver la guía de especies'}>
                <Icon name={listMode ? 'cube' : 'grid'} />
                <span>{listMode ? 'Bosque 3D' : 'Guía'}</span>
              </button>
              <button
                className={`btn tool vr ${!vrSupported && !vrActive ? 'off' : ''} ${vrActive ? 'on' : ''}`}
                onClick={toggleVr}
                title={vrSupported ? 'Entrar en realidad virtual' : 'Realidad virtual (requiere un visor compatible)'}
              >
                <Icon name="vr" />
                <span>{vrActive ? 'Salir de VR' : 'VR'}</span>
              </button>
              <button className="btn tool" onClick={() => setQr(true)} title="Código QR">
                <Icon name="qr" />
                <span>QR</span>
              </button>
            </div>
            <div className="tool-group sound">
              <button className="btn icon" onClick={() => setSound((v) => !v)} aria-pressed={sound} aria-label={sound ? 'Silenciar el ambiente' : 'Activar el ambiente sonoro'} title="Sonido ambiente">
                <Icon name={sound ? 'volume' : 'mute'} />
              </button>
              {sound && (
                <input
                  className="volume"
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volumen del ambiente"
                />
              )}
            </div>
            {found.length === TOTAL && (
              <button className="btn primary" onClick={() => dispatch({ type: 'review' })}>
                <Icon name="check" />
                <span>Ver cierre</span>
              </button>
            )}
          </nav>
        </header>

        <Toasts items={toasts} onClose={dismissToast} />

        {coach && !listMode && sceneReady && !selected && phase === 'explore' && (
          <div className="coach" aria-hidden="true">
            {touch ? 'Joystick para caminar · Arrastra para mirar · Toca un hongo' : 'W S / ↑ ↓ avanzar · A D / ← → girar · Q E pasos laterales · Clic izq. + der. avanza · Arrastra para mirar · Clic en un hongo'}
          </div>
        )}

        {notebook && <Notebook found={found} onOpen={(id) => dispatch({ type: 'select', id })} onClose={() => setNotebook(false)} />}

        {!listMode && touch && sceneReady && <Joystick moveRef={moveRef} />}

        {!listMode && (
          <nav className="points" aria-label="Zonas del bosque">
            {VIEW_POINTS.map((p, i) => {
              const done = p.species.every((id) => found.includes(id));
              return (
                <button
                  key={p.name}
                  className={`${i === point ? 'active' : ''} ${i === hintPoint ? 'pulse' : ''}`}
                  aria-current={i === point ? 'true' : undefined}
                  onClick={() => {
                    setCoach(false);
                    dispatch({ type: 'goTo', point: i });
                  }}
                >
                  <span className="num">{done ? <Icon name="check" size={12} /> : i + 1}</span>
                  <span className="label">{p.name}</span>
                </button>
              );
            })}
          </nav>
        )}
      </main>

      {selected && (
        <SpeciesCard
          id={selected}
          found={found.includes(selected)}
          onRegister={() => dispatch({ type: 'register', id: selected })}
          onClose={() => dispatch({ type: 'close' })}
        />
      )}

      {phase === 'finished' && !selected && (
        <Finish
          answer={answer}
          onAnswer={(index) => dispatch({ type: 'answer', index })}
          onReset={() => {
            setNotebook(false);
            dispatch({ type: 'reset' });
          }}
          onBack={() => dispatch({ type: 'dismiss' })}
        />
      )}

      {confirmHome && (
        <ConfirmDialog
          title="¿Volver al inicio?"
          message={`Perderás tu progreso (${found.length} de ${TOTAL} especies registradas).`}
          confirmLabel="Volver al inicio"
          cancelLabel="Seguir explorando"
          onConfirm={goHome}
          onCancel={() => setConfirmHome(false)}
        />
      )}

      {qr && <QrDialog onClose={() => setQr(false)} />}
    </div>
  );
}
