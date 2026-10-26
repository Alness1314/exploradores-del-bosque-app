# Exploradores del bosque

Demo técnica (React + TypeScript + Babylon.js) descrita en `../Demo-Exploradores-del-bosque-hongos.md`.
Es una muestra de capacidades del equipo; no es un proyecto previo de los CV.

## Ejecutar

```bash
npm install
npm run dev         # desarrollo (http)
npm run dev:https   # desarrollo con HTTPS autofirmado y acceso por la red local (necesario para VR)
npm run build       # compilación en dist/
npm run preview     # servir dist/
npm run qr -- https://tu-sitio.example/   # genera docs/qr.png y docs/qr.svg
```

## Qué incluye

- Bosque de coníferas en 3D con caminata libre. Teclado: **W / ↑** avanzan y **S / ↓** retroceden; **A D / ← →** giran la cámara (igual con las dos teclas);
  **Q / E** dan pasos laterales; mantener apretados **ambos botones del ratón** (izquierdo + derecho) avanza; Shift corre; arrastrar con el ratón también mira. Joystick virtual en pantallas táctiles. Hay colisiones con árboles, rocas, troncos caídos
  y árboles secos. Ocho zonas sirven de viaje rápido (botones o teclas 1-8).
- **Mundo redondo de 112 m de diámetro**: al llegar al borde reapareces en el lado opuesto, siguiendo tu rumbo hacia adentro. La niebla se espesa en los últimos
  ~18 m antes del borde y tiene la misma densidad a ambos lados del salto, así que no hay destello ni corte: caminas hacia la bruma y sales de ella al otro lado (el punto de
  llegada se elige libre de follaje). Más allá del borde el bosque continúa en un anillo de árboles. Cientos de árboles, 24 árboles secos en pie y 30 troncos caídos.
- **Hongos en todo el bosque**: ~130 ejemplares; el mundo se divide en sectores de ~12 m y todos tienen al menos uno. Los hongos de repisa se apoyan en la corteza real del tronco
  (se calcula con un rayo contra cada árbol) y su tamaño se ajusta al grosor del tronco.
- **20 especies de hongos** con nombre científico, familia, hábitat, papel ecológico, distribución, advertencias y enlace a la fuente (`src/data/species.ts`).
  Las 10 primeras: *Amanita muscaria*, *A. pantherina*, *Imleria badia*, *Suillus luteus*, *Coprinopsis atramentaria*, *Coprinus comatus*, *Laccaria amethystina*,
  *L. laccata*, *Ganoderma applanatum* y *Fomitopsis pinicola*. Las 10 nuevas: *Amanita caesarea*, *Boletus edulis*, *Tylopilus felleus*, *Coprinellus micaceus*,
  *Collybia nuda* (antes *Lepista nuda*), *Mycena pura*, *Laetiporus sulphureus*, *Trametes versicolor*, *Pycnoporus sanguineus* y *Fomes fomentarius*.
  Cada una tiene un ejemplar principal en su zona y varios más repartidos por el bosque (cualquiera cuenta como hallazgo).
- **Para abrir la ficha y registrar un hongo hay que estar a 5 m o menos** de él (distancia horizontal al contorno del hongo). Al pasar el cursor por encima aparece un contorno dorado fino.
- Fichas, cuaderno de 20 espacios, pista por zona, pregunta final con retroalimentación y reinicio. Registro único por especie.
- **Pasto con viento**: ~18 000 matas (7 000 en pantallas táctiles y visores) con instanciación por hardware y movimiento calculado en el shader; se repite en una cuadrícula
  de 80 m que sigue al visitante, así que cubre todo el mundo, y se aparta cuando pasas.
- **Animales con movimiento**: mariposas; aves que giran sobre el bosque; conejos y **liebres** (más grandes, de orejas largas y saltos amplios) que descansan, saltan y huyen si te acercas;
  **dos manadas de venados** (un macho con astas, hembras y una cría) que pastan, caminan, se ponen alerta y huyen al galope; y una **manada de tres lobos** (modelo animado CC0 con esqueleto)
  que recorre su zona y se aparta del visitante.
- **Realidad virtual (Meta Quest 3)**: botón "Entrar en VR" cuando el navegador soporta WebXR inmersivo. Ver abajo.
- **Código QR**: botón "QR" (también en la bienvenida) para generar el QR de la dirección de la demo y descargarlo como PNG. El dominio se cambia con `VITE_PUBLIC_URL` (ver "Dominio del QR").
- **Interfaz**: cristal oscuro translúcido con texto blanco e iconos. Encabezado con botón de **inicio** (pide confirmación si ya hay progreso), progreso y herramientas:
  cuaderno, pista, guía de especies, **VR** (siempre visible; si el navegador no soporta WebXR explica qué hacer), QR y sonido. Los avisos se cierran solos a los 3 s o con la ✕.
- **Guía de especies** (vista sin 3D): cuadrícula de tarjetas (3 columnas en escritorio, 2 en tabletas y celulares) con filtros Todas / Pendientes / Registradas.
  Se activa con el botón "Guía", desde la bienvenida, o sola si WebGL falla.
