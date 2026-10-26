import { useEffect, useImperativeHandle, useRef, type MutableRefObject, type Ref } from 'react';
import { createForestScene, type ForestScene, type VrAction, type VrCard } from '../scene/forestScene';
import type { SpeciesId } from '../data/species';

export interface ForestHandle {
  enterVR: () => Promise<void>;
  exitVR: () => Promise<void>;
}

interface Props {
  point: number;
  found: SpeciesId[];
  paused: boolean;
  /** Vector del joystick táctil, escrito por la interfaz y leído en cada cuadro. */
  moveRef: MutableRefObject<{ x: number; y: number }>;
  vrCard: VrCard | null;
  handle?: Ref<ForestHandle>;
  onPick: (id: SpeciesId, near: boolean) => void;
  onError: () => void;
  onReady: () => void;
  onVrSupport: (supported: boolean) => void;
  onVrChange: (active: boolean) => void;
  onVrAction: (action: VrAction) => void;
  /** Fondo animado de la bienvenida: sin interacción. */
  ambient?: boolean;
}

export default function ForestCanvas({ point, found, paused, moveRef, vrCard, handle, onPick, onError, onReady, onVrSupport, onVrChange, onVrAction, ambient }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ForestScene | null>(null);
  // Los callbacks cambian en cada render: se leen desde una referencia para no recrear la escena.
  const cbRef = useRef({ onPick, onReady, onVrSupport, onVrChange, onVrAction });
  cbRef.current = { onPick, onReady, onVrSupport, onVrChange, onVrAction };
  const latest = useRef({ point, found, paused, vrCard });
  latest.current = { point, found, paused, vrCard };

  useImperativeHandle(handle, () => ({
    enterVR: () => sceneRef.current?.enterVR() ?? Promise.resolve(),
    exitVR: () => sceneRef.current?.exitVR() ?? Promise.resolve(),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: ForestScene;
    try {
      scene = createForestScene(canvas, {
        onPick: (id, near) => cbRef.current.onPick(id, near),
        onReady: () => cbRef.current.onReady(),
        getMove: () => moveRef.current,
        onVrSupport: (s) => cbRef.current.onVrSupport(s),
        onVrChange: (a) => cbRef.current.onVrChange(a),
        onVrAction: (a) => cbRef.current.onVrAction(a),
        ambient,
      });
    } catch {
      onError();
      return;
    }
    sceneRef.current = scene;
    scene.setFound(latest.current.found);
    scene.setPaused(latest.current.paused);
    scene.setVrCard(latest.current.vrCard);
    scene.goTo(latest.current.point);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [onError, moveRef, ambient]);

  useEffect(() => sceneRef.current?.goTo(point), [point]);
  useEffect(() => sceneRef.current?.setFound(found), [found]);
  useEffect(() => sceneRef.current?.setPaused(paused), [paused]);
  useEffect(() => sceneRef.current?.setVrCard(vrCard), [vrCard]);

  return (
    <canvas
      ref={canvasRef}
      className="forest"
      role="img"
      aria-label="Escena 3D del bosque. Arrastra para mirar, camina con las teclas W, A, S y D o con el joystick, y toca un hongo para ver su ficha. También puedes usar la vista de lista."
    />
  );
}
