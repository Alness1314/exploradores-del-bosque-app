import {
  Color3,
  Matrix,
  Mesh,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
  VertexData,
} from '@babylonjs/core';

interface Circle {
  x: number;
  z: number;
  r: number;
}

// El viento se calcula en el vértice: la punta de cada hoja se mueve más que su base, y el pasto se aparta del visitante.
const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
#include<instancesDeclaration>
uniform mat4 viewProjection;
uniform mat4 view;
uniform float time;
uniform vec3 player;
uniform float fogDensity;
uniform float period;
varying vec2 vUv;
varying float vFog;
varying float vTint;
void main(void) {
#include<instancesVertex>
  vec4 wp = finalWorld * vec4(position, 1.0);
  // El pasto se repite cada "period" metros: cada mata se desplaza a la copia más cercana al visitante.
  vec2 shift = floor((finalWorld[3].xz - player.xz) / period + 0.5) * period;
  wp.xz -= shift;
  float bend = uv.y * uv.y;
  float phase = wp.x * 0.35 + wp.z * 0.27;
  wp.x += (sin(time * 1.7 + phase) * 0.16 + sin(time * 3.3 + wp.x * 1.9) * 0.05) * bend;
  wp.z += cos(time * 1.3 + wp.z * 0.31 + wp.x * 0.11) * 0.1 * bend;
  vec2 away = wp.xz - player.xz;
  float d = length(away);
  float push = smoothstep(1.5, 0.0, d);
  wp.xz += (away / max(d, 0.001)) * push * 0.55 * bend;
  wp.y -= push * 0.25 * bend;
  vec4 vp = view * wp;
  gl_Position = viewProjection * wp;
  vUv = uv;
  vFog = 1.0 - clamp(exp(-fogDensity * fogDensity * dot(vp.xyz, vp.xyz)), 0.0, 1.0);
  vTint = fract(sin(dot(finalWorld[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
varying float vFog;
varying float vTint;
uniform vec3 fogColor;
uniform vec3 baseColor;
uniform vec3 tipColor;
void main(void) {
  vec3 c = mix(baseColor, tipColor, vUv.y);
  c *= 0.8 + vTint * 0.45;
  c = mix(c, c * vec3(1.25, 1.1, 0.7), step(0.88, vTint));
  gl_FragColor = vec4(mix(c, fogColor, vFog), 1.0);
}`;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Mata de pasto: siete hojas en abanico, cada una con base ancha, tramo medio y punta. */
function tuftGeometry(): VertexData {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rand = rng(5);
  for (let b = 0; b < 7; b++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.12;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const yaw = rand() * Math.PI;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const w = 0.045 + rand() * 0.025;
    const h = 0.38 + rand() * 0.32;
    const leanA = rand() * Math.PI * 2;
    const lean = 0.05 + rand() * 0.16;
    const lx = Math.cos(leanA) * lean;
    const lz = Math.sin(leanA) * lean;
    const i = positions.length / 3;
    positions.push(bx - dx * w, 0, bz - dz * w, bx + dx * w, 0, bz + dz * w);
    positions.push(bx + lx * 0.4 - dx * w * 0.65, h * 0.55, bz + lz * 0.4 - dz * w * 0.65, bx + lx * 0.4 + dx * w * 0.65, h * 0.55, bz + lz * 0.4 + dz * w * 0.65);
    positions.push(bx + lx, h, bz + lz);
    uvs.push(0, 0, 1, 0, 0, 0.55, 1, 0.55, 0.5, 1);
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2, i + 2, i + 3, i + 4);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.uvs = uvs;
  vd.indices = indices;
  return vd;
}

export interface Grass {
  update: (time: number, player: Vector3) => void;
  /** Densidad de niebla de la escena (el shader del pasto la aplica por su cuenta). */
  setFog: (density: number) => void;
  dispose: () => void;
}

/**
 * Pasto con instanciación por hardware (thin instances) y movimiento por viento en el shader.
 * Las matas ocupan un cuadrado de `period` metros que se repite alrededor del visitante, por lo que cubre un mundo de cualquier tamaño.
 * `blocked` descarta posiciones (por ejemplo, sobre el tronco caído).
 */
export function buildGrass(
  scene: Scene,
  count: number,
  period: number,
  colliders: Circle[],
  blocked: (x: number, z: number) => boolean,
): Grass {
  const material = new ShaderMaterial(
    'grassMat',
    scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    { attributes: ['position', 'uv'], uniforms: ['world', 'view', 'viewProjection', 'time', 'player', 'fogDensity', 'period', 'fogColor', 'baseColor', 'tipColor'] },
  );
  material.backFaceCulling = false;
  material.setFloat('fogDensity', scene.fogDensity);
  material.setFloat('period', period);
  material.setColor3('fogColor', scene.fogColor);
  material.setColor3('baseColor', Color3.FromHexString('#1f4a1d'));
  material.setColor3('tipColor', Color3.FromHexString('#86b84a'));
  material.setFloat('time', 0);
  material.setVector3('player', Vector3.Zero());

  const mesh = new Mesh('grass', scene);
  tuftGeometry().applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;

  const rand = rng(1234);
  const buffer = new Float32Array(count * 16);
  const m = new Matrix();
  let placed = 0;
  for (let attempts = 0; attempts < count * 6 && placed < count; attempts++) {
    const x = (rand() - 0.5) * period;
    const z = (rand() - 0.5) * period;
    // Manchones: zonas densas y zonas más ralas, para que no se vea uniforme.
    const patch = 0.5 + 0.5 * Math.sin(x * 0.19 + 1.3) * Math.cos(z * 0.23 - 0.7);
    if (rand() > 0.3 + 0.7 * patch) continue;
    if (blocked(x, z) || colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.12)) continue;
    const s = 0.55 + rand() * 0.5;
    Matrix.ComposeToRef(new Vector3(s, s * (0.7 + rand() * 0.55), s), Quaternion.RotationYawPitchRoll(rand() * 6.28, 0, 0), new Vector3(x, 0, z), m);
    m.copyToArray(buffer, placed * 16);
    placed++;
  }
  mesh.thinInstanceSetBuffer('matrix', buffer.subarray(0, placed * 16), 16, true);

  return {
    setFog: (density) => material.setFloat('fogDensity', density),
    update: (time, player) => {
      material.setFloat('time', time);
      material.setVector3('player', player);
    },
    dispose: () => {
      mesh.dispose();
      material.dispose();
    },
  };
}
