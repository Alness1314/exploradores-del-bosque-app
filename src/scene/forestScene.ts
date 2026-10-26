import {
  Animation,
  Camera,
  Color3,
  Color4,
  CubicEase,
  DirectionalLight,
  DynamicTexture,
  EasingFunction,
  Engine,
  FreeCamera,
  HemisphericLight,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointerEventTypes,
  Ray,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  WebXRDefaultExperience,
  WebXRFeatureName,
  WebXRState,
} from '@babylonjs/core';
import type { AbstractMesh, AssetContainer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0';
import { SPECIES_ORDER, type SpeciesId } from '../data/species';
import { buildGrass, type Grass } from './grass';
import { buildShape, type ShapeKind, type ShapePalette } from './shapes';
import { buildBirds, buildButterflies, buildDeer, buildRabbits, buildWolves, type Updater } from './animals';
import { VrHud, VrPanel, isVrSupported, type VrAction, type VrCard } from './vr';

export type { VrCard } from './vr';
export type { VrAction } from './vr';
export type PickId = SpeciesId;

export interface ForestCallbacks {
  /** `near` es falso si el visitante todavía está lejos del hongo. */
  onPick: (id: SpeciesId, near: boolean) => void;
  /** Se invoca una vez, cuando hay un primer cuadro y los modelos terminaron de cargar. */
  onReady?: () => void;
  /** Vector del joystick táctil: x a la derecha, y hacia abajo (adelante = y negativo). */
  getMove?: () => { x: number; y: number };
  /** El navegador puede iniciar una sesión de realidad virtual (WebXR inmersivo). */
  onVrSupport?: (supported: boolean) => void;
  onVrChange?: (active: boolean) => void;
  /** Botón de la ficha flotante pulsado con el controlador. */
  onVrAction?: (action: VrAction) => void;
  /** Fondo animado: la cámara recorre sola el claro inicial y no responde a entradas. */
  ambient?: boolean;
}

export interface ForestScene {
  goTo: (pointIndex: number) => void;
  setFound: (ids: SpeciesId[]) => void;
  /** Detiene el movimiento (por ejemplo, con una ficha abierta). */
  setPaused: (paused: boolean) => void;
  /** Ficha que se muestra dentro del visor; `null` la oculta. */
  setVrCard: (card: VrCard | null) => void;
  enterVR: () => Promise<void>;
  exitVR: () => Promise<void>;
  dispose: () => void;
}

/** Distancia horizontal máxima (m) entre el visitante y el hongo para poder abrir su ficha y registrarlo. */
const PICK_DISTANCE = 5;
const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
/** Radio del mundo jugable: al cruzar el borde el visitante reaparece en el lado opuesto. */
const WORLD_RADIUS = 56;
/** Extensión del decorado (rocas, helechos, acículas…), algo mayor que el mundo. */
const SPREAD = WORLD_RADIUS * 2.1;
const LOW_POWER =
  typeof navigator !== 'undefined' &&
  (/OculusBrowser|Quest|Android|Mobile/i.test(navigator.userAgent) || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches));
/** Niebla normal y niebla densa que cubre los últimos metros antes del borde del mundo. */
const FOG_BASE = 0.017;
const FOG_VEIL = 0.15;
const VEIL_START = WORLD_RADIUS - 18;
const HORIZON = '#cfe6d8';

const POINTS = [
  { position: new Vector3(-9, EYE_HEIGHT, 7), look: new Vector3(-4, 0.5, 3) },
  { position: new Vector3(9, EYE_HEIGHT, 7), look: new Vector3(4.4, 0.9, 2.8) },
  { position: new Vector3(-3, EYE_HEIGHT, -2), look: new Vector3(0.8, 0.8, -8) },
  { position: new Vector3(14, EYE_HEIGHT, 2.5), look: new Vector3(11, 1.3, -3) },
  { position: new Vector3(-30, EYE_HEIGHT, 6), look: new Vector3(-25, 0.6, 3.5) },
  { position: new Vector3(28, EYE_HEIGHT, 11), look: new Vector3(24, 0.6, 8) },
  { position: new Vector3(-5, EYE_HEIGHT, 31), look: new Vector3(-2, 1.4, 27) },
  { position: new Vector3(21, EYE_HEIGHT, -27), look: new Vector3(25, 1.4, -32) },
];

/** Árbol seco en pie, microhábitat de Fomitopsis pinicola. */
const SNAG = new Vector3(11, 0, -3);
/** Dos troncos secos más, que alojan a los hongos de repisa de las zonas "Tocón del norte" y "Tocón del sureste". */
const SNAG2 = new Vector3(-2, 0, 27);
const SNAG3 = new Vector3(25, 0, -32);
const SNAGS = [SNAG, SNAG2, SNAG3];

/** Radio del tronco seco a la altura y (se afila de 0.28 a 0.1 m a lo largo de 7 m). */
const snagRadius = (y: number) => 0.28 - (0.28 - 0.1) * (y / 7);

/**
 * Hongo de repisa apoyado en un tronco seco, mirando hacia `toward` (girado `turn` radianes) a la altura `y`.
 * Devuelve el punto de la corteza, la dirección en que sobresale y un punto del suelo para su anillo de hallazgo.
 */
function onSnag(snag: Vector3, toward: Vector3, y: number, turn = 0) {
  const a = Math.atan2(toward.z - snag.z, toward.x - snag.x) + turn;
  const dirX = Math.cos(a);
  const dirZ = Math.sin(a);
  const r = snagRadius(y);
  return { at: new Vector3(snag.x + dirX * r, 0, snag.z + dirZ * r), dirX, dirZ, y, ground: new Vector3(snag.x + dirX, 0, snag.z + dirZ) };
}
const SN_LAETIPORUS = onSnag(SNAG2, POINTS[6].position, 1.1, -0.35);
const SN_TRAMETES = onSnag(SNAG2, POINTS[6].position, 2.1, 0.55);
const SN_PYCNOPORUS = onSnag(SNAG3, POINTS[7].position, 1.2, -0.4);
const SN_FOMES = onSnag(SNAG3, POINTS[7].position, 2.1, 0.5);

/** Posición en el suelo del ejemplar principal de cada especie (también donde se dibuja su anillo de hallazgo). */
const MAIN: Record<SpeciesId, Vector3> = {
  'amanita-muscaria': new Vector3(-4, 0, 3),
  'suillus-luteus': new Vector3(-13.5, 0, -1.5),
  'coprinus-comatus': new Vector3(2.5, 0, 9.5),
  'ganoderma-applanatum': new Vector3(4.4, 0, 3.1),
  'coprinopsis-atramentaria': new Vector3(8.6, 0, 4.2),
  'laccaria-amethystina': new Vector3(0.8, 0, -7.2),
  'laccaria-laccata': new Vector3(-2.4, 0, -6.2),
  'imleria-badia': new Vector3(3.6, 0, -6.4),
  'amanita-pantherina': new Vector3(8.8, 0, -5.2),
  'fomitopsis-pinicola': new Vector3(11.5, 0, -2.1),
  'amanita-caesarea': new Vector3(-25, 0, 3.5),
  'boletus-edulis': new Vector3(-31, 0, -2),
  'tylopilus-felleus': new Vector3(-22, 0, 10),
  'coprinellus-micaceus': new Vector3(24, 0, 8),
  'collybia-nuda': new Vector3(32, 0, 4),
  'mycena-pura': new Vector3(21, 0, 15),
  'laetiporus-sulphureus': SN_LAETIPORUS.ground,
  'trametes-versicolor': SN_TRAMETES.ground,
  'pycnoporus-sanguineus': SN_PYCNOPORUS.ground,
  'fomes-fomentarius': SN_FOMES.ground,
};
const BIG_TREE = new Vector3(0, 0, -9);

interface Circle {
  x: number;
  z: number;
  r: number;
  /** Árbol o tronco al que pertenece (para apoyar hongos de repisa en su corteza). */
  mesh?: AbstractMesh;
}

function mat(scene: Scene, name: string, color: string, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  const c = Color3.FromHexString(color);
  m.diffuseColor = c;
  m.specularColor = Color3.Black();
  m.emissiveColor = c.scale(emissive);
  return m;
}

// Generador pseudoaleatorio con semilla para que el bosque sea siempre igual.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function distToSegment(px: number, pz: number, a: Vector3, b: Vector3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

function glowTexture(scene: Scene, name: string): DynamicTexture {
  const t = new DynamicTexture(name, 64, scene, false);
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  t.update();
  t.hasAlpha = true;
  return t;
}

