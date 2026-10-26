import { DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Camera } from '@babylonjs/core';

/** Contenido de la ficha que se muestra dentro del visor (la interfaz web no existe en realidad virtual). */
export interface VrCard {
  title: string;
  subtitle: string;
  lines: string[];
  found: boolean;
  /** Texto de un único botón principal que solo cierra (p. ej. en el mensaje final). */
  primary?: string;
}

export type VrAction = 'register' | 'close';

interface XrNavigator {
  xr?: { isSessionSupported: (mode: string) => Promise<boolean> };
}

/** El navegador del visor (p. ej. Meta Quest Browser) debe soportar WebXR inmersivo y servir la página por HTTPS. */
export async function isVrSupported(): Promise<boolean> {
  try {
    const xr = (navigator as unknown as XrNavigator).xr;
    return !!xr && (await xr.isSessionSupported('immersive-vr'));
  } catch {
    return false;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

function textPlane(scene: Scene, name: string, width: number, height: number, px: number) {
  const tex = new DynamicTexture(name, { width: px, height: Math.round((px * height) / width) }, scene, true);
  tex.hasAlpha = true;
  const material = new StandardMaterial(`${name}Mat`, scene);
  material.diffuseTexture = tex;
  material.emissiveTexture = tex;
  material.disableLighting = true;
  material.useAlphaFromDiffuseTexture = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  const mesh = MeshBuilder.CreatePlane(name, { width, height }, scene);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
  return { mesh, tex, ctx: tex.getContext() as unknown as CanvasRenderingContext2D, w: px, h: Math.round((px * height) / width) };
}

/** Ficha flotante con dos botones que se activan apuntando con el controlador. */
export class VrPanel {
  private group: TransformNode;
  private card: ReturnType<typeof textPlane>;
  private register: ReturnType<typeof textPlane>;
  private close: ReturnType<typeof textPlane>;

  constructor(scene: Scene) {
    this.card = textPlane(scene, 'vrCard', 1.3, 1.0, 1024);
    this.register = textPlane(scene, 'vrRegister', 0.62, 0.17, 512);
    this.close = textPlane(scene, 'vrClose', 0.62, 0.17, 512);
    this.group = new TransformNode('vrPanel', scene);
    this.card.mesh.parent = this.group;
    this.register.mesh.parent = this.group;
    this.close.mesh.parent = this.group;
    this.register.mesh.position.set(-0.33, -0.62, 0);
    this.close.mesh.position.set(0.33, -0.62, 0);
    this.register.mesh.isPickable = true;
    this.close.mesh.isPickable = true;
    this.register.mesh.metadata = { vrAction: 'register' };
    this.close.mesh.metadata = { vrAction: 'close' };
    this.hide();
  }

  private button(p: ReturnType<typeof textPlane>, label: string, fill: string, ink: string) {
    const { ctx, w, h } = p;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = fill;
    roundRect(ctx, 4, 4, w - 8, h - 8, h / 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = `600 ${Math.round(h * 0.38)}px Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2 + 2);
    p.tex.update();
  }

  show(card: VrCard, from: Vector3, forward: Vector3) {
    const { ctx, w, h } = this.card;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f6f2e7';
    roundRect(ctx, 6, 6, w - 12, h - 12, 44);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1b2a20';
    ctx.font = '700 66px Segoe UI, system-ui, sans-serif';
    ctx.fillText(card.title, 56, 110);
    ctx.fillStyle = '#55645a';
    ctx.font = 'italic 600 42px Segoe UI, system-ui, sans-serif';
    ctx.fillText(card.subtitle, 56, 168);
    ctx.fillStyle = '#1b2a20';
    ctx.font = '400 36px Segoe UI, system-ui, sans-serif';
    let y = 238;
    for (const line of card.lines) {
      for (const part of wrap(ctx, line, w - 112)) {
        if (y > h - 40) break;
        ctx.fillText(part, 56, y);
        y += 46;
      }
      y += 14;
    }
    this.card.tex.update();

    const done = card.found && !card.primary;
    this.button(this.register, card.primary ?? (card.found ? '✔ Ya registrado' : 'Registrar hallazgo'), done ? '#cfe8d6' : '#46b36b', done ? '#2b4a35' : '#06210f');
    this.button(this.close, 'Cerrar', '#ffffff', '#1b2a20');
    this.register.mesh.metadata = card.found ? { vrAction: 'close' } : { vrAction: 'register' };

    // Se coloca frente al usuario, a 1.5 m y a la altura de los ojos, mirándolo.
    const f = new Vector3(forward.x, 0, forward.z);
    if (f.lengthSquared() < 1e-4) f.set(0, 0, 1);
    f.normalize();
    this.group.position.set(from.x + f.x * 1.5, from.y - 0.1, from.z + f.z * 1.5);
    this.group.rotation.y = Math.atan2(f.x, f.z);
    this.group.setEnabled(true);
  }

  hide() {
    this.group.setEnabled(false);
  }

  get meshes(): Mesh[] {
    return [this.card.mesh, this.register.mesh, this.close.mesh];
  }

  dispose() {
    this.group.dispose(false, true);
  }
}

/** Marcador de progreso fijo en un rincón de la vista. */
export class VrHud {
  private p: ReturnType<typeof textPlane>;

  constructor(scene: Scene) {
    this.p = textPlane(scene, 'vrHud', 0.36, 0.1, 512);
    this.p.mesh.position.set(-0.4, -0.33, 0.95);
    this.p.mesh.setEnabled(false);
  }

  attach(camera: Camera) {
    this.p.mesh.parent = camera;
    this.p.mesh.setEnabled(true);
  }

  detach() {
    this.p.mesh.parent = null;
    this.p.mesh.setEnabled(false);
  }

  draw(found: number, total: number) {
    const { ctx, w, h } = this.p;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(18, 38, 27, 0.78)';
    roundRect(ctx, 4, 4, w - 8, h - 8, h / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(h * 0.42)}px Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Hongos ${found}/${total}`, w / 2, h / 2 + 2);
    this.p.tex.update();
  }

  dispose() {
    this.p.mesh.dispose();
  }
}
