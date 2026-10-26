import { Color3, Mesh, MeshBuilder, Scene, Vector3, VertexBuffer } from '@babylonjs/core';

/**
 * Siluetas propias para especies cuya forma no se parece a ninguno de los cinco modelos del kit. Se generan por revolución de un
 * perfil (torno), con color por vértice y sombreado plano, para conservar el estilo del resto del bosque.
 */
export type ShapeKind = 'egg' | 'barrel' | 'shaggy' | 'bell' | 'broad' | 'dome';

export interface ShapePalette {
  cap: string;
  /** Color del centro del sombrero (más oscuro o claro que `cap`). */
  capCenter?: string;
  stem: string;
  /** Láminas o poros, en la cara inferior del sombrero. */
  under: string;
  /** Detalle: volva, anillo o puntas de las escamas. */
  accent?: string;
}

type Profile = [number, number][];

const lathe = (scene: Scene, name: string, pts: Profile, tess = 16): Mesh =>
  MeshBuilder.CreateLathe(name, { shape: pts.map(([r, y]) => new Vector3(r, y, 0)), tessellation: tess, sideOrientation: Mesh.DOUBLESIDE }, scene);

/** Asigna a cada vértice un color en función de su altura relativa (0 a 1) y de si mira hacia abajo. */
function colorize(mesh: Mesh, color: (t: number, down: boolean) => Color3) {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const nor = mesh.getVerticesData(VertexBuffer.NormalKind);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    minY = Math.min(minY, pos[i]);
    maxY = Math.max(maxY, pos[i]);
  }
  const colors: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const t = (pos[3 * i + 1] - minY) / (maxY - minY || 1);
    const c = color(t, !!nor && nor[3 * i + 1] < -0.45);
    colors.push(c.r, c.g, c.b, 1);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

const rgb = (hex: string) => Color3.FromHexString(hex);

interface Def {
  stem: Profile;
  cap: Profile;
  capY: number;
  /** Extras: anillo (perfil y altura) y volva (perfil en la base). */
  ring?: { pts: Profile; y: number };
  volva?: Profile;
  /** Fracción superior del sombrero que usa el color de detalle (escamas pardas de la barbuda). */
  tip?: number;
  tess?: number;
}

const DEFS: Record<ShapeKind, Def> = {
  // Amanita caesarea: huevo blanco (volva), pie amarillo con anillo y sombrero liso naranja.
  egg: {
    stem: [[0.085, 0], [0.075, 0.1], [0.065, 0.55], [0.07, 0.6]],
    cap: [[0, 0], [0.28, 0], [0.3, 0.02], [0.27, 0.08], [0.2, 0.14], [0.1, 0.18], [0, 0.19]],
    capY: 0.58,
    ring: { pts: [[0.09, 0.02], [0.15, -0.04], [0.16, -0.09]], y: 0.5 },
    volva: [[0.16, 0], [0.18, 0.05], [0.17, 0.14], [0.1, 0.18], [0.07, 0.15]],
  },
  // Boletus edulis: pie grueso en forma de barril y sombrero amplio.
  barrel: {
    stem: [[0.12, 0], [0.17, 0.08], [0.2, 0.2], [0.18, 0.32], [0.13, 0.4]],
    cap: [[0, 0], [0.34, 0], [0.4, 0.03], [0.4, 0.1], [0.32, 0.2], [0.18, 0.27], [0, 0.3]],
    capY: 0.38,
  },
  // Coprinus comatus: sombrero cilíndrico alto con escamas levantadas.
  shaggy: {
    stem: [[0.035, 0], [0.03, 0.3], [0.04, 0.55]],
    cap: [[0, 0.02], [0.11, 0], [0.145, 0.06], [0.125, 0.12], [0.16, 0.18], [0.135, 0.24], [0.165, 0.3], [0.14, 0.36], [0.15, 0.42], [0.1, 0.5], [0, 0.54]],
    capY: 0.28,
    tip: 0.3,
  },
  // Mycena pura y Coprinopsis atramentaria: sombrero acampanado sobre un pie largo y fino.
  bell: {
    stem: [[0.03, 0], [0.024, 0.5], [0.027, 0.62]],
    cap: [[0, 0], [0.1, 0], [0.14, 0.04], [0.13, 0.12], [0.08, 0.2], [0.03, 0.25], [0, 0.26]],
    capY: 0.6,
  },
  // Collybia nuda: sombrero ancho y aplanado sobre un pie corto y bulboso.
  broad: {
    stem: [[0.09, 0], [0.12, 0.06], [0.1, 0.2], [0.07, 0.3]],
    cap: [[0, 0.02], [0.3, 0], [0.36, 0.03], [0.33, 0.08], [0.2, 0.12], [0, 0.14]],
    capY: 0.28,
  },
  // Suillus luteus: domo liso y brillante con un anillo blanco en el pie.
  dome: {
    stem: [[0.07, 0], [0.065, 0.25], [0.075, 0.34]],
    cap: [[0, 0], [0.22, 0], [0.27, 0.04], [0.26, 0.1], [0.18, 0.17], [0.08, 0.2], [0, 0.21]],
    capY: 0.33,
    ring: { pts: [[0.075, 0.03], [0.125, -0.02], [0.13, -0.06]], y: 0.3 },
  },
};

/** Construye (en el origen, con la base en y = 0) una seta de la forma pedida. Úsese como maestra y clónese. */
export function buildShape(scene: Scene, kind: ShapeKind, pal: ShapePalette, name: string): Mesh {
  const d = DEFS[kind];
  const parts: Mesh[] = [];
  const cap = rgb(pal.cap);
  const center = rgb(pal.capCenter ?? pal.cap);
  const stem = rgb(pal.stem);
  const under = rgb(pal.under);
  const accent = rgb(pal.accent ?? pal.stem);

  const stemMesh = lathe(scene, name + '_stem', d.stem, 10);
  colorize(stemMesh, (t) => stem.scale(0.82 + t * 0.26));
  parts.push(stemMesh);

  const capMesh = lathe(scene, name + '_cap', d.cap, 18);
  capMesh.position.y = d.capY;
  colorize(capMesh, (t, down) => {
    if (down) return under;
    if (d.tip && t > 1 - d.tip) return accent;
    return Color3.Lerp(cap.scale(0.88), center, Math.max(0, t - 0.35) * 1.4);
  });
  parts.push(capMesh);

  if (d.ring) {
    const r = lathe(scene, name + '_ring', d.ring.pts, 14);
    r.position.y = d.ring.y;
    colorize(r, () => accent);
    parts.push(r);
  }
  if (d.volva) {
    const v = lathe(scene, name + '_volva', d.volva, 12);
    colorize(v, (t) => accent.scale(0.9 + t * 0.1));
    parts.push(v);
  }

  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  merged.name = name;
  merged.convertToFlatShadedMesh();
  merged.setEnabled(false);
  return merged;
}