function buildSky(scene: Scene) {
  const tex = new DynamicTexture('skyTex', { width: 4, height: 256 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6fa8c9');
  g.addColorStop(0.45, '#a9d0d6');
  g.addColorStop(0.62, HORIZON);
  g.addColorStop(1, HORIZON);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  tex.update();
  const dome = MeshBuilder.CreateSphere('sky', { diameter: 400, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  const m = new StandardMaterial('skyMat', scene);
  m.emissiveTexture = tex;
  m.disableLighting = true;
  m.fogEnabled = false;
  m.backFaceCulling = false;
  dome.material = m;
  dome.infiniteDistance = true;
  dome.isPickable = false;
}

function buildGround(scene: Scene): Mesh {
  const size = 512;
  const tex = new DynamicTexture('groundTex', size, scene, true);
  const ctx = tex.getContext();
  const rand = rng(99);
  ctx.fillStyle = '#466f3a';
  ctx.fillRect(0, 0, size, size);
  // Suelo de bosque de coníferas: verdes oscuros con manchas de acículas pardas.
  const tones = ['#3d6633', '#4f7c40', '#355c2e', '#5a8546', '#6b5a3c', '#5b4a31', '#765f3e'];
  for (let i = 0; i < 2800; i++) {
    ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
    ctx.globalAlpha = 0.3 + rand() * 0.4;
    const w = 3 + rand() * 14;
    ctx.save();
    ctx.translate(rand() * size, rand() * size);
    ctx.rotate(rand() * 3);
    ctx.scale(1, 0.4 + rand() * 0.4);
    ctx.beginPath();
    ctx.arc(0, 0, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  tex.update();
  tex.wrapU = tex.wrapV = 1;
  tex.uScale = tex.vScale = 40;
  const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400 }, scene);
  const gm = new StandardMaterial('groundMat', scene);
  gm.diffuseTexture = tex;
  gm.specularColor = Color3.Black();
  ground.material = gm;
  ground.receiveShadows = true;
  ground.isPickable = false;
  return ground;
}

// ---------------------------------------------------------------------------
// Coníferas procedurales (sombreado plano, colores por vértice)
// ---------------------------------------------------------------------------

/** Pinta una malla con un color base que se oscurece hacia abajo (a lo largo de su propia altura). */
function paint(mesh: Mesh, base: Color3, darkBottom = 0.7) {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    minY = Math.min(minY, pos[i]);
    maxY = Math.max(maxY, pos[i]);
  }
  const colors: number[] = [];
  for (let i = 1; i < pos.length; i += 3) {
    const u = (pos[i] - minY) / (maxY - minY || 1);
    const k = darkBottom + (1.08 - darkBottom) * u;
    colors.push(Math.min(1, base.r * k), Math.min(1, base.g * k), Math.min(1, base.b * k), 1);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

interface ConiferSpec {
  tiers: number;
  baseY: number;
  topY: number;
  maxR: number;
  minR: number;
  trunk: number;
  dark: string;
  light: string;
}

function buildConifer(scene: Scene, name: string, spec: ConiferSpec, rand: () => number): Mesh {
  const parts: Mesh[] = [];
  const dark = Color3.FromHexString(spec.dark);
  const light = Color3.FromHexString(spec.light);

  const trunk = MeshBuilder.CreateCylinder(
    `${name}_trunk`,
    { diameterTop: spec.trunk * 0.9, diameterBottom: spec.trunk * 2.6, height: spec.topY, tessellation: 7 },
    scene,
  );
  trunk.position.y = spec.topY / 2;
  paint(trunk, Color3.FromHexString('#5d3f2c'), 0.75);
  parts.push(trunk);

  const sides = 10;
  const tierH = ((spec.topY - spec.baseY) / spec.tiers) * 2.2;
  for (let i = 0; i < spec.tiers; i++) {
    const t = i / (spec.tiers - 1);
    const y = spec.baseY + (spec.topY - spec.baseY - tierH * 0.45) * t;
    const r = spec.maxR + (spec.minR - spec.maxR) * Math.pow(t, 0.85);
    const cone = MeshBuilder.CreateCylinder(`${name}_t${i}`, { diameterTop: 0, diameterBottom: r * 2, height: tierH, tessellation: sides }, scene);

    // Borde dentado y caído, como ramas: alterna el radio de la base y baja la punta de cada rama.
    const p = cone.getVerticesData(VertexBuffer.PositionKind)!;
    const phase = rand() * 2;
    for (let v = 0; v < p.length; v += 3) {
      if (p[v + 1] > -tierH / 2 + 0.001) continue;
      const angle = (Math.atan2(p[v + 2], p[v]) + Math.PI * 2) % (Math.PI * 2);
      const j = Math.round(angle / ((Math.PI * 2) / sides)) + Math.round(phase);
      const k = j % 2 === 0 ? 1.18 : 0.82;
      p[v] *= k;
      p[v + 2] *= k;
      p[v + 1] -= tierH * (j % 2 === 0 ? 0.16 : 0.04);
    }
    cone.updateVerticesData(VertexBuffer.PositionKind, p);

    const shade = 0.92 + rand() * 0.16;
    paint(cone, Color3.Lerp(dark, light, t).scale(shade), 0.62);
    cone.position.y = y + tierH / 2;
    cone.rotation.y = rand() * Math.PI;
    parts.push(cone);
  }

  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  merged.name = name;
  merged.convertToFlatShadedMesh();
  return merged;
}

interface Builders {
  scene: Scene;
  root: TransformNode;
  casters: Mesh[];
  colliders: Circle[];
}

/** Maestra para instancias: queda bajo el suelo pero "visible" para que sus instancias proyecten sombra. */
function master(mesh: Mesh, material: StandardMaterial, casters: Mesh[]): Mesh {
  mesh.material = material;
  mesh.position.y = -300;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  casters.push(mesh);
  return mesh;
}

/**
 * Árboles de "Low Poly Pine Trees" (Trekkerac, CC0). El GLB trae varios pinos separados por un desplazamiento
 * en X: se hornea cada transformación para dejar cada árbol centrado en el origen y poder instanciarlo.
 */
/**
 * El paquete pinta los árboles con una paleta gris poco útil aquí: se colorea por vértices (tronco café y follaje
 * verde que aclara hacia la copa), igual que las coníferas procedurales, para que todo el bosque combine.
 */
function recolorPine(m: Mesh) {
  const pos = m.getVerticesData(VertexBuffer.PositionKind);
  const uv = m.getVerticesData(VertexBuffer.UVKind);
  if (!pos) return;
  const count = pos.length / 3;
  const radius = (i: number) => Math.hypot(pos[3 * i], pos[3 * i + 2]);
  let foliageStart = Infinity;
  let top = 0;
  for (let i = 0; i < count; i++) {
    if (radius(i) > 0.5) foliageStart = Math.min(foliageStart, pos[3 * i + 1]);
    top = Math.max(top, pos[3 * i + 1]);
  }
  const trunkColor = Color3.FromHexString('#5d3f2c');
  const dark = Color3.FromHexString('#1b4a30');
  const light = Color3.FromHexString('#42945a');
  const colors: number[] = [];
  for (let i = 0; i < count; i++) {
    const y = pos[3 * i + 1];
    const trunk = radius(i) < 0.3 && y < foliageStart + 0.35;
    const u = Math.max(0, Math.min(1, (y - foliageStart) / (top - foliageStart || 1)));
    // La coordenada v original distingue las ramas (más anchas = más abajo) de la copa: aporta variación entre pisos.
    const tier = uv ? Math.max(0, Math.min(1, (uv[2 * i + 1] - 0.5) / 0.14)) : 0.5;
    const shade = 0.88 + (1 - tier) * 0.22;
    const c = trunk ? trunkColor.scale(0.85 + u * 0.3) : Color3.Lerp(dark, light, u).scale(shade);
    colors.push(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b), 1);
  }
  m.setVerticesData(VertexBuffer.ColorKind, colors);
}

async function loadPineTrees(scene: Scene, casters: Mesh[]): Promise<Mesh[]> {
  const container = await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}models/trees/pine-trees.glb`, scene);
  container.addAllToScene();
  const material = new StandardMaterial('pineTreeMat', scene);
  material.specularColor = Color3.Black();
  material.diffuseColor = Color3.White();
  material.emissiveColor = new Color3(0.1, 0.12, 0.1);

  const masters: Mesh[] = [];
  for (const m of container.meshes) {
    if (!(m instanceof Mesh) || m.getTotalVertices() === 0) continue;
    const world = m.computeWorldMatrix(true).clone();
    m.parent = null;
    m.position.setAll(0);
    m.rotationQuaternion = null;
    m.rotation.setAll(0);
    m.scaling.setAll(1);
    m.bakeTransformIntoVertices(world);
    m.refreshBoundingInfo();
    const box = m.getBoundingInfo().boundingBox;
    const height = box.maximum.y - box.minimum.y;
    m.bakeTransformIntoVertices(Matrix.Translation(-(box.minimum.x + box.maximum.x) / 2, -box.minimum.y, -(box.minimum.z + box.maximum.z) / 2));
    m.refreshBoundingInfo();
    if (height < 2.5) {
      m.dispose(); // plántula del paquete: demasiado pequeña para el bosque
      continue;
    }
    recolorPine(m);
    masters.push(master(m, material, casters));
  }
  return masters;
}

async function buildForest({ scene, root, casters, colliders }: Builders): Promise<{ placed: Circle[]; masters: Mesh[] }> {
  const treeMat = new StandardMaterial('treeMat', scene);
  treeMat.diffuseColor = Color3.White();
  treeMat.specularColor = Color3.Black();
  treeMat.emissiveColor = new Color3(0.1, 0.12, 0.1);

  const rand = rng(42);
  const variants = {
    spruce: master(buildConifer(scene, 'spruce', { tiers: 9, baseY: 1.1, topY: 7.4, maxR: 1.75, minR: 0.25, trunk: 0.2, dark: '#173f2a', light: '#3b8a4e' }, rand), treeMat, casters),
    fir: master(buildConifer(scene, 'fir', { tiers: 12, baseY: 1.3, topY: 9, maxR: 1.3, minR: 0.18, trunk: 0.2, dark: '#1a4538', light: '#3f9068' }, rand), treeMat, casters),
    young: master(buildConifer(scene, 'young', { tiers: 6, baseY: 0.5, topY: 3.8, maxR: 1.15, minR: 0.2, trunk: 0.13, dark: '#1f4f31', light: '#4a9a50' }, rand), treeMat, casters),
    tall: master(buildConifer(scene, 'tall', { tiers: 14, baseY: 1.6, topY: 11, maxR: 1.5, minR: 0.15, trunk: 0.24, dark: '#14382a', light: '#357f4a' }, rand), treeMat, casters),
  };
  // Pinos detallados del paquete CC0; si no cargan, el bosque se arma solo con las coníferas procedurales.
  const glb = await loadPineTrees(scene, casters).catch((e) => {
    console.warn('Los árboles GLB no cargaron; se usan los procedurales.', e);
    return [] as Mesh[];
  });
  const pick = (): { mesh: Mesh; boost: number } => {
    const r = rand();
    if (glb.length && r < 0.72) return { mesh: glb[Math.floor(rand() * glb.length)], boost: 1.3 };
    const q = rand();
    const mesh = q < 0.36 ? variants.spruce : q < 0.62 ? variants.fir : q < 0.8 ? variants.young : variants.tall;
    return { mesh, boost: 1 };
  };

  const keepClear = [...POINTS.map((p) => p.position), ...Object.values(MAIN), BIG_TREE];
  const placed: Circle[] = [];
  let n = 0;
  // Dentro del mundo hay un bosque denso; más allá del borde sigue un anillo de árboles (más ralo) que la niebla termina de ocultar.
  const edge = WORLD_RADIUS + 42;
  const maxInside = LOW_POWER ? 170 : 260;
  const maxRing = LOW_POWER ? 100 : 170;
  let inside = 0;
  let ring = 0;
  for (let i = 0; i < 6000 && (inside < maxInside || ring < maxRing); i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * edge;
    if (d > WORLD_RADIUS ? ring >= maxRing : inside >= maxInside) continue;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const scale = 0.85 + rand() * 0.55;
    const rot = rand() * 6;
    if (keepClear.some((k) => Math.hypot(k.x - x, k.z - z) < 4.6)) continue;
    // Despeja la línea de visión entre cada punto de observación y su hongo.
    if (POINTS.some((p) => distToSegment(x, z, p.position, p.look) < 2.4)) continue;
    // Despeja el costado visible del tronco caído.
    if (x > -1 && x < 9 && z > 0 && z < 7) continue;
    if (placed.some((t) => Math.hypot(t.x - x, t.z - z) < 2.5)) continue;
    const choice = pick();
    const tree = choice.mesh.createInstance(`tree${n++}`);
    tree.parent = root;
    tree.position.set(x, 0, z);
    tree.scaling.setAll(scale * choice.boost);
    tree.rotation.y = rot;
    tree.isPickable = false;
    const c: Circle = { x, z, r: 0.5 * scale * (choice.boost > 1 ? 1.1 : 1), mesh: tree };
    placed.push(c);
    colliders.push(c);
    if (d > WORLD_RADIUS) ring++;
    else inside++;
  }

  // Árboles secos en pie y troncos caídos repartidos por todo el bosque.
  placed.push(...buildDeadwood({ scene, root, casters, colliders }, placed));

  // Árbol grande, microhábitat de la Especie C: una picea enorme con raíces expuestas.
  const bigSource = glb.length ? glb.reduce((a, b) => (b.getBoundingInfo().boundingBox.maximum.y > a.getBoundingInfo().boundingBox.maximum.y ? b : a)) : variants.spruce;
  const big = bigSource.createInstance('bigTree');
  big.parent = root;
  big.position.copyFrom(BIG_TREE);
  big.scaling.setAll(glb.length ? 2.3 : 2.1);
  big.isPickable = false;
  colliders.push({ x: BIG_TREE.x, z: BIG_TREE.z, r: 0.75 });
  const rootMat = mat(scene, 'rootMat', '#5a3f2c');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = MeshBuilder.CreateCylinder(`root${i}`, { diameterTop: 0.12, diameterBottom: 0.42, height: 2.4, tessellation: 6 }, scene);
    r.position = new Vector3(Math.cos(a) * 1.15, 0.28, BIG_TREE.z + Math.sin(a) * 1.15);
    r.rotation = new Vector3(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    r.material = rootMat;
    r.parent = root;
    r.isPickable = false;
  }
  return { placed, masters: [...Object.values(variants), ...glb] };
}

/** Árboles secos en pie y troncos caídos: instancias de unas pocas formas, con colisiones. Devuelve los troncos en pie. */
function buildDeadwood({ scene, root, casters, colliders }: Builders, existing: Circle[]): Circle[] {
  const rand = rng(909);
  const material = new StandardMaterial('deadwoodMat', scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.1, 0.1, 0.09);

  const snagMaster = (name: string, height: number, broken: boolean, stubs: number) => {
    const parts: Mesh[] = [];
    const trunk = MeshBuilder.CreateCylinder(name + '_t', { diameterTop: broken ? 0.3 : 0.14, diameterBottom: 0.55, height, tessellation: 7 }, scene);
    trunk.position.y = height / 2;
    paint(trunk, Color3.FromHexString('#857a6d'), 0.7);
    parts.push(trunk);
    for (let k = 0; k < stubs; k++) {
      const a = k * 2.4 + rand();
      const stub = MeshBuilder.CreateCylinder(name + '_s' + k, { diameterTop: 0.03, diameterBottom: 0.1, height: 0.6 + rand() * 0.9, tessellation: 5 }, scene);
      stub.rotation.set(Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
      stub.position.set(Math.cos(a) * 0.28, height * (0.35 + 0.55 * rand()), Math.sin(a) * 0.28);
      paint(stub, Color3.FromHexString('#7a6f62'), 0.8);
      parts.push(stub);
    }
    if (broken) {
      const top = MeshBuilder.CreateCylinder(name + '_top', { diameterTop: 0.04, diameterBottom: 0.28, height: 0.55, tessellation: 5 }, scene);
      top.position.set(0.05, height + 0.2, 0);
      top.rotation.z = 0.4;
      paint(top, Color3.FromHexString('#9a8f80'), 0.8);
      parts.push(top);
    }
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
    merged.name = name;
    merged.convertToFlatShadedMesh();
    return master(merged, material, casters);
  };
  const logMaster = (name: string, color: string) => {
    const c = MeshBuilder.CreateCylinder(name, { diameter: 0.7, height: 4, tessellation: 8 }, scene);
    c.rotation.z = Math.PI / 2;
    c.bakeCurrentTransformIntoVertices();
    paint(c, Color3.FromHexString(color), 0.8);
    c.convertToFlatShadedMesh();
    return master(c, material, casters);
  };
  const snags = [snagMaster('snagTall', 8.5, false, 4), snagMaster('snagBroken', 5.5, true, 3), snagMaster('snagBare', 7, false, 5)];
  const logs = [logMaster('logGrey', '#7b6f60'), logMaster('logBrown', '#6a4a35'), logMaster('logPale', '#9a8a74')];

  const keepClear = [...POINTS.map((p) => p.position), ...Object.values(MAIN), BIG_TREE, ...SNAGS];
  const free = (x: number, z: number, r: number) =>
    !keepClear.some((k) => Math.hypot(k.x - x, k.z - z) < 4.6) &&
    !POINTS.some((p) => distToSegment(x, z, p.position, p.look) < 2.4) &&
    !(x > -3 && x < 11 && z > -1 && z < 8) &&
    !existing.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r + 0.8);

  const edge = WORLD_RADIUS + 42;
  const out: Circle[] = [];
  let nS = 0;
  let nL = 0;
  const wantS = LOW_POWER ? 14 : 24;
  const wantL = LOW_POWER ? 18 : 30;
  for (let i = 0; i < 3000 && (nS < wantS || nL < wantL); i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * edge;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const makeSnag = rand() < 0.45;
    if (makeSnag ? nS >= wantS : nL >= wantL) continue;
    if (!free(x, z, makeSnag ? 0.5 : 1.4)) continue;
    if (makeSnag) {
      const s = 0.85 + rand() * 0.5;
      const inst = snags[Math.floor(rand() * snags.length)].createInstance('snag' + nS);
      inst.parent = root;
      inst.position.set(x, 0, z);
      inst.scaling.setAll(s);
      inst.rotation.set(0, rand() * 6, (rand() - 0.5) * 0.18);
      inst.isPickable = false;
      const c: Circle = { x, z, r: 0.42 * s, mesh: inst };
      out.push(c);
      existing.push(c);
      colliders.push(c);
      nS++;
    } else {
      const len = 0.8 + rand() * 1.5;
      const th = 0.7 + rand() * 0.8;
      const yaw = rand() * Math.PI;
      const inst = logs[Math.floor(rand() * logs.length)].createInstance('fallen' + nL);
      inst.parent = root;
      inst.position.set(x, 0.33 * th, z);
      inst.scaling.set(len, th, th);
      inst.rotation.set(0, yaw, (rand() - 0.5) * 0.1);
      inst.isPickable = false;
      const half = 2 * len;
      for (let t = -half + 0.6; t <= half - 0.6; t += 1.2) {
        const c = { x: x + Math.cos(yaw) * t, z: z - Math.sin(yaw) * t, r: 0.33 * th + 0.12 };
        existing.push(c);
        colliders.push(c);
      }
      nL++;
    }
  }
  return out;
}

function buildDecor({ scene, root, casters, colliders }: Builders) {
  const rock = mat(scene, 'rock', '#82888a');
  const needles = mat(scene, 'needles', '#5c4a30');
  const needlesDark = mat(scene, 'needlesDark', '#46361f');
  const fern = mat(scene, 'fern', '#3f8a4a');
  const bush = mat(scene, 'bush', '#2f6a3a');
  const litter = [mat(scene, 'litter1', '#a85d2a'), mat(scene, 'litter2', '#c28a3a'), mat(scene, 'litter3', '#7a4a2a')];
  const twigMat = mat(scene, 'twig', '#5b4330');
  const rand = rng(7);

  const clear = (x: number, z: number, r: number) =>
    Object.values(MAIN).some((m) => Math.hypot(m.x - x, m.z - z) < r) || POINTS.some((p) => Math.hypot(p.position.x - x, p.position.z - z) < r);

  for (let i = 0; i < 48; i++) {
    const x = (rand() - 0.5) * SPREAD;
    const z = (rand() - 0.5) * SPREAD;
    const radius = 0.35 + rand() * 0.5;
    const yaw = rand() * 3;
    if (clear(x, z, 2)) continue;
    const r = MeshBuilder.CreateIcoSphere(`rock${i}`, { radius, subdivisions: 1, flat: true }, scene);
    r.position = new Vector3(x, 0.1, z);
    r.scaling.y = 0.6;
    r.rotation.y = yaw;
    r.material = rock;
    r.parent = root;
    r.isPickable = false;
    casters.push(r);
    colliders.push({ x, z, r: radius * 0.8 });
  }

  // Hojarasca de colores sólo en el claro de la Especie A; en el resto, acículas pardas.
  for (let i = 0; i < 70; i++) {
    const leaf = MeshBuilder.CreateDisc(`leaf${i}`, { radius: 0.1 + rand() * 0.12, tessellation: 6 }, scene);
    leaf.rotation.x = Math.PI / 2;
    leaf.rotation.y = rand() * 6;
    leaf.position = new Vector3(MAIN['amanita-muscaria'].x + (rand() - 0.5) * 4.2, 0.02 + rand() * 0.02, MAIN['amanita-muscaria'].z + (rand() - 0.5) * 4.2);
    leaf.material = litter[i % litter.length];
    leaf.parent = root;
    leaf.isPickable = false;
  }
  const patch = MeshBuilder.CreateDisc('needlePatch', { radius: 1, tessellation: 7 }, scene);
  patch.rotation.x = Math.PI / 2;
  patch.bakeCurrentTransformIntoVertices();
  patch.material = needles;
  patch.setEnabled(false);
  const patch2 = patch.clone('needlePatch2');
  patch2.material = needlesDark;
  patch2.setEnabled(false);
  for (let i = 0; i < (LOW_POWER ? 380 : 650); i++) {
    const x = (rand() - 0.5) * SPREAD;
    const z = (rand() - 0.5) * SPREAD;
    const p = (i % 2 ? patch : patch2).createInstance(`needle${i}`);
    p.parent = root;
    p.position.set(x, 0.015 + (i % 5) * 0.002, z);
    p.scaling.set(0.25 + rand() * 0.45, 1, 0.25 + rand() * 0.4);
    p.rotation.y = rand() * 6;
    p.isPickable = false;
  }

  const tuft = MeshBuilder.CreateCylinder('tuft', { diameterTop: 0, diameterBottom: 0.16, height: 0.42, tessellation: 4 }, scene);
  tuft.material = fern;
  tuft.setEnabled(false);
  const shrub = MeshBuilder.CreateIcoSphere('shrub', { radius: 0.7, subdivisions: 2, flat: true }, scene);
  shrub.material = bush;
  shrub.setEnabled(false);
  const twig = MeshBuilder.CreateCylinder('twig', { diameter: 0.05, height: 0.9, tessellation: 5 }, scene);
  twig.material = twigMat;
  twig.rotation.z = Math.PI / 2;
  twig.bakeCurrentTransformIntoVertices();
  twig.setEnabled(false);

  for (let i = 0; i < (LOW_POWER ? 150 : 300); i++) {
    const x = (rand() - 0.5) * SPREAD;
    const z = (rand() - 0.5) * SPREAD;
    if (clear(x, z, 1.4)) continue;
    // Matas de helecho: tres hojas inclinadas.
    for (let blade = 0; blade < 3; blade++) {
      const t = tuft.createInstance(`tuft${i}_${blade}`);
      const h = 0.8 + rand() * 1.0;
      t.parent = root;
      t.position = new Vector3(x + (blade - 1) * 0.07, 0.21 * h, z + (blade % 2) * 0.06);
      t.scaling.y = h;
      t.rotation = new Vector3((blade - 1) * 0.3, rand() * 3, (1 - blade) * 0.24);
      t.isPickable = false;
    }
  }
  for (let i = 0; i < 46; i++) {
    const x = (rand() - 0.5) * SPREAD;
    const z = (rand() - 0.5) * SPREAD;
    if (clear(x, z, 3) || (x > -1 && x < 9 && z > 0 && z < 7)) continue;
    const s = shrub.createInstance(`shrub${i}`);
    s.parent = root;
    const k = 0.7 + rand() * 0.8;
    s.position = new Vector3(x, 0.38 * k, z);
    s.scaling = new Vector3(k, k * 0.75, k);
    s.isPickable = false;
  }
  for (let i = 0; i < 120; i++) {
    const x = (rand() - 0.5) * SPREAD;
    const z = (rand() - 0.5) * SPREAD;
    if (clear(x, z, 1.2)) continue;
    const t = twig.createInstance(`twig${i}`);
    t.parent = root;
    t.position.set(x, 0.04, z);
    t.rotation.y = rand() * 6;
    t.scaling.x = 0.6 + rand() * 1.1;
    t.isPickable = false;
  }

  // Tronco caído (microambiente de la Especie B).
  const log = MeshBuilder.CreateCylinder('log', { diameter: 1.3, height: 7, tessellation: 12 }, scene);
  log.rotation.z = Math.PI / 2;
  log.position = new Vector3(4, 0.62, 2);
  log.material = mat(scene, 'logMat', '#6a4a35');
  log.parent = root;
  log.isPickable = false;
  casters.push(log);
  for (let x = 0.7; x <= 7.3; x += 1) colliders.push({ x, z: 2, r: 0.75 });

  // Árboles secos en pie (microhábitat de los hongos de repisa de "Árbol seco" y "Tocón"): tronco gris con muñones de ramas.
  const snagMat = mat(scene, 'snagMat', '#80766a');
  SNAGS.forEach((at, n) => {
    const trunk = MeshBuilder.CreateCylinder('dryTrunk' + n, { diameterTop: 0.2, diameterBottom: 0.56, height: 7, tessellation: 8 }, scene);
    trunk.position.set(at.x, 3.5, at.z);
    trunk.material = snagMat;
    trunk.parent = root;
    trunk.isPickable = false;
    casters.push(trunk);
    for (let i = 0; i < 4; i++) {
      const ang = i * 1.7 + 0.5 + n;
      const stub = MeshBuilder.CreateCylinder('dryStub' + n + '_' + i, { diameterTop: 0.04, diameterBottom: 0.12, height: 1.1, tessellation: 5 }, scene);
      stub.position.set(at.x + Math.cos(ang) * 0.35, 3.8 + i * 0.75, at.z + Math.sin(ang) * 0.35);
      stub.rotation.set(Math.sin(ang) * 1.0, 0, -Math.cos(ang) * 1.0);
      stub.material = snagMat;
      stub.parent = root;
      stub.isPickable = false;
    }
    colliders.push({ x: at.x, z: at.z, r: 0.45 });
  });
}

// ---------------------------------------------------------------------------
// Hongos: modelos CC0 de Asset Quest (ver public/models/CREDITS.md)
// ---------------------------------------------------------------------------

const MODEL_URL = (file: string) => `${import.meta.env.BASE_URL}models/${file}.glb`;
const TEXTURE_URL = (name: string) => `${import.meta.env.BASE_URL}models/${name}.png`;

/** Variantes de color del atlas del kit, para representar especies que no tienen modelo propio. */
type Tint =
  | 'pantherina'
  | 'suillus'
  | 'coprinus'
  | 'laccata'
  | 'fomitopsis'
  | 'caesarea'
  | 'edulis'
  | 'tylopilus'
  | 'micaceus'
  | 'nuda'
  | 'mycena'
  | 'laetiporus'
  | 'trametes'
  | 'pycnoporus'
  | 'fomes';

interface Extra {
  file: string;
  count: number;
  /** Rango de altura en metros. */
  h: [number, number];
  /** [x, z, radio mínimo, radio máximo]; si falta, se reparten por todo el bosque. */
  around?: [number, number, number, number];
  /** Crecen sobre el tronco de árboles al azar (hongos de repisa). */
  onTrees?: boolean;
}

interface Spawn {
  file: string;
  tint?: Tint;
  height: number;
  /** Hongo de repisa pegado a un tronco: punto de la corteza, dirección en que sobresale y altura. */
  bracket?: { at: Vector3; dirX: number; dirZ: number; y: number };
  extras: Extra[];
}

/**
 * Cada especie tiene un ejemplar principal en su microhábitat y varios más repartidos. Los modelos del kit son cinco
 * (Fly Agaric, Bay Bolete, Inky Cap, Amethyst Deceiver y Artist's Conk): las otras cinco especies reutilizan la forma
 * más parecida con otra textura de color. Son representaciones estilizadas, no réplicas taxonómicas.
 */
const SPAWNS: Record<SpeciesId, Spawn> = {
  'amanita-muscaria': {
    file: 'fly-agaric',
    height: 1.2,
    extras: [
      { file: 'fly-agaric-small', count: 2, h: [0.5, 0.75], around: [-4, 3, 5, 10] },
      { file: 'fly-agaric-small', count: 2, h: [0.45, 0.7] },
      { file: 'fly-agaric-group', count: 1, h: [0.6, 0.8] },
    ],
  },
  'suillus-luteus': {
    file: 'bay-bolete',
    tint: 'suillus',
    height: 1.0,
    extras: [
      { file: 'bay-bolete', count: 2, h: [0.5, 0.8], around: [-13.5, -1.5, 5, 10] },
      { file: 'bay-bolete', count: 1, h: [0.5, 0.8] },
      { file: 'bay-bolete-group', count: 1, h: [0.55, 0.75] },
    ],
  },
  'coprinus-comatus': {
    file: 'inky-cap',
    tint: 'coprinus',
    height: 1.3,
    extras: [
      { file: 'inky-cap', count: 2, h: [0.6, 1.0], around: [2.5, 9.5, 5, 10] },
      { file: 'inky-cap', count: 1, h: [0.6, 1.0] },
      { file: 'inky-cap-group', count: 1, h: [0.6, 0.8] },
    ],
  },
  'ganoderma-applanatum': {
    file: 'artists-conk-group',
    height: 1.0,
    bracket: { at: new Vector3(4.4, 0, 2.62), dirX: 0, dirZ: 1, y: 0.8 },
    extras: [{ file: 'artists-conk', count: 7, h: [0.35, 0.5], onTrees: true }],
  },
  'coprinopsis-atramentaria': {
    file: 'inky-cap',
    height: 1.1,
    extras: [
      { file: 'inky-cap', count: 2, h: [0.5, 0.85], around: [8.6, 4.2, 4, 9] },
      { file: 'inky-cap', count: 1, h: [0.5, 0.85] },
      { file: 'inky-cap-group', count: 1, h: [0.55, 0.75] },
    ],
  },
  'laccaria-amethystina': {
    file: 'amethyst-deceiver',
    height: 1.2,
    extras: [
      { file: 'amethyst-deceiver-small', count: 2, h: [0.5, 0.8], around: [0, -9, 5, 10] },
      { file: 'amethyst-deceiver-small', count: 1, h: [0.5, 0.8] },
      { file: 'amethyst-deceiver-group', count: 1, h: [0.7, 0.9] },
    ],
  },
  'laccaria-laccata': {
    file: 'amethyst-deceiver-small',
    tint: 'laccata',
    height: 0.9,
    extras: [
      { file: 'amethyst-deceiver-small', count: 2, h: [0.5, 0.8], around: [-2.4, -6.2, 4, 9] },
      { file: 'amethyst-deceiver-small', count: 1, h: [0.5, 0.8] },
      { file: 'amethyst-deceiver-group', count: 1, h: [0.7, 0.9] },
    ],
  },
  'imleria-badia': {
    file: 'bay-bolete',
    height: 1.0,
    extras: [
      { file: 'bay-bolete', count: 2, h: [0.5, 0.8], around: [3.6, -6.4, 4, 9] },
      { file: 'bay-bolete', count: 1, h: [0.5, 0.8] },
      { file: 'bay-bolete-group', count: 1, h: [0.55, 0.75] },
    ],
  },
  'amanita-pantherina': {
    file: 'fly-agaric',
    tint: 'pantherina',
    height: 1.1,
    extras: [
      { file: 'fly-agaric-small', count: 2, h: [0.5, 0.7], around: [8.8, -5.2, 4, 9] },
      { file: 'fly-agaric-small', count: 1, h: [0.5, 0.7] },
      { file: 'fly-agaric-group', count: 1, h: [0.6, 0.8] },
    ],
  },
  'fomitopsis-pinicola': {
    file: 'artists-conk-group',
    tint: 'fomitopsis',
    height: 0.7,
    bracket: { at: new Vector3(SNAG.x + 0.42 * 0.28, 0, SNAG.z + 0.88 * 0.28), dirX: 0.48, dirZ: 0.88, y: 1.3 },
    extras: [{ file: 'artists-conk', count: 6, h: [0.35, 0.5], onTrees: true }],
  },
  'amanita-caesarea': {
    file: 'fly-agaric',
    tint: 'caesarea',
    height: 1.15,
    extras: [
      { file: 'fly-agaric-small', count: 2, h: [0.5, 0.7], around: [-25, 3.5, 5, 10] },
      { file: 'fly-agaric-group', count: 1, h: [0.6, 0.8], around: [-25, 3.5, 6, 11] },
    ],
  },
  'boletus-edulis': {
    file: 'bay-bolete',
    tint: 'edulis',
    height: 1.05,
    extras: [
      { file: 'bay-bolete', count: 2, h: [0.5, 0.8], around: [-31, -2, 4, 9] },
      { file: 'bay-bolete-group', count: 1, h: [0.55, 0.75], around: [-31, -2, 6, 11] },
    ],
  },
  'tylopilus-felleus': {
    file: 'bay-bolete',
    tint: 'tylopilus',
    height: 0.95,
    extras: [
      { file: 'bay-bolete', count: 2, h: [0.5, 0.8], around: [-22, 10, 4, 9] },
      { file: 'bay-bolete-group', count: 1, h: [0.55, 0.75] },
    ],
  },
  'coprinellus-micaceus': {
    file: 'inky-cap',
    tint: 'micaceus',
    height: 1.0,
    extras: [
      { file: 'inky-cap', count: 2, h: [0.5, 0.9], around: [24, 8, 4, 9] },
      { file: 'inky-cap-group', count: 1, h: [0.6, 0.8], around: [24, 8, 6, 11] },
    ],
  },
  'collybia-nuda': {
    file: 'amethyst-deceiver',
    tint: 'nuda',
    height: 1.1,
    extras: [
      { file: 'amethyst-deceiver-small', count: 2, h: [0.5, 0.8], around: [32, 4, 4, 9] },
      { file: 'amethyst-deceiver-group', count: 1, h: [0.7, 0.9] },
    ],
  },
  'mycena-pura': {
    file: 'amethyst-deceiver-small',
    tint: 'mycena',
    height: 0.9,
    extras: [
      { file: 'amethyst-deceiver-small', count: 2, h: [0.5, 0.8], around: [21, 15, 4, 9] },
      { file: 'amethyst-deceiver-group', count: 1, h: [0.7, 0.9] },
    ],
  },
  'laetiporus-sulphureus': {
    file: 'artists-conk-group',
    tint: 'laetiporus',
    height: 0.55,
    bracket: { at: SN_LAETIPORUS.at, dirX: SN_LAETIPORUS.dirX, dirZ: SN_LAETIPORUS.dirZ, y: SN_LAETIPORUS.y },
    extras: [{ file: 'artists-conk', count: 5, h: [0.35, 0.5], onTrees: true }],
  },
  'trametes-versicolor': {
    file: 'artists-conk-group',
    tint: 'trametes',
    height: 0.5,
    bracket: { at: SN_TRAMETES.at, dirX: SN_TRAMETES.dirX, dirZ: SN_TRAMETES.dirZ, y: SN_TRAMETES.y },
    extras: [{ file: 'artists-conk', count: 5, h: [0.3, 0.45], onTrees: true }],
  },
  'pycnoporus-sanguineus': {
    file: 'artists-conk',
    tint: 'pycnoporus',
    height: 0.45,
    bracket: { at: SN_PYCNOPORUS.at, dirX: SN_PYCNOPORUS.dirX, dirZ: SN_PYCNOPORUS.dirZ, y: SN_PYCNOPORUS.y },
    extras: [{ file: 'artists-conk', count: 5, h: [0.3, 0.45], onTrees: true }],
  },
  'fomes-fomentarius': {
    file: 'artists-conk-group',
    tint: 'fomes',
    height: 0.55,
    bracket: { at: SN_FOMES.at, dirX: SN_FOMES.dirX, dirZ: SN_FOMES.dirZ, y: SN_FOMES.y },
    extras: [{ file: 'artists-conk', count: 5, h: [0.3, 0.5], onTrees: true }],
  },
};

/**
 * Forma propia (en lugar del modelo del kit), proporción (ancho relativo) y escala de altura de cada especie. Las especies que no
 * aparecen aquí usan el modelo del kit recoloreado, con su proporción original.
 */
const LOOK: Partial<Record<SpeciesId, { shape?: ShapeKind; palette?: ShapePalette; aspect?: number; heightScale?: number }>> = {
  'amanita-caesarea': { shape: 'egg', palette: { cap: '#ef8a2a', capCenter: '#f7b34c', stem: '#f5dc72', under: '#f3d255', accent: '#f7f3e3' } },
  'boletus-edulis': { shape: 'barrel', heightScale: 0.85, palette: { cap: '#8b5a2e', capCenter: '#6f4522', stem: '#dcc8a0', under: '#ece2b8' } },
  'coprinus-comatus': { shape: 'shaggy', palette: { cap: '#f3eee2', stem: '#efe9dc', under: '#2b2b2b', accent: '#a9885f' } },
  'mycena-pura': { shape: 'bell', palette: { cap: '#b693d8', capCenter: '#9c74c4', stem: '#cdb9e6', under: '#e4d6f2' } },
  'collybia-nuda': { shape: 'broad', heightScale: 0.65, palette: { cap: '#8d6bc9', capCenter: '#7554b3', stem: '#a68ad9', under: '#b79fe6' } },
  'coprinopsis-atramentaria': { shape: 'bell', aspect: 1.35, palette: { cap: '#8a8f98', capCenter: '#6f747c', stem: '#e8e4da', under: '#4a4d52' } },
  'suillus-luteus': { shape: 'dome', palette: { cap: '#7b4a22', capCenter: '#5d3718', stem: '#e8dcae', under: '#e2cf7a', accent: '#f4f1e6' } },
  'amanita-pantherina': { aspect: 0.92 },
  'imleria-badia': { aspect: 1.2 },
  'tylopilus-felleus': { aspect: 0.85 },
  'laccaria-amethystina': { aspect: 0.8 },
  'laccaria-laccata': { aspect: 1.05 },
  'coprinellus-micaceus': { aspect: 0.9 },
  'ganoderma-applanatum': { aspect: 1.15 },
  'laetiporus-sulphureus': { aspect: 1.2 },
  'trametes-versicolor': { aspect: 0.95 },
  'pycnoporus-sanguineus': { aspect: 0.85 },
  'fomes-fomentarius': { aspect: 1.1 },
};

interface Placement {
  file: string;
  tint?: Tint;
  /** Forma propia en lugar del modelo (ver LOOK) y su paleta. */
  shape?: ShapeKind;
  palette?: ShapePalette;
  /** Ancho relativo (1 = proporción original). */
  aspect?: number;
  /** Altura del modelo en metros de la escena. */
  height: number;
  /** Posición de la base o, para un hongo de repisa, punto de la corteza donde se apoya. */
  at: Vector3;
  yaw?: number;
  id: SpeciesId;
  /** Hongo de repisa: dirección (en XZ) en que sobresale del tronco y altura del centro. */
  bracket?: { dirX: number; dirZ: number; y: number; embed?: number };
}

/** Yaw para que un modelo de repisa (sobresale hacia +Z del glTF, invertido por el cargador) mire hacia (dx, dz). */
const yawFacing = (dx: number, dz: number) => Math.atan2(-dx, -dz);

type Meta = { pickId?: SpeciesId; vrAction?: VrAction; node?: TransformNode; center?: Vector3; min?: Vector3; max?: Vector3 };
const metaOf = (m?: AbstractMesh | null) => (m?.metadata ?? undefined) as Meta | undefined;

export function createForestScene(canvas: HTMLCanvasElement, cb: ForestCallbacks): ForestScene {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true }, true);
  const scene = new Scene(engine);
  const fog = Color3.FromHexString(HORIZON);
  scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = FOG_BASE;
  scene.fogColor = fog;

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;
  hemi.diffuse = new Color3(1, 0.98, 0.92);
  hemi.groundColor = new Color3(0.32, 0.4, 0.3);
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.45), scene);
  sun.intensity = 1.0;
  sun.diffuse = new Color3(1, 0.93, 0.8);
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -26;
  sun.orthoRight = 26;
  sun.orthoTop = 26;
  sun.orthoBottom = -26;
  sun.shadowMinZ = 5;
  sun.shadowMaxZ = 110;

  buildSky(scene);
  buildGround(scene);
  // En realidad virtual solo se puede teletransportar dentro del mundo: este disco casi invisible es el "suelo" válido.
  const teleportFloor = MeshBuilder.CreateDisc('teleportFloor', { radius: WORLD_RADIUS - 2, tessellation: 64 }, scene);
  teleportFloor.rotation.x = Math.PI / 2;
  teleportFloor.position.y = 0.03;
  teleportFloor.visibility = 0.001;
  teleportFloor.isPickable = false;

  const root = new TransformNode('world', scene);
  const casters: Mesh[] = [];
  const colliders: Circle[] = [];
  const b: Builders = { scene, root, casters, colliders };
  const forestReady = buildForest(b);
  buildDecor(b);

  // Sombras suaves que siguen al visitante: menor resolución en pantallas pequeñas.
  const shadowSize = Math.min(window.innerWidth, window.innerHeight) < 600 ? 1024 : 2048;
  const shadows = new ShadowGenerator(shadowSize, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.darkness = 0.2;
  casters.forEach((m) => shadows.addShadowCaster(m));
  void forestReady.then(({ masters }) => masters.forEach((m) => shadows.addShadowCaster(m)));


  // Anillos que marcan los hallazgos registrados.
  const markers = new Map<SpeciesId, Mesh>();
  SPECIES_ORDER.forEach((id) => {
    const ring = MeshBuilder.CreateTorus(`ring_${id}`, { diameter: 1.5, thickness: 0.06, tessellation: 40 }, scene);
    ring.material = mat(scene, `ringMat_${id}`, '#46d36f', 0.9);
    ring.position.set(MAIN[id].x, 0.08, MAIN[id].z);
    ring.isPickable = false;
    ring.setEnabled(false);
    markers.set(id, ring);
  });

  // Esporas / luciérnagas: partículas lentas que dan vida al ambiente.
  const glow = glowTexture(scene, 'glow');
  const spores = new ParticleSystem('spores', 180, scene);
  spores.particleTexture = glow;
  spores.createBoxEmitter(new Vector3(-0.1, 0.02, -0.1), new Vector3(0.1, 0.2, 0.1), new Vector3(-30, 0.3, -30), new Vector3(30, 4.5, 30));
  const sporeOrigin = new Vector3();
  spores.emitter = sporeOrigin;
  spores.minLifeTime = 7;
  spores.maxLifeTime = 14;
  spores.emitRate = 16;
  spores.minSize = 0.04;
  spores.maxSize = 0.12;
  spores.minEmitPower = 0.15;
  spores.maxEmitPower = 0.45;
  spores.color1 = new Color4(1, 0.95, 0.6, 0.85);
  spores.color2 = new Color4(0.8, 1, 0.7, 0.6);
  spores.colorDead = new Color4(1, 1, 1, 0);
  spores.blendMode = ParticleSystem.BLENDMODE_ADD;
  spores.preWarmCycles = 120;
  spores.preWarmStepOffset = 5;
  spores.start();

  const burst = (at: Vector3) => {
    const ps = new ParticleSystem('burst', 60, scene);
    ps.particleTexture = glow;
    ps.emitter = at.add(new Vector3(0, 0.5, 0));
    ps.createSphereEmitter(0.25);
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 1.3;
    ps.minSize = 0.08;
    ps.maxSize = 0.22;
    ps.minEmitPower = 1.2;
    ps.maxEmitPower = 3;
    ps.gravity = new Vector3(0, -1.5, 0);
    ps.color1 = new Color4(0.5, 1, 0.6, 1);
    ps.color2 = new Color4(1, 0.9, 0.4, 1);
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.manualEmitCount = 50;
    ps.emitRate = 0;
    ps.targetStopDuration = 0.1;
    ps.disposeOnStop = true;
    ps.start();
  };

  // --- Hongos --------------------------------------------------------------
  const materials = new Map<string, StandardMaterial>();
  const mushroomMaterial = (tint?: Tint) => {
    const key = tint ?? 'base';
    let m = materials.get(key);
    if (!m) {
      m = new StandardMaterial(`mushroom_${key}`, scene);
      m.diffuseTexture = new Texture(TEXTURE_URL(tint ? `mushrooms-${tint}` : 'mushrooms'), scene, false, false);
      m.specularColor = Color3.Black();
      m.emissiveColor = new Color3(0.14, 0.14, 0.14);
      materials.set(key, m);
    }
    return m;
  };

  const containers = new Map<string, Promise<AssetContainer | null>>();
  const loadContainer = (file: string) => {
    let p = containers.get(file);
    if (!p) {
      p = LoadAssetContainerAsync(MODEL_URL(file), scene).catch((e) => {
        console.warn(`Modelo ${file} no cargó.`, e);
        return null;
      });
      containers.set(file, p);
    }
    return p;
  };

  let uid = 0;
  /** `dir` y `depth` solo existen en los hongos de repisa (dirección en que sobresalen del tronco y su profundidad). */
  const instances: { node: TransformNode; center: Vector3; id: SpeciesId; dir?: { x: number; z: number }; depth?: number }[] = [];

  // Material de las formas propias: el color viene de los vértices.
  const shapeMaterial = new StandardMaterial('shapeMat', scene);
  shapeMaterial.diffuseColor = Color3.White();
  shapeMaterial.specularColor = Color3.Black();
  shapeMaterial.emissiveColor = new Color3(0.16, 0.16, 0.15);
  const shapeMasters = new Map<SpeciesId, Mesh>();

  async function spawn(s: Placement): Promise<boolean> {
    const holder = new TransformNode(`mush_${s.id}_${uid++}`, scene);
    holder.parent = root;
    let parts: Mesh[];
    if (s.shape && s.palette) {
      let master = shapeMasters.get(s.id);
      if (!master) {
        master = buildShape(scene, s.shape, s.palette, `shape_${s.id}`);
        shapeMasters.set(s.id, master);
      }
      const m = master.clone(`shape_${s.id}_${uid++}`);
      m.setEnabled(true);
      m.parent = holder;
      m.material = shapeMaterial;
      parts = [m];
    } else {
      const c = await loadContainer(s.file);
      if (!c) {
        holder.dispose();
        return false;
      }
      const entries = c.instantiateModelsToScene((n) => `${n}_${uid++}`, false, { doNotInstantiate: true });
      entries.rootNodes.forEach((n) => ((n as TransformNode).parent = holder));
      parts = holder.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0) as Mesh[];
      const material = mushroomMaterial(s.tint);
      parts.forEach((m) => (m.material = material));
    }
    const bounds = () => {
      holder.computeWorldMatrix(true);
      parts.forEach((m) => m.computeWorldMatrix(true));
      return holder.getHierarchyBoundingVectors(true);
    };

    const bracket = s.bracket;
    // Una repisa se mide sin girar (en el marco del propio modelo); un hongo de suelo, ya girado.
    holder.rotation.y = bracket ? 0 : (s.yaw ?? 0);
    let { min, max } = bounds();
    // Altura exacta pedida; el ancho se ajusta con la proporción de la especie y una variación de ±8 % entre ejemplares.
    const k = s.height / (max.y - min.y);
    const width = k * (s.aspect ?? 1) * (1 + (((uid * 37) % 17) - 8) / 100);
    holder.scaling.set(width, k, s.bracket ? k : width);
    ({ min, max } = bounds());
    let depth: number | undefined;
    if (bracket) {
      // El modelo sobresale hacia -Z de su marco (el cargador invierte ese eje), así que su cara trasera es la de mayor Z.
      // Se calcula dónde queda ese punto de anclaje tras girar el modelo y se coloca justo sobre la corteza,
      // empotrado "embed" metros. (Medir con cajas alineadas a los ejes sobreestima la profundidad en diagonal.)
      const yaw = s.yaw ?? 0;
      const ax = (min.x + max.x) / 2;
      const ay = (min.y + max.y) / 2;
      const az = max.z;
      const inset = bracket.embed ?? 0.04;
      const anchorX = s.at.x - bracket.dirX * inset;
      const anchorZ = s.at.z - bracket.dirZ * inset;
      holder.rotation.y = yaw;
      holder.position.set(
        anchorX - (ax * Math.cos(yaw) + az * Math.sin(yaw)),
        bracket.y - ay,
        anchorZ - (-ax * Math.sin(yaw) + az * Math.cos(yaw)),
      );
      depth = max.z - min.z;
    } else {
      holder.position.set(s.at.x - (min.x + max.x) / 2, s.at.y - min.y, s.at.z - (min.z + max.z) / 2);
    }
    ({ min, max } = bounds());
    const center = new Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);

    // Esfera de selección casi invisible, más generosa que el modelo (útil con el dedo y con el rayo del visor).
    const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
    const proxy = MeshBuilder.CreateSphere(`pick_${uid++}`, { diameter: Math.max(0.75, size * 1.15), segments: 8 }, scene);
    proxy.position.copyFrom(center);
    proxy.visibility = 0.001;
    proxy.parent = root;
    const meta: Meta = { pickId: s.id, node: holder, center, min: min.clone(), max: max.clone() };
    proxy.metadata = meta;
    parts.forEach((m) => {
      m.metadata = meta;
      m.receiveShadows = true;
      shadows.addShadowCaster(m);
    });
    instances.push({ node: holder, center, id: s.id, dir: bracket ? { x: bracket.dirX, z: bracket.dirZ } : undefined, depth });
    return true;
  }

  /** Respaldo muy simple si el modelo principal de una especie no carga. */
  function fallbackMushroom(id: SpeciesId) {
    const at = SPAWNS[id].bracket ? new Vector3(MAIN[id].x, 0, MAIN[id].z) : MAIN[id];
    const stem = MeshBuilder.CreateCylinder(`fbStem_${id}`, { diameterTop: 0.14, diameterBottom: 0.2, height: 0.7 }, scene);
    stem.material = mat(scene, `fbStemMat_${id}`, '#efe2c0', 0.2);
    stem.position.set(at.x, at.y + 0.35, at.z);
    const cap = MeshBuilder.CreateSphere(`fbCap_${id}`, { diameter: 0.8, slice: 0.5, segments: 12, sideOrientation: Mesh.DOUBLESIDE }, scene);
    cap.material = mat(scene, `fbCapMat_${id}`, '#c0672d', 0.25);
    cap.position.set(at.x, at.y + 0.7, at.z);
    const proxy = MeshBuilder.CreateSphere(`fbPick_${id}`, { diameter: 1.2, segments: 8 }, scene);
    proxy.position.set(at.x, at.y + 0.5, at.z);
    proxy.visibility = 0.001;
    const meta: Meta = { pickId: id, node: stem, center: proxy.position.clone(), min: proxy.position.add(new Vector3(-0.4, -0.5, -0.4)), max: proxy.position.add(new Vector3(0.4, 0.5, 0.4)) };
    proxy.metadata = meta;
    stem.metadata = meta;
    cap.metadata = meta;
    instances.push({ node: stem, center: meta.center!, id });
  }

  const treeRand = rng(2024);
  const walkable = (x: number, z: number, margin = 0.3) =>
    Math.hypot(x, z) < WORLD_RADIUS - 2 && !colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + margin);
  // Posiciones ya ocupadas por hongos: ninguno nuevo se coloca a menos de 3.5 m de otro.
  const taken: Vector3[] = Object.values(MAIN).map((v) => v.clone());
  const spot = (minR: number, maxR: number, cx = 0, cz = 0): Vector3 | null => {
    for (let t = 0; t < 40; t++) {
      const a = treeRand() * Math.PI * 2;
      const d = minR + treeRand() * (maxR - minR);
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (!walkable(x, z, 0.7)) continue;
      if (POINTS.some((p) => Math.hypot(p.position.x - x, p.position.z - z) < 2.5)) continue;
      if (taken.some((m) => Math.hypot(m.x - x, m.z - z) < 3.5)) continue;
      const found = new Vector3(x, 0, z);
      taken.push(found);
      return found;
    }
    return null;
  };
  const between = (a: number, b: number) => a + treeRand() * (b - a);

  const look = (id: SpeciesId) => ({ shape: LOOK[id]?.shape, palette: LOOK[id]?.palette, aspect: LOOK[id]?.aspect });
  const hs = (id: SpeciesId) => LOOK[id]?.heightScale ?? 1;
  /** Siembra un ejemplar de suelo o, si es un "grupo" de una especie con forma propia, tres ejemplares juntos. */
  const sowGround = (e: Extra, sp: Spawn, id: SpeciesId, at: Vector3): Promise<boolean>[] => {
    const l = look(id);
    const group = !!l.shape && e.file.includes('group');
    return Array.from({ length: group ? 3 : 1 }, (_, i) => {
      const a = treeRand() * 6.28;
      const r = i === 0 ? 0 : 0.35 + treeRand() * 0.3;
      const h = between(e.h[0], e.h[1]) * hs(id) * (group ? 0.7 + treeRand() * 0.3 : 1);
      return spawn({ file: e.file, tint: sp.tint, id, ...l, height: h, at: new Vector3(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r), yaw: treeRand() * 6 });
    });
  };

  // Los hongos extra se colocan cuando el bosque ya está armado, para esquivar sus árboles.
  const populate = (trees: Circle[]) => {
    const jobs: Promise<boolean>[] = [];
    const candidates = trees.filter((t) => t.mesh && Math.hypot(t.x, t.z) > 6 && Math.hypot(t.x, t.z) < WORLD_RADIUS - 6);

    /** Punto de la corteza a la altura y por el lado (dx, dz): se lanza un rayo contra ese árbol y se descartan las ramas. */
    const trunkSurface = (t: Circle, dx: number, dz: number, y: number) => {
      t.mesh!.computeWorldMatrix(true);
      const ray = new Ray(new Vector3(t.x + dx * 4, y, t.z + dz * 4), new Vector3(-dx, 0, -dz), 4.5);
      const hit = scene.pickWithRay(ray, (m) => m === t.mesh);
      if (!hit?.hit || !hit.pickedPoint) return null;
      const rho = Math.hypot(hit.pickedPoint.x - t.x, hit.pickedPoint.z - t.z);
      if (rho >= 0.45) return null; // más ancho = follaje, no tronco
      // La normal de la cara tocada (horizontal) da la orientación para que la repisa quede a ras de la corteza.
      const n = hit.getNormal(true, true);
      let nx = n ? n.x : dx;
      let nz = n ? n.z : dz;
      if (nx * -dx + nz * -dz > 0) {
        nx = -nx;
        nz = -nz;
      }
      const len = Math.hypot(nx, nz);
      if (len < 0.4) return null; // cara casi horizontal
      return { x: hit.pickedPoint.x, z: hit.pickedPoint.z, rho, nx: nx / len, nz: nz / len };
    };

    for (const id of SPECIES_ORDER) {
      const sp = SPAWNS[id];
      const mainJob = sp.bracket
        ? spawn({
            file: sp.file,
            tint: sp.tint,
            id,
            ...look(id),
            height: sp.height * hs(id),
            at: sp.bracket.at,
            yaw: yawFacing(sp.bracket.dirX, sp.bracket.dirZ),
            bracket: { dirX: sp.bracket.dirX, dirZ: sp.bracket.dirZ, y: sp.bracket.y },
          })
        : spawn({ file: sp.file, tint: sp.tint, id, ...look(id), height: sp.height * hs(id), at: MAIN[id] });
      jobs.push(mainJob.then((ok) => (ok ? true : (fallbackMushroom(id), false))));

      for (const e of sp.extras) {
        // Los ejemplares sin zona fija los reparte la cuadrícula de abajo.
        if (!e.onTrees && !e.around) continue;
        for (let i = 0; i < e.count; i++) {
          if (e.onTrees) {
            // Hongo de repisa apoyado en la corteza de un tronco: se prueban varios árboles hasta hallar uno con tronco libre.
            for (let attempt = 0; attempt < 12 && candidates.length; attempt++) {
              const t = candidates.splice(Math.floor(treeRand() * candidates.length), 1)[0];
              const toward = Math.atan2(-t.z, -t.x) + between(-0.7, 0.7);
              const dx = Math.cos(toward);
              const dz = Math.sin(toward);
              const y = between(0.4, 0.95);
              const hit = trunkSurface(t, dx, dz, y);
              if (!hit) continue;
              // El ancho de la repisa (≈ 2 veces su alto) no debe pasar mucho del grosor del tronco.
              const height = Math.min(between(e.h[0], e.h[1]), (2.4 * hit.rho + 0.3) / 2.07);
              jobs.push(
                spawn({
                  file: e.file,
                  tint: sp.tint,
                  id,
                  ...look(id),
                  height,
                  at: new Vector3(hit.x, 0, hit.z),
                  yaw: yawFacing(hit.nx, hit.nz),
                  bracket: { dirX: hit.nx, dirZ: hit.nz, y, embed: 0.06 },
                }),
              );
              break;
            }
          } else if (e.around) {
            const at = spot(e.around[2], e.around[3], e.around[0], e.around[1]);
            if (at) jobs.push(...sowGround(e, sp, id, at));
          }
        }
      }
    }

    // Cuadrícula de ~13 m: en cada celda que aún no tenga hongos se coloca uno (rotando las especies de suelo),
    // para que haya hongos en todo el bosque y no solo cerca del claro.
    const groundIds = SPECIES_ORDER.filter((id) => !SPAWNS[id].bracket);
    const cell = 12;
    const lim = WORLD_RADIUS - 3;
    const cells: { x: number; z: number }[] = [];
    for (let gx = -lim; gx < lim; gx += cell) {
      for (let gz = -lim; gz < lim; gz += cell) {
        const cx = gx + cell / 2;
        const cz = gz + cell / 2;
        if (Math.hypot(cx, cz) < lim + cell * 0.2) cells.push({ x: cx, z: cz });
      }
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(treeRand() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    let turn = 0;
    for (const c of cells) {
      if (taken.some((v) => Math.abs(v.x - c.x) < cell / 2 && Math.abs(v.z - c.z) < cell / 2)) continue;
      const id = groundIds[turn++ % groundIds.length];
      const sp = SPAWNS[id];
      const e = sp.extras.find((x) => !x.onTrees)!;
      const at = spot(0, cell * 0.45, c.x, c.z);
      if (at) jobs.push(...sowGround(e, sp, id, at));
    }
    return Promise.allSettled(jobs);
  };
  const modelsLoaded = forestReady.then(({ placed }) => populate(placed));

  // --- Cámara y movimiento -------------------------------------------------
  const camera = new FreeCamera('camera', POINTS[0].position.clone(), scene);
  camera.minZ = 0.1;
  camera.maxZ = 300;
  camera.angularSensibility = 2600;
  camera.inputs.removeByType('FreeCameraKeyboardMoveInput');
  if (!cb.ambient) camera.attachControl(canvas, true);

  // Campo de visión horizontal fijo en pantallas verticales para no recortar la escena.
  const updateFov = () => {
    const portrait = engine.getRenderWidth() < engine.getRenderHeight();
    camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    camera.fov = portrait ? 1.05 : 0.95;
  };
  updateFov();

  function lookRotation(point: (typeof POINTS)[number]): Vector3 {
    const d = point.look.subtract(point.position);
    return new Vector3(Math.atan2(-d.y, Math.hypot(d.x, d.z)), Math.atan2(d.x, d.z), 0);
  }
  camera.rotation = lookRotation(POINTS[0]);

  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

  let traveling = false;
  let paused = false;
  const goTo = (index: number) => {
    const p = POINTS[index];
    if (!p) return;
    const dest = lookRotation(p);
    // Evita giros largos: acerca el yaw destino al actual.
    dest.y += Math.round((camera.rotation.y - dest.y) / (Math.PI * 2)) * Math.PI * 2;
    const loop = Animation.ANIMATIONLOOPMODE_CONSTANT;
    traveling = true;
    Animation.CreateAndStartAnimation('camPos', camera, 'position', 60, 60, camera.position.clone(), p.position, loop, ease, () => (traveling = false));
    Animation.CreateAndStartAnimation('camRot', camera, 'rotation', 60, 60, camera.rotation.clone(), dest, loop, ease);
  };

  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => {
    keys.clear();
    mouseButtons = 0;
  };
  // Mantener apretados a la vez el botón izquierdo y el derecho del ratón hace avanzar (como en muchos juegos); arrastrar sigue girando la cámara.
  let mouseButtons = 0;
  const onPointerButtons = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') mouseButtons = e.buttons;
  };
  const onContextMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('pointerdown', onPointerButtons);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointermove', onPointerButtons);
  window.addEventListener('pointerup', onPointerButtons);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  /** Empuja una posición fuera de los troncos, rocas y árboles caídos. */
  const resolveColliders = (x0: number, z0: number): [number, number] => {
    let x = x0;
    let z = z0;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + PLAYER_RADIUS;
        if (d < min) {
          const f = d === 0 ? 1 : min / d;
          x = c.x + dx * f;
          z = c.z + dz * f;
        }
      }
    }
    return [x, z];
  };

  /** Busca, sobre el mismo círculo, el punto libre más cercano (sin copas de árbol encima) para que al reaparecer no se esté dentro del follaje. */
  const clearSpot = (x: number, z: number): [number, number] => {
    const r = Math.hypot(x, z);
    const a0 = Math.atan2(z, x);
    for (let k = 0; k < 40; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.018;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      if (!colliders.some((c) => Math.hypot(c.x - cx, c.z - cz) < c.r + 2.6)) return [cx, cz];
    }
    return [x, z];
  };

  let walked = 0;
  const move = (dt: number) => {
    const joy = cb.getMove?.() ?? { x: 0, y: 0 };
    const k = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0);
    // W A S D y las flechas hacen lo mismo: arriba/W avanza, abajo/S retrocede e izquierda-derecha / A-D giran la cámara.
    // Q y E dan pasos laterales sin girar.
    camera.rotation.y += (k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft')) * 1.8 * dt;
    let forward = k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') - joy.y + ((mouseButtons & 3) === 3 ? 1 : 0);
    let side = k('KeyE') - k('KeyQ') + joy.x;
    const len = Math.hypot(forward, side);
    if (len < 0.05) return;
    if (len > 1) {
      forward /= len;
      side /= len;
    }
    const speed = (k('ShiftLeft', 'ShiftRight') ? 5.2 : 3.2) * dt;
    const yaw = camera.rotation.y;
    let x = camera.position.x + (Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed;
    let z = camera.position.z + (Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed;
    [x, z] = resolveColliders(x, z);
    const r = Math.hypot(x, z);
    if (r > WORLD_RADIUS) {
      // Mundo redondo: al llegar al borde reaparece en el lado opuesto y sigue avanzando hacia adentro.
      // En ese tramo la niebla es densa (ver "velo" más abajo), así que el salto no se nota.
      const k = (WORLD_RADIUS - 1.5) / r;
      [x, z] = clearSpot(-x * k, -z * k);
    }
    walked += Math.hypot(x - camera.position.x, z - camera.position.z);
    camera.position.x = x;
    camera.position.z = z;
  };

  // --- Pasto con viento y animales ----------------------------------------
  const updaters: Updater[] = [];
  let grass: Grass | null = null;
  const onLog = (x: number, z: number) => x > -0.5 && x < 8.5 && Math.abs(z - 2) < 1.0;
  void forestReady.then(() => {
    const player = () => (scene.activeCamera ?? camera).globalPosition;
    // El pasto se repite en una cuadrícula de 80 m centrada en el visitante, así que cubre todo el mundo.
    grass = buildGrass(scene, LOW_POWER ? 7000 : 18000, 80, colliders, onLog);
    const centers = [[-6, 3], [-1, 4], [3, 6], [1, -4], [9, -1], [-9, -4], [-30, 20], [28, 24], [-24, -30], [34, -6], [10, 36], [-38, 0]].map(([x, z]) => new Vector3(x, 0, z));
    updaters.push(buildButterflies(scene, centers, LOW_POWER ? 12 : 22));
    updaters.push(buildBirds(scene, LOW_POWER ? 5 : 9));

    const canHop = (x: number, z: number) => walkable(x, z, 0.35) && !onLog(x, z);
    const pick = (n: number, minR: number, maxR: number) =>
      Array.from({ length: n }, () => spot(minR, maxR)).filter((v): v is Vector3 => !!v);
    // Conejos cerca del claro y liebres (más grandes, de orejas largas y saltos amplios) más lejos.
    const near = [spot(3, 9, -4, 5), spot(3, 9, 3, 6), spot(4, 10, 8, -3)].filter((v): v is Vector3 => !!v);
    updaters.push(buildRabbits(scene, near, canHop, player));
    updaters.push(buildRabbits(scene, pick(5, 14, WORLD_RADIUS - 8), canHop, player, { prefix: 'hare', scale: 1.4, ears: 1.7, fur: '#a58c62', step: 1.6, seed: 23 }));

    // Dos manadas de venados, lejos del claro inicial.
    const home = (x: number, z: number) => spot(1, 5, x, z) ?? new Vector3(x, 0, z);
    updaters.push(buildDeer(scene, home(30, -22), LOW_POWER ? 3 : 4, (x, z) => walkable(x, z, 0.5), player));
    updaters.push(buildDeer(scene, home(-22, 36), 3, (x, z) => walkable(x, z, 0.5), player));

    // Manada de lobos (modelo animado CC0): se aparta del visitante si este se acerca.
    const packCenter = home(-34, -24);
    const wolfHomes = [packCenter, home(packCenter.x + 4, packCenter.z + 3), home(packCenter.x - 3, packCenter.z + 5)];
    buildWolves(
      scene,
      `${import.meta.env.BASE_URL}models/animals/wolf.glb`,
      root,
      wolfHomes,
      (x, z) => walkable(x, z, 0.5),
      player,
      (meshes) => meshes.forEach((m) => shadows.addShadowCaster(m)),
    )
      .then((u) => updaters.push(u))
      .catch((e) => console.warn('Los lobos no cargaron.', e));
  });

  // --- Marcado de hallazgos ------------------------------------------------
  let found: SpeciesId[] = [];
  let previouslyFound: SpeciesId[] = [];
  const hud = new VrHud(scene);
  const setFound = (ids: SpeciesId[]) => {
    markers.forEach((ring, id) => ring.setEnabled(ids.includes(id)));
    ids.filter((id) => !previouslyFound.includes(id)).forEach((id) => burst(MAIN[id]));
    previouslyFound = ids;
    found = ids;
    if (xrActive) hud.draw(found.length, SPECIES_ORDER.length);
  };

  // --- Realidad virtual (WebXR, p. ej. Meta Quest 3) -------------------------
  const panel = new VrPanel(scene);
  let xr: WebXRDefaultExperience | null = null;
  let xrActive = false;
  let xrPending = false;
  let currentCard: VrCard | null = null;

  const showPanel = () => {
    const cam = scene.activeCamera;
    if (!currentCard || !cam || !xrActive) return;
    panel.show(currentCard, cam.globalPosition, cam.getForwardRay().direction);
  };

  void isVrSupported().then((ok) => cb.onVrSupport?.(ok));

  const enterVR = async () => {
    if (xrActive || xrPending) return;
    xrPending = true;
    try {
      if (!xr) {
        xr = await WebXRDefaultExperience.CreateAsync(scene, { floorMeshes: [teleportFloor], disableDefaultUI: true, disableTeleportation: true });
        // Controles para Meta Quest 3: palanca izquierda = caminar hacia donde mira; palanca derecha = girar. El gatillo selecciona.
        // Si el navegador no soporta ese modo, se recurre al teletransporte (empujar la palanca hacia adelante y soltar).
        try {
          xr.baseExperience.featuresManager.enableFeature(WebXRFeatureName.MOVEMENT, 'latest', {
            xrInput: xr.input,
            movementOrientationFollowsViewerPose: true,
            movementOrientationFollowsController: false,
            movementSpeed: 1.8,
            rotationSpeed: 0.7,
          });
        } catch (e) {
          console.warn('El movimiento con palancas no está disponible; se usa teletransporte.', e);
          xr.baseExperience.featuresManager.enableFeature(WebXRFeatureName.TELEPORTATION, 'stable', { xrInput: xr.input, floorMeshes: [teleportFloor] });
        }
        // El rayo del controlador solo debe "ver" los hongos y los botones de la ficha.
        if (xr.pointerSelection) xr.pointerSelection.raySelectionPredicate = (mesh) => !!(metaOf(mesh)?.pickId || metaOf(mesh)?.vrAction);
        xr.baseExperience.onStateChangedObservable.add((state) => {
          if (state === WebXRState.IN_XR) {
            xrActive = true;
            xrPending = false;
            scene.shadowsEnabled = false; // cuida el rendimiento en el visor
            hud.attach(xr!.baseExperience.camera);
            hud.draw(found.length, SPECIES_ORDER.length);
            cb.onVrChange?.(true);
            showPanel();
          } else if (state === WebXRState.NOT_IN_XR) {
            const wasActive = xrActive;
            xrActive = false;
            xrPending = false;
            scene.shadowsEnabled = true;
            hud.detach();
            panel.hide();
            if (wasActive) {
              const c = xr!.baseExperience.camera;
              camera.position.set(c.position.x, EYE_HEIGHT, c.position.z);
              cb.onVrChange?.(false);
            }
          }
        });
      }
      // En "local-floor" la altura de los ojos la da el visor: la cámara web debe partir del suelo.
      camera.position.y = 0;
      await xr.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
    } catch (e) {
      xrPending = false;
      camera.position.y = EYE_HEIGHT;
      console.warn('No se pudo entrar en realidad virtual.', e);
      throw e;
    }
  };
  const exitVR = async () => {
    if (xr && xrActive) await xr.baseExperience.exitXRAsync();
  };

  // --- Selección y resaltado -----------------------------------------------
  const pickAt = (): Meta | undefined => {
    const hit = scene.pick(scene.pointerX, scene.pointerY, (m: AbstractMesh) => !!(metaOf(m)?.pickId || metaOf(m)?.vrAction));
    return metaOf(hit?.pickedMesh);
  };
  const handle = (m?: Meta) => {
    if (!m) return;
    if (m.vrAction) {
      cb.onVrAction?.(m.vrAction);
    } else if (m.pickId && m.center) {
      // Distancia horizontal del visitante al contorno del hongo (no a su centro): hay que estar a PICK_DISTANCE o menos.
      const p = (scene.activeCamera ?? camera).globalPosition;
      const lo = m.min ?? m.center;
      const hi = m.max ?? m.center;
      const d = Math.hypot(Math.max(lo.x - p.x, 0, p.x - hi.x), Math.max(lo.z - p.z, 0, p.z - hi.z));
      cb.onPick(m.pickId, d <= PICK_DISTANCE);
    }
  };

  /** Contorno fino dorado sobre el hongo bajo el cursor (sin resplandor). */
  const setOutline = (node: TransformNode | undefined, on: boolean) => {
    node?.getChildMeshes(false).forEach((c) => {
      if (!(c instanceof Mesh) || c.getTotalVertices() === 0) return;
      c.renderOutline = on;
      if (on) {
        c.outlineColor = Color3.FromHexString('#ffe27a');
        // El grosor se extruye en unidades del modelo: se divide por la escala real en el mundo para que mida lo mismo (1,2 cm) en todos.
        c.computeWorldMatrix(true);
        const k = c.absoluteScaling;
        c.outlineWidth = 0.012 / (((Math.abs(k.x) + Math.abs(k.y) + Math.abs(k.z)) / 3) || 1);
      }
    });
  };

  let hovered: TransformNode | undefined;
  scene.onPointerObservable.add((info) => {
    if (xrActive) {
      // El rayo del controlador genera eventos de puntero con su propia información de selección.
      if (info.type === PointerEventTypes.POINTERDOWN) handle(metaOf(info.pickInfo?.pickedMesh));
      return;
    }
    if (info.type === PointerEventTypes.POINTERTAP) {
      handle(pickAt());
    } else if (info.type === PointerEventTypes.POINTERMOVE && (info.event as PointerEvent).pointerType === 'mouse') {
      const m = pickAt();
      canvas.style.cursor = m ? 'pointer' : 'grab';
      if (m?.node !== hovered) {
        setOutline(hovered, false);
        hovered = m?.node;
        setOutline(hovered, true);
      }
    }
  });

  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    time += dt;
    const cam = scene.activeCamera ?? camera;
    markers.forEach((ring) => (ring.rotation.y += 0.01));
    sporeOrigin.set(cam.globalPosition.x, 0, cam.globalPosition.z);
    // Velo: la niebla se espesa en los últimos metros antes del borde. Como la densidad solo depende de la distancia al centro,
    // es igual a ambos lados del salto y el visitante no percibe que reaparece en el extremo opuesto.
    const edgeT = Math.min(1, Math.max(0, (Math.hypot(cam.globalPosition.x, cam.globalPosition.z) - VEIL_START) / (WORLD_RADIUS - VEIL_START)));
    scene.fogDensity = FOG_BASE + (FOG_VEIL - FOG_BASE) * edgeT * edgeT * (3 - 2 * edgeT);
    grass?.setFog(scene.fogDensity);
    if (xrActive && xr) {
      // En VR el movimiento lo hacen las palancas; aquí solo se respetan los obstáculos y el borde.
      const c = xr.baseExperience.camera;
      let [x, z] = resolveColliders(c.position.x, c.position.z);
      const r = Math.hypot(x, z);
      if (r > WORLD_RADIUS - 0.5) {
        x = (x / r) * (WORLD_RADIUS - 0.5);
        z = (z / r) * (WORLD_RADIUS - 0.5);
      }
      if (x !== c.position.x || z !== c.position.z) {
        c.position.x = x;
        c.position.z = z;
      }
    }
    if (cb.ambient) {
      // Paseo lento en círculo alrededor del claro inicial, mirando en la dirección de avance.
      const a = time * 0.07;
      const o = POINTS[0].position;
      const [x, z] = resolveColliders(o.x + Math.cos(a) * 6, o.z + Math.sin(a) * 6);
      camera.position.set(x, EYE_HEIGHT + Math.sin(time * 1.6) * 0.03, z);
      camera.rotation.set(0.08, Math.atan2(-Math.sin(a), Math.cos(a)) + 0.35, 0);
    } else if (!paused && !traveling && !xrActive && !xrPending) move(dt);
    // Limita la inclinación vertical para no ver bajo el suelo ni el cielo vacío.
    if (!xrActive && !cb.ambient) camera.rotation.x = Math.max(-0.5, Math.min(0.85, camera.rotation.x));
    // Altura de los ojos con un ligero balanceo al caminar.
    if (!traveling && !xrActive && !xrPending && !cb.ambient) camera.position.y = EYE_HEIGHT + Math.sin(walked * 2.6) * 0.035;
    // Las sombras siguen al visitante.
    sun.position.set(cam.globalPosition.x - sun.direction.x * 45, -sun.direction.y * 45, cam.globalPosition.z - sun.direction.z * 45);
    updaters.forEach((u) => u(time, dt));
    grass?.update(time, cam.globalPosition);
  });

  if (import.meta.env.DEV) (window as unknown as { __forest: unknown }).__forest = { camera, scene, instances, colliders, panel, hud };

  // Avisa que todo está listo cuando hay un primer cuadro y los modelos terminaron (o fallaron).
  let rendered = false;
  let modelsDone = false;
  let notified = false;
  const notifyIfReady = () => {
    if (rendered && modelsDone && !notified) {
      notified = true;
      cb.onReady?.();
    }
  };
  void modelsLoaded.then(() => {
    modelsDone = true;
    notifyIfReady();
  });
  engine.runRenderLoop(() => {
    scene.render();
    rendered = true;
    notifyIfReady();
  });
  const onResize = () => {
    engine.resize();
    updateFov();
  };
  window.addEventListener('resize', onResize);

  return {
    goTo,
    setFound,
    setPaused: (p) => {
      paused = p;
      if (p) {
        keys.clear();
        mouseButtons = 0;
      }
    },
    setVrCard: (card) => {
      currentCard = card;
      if (!card) panel.hide();
      else showPanel();
    },
    enterVR,
    exitVR,
    dispose: () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerButtons);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerButtons);
      window.removeEventListener('pointerup', onPointerButtons);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
