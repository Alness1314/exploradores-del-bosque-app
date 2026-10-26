import { Color3, LoadAssetContainerAsync, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, PBRMaterial } from '@babylonjs/core';

export type Updater = (time: number, dt: number) => void;

function flatMat(scene: Scene, name: string, color: string, emissive = 0.25): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  const c = Color3.FromHexString(color);
  m.diffuseColor = c;
  m.specularColor = Color3.Black();
  m.emissiveColor = c.scale(emissive);
  return m;
}

function unlit(scene: Scene, name: string, color: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = Color3.FromHexString(color);
  m.disableLighting = true;
  m.backFaceCulling = false;
  return m;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Winged {
  node: TransformNode;
  left: TransformNode;
  right: TransformNode;
}

/** Cuerpo con dos alas articuladas en el eje longitudinal; el aleteo rota cada articulación sobre Z. */
function winged(scene: Scene, name: string, wingSize: [number, number], wingMat: StandardMaterial, bodyMat: StandardMaterial, bodyLen: number, bodyR: number): Winged {
  const node = new TransformNode(name, scene);
  const body = MeshBuilder.CreateCylinder(`${name}_body`, { height: bodyLen, diameter: bodyR * 2, tessellation: 6 }, scene);
  body.rotation.x = Math.PI / 2;
  body.material = bodyMat;
  body.parent = node;
  body.isPickable = false;
  const hinge = (side: 1 | -1) => {
    const h = new TransformNode(`${name}_hinge${side}`, scene);
    h.parent = node;
    const wing = MeshBuilder.CreatePlane(`${name}_wing${side}`, { width: wingSize[0], height: wingSize[1], sideOrientation: Mesh.DOUBLESIDE }, scene);
    wing.rotation.x = Math.PI / 2;
    wing.position.x = (side * wingSize[0]) / 2;
    wing.material = wingMat;
    wing.parent = h;
    wing.isPickable = false;
    return h;
  };
  return { node, left: hinge(-1), right: hinge(1) };
}

/** Mariposas que vuelan en trayectorias suaves (curvas de Lissajous) alrededor de varios puntos. */
export function buildButterflies(scene: Scene, centers: Vector3[], count: number): Updater {
  const rand = rng(77);
  const colors = ['#ffb347', '#f4f4f0', '#6ab7ff', '#ffd93b', '#e873c6'];
  const body = flatMat(scene, 'butterflyBody', '#2b2320');
  const flyers = Array.from({ length: count }, (_, i) => {
    const w = winged(scene, `butterfly${i}`, [0.1, 0.085], unlit(scene, `butterflyWing${i}`, colors[i % colors.length]), body, 0.07, 0.01);
    const c = centers[i % centers.length];
    return {
      ...w,
      cx: c.x + (rand() - 0.5) * 3,
      cy: 0.7 + rand() * 1.4,
      cz: c.z + (rand() - 0.5) * 3,
      a: 1.5 + rand() * 2.5,
      b: 0.25 + rand() * 0.4,
      c: 1.5 + rand() * 2.5,
      w1: 0.25 + rand() * 0.3,
      w2: 0.5 + rand() * 0.5,
      w3: 0.2 + rand() * 0.3,
      p: rand() * 6.28,
      flap: 16 + rand() * 8,
    };
  });
  return (t) => {
    for (const f of flyers) {
      const x = f.cx + f.a * Math.sin(f.w1 * t + f.p);
      const y = f.cy + f.b * Math.sin(f.w2 * t + f.p * 2);
      const z = f.cz + f.c * Math.sin(f.w3 * t + f.p * 3);
      const dx = f.a * f.w1 * Math.cos(f.w1 * t + f.p);
      const dz = f.c * f.w3 * Math.cos(f.w3 * t + f.p * 3);
      f.node.position.set(x, y, z);
      f.node.rotation.y = Math.atan2(dx, dz);
      const flap = 0.25 + Math.abs(Math.sin(t * f.flap + f.p)) * 1.1;
      f.left.rotation.z = flap;
      f.right.rotation.z = -flap;
    }
  };
}

/** Aves que giran sobre el bosque: unas por encima de las copas y otras más bajas, entre los árboles. */
export function buildBirds(scene: Scene, count: number): Updater {
  const rand = rng(31);
  const wing = unlit(scene, 'birdWing', '#33363d');
  const body = flatMat(scene, 'birdBody', '#2c2f36');
  const birds = Array.from({ length: count }, (_, i) => {
    const high = i % 2 === 0;
    const w = winged(scene, `bird${i}`, high ? [0.5, 0.17] : [0.28, 0.1], wing, body, high ? 0.36 : 0.2, high ? 0.05 : 0.03);
    return {
      ...w,
      radius: high ? 14 + rand() * 14 : 8 + rand() * 9,
      height: high ? 15 + rand() * 6 : 5 + rand() * 3,
      speed: (high ? 0.1 : 0.2) + rand() * 0.08,
      dir: rand() > 0.5 ? 1 : -1,
      phase: rand() * 6.28,
      ox: (rand() - 0.5) * 8,
      oz: (rand() - 0.5) * 8,
      flap: high ? 4 : 11,
    };
  });
  return (t) => {
    for (const b of birds) {
      const th = b.phase + b.dir * b.speed * t;
      const x = b.ox + Math.cos(th) * b.radius;
      const z = b.oz + Math.sin(th) * b.radius;
      b.node.position.set(x, b.height + Math.sin(t * 0.5 + b.phase) * 0.9, z);
      b.node.rotation.y = Math.atan2(-Math.sin(th) * b.dir, Math.cos(th) * b.dir);
      // Aleteo con pausas de planeo.
      const glide = Math.max(0, Math.sin(t * 0.35 + b.phase));
      const flap = 0.1 + Math.sin(t * b.flap + b.phase) * 0.65 * (1 - glide * 0.85);
      b.left.rotation.z = flap;
      b.right.rotation.z = -flap;
      b.node.rotation.z = Math.sin(th * 3) * 0.12 * b.dir;
    }
  };
}

interface Rabbit {
  root: TransformNode;
  body: TransformNode;
  ears: TransformNode[];
  state: 'idle' | 'hop' | 'flee';
  timer: number;
  hopT: number;
  hopDur: number;
  step: number;
  from: Vector3;
  to: Vector3;
  heading: number;
  hopsLeft: number;
  seed: number;
}

export interface RabbitOptions {
  /** Prefijo de los nombres de nodos (para distinguir conejos de liebres). */
  prefix: string;
  /** Tamaño relativo del animal. */
  scale: number;
  /** Alargamiento de las orejas. */
  ears: number;
  fur: string;
  /** Longitud relativa de cada salto. */
  step: number;
  seed: number;
}

/**
 * Conejos y liebres de pocos polígonos: se quedan quietos, dan saltitos y huyen si el visitante se acerca.
 * La liebre es más grande, de orejas largas y saltos más amplios.
 */
export function buildRabbits(
  scene: Scene,
  starts: Vector3[],
  canWalk: (x: number, z: number) => boolean,
  player: () => Vector3,
  options: Partial<RabbitOptions> = {},
): Updater {
  const o: RabbitOptions = { prefix: 'rabbit', scale: 1, ears: 1, fur: '#9b8566', step: 1, seed: 11, ...options };
  const rand = rng(o.seed);
  const fur = flatMat(scene, `${o.prefix}Fur`, o.fur, 0.3);
  const light = flatMat(scene, `${o.prefix}Light`, '#e9e1d2', 0.4);
  const dark = flatMat(scene, `${o.prefix}Eye`, '#16110d', 0);

  const part = (name: string, parent: TransformNode, radius: number, scale: [number, number, number], pos: [number, number, number], material: StandardMaterial) => {
    const m = MeshBuilder.CreateIcoSphere(name, { radius, subdivisions: 1, flat: true }, scene);
    m.scaling.set(...scale);
    m.position.set(...pos);
    m.material = material;
    m.parent = parent;
    m.isPickable = false;
    return m;
  };

  const rabbits: Rabbit[] = starts.map((s, i) => {
    const n = `${o.prefix}${i}`;
    const root = new TransformNode(n, scene);
    root.scaling.setAll(o.scale);
    const body = new TransformNode(`${n}Body`, scene);
    body.parent = root;
    part(`${n}b`, body, 0.16, [0.9, 0.85, 1.4], [0, 0.15, 0], fur);
    part(`${n}h`, body, 0.1, [1, 1, 1.05], [0, 0.27, 0.2], fur);
    part(`${n}t`, body, 0.05, [1, 1, 1], [0, 0.17, -0.24], light);
    part(`${n}e1`, body, 0.015, [1, 1, 1], [0.05, 0.3, 0.29], dark);
    part(`${n}e2`, body, 0.015, [1, 1, 1], [-0.05, 0.3, 0.29], dark);
    const ears = [-1, 1].map((side, k) => {
      const pivot = new TransformNode(`${n}ear${k}`, scene);
      pivot.parent = body;
      pivot.position.set(side * 0.045, 0.34, 0.17);
      part(`${n}ea${k}`, pivot, 0.045, [0.55, 2.6 * o.ears, 0.4], [0, 0.1 * o.ears, 0], fur);
      return pivot;
    });
    root.position.copyFrom(s);
    return {
      root,
      body,
      ears,
      state: 'idle' as const,
      timer: 0.5 + rand() * 2,
      hopT: 0,
      hopDur: 0.45,
      step: 0.5,
      from: s.clone(),
      to: s.clone(),
      heading: rand() * 6.28,
      hopsLeft: 0,
      seed: rand() * 10,
    };
  });

  const startHop = (r: Rabbit, heading: number, step: number, dur: number) => {
    // Si el salto choca con un obstáculo, prueba otras direcciones.
    for (let k = 0; k < 8; k++) {
      const h = heading + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.7;
      const x = r.root.position.x + Math.sin(h) * step;
      const z = r.root.position.z + Math.cos(h) * step;
      if (canWalk(x, z)) {
        r.heading = h;
        r.from.copyFrom(r.root.position);
        r.to.set(x, 0, z);
        r.hopT = 0;
        r.hopDur = dur;
        return true;
      }
    }
    return false;
  };

  return (t, dt) => {
    const p = player();
    for (const r of rabbits) {
      const dx = r.root.position.x - p.x;
      const dz = r.root.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (r.state !== 'flee' && dist < 3.2 * o.scale) {
        r.state = 'flee';
        r.hopsLeft = 99;
        r.hopT = 1; // termina el salto actual y arranca uno nuevo
      } else if (r.state === 'flee' && dist > 8 * o.scale) {
        r.state = 'idle';
        r.timer = 1 + rand() * 2;
        r.hopT = 1;
      }

      if (r.state === 'idle') {
        r.timer -= dt;
        // Las orejas se mueven un poco mientras descansa.
        r.ears[0].rotation.x = -0.15 + Math.sin(t * 2.1 + r.seed) * 0.08;
        r.ears[1].rotation.x = -0.15 + Math.sin(t * 1.7 + r.seed * 2) * 0.08;
        r.body.position.y = 0;
        r.body.rotation.x = 0;
        if (r.timer <= 0) {
          r.hopsLeft = 2 + Math.floor(rand() * 3);
          r.heading += (rand() - 0.5) * 2.4;
          if (startHop(r, r.heading, 0.5 * o.step * o.scale, 0.45)) r.state = 'hop';
          else r.timer = 0.8;
        }
      } else {
        const flee = r.state === 'flee';
        if (r.hopT >= 1) {
          r.root.position.copyFrom(r.to);
          r.hopsLeft--;
          if (!flee && r.hopsLeft <= 0) {
            r.state = 'idle';
            r.timer = 1.2 + rand() * 2.8;
            continue;
          }
          const away = Math.atan2(dx, dz) + (rand() - 0.5) * 0.8;
          if (!startHop(r, flee ? away : r.heading, (flee ? 1.0 : 0.5) * o.step * o.scale, flee ? 0.28 : 0.45)) {
            r.state = 'idle';
            r.timer = 0.6;
            continue;
          }
        }
        r.hopT = Math.min(1, r.hopT + dt / r.hopDur);
        const k = r.hopT;
        r.root.position.x = r.from.x + (r.to.x - r.from.x) * k;
        r.root.position.z = r.from.z + (r.to.z - r.from.z) * k;
        r.body.position.y = Math.sin(Math.PI * k) * (flee ? 0.3 : 0.18);
        r.body.rotation.x = -Math.sin(Math.PI * k) * 0.4;
        r.ears[0].rotation.x = r.ears[1].rotation.x = -0.5 + Math.sin(Math.PI * k) * 0.4;
        // Gira suavemente hacia la dirección del salto.
        let diff = r.heading - r.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        r.root.rotation.y += diff * Math.min(1, dt * 12);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Venados (procedurales, con andar de cuatro patas)
// ---------------------------------------------------------------------------

interface Deer {
  root: TransformNode;
  body: TransformNode;
  neck: TransformNode;
  legs: TransformNode[];
  ears: TransformNode[];
  pos: Vector3;
  heading: number;
  state: 'graze' | 'walk' | 'alert' | 'flee';
  timer: number;
  target: Vector3;
  phase: number;
  neckAngle: number;
  speed: number;
  seed: number;
}

/**
 * Manada de venados: pastan con la cabeza baja, caminan despacio, se ponen alerta si el visitante se acerca y
 * huyen al galope si se acerca más. Los machos llevan astas.
 */
export function buildDeer(
  scene: Scene,
  home: Vector3,
  count: number,
  canWalk: (x: number, z: number) => boolean,
  player: () => Vector3,
): Updater {
  const rand = rng(909);
  const coat = flatMat(scene, 'deerCoat', '#8c5e3a', 0.3);
  const belly = flatMat(scene, 'deerBelly', '#d4c09b', 0.4);
  const legMat = flatMat(scene, 'deerLeg', '#6f4a2d', 0.3);
  const antlerMat = flatMat(scene, 'deerAntler', '#d9caa6', 0.4);
  const dark = flatMat(scene, 'deerDark', '#1c1511', 0);

  const ico = (name: string, parent: TransformNode, r: number, s: [number, number, number], p: [number, number, number], m: StandardMaterial) => {
    const x = MeshBuilder.CreateIcoSphere(name, { radius: r, subdivisions: 1, flat: true }, scene);
    x.scaling.set(...s);
    x.position.set(...p);
    x.material = m;
    x.parent = parent;
    x.isPickable = false;
    return x;
  };
  const cyl = (name: string, parent: TransformNode, top: number, bottom: number, h: number, p: [number, number, number], m: StandardMaterial, rot: [number, number, number] = [0, 0, 0]) => {
    const c = MeshBuilder.CreateCylinder(name, { diameterTop: top, diameterBottom: bottom, height: h, tessellation: 6 }, scene);
    c.position.set(...p);
    c.rotation.set(...rot);
    c.material = m;
    c.parent = parent;
    c.isPickable = false;
    return c;
  };

  const make = (i: number, stag: boolean, size: number): Deer => {
    const n = `deer${i}`;
    const root = new TransformNode(n, scene);
    root.scaling.setAll(size);
    const body = new TransformNode(`${n}Body`, scene);
    body.parent = root;
    ico(`${n}t`, body, 0.34, [0.82, 0.84, 1.62], [0, 0.86, 0], coat);
    ico(`${n}b`, body, 0.25, [0.84, 0.5, 1.3], [0, 0.7, -0.02], belly);
    ico(`${n}c`, body, 0.24, [0.9, 1, 0.9], [0, 0.92, 0.42], coat);
    ico(`${n}tail`, body, 0.07, [0.7, 1.5, 0.9], [0, 0.98, -0.55], belly);

    // Cuello y cabeza: el cuello gira desde el hombro para bajar la cabeza al pastar.
    const neck = new TransformNode(`${n}Neck`, scene);
    neck.parent = body;
    neck.position.set(0, 0.98, 0.5);
    cyl(`${n}n`, neck, 0.14, 0.24, 0.55, [0, 0.27, 0], coat);
    const head = new TransformNode(`${n}Head`, scene);
    head.parent = neck;
    head.position.set(0, 0.56, 0.02);
    ico(`${n}h`, head, 0.115, [0.8, 0.85, 1.5], [0, 0, 0.12], coat);
    ico(`${n}nose`, head, 0.045, [1, 0.9, 1], [0, -0.03, 0.3], dark);
    const ears = [-1, 1].map((side, k) => {
      const e = new TransformNode(`${n}ear${k}`, scene);
      e.parent = head;
      e.position.set(side * 0.08, 0.08, -0.03);
      e.rotation.z = -side * 0.7;
      ico(`${n}ea${k}`, e, 0.05, [0.4, 1.6, 0.6], [0, 0.04, 0], coat);
      return e;
    });
    if (stag) {
      for (const side of [-1, 1]) {
        const a = new TransformNode(`${n}antler${side}`, scene);
        a.parent = head;
        a.position.set(side * 0.06, 0.1, -0.02);
        a.rotation.set(-0.25, 0, -side * 0.4);
        cyl(`${n}beam${side}`, a, 0.012, 0.03, 0.42, [0, 0.21, 0], antlerMat);
        cyl(`${n}tine1${side}`, a, 0.008, 0.02, 0.2, [side * 0.05, 0.22, 0.02], antlerMat, [0, 0, -side * 0.7]);
        cyl(`${n}tine2${side}`, a, 0.008, 0.02, 0.18, [side * 0.03, 0.36, 0.0], antlerMat, [0, 0, -side * 0.6]);
      }
    }

    // Patas articuladas en la cadera/hombro.
    const legs = [
      [-0.16, 0.44],
      [0.16, 0.44],
      [-0.16, -0.44],
      [0.16, -0.44],
    ].map(([x, z], k) => {
      const hip = new TransformNode(`${n}leg${k}`, scene);
      hip.parent = body;
      hip.position.set(x, 0.72, z);
      cyl(`${n}lu${k}`, hip, 0.14, 0.085, 0.36, [0, -0.18, 0], legMat);
      cyl(`${n}ll${k}`, hip, 0.075, 0.05, 0.38, [0, -0.52, 0], legMat);
      cyl(`${n}lh${k}`, hip, 0.055, 0.065, 0.07, [0, -0.72, 0], dark);
      return hip;
    });

    return {
      root,
      body,
      neck,
      legs,
      ears,
      pos: new Vector3(),
      heading: rand() * 6.28,
      state: 'graze',
      timer: 2 + rand() * 6,
      target: new Vector3(),
      phase: rand() * 6.28,
      neckAngle: 1.7,
      speed: 0,
      seed: rand() * 10,
    };
  };

  const herd: Deer[] = [];
  for (let i = 0; i < count; i++) {
    const d = make(i, i === 0, i === 0 ? 1.1 : i === count - 1 && count > 2 ? 0.65 : 1.0);
    for (let k = 0; k < 20; k++) {
      const a = rand() * 6.28;
      const r = 1 + rand() * 4;
      const x = home.x + Math.cos(a) * r;
      const z = home.z + Math.sin(a) * r;
      if (canWalk(x, z)) {
        d.pos.set(x, 0, z);
        break;
      }
    }
    if (d.pos.lengthSquared() === 0) d.pos.copyFrom(home);
    herd.push(d);
  }
  const herdCenter = home.clone();
  let herdTimer = 0;

  const pickTarget = (d: Deer, away?: { x: number; z: number }) => {
    for (let k = 0; k < 16; k++) {
      let x: number;
      let z: number;
      if (away) {
        const a = Math.atan2(d.pos.x - away.x, d.pos.z - away.z) + (rand() - 0.5) * (0.8 + k * 0.3);
        const dist = 14 + rand() * 8;
        x = d.pos.x + Math.sin(a) * dist;
        z = d.pos.z + Math.cos(a) * dist;
      } else {
        const a = rand() * 6.28;
        const r = 2 + rand() * 5;
        x = herdCenter.x + Math.cos(a) * r;
        z = herdCenter.z + Math.sin(a) * r;
      }
      if (canWalk(x, z)) {
        d.target.set(x, 0, z);
        return true;
      }
    }
    return false;
  };

  return (t, dt) => {
    const p = player();
    herdTimer -= dt;
    if (herdTimer <= 0) {
      // La manada se mueve poco a poco hacia otro punto de su zona.
      const a = rand() * 6.28;
      const r = 3 + rand() * 7;
      const x = home.x + Math.cos(a) * r;
      const z = home.z + Math.sin(a) * r;
      if (canWalk(x, z)) herdCenter.set(x, 0, z);
      herdTimer = 12 + rand() * 14;
    }

    for (const d of herd) {
      const dist = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
      if (d.state !== 'flee' && dist < 13) {
        if (pickTarget(d, { x: p.x, z: p.z })) d.state = 'flee';
      } else if ((d.state === 'graze' || d.state === 'walk') && dist < 24) {
        d.state = 'alert';
        d.timer = 3 + rand() * 3;
      }

      let want = 0; // velocidad deseada
      let neckGoal = 0.5;
      let gait = 0;
      switch (d.state) {
        case 'graze':
          neckGoal = 1.75 + Math.sin(t * 1.3 + d.seed) * 0.08;
          d.timer -= dt;
          if (d.timer <= 0) {
            if (rand() < 0.65 && pickTarget(d)) d.state = 'walk';
            else d.timer = 3 + rand() * 6;
          }
          break;
        case 'walk': {
          neckGoal = 0.9;
          want = 0.95;
          gait = 3.6;
          const dx = d.target.x - d.pos.x;
          const dz = d.target.z - d.pos.z;
          if (Math.hypot(dx, dz) < 0.6) {
            d.state = 'graze';
            d.timer = 4 + rand() * 7;
          } else {
            d.heading = turnTo(d.heading, Math.atan2(dx, dz), dt * 2.5);
          }
          break;
        }
        case 'alert': {
          neckGoal = 0.15;
          // Se queda quieto mirando al visitante, con las orejas hacia él.
          d.heading = turnTo(d.heading, Math.atan2(p.x - d.pos.x, p.z - d.pos.z), dt * 3);
          d.timer -= dt;
          if (dist > 28 || d.timer <= 0) {
            d.state = 'graze';
            d.timer = 3 + rand() * 4;
          }
          break;
        }
        case 'flee': {
          neckGoal = 0.35;
          want = 4.8;
          gait = 9;
          const dx = d.target.x - d.pos.x;
          const dz = d.target.z - d.pos.z;
          if (Math.hypot(dx, dz) < 1.2 || dist > 38) {
            d.state = 'alert';
            d.timer = 4;
          } else {
            d.heading = turnTo(d.heading, Math.atan2(dx, dz), dt * 6);
          }
          break;
        }
      }

      d.speed += (want - d.speed) * Math.min(1, dt * 4);
      if (d.speed > 0.02) {
        const nx = d.pos.x + Math.sin(d.heading) * d.speed * dt;
        const nz = d.pos.z + Math.cos(d.heading) * d.speed * dt;
        if (canWalk(nx, nz)) {
          d.pos.x = nx;
          d.pos.z = nz;
        } else {
          d.speed = 0;
          if (d.state === 'walk') d.state = 'graze';
          else if (d.state === 'flee' && !pickTarget(d, { x: p.x, z: p.z })) d.state = 'alert';
        }
      }

      // Andar en diagonal (pata delantera con trasera contraria); el galope amplía el vaivén.
      d.phase += gait * dt;
      const amp = d.state === 'flee' ? 0.8 : 0.42;
      const k = Math.min(1, d.speed / 0.9);
      const s = Math.sin(d.phase) * amp * k;
      d.legs[0].rotation.x = s;
      d.legs[3].rotation.x = s;
      d.legs[1].rotation.x = -s;
      d.legs[2].rotation.x = -s;
      d.body.position.y = Math.abs(Math.sin(d.phase)) * (d.state === 'flee' ? 0.09 : 0.025) * k;
      d.body.rotation.x = d.state === 'flee' ? Math.sin(d.phase) * 0.06 : 0;
      d.neckAngle += (neckGoal - d.neckAngle) * Math.min(1, dt * 3);
      d.neck.rotation.x = d.neckAngle;
      const flick = d.state === 'alert' ? 0.5 : 0.7 + Math.sin(t * 5 + d.seed) * 0.05;
      d.ears[0].rotation.z = flick;
      d.ears[1].rotation.z = -flick;

      d.root.position.set(d.pos.x, 0, d.pos.z);
      d.root.rotation.y = d.heading;
    }
  };
}

function turnTo(current: number, want: number, rate: number): number {
  const diff = Math.atan2(Math.sin(want - current), Math.cos(want - current));
  return current + diff * Math.min(1, rate);
}

// ---------------------------------------------------------------------------
// Lobos (modelo animado CC0 de Quaternius)
// ---------------------------------------------------------------------------

/**
 * Manada de lobos de "Animal Pack Vol.2" (Quaternius, CC0), con esqueleto y las animaciones Idle y Walking del propio modelo.
 * Descansan, recorren su zona y se alejan del visitante si este se acerca demasiado.
 */
export async function buildWolves(
  scene: Scene,
  url: string,
  parent: TransformNode,
  homes: Vector3[],
  canWalk: (x: number, z: number) => boolean,
  player: () => Vector3,
  onMeshes?: (meshes: Mesh[]) => void,
): Promise<Updater> {
  const container = await LoadAssetContainerAsync(url, scene);

  interface Wolf {
    holder: TransformNode;
    idle?: AnimationGroup;
    walk?: AnimationGroup;
    playing?: AnimationGroup;
    pos: Vector3;
    home: Vector3;
    heading: number;
    state: 'idle' | 'walk' | 'avoid';
    timer: number;
    target: Vector3;
    foot: number;
    rand: () => number;
  }

  let scale = 0;
  const wolves: Wolf[] = homes.map((home, i) => {
    const entries = container.instantiateModelsToScene((n) => `wolf${i}_${n}`, false, { doNotInstantiate: true });
    const holder = new TransformNode(`wolf${i}`, scene);
    holder.parent = parent;
    entries.rootNodes.forEach((n) => ((n as TransformNode).parent = holder));
    const meshes = holder.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0) as Mesh[];

    // Material liso con el color del modelo: el PBR sin entorno se ve apagado en esta escena.
    meshes.forEach((m) => {
      const pbr = m.material as PBRMaterial | null;
      const std = new StandardMaterial(`wolfMat${i}`, scene);
      std.diffuseColor = pbr?.albedoColor?.clone() ?? new Color3(0.8, 0.8, 0.78);
      // Cada lobo tiene un tono un poco distinto para distinguir la manada.
      std.diffuseColor.scaleInPlace(i === 0 ? 1 : 0.62 + (i % 3) * 0.12);
      std.emissiveColor = std.diffuseColor.scale(0.3);
      std.specularColor = Color3.Black();
      m.material = std;
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = true; // la malla animada por esqueleto no debe recortarse con su caja original
    });
    onMeshes?.(meshes);

    // El modelo viene en otras unidades: se escala a ~1.5 m de largo y se apoya sobre el suelo.
    const measure = () => {
      holder.computeWorldMatrix(true);
      meshes.forEach((m) => m.computeWorldMatrix(true));
      return holder.getHierarchyBoundingVectors(true);
    };
    if (!scale) {
      const b = measure();
      scale = (1.5 * (i === 0 ? 1.1 : 1)) / Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    }
    holder.scaling.setAll(scale * (i === 0 ? 1.1 : 1));
    const b = measure();

    const find = (word: string): AnimationGroup | undefined => entries.animationGroups.find((g) => g.name.toLowerCase().includes(word));
    entries.animationGroups.forEach((g) => g.stop());

    const r = rng(404 + i * 37);
    const w: Wolf = {
      holder,
      idle: find('idle'),
      walk: find('walk'),
      pos: home.clone(),
      home: home.clone(),
      heading: r() * 6.28,
      state: 'idle',
      timer: 1 + r() * 4,
      target: home.clone(),
      foot: -b.min.y,
      rand: r,
    };
    return w;
  });

  const play = (w: Wolf, g: AnimationGroup | undefined, speed = 1) => {
    if (w.playing !== g) {
      w.playing?.stop();
      g?.start(true, speed);
      w.playing = g;
    } else if (g) {
      g.speedRatio = speed;
    }
  };
  wolves.forEach((w) => play(w, w.idle, 0.8 + w.rand() * 0.4));

  // El cuerpo del modelo se extiende sobre el eje X con la cabeza hacia -X: se gira 90° para que avance hacia su rumbo.
  const FACING = Math.PI / 2;

  const pickTarget = (w: Wolf, fromAway?: { x: number; z: number }) => {
    for (let k = 0; k < 16; k++) {
      let x: number;
      let z: number;
      if (fromAway) {
        // Prefiere alejarse en línea recta y va abriendo el ángulo si hay árboles en medio.
        const a = Math.atan2(w.pos.x - fromAway.x, w.pos.z - fromAway.z) + (w.rand() - 0.5) * (1.0 + k * 0.35);
        x = w.pos.x + Math.sin(a) * (6 + w.rand() * 5);
        z = w.pos.z + Math.cos(a) * (6 + w.rand() * 5);
      } else {
        const a = w.rand() * 6.28;
        const d = 2 + w.rand() * 8;
        x = w.home.x + Math.cos(a) * d;
        z = w.home.z + Math.sin(a) * d;
      }
      if (canWalk(x, z)) {
        w.target.set(x, 0, z);
        return true;
      }
    }
    return false;
  };

  return (_t, dt) => {
    const p = player();
    for (const w of wolves) {
      const dPlayer = Math.hypot(w.pos.x - p.x, w.pos.z - p.z);
      if (w.state !== 'avoid' && dPlayer < 9 && pickTarget(w, { x: p.x, z: p.z })) w.state = 'avoid';

      if (w.state === 'idle') {
        play(w, w.idle);
        w.timer -= dt;
        if (w.timer <= 0) {
          if (pickTarget(w)) w.state = 'walk';
          else w.timer = 1;
        }
      } else {
        const fleeing = w.state === 'avoid';
        play(w, w.walk, fleeing ? 1.7 : 1);
        const dx = w.target.x - w.pos.x;
        const dz = w.target.z - w.pos.z;
        if (Math.hypot(dx, dz) < 0.4 || (fleeing && dPlayer > 15)) {
          w.state = 'idle';
          w.timer = 3 + w.rand() * 5;
        } else {
          w.heading = turnTo(w.heading, Math.atan2(dx, dz), dt * 4);
          const speed = (fleeing ? 2.6 : 0.9) * dt;
          const nx = w.pos.x + Math.sin(w.heading) * speed;
          const nz = w.pos.z + Math.cos(w.heading) * speed;
          if (canWalk(nx, nz)) {
            w.pos.x = nx;
            w.pos.z = nz;
          } else {
            w.state = 'idle';
            w.timer = 1;
          }
        }
      }
      w.holder.position.set(w.pos.x, w.foot, w.pos.z);
      w.holder.rotation.y = w.heading + FACING;
    }
  };
}
