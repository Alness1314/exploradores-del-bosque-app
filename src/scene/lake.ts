import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';

/** Pequeño lago con orilla de pantano: agua, lodo, juncos, nenúfares y troncos donde toman el sol las tortugas. */
export const LAKE = { x: -14, z: -27, r: 7.5 };

/** Radio del contorno del lago en la dirección `a` (borde irregular, no un círculo perfecto). */
export const lakeRadius = (a: number) => LAKE.r * (1 + 0.16 * Math.sin(3 * a + 0.7) + 0.09 * Math.sin(5 * a + 2.1) + 0.05 * Math.sin(2 * a));

/** Distancia al borde del agua: negativa dentro del lago, positiva fuera. */
export const lakeDist = (x: number, z: number) => Math.hypot(x - LAKE.x, z - LAKE.z) - lakeRadius(Math.atan2(z - LAKE.z, x - LAKE.x));

/** Verdadero dentro del lago o a menos de `margin` metros de su orilla. */
export const inLake = (x: number, z: number, margin = 0) => lakeDist(x, z) < margin;

/** Punto al azar dentro del agua, a `inset` metros o más de la orilla. */
export function randomWater(rand: () => number, inset = 1.4): Vector3 {
  for (let i = 0; i < 20; i++) {
    const a = rand() * Math.PI * 2;
    const r = lakeRadius(a) * (0.1 + 0.85 * Math.sqrt(rand()));
    const x = LAKE.x + Math.cos(a) * r;
    const z = LAKE.z + Math.sin(a) * r;
    if (lakeDist(x, z) < -inset) return new Vector3(x, 0, z);
  }
  return new Vector3(LAKE.x, 0, LAKE.z);
}

export interface Perch {
  x: number;
  y: number;
  z: number;
  /** Rumbo del tronco, para que el animal quede alineado con él. */
  yaw: number;
}