- Ambiente sonoro opcional con volumen y campanilla al registrar: grabación libre de bosque (aves y viento, CC0) en bucle; si falta el archivo, genera viento con Web Audio.
- Accesibilidad: diálogos con foco atrapado y Esc para cerrar, botones de 40-44 px, `prefers-reduced-motion`, nada depende solo del color o del sonido.
- Estado solo en memoria: recargar reinicia el demo.

## Realidad virtual en Meta Quest 3

WebXR inmersivo exige **HTTPS** (o `localhost`). Dos formas de probarlo:

1. **Por Wi-Fi con HTTPS autofirmado.** En la PC: `npm run dev:https`. En el Meta Quest Browser abre la dirección `https://<IP-de-la-PC>:<puerto>`
   que imprime Vite (aparece como "Network") y acepta la advertencia del certificado. Puedes generar el QR con el botón "QR".
2. **Por cable.** Con el visor conectado por USB y la depuración activada: `adb reverse tcp:5173 tcp:5173` y abre `http://localhost:5173` en el visor
   (`localhost` cuenta como contexto seguro).

Controles dentro del visor (Meta Quest 3):

| Control | Acción |
|---|---|
| Palanca izquierda | Caminar hacia donde miras |
| Palanca derecha | Girar |
| Rayo del controlador + gatillo | Seleccionar un hongo / pulsar **Registrar hallazgo** o **Cerrar** en la ficha flotante |

La colisión con troncos y el borde del mundo (niebla, sin salto) se aplican también en VR. Un marcador pequeño muestra el progreso. Si el navegador no soporta el movimiento con
palancas, la demo recurre al teletransporte (empujar la palanca hacia adelante y soltar). Al entrar en VR se desactivan las sombras para cuidar el rendimiento. Las velocidades
de movimiento y giro se ajustan en `movementSpeed` y `rotationSpeed` (`src/scene/forestScene.ts`).

> **Estado de validación:** el código de VR está implementado y comprobado solo en escritorio (la ficha flotante, los marcadores y la carga). **No se ha probado con un
> visor físico**: antes de presentarlo como funcional hay que validar entrada, selección con el controlador, teletransporte, legibilidad y rendimiento en un Quest 3
> real y registrar la evidencia (la propuesta lo exige).

## Dominio del QR

El QR usa la variable `VITE_PUBLIC_URL`:

| Archivo | Cuándo se usa |
|---|---|
| `.env` | Desarrollo (`npm run dev`). Vacía = el QR usa la dirección con la que abriste la página. |
| `.env.production` | Compilación (`npm run build`). Cambia el valor por el dominio real al publicar. |
| `.env.example` | Plantilla de referencia. |

`npm run qr` genera `docs/qr.png` y `docs/qr.svg` con ese mismo dominio (o con uno pasado como argumento). Mientras el valor sea el marcador
`tu-dominio.example`, la demo lo ignora y usa la dirección actual. En el diálogo "QR" la dirección también se puede editar a mano.

## Contenido científico

Las fichas se redactaron a partir de las páginas de Wikipedia enlazadas en cada especie (consultadas en octubre de 2026). Son especies **representativas de
bosques de coníferas y mixtos**; la demo no afirma que todas crezcan en Hidalgo. Los modelos 3D son representaciones estilizadas, no sirven para identificar hongos
ni para decidir su consumo. **Antes de publicar, el contenido debe pasar por revisión micológica** (nombres comunes en español, distribución local, advertencias).

## Modelos y créditos

Ver `public/models/CREDITS.md`. Hongos: *Free Mushroom Asset Kit* de Asset Quest (CC0). Cinco modelos cubren veinte especies: las demás reutilizan la forma más
parecida con otra textura de color, recoloreada por zonas del atlas (por ejemplo, *A. pantherina* y *A. caesarea* usan el modelo de *Fly Agaric*; en *A. caesarea* se borran además
las motas blancas, que esa especie no tiene). Siete especies tienen además **forma propia** generada por código (`src/scene/shapes.ts`): huevo con volva (*A. caesarea*), barril (*B. edulis*), cilindro con escamas (*C. comatus*), campana esbelta (*M. pura*, *C. atramentaria*), sombrero ancho (*C. nuda*) y domo con anillo (*S. luteus*); el resto ajusta la proporción del modelo. Son representaciones estilizadas, no réplicas taxonómicas. Árboles: pinos de *Low Poly Pine Trees*
parecida con otra textura de color (por ejemplo, *A. pantherina* usa el modelo de *Fly Agaric* con la paleta recoloreada). Árboles: pinos de *Low Poly Pine Trees*
de Trekkerac (CC0, `public/models/trees/`) mezclados con coníferas procedurales. Lobo: *Animal Pack Vol.2* de Quaternius (CC0). Sonido: *Birds and Wind - Ambient* de
Spring Spring (CC0). Pasto, conejos, mariposas, aves, cielo y suelo se generan por código.
El archivo `xS0VkGOjfW.glb` de la carpeta superior (~40 MB) no se usa ni se revisó.

## Pendiente

- Validar la VR en un Meta Quest 3 real.
- Publicar con HTTPS (Netlify, GitHub Pages, Vercel…) y generar el QR definitivo con `npm run qr`.
- Revisión micológica del contenido y pruebas en dispositivos reales (táctil, rendimiento en gama media).
- El paquete 3D pesa ~6 MB (1.3 MB comprimido) por importar `@babylonjs/core` completo; se puede reducir con imports por ruta.
