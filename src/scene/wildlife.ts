import { Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { flatMat, rng, turnTo, unlit, winged, type Ecology, type Prey, type Updater } from './animals';
import { LAKE, lakeDist, randomWater, type Perch } from './lake';

const WATER_Y = 0.045;

function ball(scene: Scene, name: string, parent: TransformNode, r: number, scale: [number, number, number], pos: [number, number, number], m: StandardMaterial): Mesh {
  const s = MeshBuilder.CreateIcoSphere(name, { radius: r, subdivisions: 1, flat: true }, scene);
  s.scaling.set(...scale);
  s.position.set(...pos);
  s.material = m;
  s.parent = parent;
  s.isPickable = false;
  return s;
}

const smooth = (t: number) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

// ---------------------------------------------------------------------------
// Patos
// ---------------------------------------------------------------------------

type DuckState = 'swim' | 'flee' | 'fly' | 'land';

interface Duck {
  root: TransformNode;
  body: TransformNode;
  neck: TransformNode;
  wings: TransformNode[];
  wingMeshes: Mesh[];
  pos: Vector3;
  heading: number;
  state: DuckState;
  timer: number;
  target: Vector3;
  phase: number;
  dabble: number;
  /** Datos del vuelo: ángulo sobre el círculo, posición de partida y destino de amerizaje. */
  flyT: number;
  flyA: number;
  from: Vector3;
}

/**
 * Patos (machos de cabeza verde y hembras pardas) que nadan por el lago, hunden la cabeza para buscar comida, se apartan del
 * visitante nadando y, si este se acerca demasiado, echan a volar en círculo y vuelven a posarse en el agua.
 */
export function buildDucks(scene: Scene, count: number, player: () => Vector3): Updater {
  const rand = rng(515);
  const grey = flatMat(scene, 'duckGrey', '#8e9096', 0.3);
  const brown = flatMat(scene, 'duckBrown', '#8a6d4b', 0.3);
  const chest = flatMat(scene, 'duckChest', '#6b4a38', 0.3);
  const green = flatMat(scene, 'duckGreen', '#1f7a52', 0.35);
  const henHead = flatMat(scene, 'duckHenHead', '#9b7b55', 0.3);
  const beak = flatMat(scene, 'duckBeak', '#e3a82a', 0.4);
  const dark = flatMat(scene, 'duckDark', '#1d1a17', 0);
  const white = flatMat(scene, 'duckWhite', '#f1ede2', 0.4);
  const wingMat = unlit(scene, 'duckWing', '#6f5a40');

  const ducks: Duck[] = Array.from({ length: count }, (_, i) => {
    const drake = i % 3 !== 2;
    const root = new TransformNode(`duck${i}`, scene);
    root.scaling.setAll(1.05 + rand() * 0.2);
    const body = new TransformNode(`duck${i}Body`, scene);
    body.parent = root;
    ball(scene, `duck${i}b`, body, 0.17, [0.95, 0.8, 1.5], [0, 0.14, 0], drake ? grey : brown);
    ball(scene, `duck${i}c`, body, 0.13, [1, 0.9, 1], [0, 0.17, 0.17], drake ? chest : brown);
    ball(scene, `duck${i}t`, body, 0.06, [0.9, 0.45, 1.5], [0, 0.2, -0.29], dark);
    const neck = new TransformNode(`duck${i}Neck`, scene);
    neck.parent = body;
    neck.position.set(0, 0.24, 0.22);
    ball(scene, `duck${i}n`, neck, 0.04, [1, 2.2, 1], [0, 0.07, 0.01], drake ? green : henHead);
    ball(scene, `duck${i}h`, neck, 0.075, [1, 1, 1.1], [0, 0.15, 0.04], drake ? green : henHead);
    if (drake) ball(scene, `duck${i}w`, neck, 0.045, [1.1, 0.4, 1.1], [0, 0.065, 0.015], white);
    const bk = MeshBuilder.CreateBox(`duck${i}k`, { width: 0.055, height: 0.022, depth: 0.1 }, scene);
    bk.position.set(0, 0.14, 0.14);
    bk.material = beak;
    bk.parent = neck;
    bk.isPickable = false;
    ball(scene, `duck${i}e1`, neck, 0.014, [1, 1, 1], [0.05, 0.17, 0.08], dark);
    ball(scene, `duck${i}e2`, neck, 0.014, [1, 1, 1], [-0.05, 0.17, 0.08], dark);
    // Alas: solo se ven en vuelo.
    const wings: TransformNode[] = [];
    const wingMeshes: Mesh[] = [];
    for (const side of [-1, 1]) {
      const hinge = new TransformNode(`duck${i}hinge${side}`, scene);
      hinge.parent = body;
      hinge.position.set(side * 0.12, 0.22, 0.02);
      const wing = MeshBuilder.CreatePlane(`duck${i}wing${side}`, { width: 0.6, height: 0.24, sideOrientation: Mesh.DOUBLESIDE }, scene);
      wing.rotation.x = Math.PI / 2;
      wing.position.x = side * 0.3;
      wing.material = wingMat;
      wing.parent = hinge;
      wing.isPickable = false;
      wing.setEnabled(false);
      wings.push(hinge);
      wingMeshes.push(wing);
    }
    const start = randomWater(rand, 1.6);
    root.position.set(start.x, WATER_Y, start.z);
    return {
      root,
      body,
      neck,
      wings,
      wingMeshes,
      pos: start.clone(),
      heading: rand() * 6.28,
      state: 'swim' as const,
      timer: 2 + rand() * 4,
      target: randomWater(rand, 1.6),
      phase: rand() * 6.28,
      dabble: 0,
      flyT: 0,
      flyA: 0,
      from: new Vector3(),
    };
  });

  const farthestWater = (from: { x: number; z: number }) => {
    let best = randomWater(rand, 1.6);
    let bd = -1;
    for (let k = 0; k < 10; k++) {
      const c = randomWater(rand, 1.6);
      const d = Math.hypot(c.x - from.x, c.z - from.z);
      if (d > bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };

  return (t, dt) => {
    const p = player();
    for (const d of ducks) {
      const dP = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
      const flying = d.state === 'fly' || d.state === 'land';
      if (!flying) {
        if (dP < 4.2) {
          // Echa a volar.
          d.state = 'fly';
          d.flyT = 0;
          d.flyA = Math.atan2(d.pos.z - LAKE.z, d.pos.x - LAKE.x);
          d.from.copyFrom(d.pos);
          d.wingMeshes.forEach((w) => w.setEnabled(true));
        } else if (d.state === 'swim' && dP < 12) {
          d.state = 'flee';
          d.target = farthestWater(p);
        } else if (d.state === 'flee' && dP > 16) {
          d.state = 'swim';
          d.timer = 1;
        }
      }

      if (d.state === 'swim' || d.state === 'flee') {
        const fleeing = d.state === 'flee';
        const dx = d.target.x - d.pos.x;
        const dz = d.target.z - d.pos.z;
        if (Math.hypot(dx, dz) < 0.6) {
          d.target = randomWater(rand, 1.6);
          if (!fleeing && rand() < 0.4) d.dabble = 2 + rand() * 1.5;
        }
        d.dabble = Math.max(0, d.dabble - dt);
        const speed = d.dabble > 0 ? 0.05 : fleeing ? 1.15 : 0.4;
        d.heading = turnTo(d.heading, Math.atan2(dx, dz), dt * (fleeing ? 3 : 1.4));
        const nx = d.pos.x + Math.sin(d.heading) * speed * dt;
        const nz = d.pos.z + Math.cos(d.heading) * speed * dt;
        if (lakeDist(nx, nz) < -1.1) {
          d.pos.x = nx;
          d.pos.z = nz;
        } else d.target = randomWater(rand, 1.6);
        // Hunde la cabeza con la cola en alto para buscar comida en el fondo.
        const dip = d.dabble > 0 ? Math.min(1, d.dabble) : 0;
        d.neck.rotation.x += (dip * 1.25 - d.neck.rotation.x) * Math.min(1, dt * 5);
        d.body.rotation.x += (dip * 0.6 - d.body.rotation.x) * Math.min(1, dt * 5);
        d.root.position.set(d.pos.x, WATER_Y + Math.sin(t * 2 + d.phase) * 0.007, d.pos.z);
        d.root.rotation.set(0, d.heading, Math.sin(t * 1.3 + d.phase) * 0.03);
      } else {
        // Vuelo en círculo sobre el lago y regreso al agua.
        d.flyT += dt;
        d.neck.rotation.x = 0;
        d.body.rotation.x = -0.15;
        const R = 17;
        d.flyA += (4.8 / R) * dt;
        const cx = LAKE.x + Math.cos(d.flyA) * R;
        const cz = LAKE.z + Math.sin(d.flyA) * R;
        let x: number;
        let y: number;
        let z: number;
        if (d.state === 'fly') {
          const k = smooth(d.flyT / 2.5);
          x = d.from.x + (cx - d.from.x) * k;
          z = d.from.z + (cz - d.from.z) * k;
          y = WATER_Y + k * 6.5;
          if (d.flyT > 11) {
            d.state = 'land';
            d.flyT = 0;
            d.from.set(x, y, z);
            d.target = randomWater(rand, 1.8);
          }
        } else {
          const k = smooth(d.flyT / 3);
          x = d.from.x + (d.target.x - d.from.x) * k;
          z = d.from.z + (d.target.z - d.from.z) * k;
          y = d.from.y + (WATER_Y - d.from.y) * k;
          if (d.flyT >= 3) {
            d.state = 'swim';
            d.pos.set(d.target.x, 0, d.target.z);
            d.wingMeshes.forEach((w) => w.setEnabled(false));
            d.body.rotation.x = 0;
            d.root.position.set(d.pos.x, WATER_Y, d.pos.z);
            continue;
          }
        }
        const dx = x - d.root.position.x;
        const dz = z - d.root.position.z;
        if (dx * dx + dz * dz > 1e-6) d.heading = turnTo(d.heading, Math.atan2(dx, dz), dt * 6);
        d.root.position.set(x, y, z);
        d.root.rotation.set(0, d.heading, 0.12);
        const flap = Math.sin(t * 22 + d.phase) * 0.8;
        d.wings[0].rotation.z = flap;
        d.wings[1].rotation.z = -flap;
        d.pos.set(x, 0, z);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Tortugas
// ---------------------------------------------------------------------------

type TurtleState = 'bask' | 'dive' | 'swim' | 'return';

interface Turtle {
  root: TransformNode;
  head: TransformNode;
  legs: TransformNode[];
  pos: Vector3;
  y: number;
  heading: number;
  state: TurtleState;
  perch?: Perch;
  target: Vector3;
  timer: number;
  phase: number;
}

/**
 * Tortugas de caparazón verde oliva: unas toman el sol sobre los troncos con el cuello estirado y se tiran al agua si el
 * visitante se acerca; otras nadan despacio. Cuando todo está tranquilo, vuelven a su tronco.
 */
export function buildTurtles(scene: Scene, count: number, perches: Perch[], player: () => Vector3): Updater {
  const rand = rng(626);
  const shellMat = flatMat(scene, 'turtleShell', '#4b5f2d', 0.3);
  const rimMat = flatMat(scene, 'turtleRim', '#8d8a58', 0.35);
  const skinMat = flatMat(scene, 'turtleSkin', '#7b8a4c', 0.3);
  const darkMat = flatMat(scene, 'turtleDark', '#16120e', 0);

  const turtles: Turtle[] = Array.from({ length: count }, (_, i) => {
    const root = new TransformNode(`turtle${i}`, scene);
    root.scaling.setAll(1 + rand() * 0.4);
    ball(scene, `turtle${i}s`, root, 0.15, [1, 0.55, 1.3], [0, 0.09, 0], shellMat);
    ball(scene, `turtle${i}r`, root, 0.16, [1.06, 0.2, 1.38], [0, 0.05, 0], rimMat);
    const head = new TransformNode(`turtle${i}Head`, scene);
    head.parent = root;
    head.position.set(0, 0.07, 0.2);
    ball(scene, `turtle${i}n`, head, 0.035, [1, 1, 2.4], [0, 0.01, 0.05], skinMat);
    ball(scene, `turtle${i}h`, head, 0.05, [1, 0.9, 1.15], [0, 0.02, 0.12], skinMat);
    ball(scene, `turtle${i}e1`, head, 0.011, [1, 1, 1], [0.03, 0.04, 0.15], darkMat);
    ball(scene, `turtle${i}e2`, head, 0.011, [1, 1, 1], [-0.03, 0.04, 0.15], darkMat);
    const legs: TransformNode[] = [];
    [[0.14, 0.12], [-0.14, 0.12], [0.14, -0.12], [-0.14, -0.12]].forEach(([x, z], k) => {
      const leg = new TransformNode(`turtle${i}Leg${k}`, scene);
      leg.parent = root;
      leg.position.set(x, 0.045, z);
      ball(scene, `turtle${i}l${k}`, leg, 0.05, [1.5, 0.35, 1.1], [Math.sign(x) * 0.03, 0, 0], skinMat);
      legs.push(leg);
    });
    ball(scene, `turtle${i}t`, root, 0.03, [0.6, 0.5, 2.2], [0, 0.05, -0.22], skinMat);

    const perch = i < perches.length ? perches[i] : undefined;
    const start = perch ? new Vector3(perch.x, 0, perch.z) : randomWater(rand, 1.6);
    return {
      root,
      head,
      legs,
      pos: start,
      y: perch ? perch.y : WATER_Y - 0.03,
      heading: perch ? perch.yaw : rand() * 6.28,
      state: perch ? ('bask' as const) : ('swim' as const),
      perch,
      target: randomWater(rand, 1.6),
      timer: 0,
      phase: rand() * 6.28,
    };
  });

  return (t, dt) => {
    const p = player();
    for (const u of turtles) {
      const dP = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      u.timer += dt;
      let moving = false;
      if (u.state === 'bask') {
        // Cuello estirado hacia arriba, con un leve cabeceo.
        u.head.rotation.x = -0.45 + Math.sin(t * 0.7 + u.phase) * 0.12;
        if (dP < 7.5) {
          u.state = 'dive';
          u.timer = 0;
          u.target = randomWater(rand, 1.6);
        }
      } else if (u.state === 'dive' || u.state === 'swim' || u.state === 'return') {
        const goal = u.state === 'return' && u.perch ? u.perch : u.target;
        const dx = goal.x - u.pos.x;
        const dz = goal.z - u.pos.z;
        const d = Math.hypot(dx, dz);
        u.head.rotation.x += (0.05 - u.head.rotation.x) * Math.min(1, dt * 3);
        u.heading = turnTo(u.heading, Math.atan2(dx, dz), dt * 1.6);
        const speed = u.state === 'dive' ? 0.55 : 0.28;
        if (d > 0.25) {
          u.pos.x += Math.sin(u.heading) * speed * dt;
          u.pos.z += Math.cos(u.heading) * speed * dt;
          moving = true;
        }
        const wantY = u.state === 'return' && d < 0.8 && u.perch ? u.perch.y : WATER_Y - 0.03;
        u.y += (wantY - u.y) * Math.min(1, dt * 2.2);
        if (u.state === 'dive' && d <= 0.6) u.state = 'swim';
        else if (u.state === 'swim') {
          if (d <= 0.6) u.target = randomWater(rand, 1.6);
          if (u.perch && u.timer > 35 && dP > 14) {
            u.state = 'return';
            u.timer = 0;
          }
        } else if (u.state === 'return') {
          if (dP < 7.5) {
            u.state = 'swim';
            u.timer = 0;
          } else if (d <= 0.25) {
            u.state = 'bask';
            u.pos.x = u.perch!.x;
            u.pos.z = u.perch!.z;
            u.heading = u.perch!.yaw;
          }
        }
      }
      if (moving) u.legs.forEach((l, k) => (l.rotation.y = Math.sin(t * 3 + k * 1.6) * 0.5));
      u.root.position.set(u.pos.x, u.y, u.pos.z);
      u.root.rotation.y = u.heading;
    }
  };
}

// ---------------------------------------------------------------------------
// Águila
// ---------------------------------------------------------------------------

type EagleState = 'soar' | 'hunt' | 'carry' | 'eat' | 'takeoff';

/**
 * Águila de cabeza y cola blancas que planea en círculos a gran altura. Cuando detecta un ave pequeña se lanza en picada;
 * si la atrapa, la lleva a un claro del suelo, la come y vuelve a remontar el vuelo.
 */
export function buildEagle(scene: Scene, eco: Ecology, canLand: (x: number, z: number) => boolean, player: () => Vector3): Updater {
  const rand = rng(88);
  const brown = flatMat(scene, 'eagleBody', '#4a3624', 0.3);
  const wingMat = unlit(scene, 'eagleWing', '#46331f');
  const white = flatMat(scene, 'eagleWhite', '#f2efe6', 0.4);
  const beak = flatMat(scene, 'eagleBeak', '#e8b32b', 0.4);
  const meatMat = flatMat(scene, 'eagleMeal', '#5d5047', 0.2);

  const w = winged(scene, 'eagle', [1.3, 0.5], wingMat, brown, 0.85, 0.14);
  const node = w.node;
  ball(scene, 'eagleHead', node, 0.11, [1, 1, 1.15], [0, 0.07, 0.5], white);
  const bk = MeshBuilder.CreateBox('eagleBeak', { width: 0.045, height: 0.055, depth: 0.1 }, scene);
  bk.position.set(0, 0.04, 0.63);
  bk.material = beak;
  bk.parent = node;
  bk.isPickable = false;
  const tail = MeshBuilder.CreateBox('eagleTail', { width: 0.34, height: 0.02, depth: 0.36 }, scene);
  tail.position.set(0, 0, -0.62);
  tail.material = white;
  tail.parent = node;
  tail.isPickable = false;
  const meal = ball(scene, 'eagleMeal', node, 0.07, [1, 0.7, 1.7], [0, -0.22, 0.12], meatMat);
  meal.setEnabled(false);

  // Con las alas plegadas o abiertas, según el estado.
  const wingsAt = (a: number) => {
    w.left.rotation.z = a;
    w.right.rotation.z = -a;
  };

  const pos = new Vector3(26, 20, 0);
  let heading = Math.PI / 2;
  let state: EagleState = 'soar';
  let cool = 12 + rand() * 12;
  let huntT = 0;
  let eatT = 0;
  let prey: Prey | undefined;
  const land = new Vector3();
  const C = new Vector3();

  const endHunt = (c: number) => {
    if (prey) {
      prey.chased = false;
      prey = undefined;
    }
    meal.setEnabled(false);
    state = 'soar';
    cool = c;
  };

  return (t, dt) => {
    const pl = player();
    // El centro del círculo de planeo se desplaza despacio para cubrir distintas zonas del bosque.
    C.set(Math.sin(t * 0.021) * 14, 0, Math.cos(t * 0.017) * 14);
    let tx = pos.x;
    let tz = pos.z;
    let ty = 20;
    let speed = 8;
    let turn = 1.3;
    let flap = 0;
    let roll = 0;

    if (state === 'soar') {
      const a = Math.atan2(pos.z - C.z, pos.x - C.x) + 0.45;
      const R = 21;
      tx = C.x + Math.cos(a) * R;
      tz = C.z + Math.sin(a) * R;
      ty = 20 + Math.sin(t * 0.3) * 2.2;
      flap = Math.max(0, Math.sin(t * 0.4)) * 0.25;
      cool -= dt;
      if (cool <= 0) {
        let best: Prey | undefined;
        let bd = 46;
        for (const pr of eco.prey) {
          if (pr.kind !== 'bird' || !pr.alive || pr.chased) continue;
          const d = Math.hypot(pr.pos.x - pos.x, pr.pos.z - pos.z);
          if (d < bd) {
            bd = d;
            best = pr;
          }
        }
        if (best) {
          prey = best;
          best.chased = true;
          state = 'hunt';
          huntT = 0;
        } else cool = 4;
      }
    } else if (state === 'hunt' && prey) {
      huntT += dt;
      // Picada: apunta un poco por delante del ave para interceptarla.
      tx = prey.pos.x;
      tz = prey.pos.z;
      ty = prey.pos.y;
      speed = 13;
      turn = 3.6;
      flap = 0.15;
      const dx = prey.pos.x - pos.x;
      const dy = prey.pos.y - pos.y;
      const dz = prey.pos.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (!prey.alive) endHunt(10);
      else {
        prey.alarm(pos.x, pos.z);
        if (d < 1.4) {
          prey.caught();
          prey.chased = false;
          prey = undefined;
          meal.setEnabled(true);
          // Elige dónde posarse a comer: un claro cercano, lejos del visitante.
          let found = false;
          for (let k = 0; k < 40 && !found; k++) {
            const a = rand() * Math.PI * 2;
            const r = 9 + rand() * 12;
            const x = pos.x + Math.cos(a) * r;
            const z = pos.z + Math.sin(a) * r;
            if (Math.hypot(x, z) < 50 && canLand(x, z) && Math.hypot(x - pl.x, z - pl.z) > 8) {
              land.set(x, 0, z);
              found = true;
            }
          }
          if (!found) land.set(pos.x + 8, 0, pos.z);
          state = 'carry';
        } else if (huntT > 7.5) endHunt(18); // el ave escapó
      }
    } else if (state === 'carry') {
      tx = land.x;
      tz = land.z;
      const d = Math.hypot(land.x - pos.x, land.z - pos.z);
      ty = Math.max(0.3, d * 0.3);
      speed = Math.min(9, 2.5 + d * 0.7);
      turn = 3;
      flap = 0.5;
      if (d < 0.7 && pos.y < 0.7) {
        state = 'eat';
        eatT = 0;
        pos.set(land.x, 0.28, land.z);
        // La presa queda en el suelo, delante de sus garras.
        meal.parent = null;
        meal.position.set(land.x + Math.sin(heading) * 0.35, 0.06, land.z + Math.cos(heading) * 0.35);
        meal.rotation.y = heading;
      }
    } else if (state === 'eat') {
      eatT += dt;
      speed = 0;
      pos.y = 0.28;
      wingsAt(1.15); // ángulo positivo = punta del ala hacia abajo (alas plegadas a los costados)
      // Picotea la presa: inclina el cuerpo hacia adelante a intervalos.
      node.rotation.x = Math.max(0, Math.sin(t * 3.2)) * 0.5;
      node.rotation.z = 0;
      const k = Math.min(1, eatT / 10);
      meal.scaling.setAll(1 - 0.85 * k);
      node.position.set(pos.x, pos.y, pos.z);
      node.rotation.y = heading;
      if (eatT >= 10 || Math.hypot(pl.x - pos.x, pl.z - pos.z) < 6) {
        meal.setEnabled(false);
        meal.parent = node;
        meal.position.set(0, -0.22, 0.12);
        meal.scaling.setAll(1);
        meal.rotation.y = 0;
        state = 'takeoff';
        huntT = 0;
      }
      return;
    } else if (state === 'takeoff') {
      huntT += dt;
      // Despega ganando altura en línea recta.
      tx = pos.x + Math.sin(heading) * 20;
      tz = pos.z + Math.cos(heading) * 20;
      ty = 20;
      speed = 7;
      flap = 1;
      if (pos.y > 17) {
        state = 'soar';
        cool = 40 + rand() * 30;
      }
    }

    const before = heading;
    heading = turnTo(heading, Math.atan2(tx - pos.x, tz - pos.z), dt * turn);
    let dh = heading - before;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    pos.x += Math.sin(heading) * speed * dt;
    pos.z += Math.cos(heading) * speed * dt;
    const climb = state === 'takeoff' ? 4 : state === 'hunt' ? 9 : state === 'carry' ? 3 : 1.2;
    const dy = ty - pos.y;
    const vy = Math.max(-climb, Math.min(climb, dy));
    pos.y += vy * dt * (state === 'hunt' ? 1.3 : 1);
    if (state === 'carry' && pos.y < 0.3) pos.y = 0.3;
    roll = -dh / Math.max(dt, 1e-3) * 0.22;
    node.position.set(pos.x, pos.y, pos.z);
    node.rotation.y = heading;
    node.rotation.x = -vy * 0.06;
    node.rotation.z = Math.max(-0.5, Math.min(0.5, roll));
    const a = -0.1 + (flap > 0 ? Math.sin(t * (6 + flap * 6)) * 0.7 * flap : 0);
    wingsAt(a);
  };
}