export interface Lake {
  /** Círculos que impiden caminar por el agua. */
  colliders: { x: number; z: number; r: number }[];
  /** Lugares sobre los troncos donde se asolean las tortugas. */
  perches: Perch[];
  update: (time: number) => void;
}

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/** Malla plana formada por anillos concéntricos con el contorno del lago; cada anillo trae su radio y su color. */
function radialMesh(scene: Scene, name: string, y: number, rings: { r: (a: number) => number; color: Color4 }[], steps = 72): Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  rings.forEach((ring, k) => {
    const n = k === 0 ? 1 : steps;
    for (let i = 0; i < n; i++) {
      const a = (i / steps) * Math.PI * 2;
      const r = ring.r(a);
      const x = LAKE.x + Math.cos(a) * r;
      const z = LAKE.z + Math.sin(a) * r;
      positions.push(x, y, z);
      colors.push(ring.color.r, ring.color.g, ring.color.b, ring.color.a);
      uvs.push(x * 0.12, z * 0.12);
    }
  });
  for (let k = 1; k < rings.length; k++) {
    const prev = k === 1 ? 0 : 1 + (k - 2) * steps;
    const cur = 1 + (k - 1) * steps;
    for (let i = 0; i < steps; i++) {
      const j = (i + 1) % steps;
      if (k === 1) indices.push(0, cur + j, cur + i);
      else indices.push(prev + i, cur + j, cur + i, prev + i, prev + j, cur + j);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals.map((_, i) => (i % 3 === 1 ? 1 : 0));
  data.uvs = uvs;
  data.colors = colors;
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

function flat(scene: Scene, name: string, hex: string, emissive = 0.25): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  const c = Color3.FromHexString(hex);
  m.diffuseColor = c;
  m.specularColor = Color3.Black();
  m.emissiveColor = c.scale(emissive);
  return m;
}

function tint(mesh: Mesh, hex: string, shade = 0.75) {
  const base = Color3.FromHexString(hex);
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    lo = Math.min(lo, pos[i]);
    hi = Math.max(hi, pos[i]);
  }
  const colors: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const t = (pos[3 * i + 1] - lo) / (hi - lo || 1);
    const k = shade + (1 - shade) * t;
    colors.push(base.r * k, base.g * k, base.b * k, 1);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

export function buildLake(scene: Scene, root: TransformNode, onShadow?: (m: AbstractMesh) => void): Lake {
  const rand = rng(777);
  const colliders: Lake['colliders'] = [];
  const perches: Perch[] = [];
  const instances: { node: TransformNode; phase: number; base: number }[] = [];

  // Lodo oscuro que se difumina hacia el suelo del bosque, y el agua con tono más profundo hacia el centro.
  const mud = radialMesh(scene, 'lakeMud', 0.012, [
    { r: () => 0, color: new Color4(0.27, 0.25, 0.15, 1) },
    { r: (a) => lakeRadius(a) + 0.3, color: new Color4(0.3, 0.27, 0.17, 1) },
    { r: (a) => lakeRadius(a) + 2.3, color: new Color4(0.34, 0.31, 0.2, 0.7) },
    { r: (a) => lakeRadius(a) + 4.2, color: new Color4(0.38, 0.36, 0.22, 0) },
  ]);
  const mudMat = new StandardMaterial('lakeMudMat', scene);
  mudMat.diffuseColor = Color3.White();
  mudMat.specularColor = Color3.Black();
  mudMat.emissiveColor = new Color3(0.08, 0.075, 0.05);
  mudMat.backFaceCulling = false;
  mudMat.zOffset = -2;
  mud.hasVertexAlpha = true;
  mud.material = mudMat;
  mud.parent = root;
  mud.alphaIndex = 1; // el lodo se pinta antes que el agua (ambos son translúcidos)
  mudMat.disableDepthWrite = true;
  mud.receiveShadows = true;

  const ripple = new DynamicTexture('lakeRipple', 256, scene, true);
  const ctx = ripple.getContext();
  ctx.fillStyle = '#9fc9c9';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(40,90,110,0.22)';
    ctx.lineWidth = 1 + rand() * 2;
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * 0.6);
    ctx.scale(1, (1 + rand() * 2.5) / (5 + rand() * 18));
    ctx.beginPath();
    ctx.arc(0, 0, 5 + rand() * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ripple.update();
  ripple.wrapU = ripple.wrapV = 1;
  const water = radialMesh(scene, 'lakeWater', 0.045, [
    { r: () => 0, color: new Color4(0.18, 0.42, 0.5, 1) },
    { r: (a) => lakeRadius(a) * 0.65, color: new Color4(0.25, 0.52, 0.58, 1) },
    { r: (a) => lakeRadius(a) + 0.15, color: new Color4(0.42, 0.65, 0.58, 1) },
  ]);
  const waterMat = new StandardMaterial('lakeWaterMat', scene);
  waterMat.diffuseTexture = ripple;
  waterMat.diffuseColor = Color3.White();
  waterMat.specularColor = new Color3(0.85, 0.9, 0.9);
  waterMat.specularPower = 72;
  waterMat.emissiveColor = new Color3(0.07, 0.14, 0.15);
  waterMat.alpha = 0.9;
  waterMat.backFaceCulling = false;
  waterMat.zOffset = -4;
  water.material = waterMat;
  water.parent = root;
  water.alphaIndex = 2;

  // Colisiones: anillo en el borde más una malla interior, para que ni el visitante ni los animales terrestres entren al agua.
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const r = lakeRadius(a) - 0.3;
    colliders.push({ x: LAKE.x + Math.cos(a) * r, z: LAKE.z + Math.sin(a) * r, r: 1.2 });
  }
  for (let gx = -LAKE.r; gx <= LAKE.r; gx += 2.3) {
    for (let gz = -LAKE.r; gz <= LAKE.r; gz += 2.3) {
      const x = LAKE.x + gx;
      const z = LAKE.z + gz;
      if (lakeDist(x, z) < -1.2) colliders.push({ x, z, r: 1.8 });
    }
  }

  // Juncos y espadañas en la orilla.
  const reedParts: Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const h = 1.3 + k * 0.25;
    const blade = MeshBuilder.CreateCylinder(`reedBlade${k}`, { diameterTop: 0.015, diameterBottom: 0.05, height: h, tessellation: 4 }, scene);
    blade.position.set((k - 1) * 0.09, h / 2, (k % 2) * 0.07);
    blade.rotation.z = (k - 1) * 0.1;
    tint(blade, '#4f7a3a', 0.65);
    reedParts.push(blade);
  }
  const cattail = MeshBuilder.CreateCylinder('reedHead', { diameter: 0.075, height: 0.28, tessellation: 5 }, scene);
  cattail.position.set(0, 1.5, 0);
  tint(cattail, '#5d3b22', 0.85);
  reedParts.push(cattail);
  const reedMaster = Mesh.MergeMeshes(reedParts, true, true, undefined, false, false)!;
  reedMaster.name = 'reedMaster';
  reedMaster.convertToFlatShadedMesh();
  const reedMat = new StandardMaterial('reedMat', scene);
  reedMat.diffuseColor = Color3.White();
  reedMat.specularColor = Color3.Black();
  reedMat.emissiveColor = new Color3(0.12, 0.14, 0.1);
  reedMaster.material = reedMat;
  reedMaster.isPickable = false;
  reedMaster.position.y = -300;
  const reedCount = 46;
  for (let i = 0; i < reedCount; i++) {
    const a = (i / reedCount) * Math.PI * 2 + rand() * 0.12;
    const r = lakeRadius(a) + (rand() < 0.7 ? -0.5 + rand() * 1.1 : 0.8 + rand() * 1.4);
    const inst = reedMaster.createInstance(`reed${i}`);
    inst.parent = root;
    inst.position.set(LAKE.x + Math.cos(a) * r, 0, LAKE.z + Math.sin(a) * r);
    const s = 0.8 + rand() * 0.8;
    inst.scaling.set(s, s, s);
    inst.rotation.y = rand() * 6;
    inst.isPickable = false;
    instances.push({ node: inst, phase: rand() * 6.28, base: 0 });
  }

  // Nenúfares sobre el agua.
  const pad = MeshBuilder.CreateDisc('padMaster', { radius: 0.38, tessellation: 9 }, scene);
  pad.rotation.x = Math.PI / 2;
  pad.bakeCurrentTransformIntoVertices();
  tint(pad, '#4d8a3c', 0.9);
  const padMat = new StandardMaterial('padMat', scene);
  padMat.diffuseColor = Color3.White();
  padMat.specularColor = Color3.Black();
  padMat.emissiveColor = new Color3(0.1, 0.16, 0.08);
  padMat.backFaceCulling = false;
  padMat.zOffset = -6;
  pad.material = padMat;
  pad.isPickable = false;
  pad.position.y = -300;
  for (let i = 0; i < 16; i++) {
    const p = randomWater(rand, 1.3);
    const inst = pad.createInstance(`pad${i}`);
    inst.parent = root;
    inst.position.set(p.x, 0.065, p.z);
    inst.scaling.setAll(0.7 + rand() * 0.7);
    inst.rotation.y = rand() * 6;
    inst.isPickable = false;
  }

  // Troncos: dos entran al agua desde la orilla, uno flota cerca del centro y dos yacen en el lodo.
  const logMat = flat(scene, 'lakeLogMat', '#ffffff', 0.12);
  const makeLog = (name: string, len: number, diam: number, hex: string) => {
    const c = MeshBuilder.CreateCylinder(name, { diameter: diam, height: len, tessellation: 8 }, scene);
    c.rotation.z = Math.PI / 2;
    c.bakeCurrentTransformIntoVertices();
    tint(c, hex, 0.8);
    c.convertToFlatShadedMesh();
    c.material = logMat;
    c.isPickable = false;
    c.position.y = -300;
    return c;
  };
  const logs = [makeLog('lakeLogA', 3.6, 0.55, '#6a4a35'), makeLog('lakeLogB', 3.0, 0.5, '#7b6f60'), makeLog('lakeLogC', 2.4, 0.42, '#5b4030')];
  const placeLog = (i: number, x: number, y: number, z: number, yaw: number, kind: number, solid: boolean) => {
    const inst = logs[kind].createInstance(`lakeLog${i}`);
    inst.parent = root;
    inst.position.set(x, y, z);
    inst.rotation.y = yaw;
    inst.isPickable = false;
    onShadow?.(inst as unknown as AbstractMesh);
    if (solid) {
      const len = [3.6, 3.0, 2.4][kind];
      for (let t = -len / 2 + 0.4; t <= len / 2 - 0.4; t += 1) {
        colliders.push({ x: x + Math.cos(yaw) * t, z: z - Math.sin(yaw) * t, r: 0.45 });
      }
    }
    return inst;
  };
  const shore = (a: number, inward: number) => {
    const r = lakeRadius(a) - inward;
    return { x: LAKE.x + Math.cos(a) * r, z: LAKE.z + Math.sin(a) * r };
  };
  // Troncos que entran al agua: la mitad queda sobre el lodo y la otra mitad sobre el agua.
  [[0.9, 0], [3.9, 1]].forEach(([a, kind], i) => {
    const p = shore(a, 1.0);
    const yaw = -(a + Math.PI); // el eje X local del tronco queda apuntando hacia el centro del lago
    placeLog(i, p.x, 0.2, p.z, yaw, kind, false);
    const top = shore(a, 1.7);
    perches.push({ x: top.x, y: 0.2 + 0.28, z: top.z, yaw });
  });
  // Tronco flotante.
  {
    const p = randomWater(rand, 2.6);
    placeLog(2, p.x, 0.1, p.z, rand() * 3, 2, false);
    perches.push({ x: p.x, y: 0.1 + 0.23, z: p.z, yaw: 0 });
    perches[perches.length - 1].yaw = 0;
  }
  // Troncos en tierra, junto al lodo.
  [[2.3, 1], [5.4, 0]].forEach(([a, kind], i) => {
    const p = shore(a, -3.2);
    placeLog(3 + i, p.x, 0.25, p.z, a + 1.2, kind, true);
  });

  // Piedras en la orilla.
  const stoneMat = flat(scene, 'lakeStoneMat', '#8a8f88', 0.2);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const p = shore(a, -0.9 - rand() * 1.6);
    const s = MeshBuilder.CreateIcoSphere(`lakeStone${i}`, { radius: 0.18 + rand() * 0.22, subdivisions: 1, flat: true }, scene);
    s.scaling.set(1.2, 0.6, 1);
    s.position.set(p.x, 0.07, p.z);
    s.rotation.y = rand() * 6;
    s.material = stoneMat;
    s.parent = root;
    s.isPickable = false;
  }

  return {
    colliders,
    perches,
    update: (t) => {
      ripple.uOffset = t * 0.012;
      ripple.vOffset = Math.sin(t * 0.15) * 0.05;
      for (const r of instances) {
        r.node.rotation.z = Math.sin(t * 1.3 + r.phase) * 0.045;
        r.node.rotation.x = Math.cos(t * 1.1 + r.phase) * 0.03;
      }
    },
  };
}
