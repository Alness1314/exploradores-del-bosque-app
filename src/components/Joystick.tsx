import { useRef, useState, type MutableRefObject, type PointerEvent } from 'react';

interface Props {
  moveRef: MutableRefObject<{ x: number; y: number }>;
}

const RADIUS = 52;

/** Joystick virtual para caminar en pantallas táctiles. Mirar alrededor se hace arrastrando la escena. */
export default function Joystick({ moveRef }: Props) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    moveRef.current = { x: dx / RADIUS, y: dy / RADIUS };
  };
  const release = () => {
    setKnob({ x: 0, y: 0 });
    moveRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label="Joystick para caminar"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => e.buttons !== 0 && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
