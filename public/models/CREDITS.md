# Créditos de modelos

Hongos 3D: **Free Mushroom Asset Kit** de Asset Quest (https://www.assetquest.dev), licencia **CC0 1.0**
(https://creativecommons.org/publicdomain/zero/1.0/). Fuente: https://opengameart.org/content/low-poly-mushroom-kit

| Archivo | Modelo original (FBX) | Uso |
|---|---|---|
| `fly-agaric.glb`, `fly-agaric-small.glb`, `fly-agaric-group.glb` | `Fly_Agaric_Basic`, `_Small`, `_Group_1` | *Amanita muscaria* y *A. pantherina* (recoloreado) |
| `artists-conk-group.glb`, `artists-conk.glb` | `Artists_Conk_Group_1`, `_Basic` | *Ganoderma applanatum* y *Fomitopsis pinicola* (recoloreado) |
| `amethyst-deceiver.glb`, `-small.glb`, `-group.glb` | `Amethyst_Deceiver_Basic`, `_Small`, `_Group_1` | *Laccaria amethystina* y *L. laccata* (recoloreado) |
| `bay-bolete.glb`, `bay-bolete-group.glb` | `Bay_Bolete_Basic`, `_Group_1` | *Imleria badia* y *Suillus luteus* (recoloreado) |
| `inky-cap.glb`, `inky-cap-group.glb` | `Inky_Cap_Basic`, `_Group_1` | *Coprinopsis atramentaria* y *Coprinus comatus* (recoloreado) |
| `mushrooms.png` | `Textures/Mushrooms_C.png` reducida a 1024 px | textura compartida |
| `mushrooms-pantherina.png`, `-suillus.png`, `-coprinus.png`, `-laccata.png`, `-fomitopsis.png` | la misma textura con el tono, la saturación y el brillo modificados | especies que reutilizan un modelo con otro color |
| `mushrooms-caesarea.png`, `-edulis.png`, `-tylopilus.png`, `-micaceus.png`, `-nuda.png`, `-mycena.png`, `-laetiporus.png`, `-trametes.png`, `-pycnoporus.png`, `-fomes.png` | la misma textura recoloreada solo en la zona de cada modelo (en `caesarea` se borran las motas blancas) | las 10 especies añadidas después |

Modificaciones: conversión de FBX a GLB (assimp) sin geometría alterada, referencia a textura externa
eliminada y textura reducida. El escalado y la colocación se hacen en `src/scene/forestScene.ts`.

## Árboles

Pinos 3D: **Low Poly Pine Trees** de Trekkerac (https://happykeys.itch.io/pine-trees), licencia **CC0** según su página.
Archivo: `trees/pine-trees.glb` (original `PinetreeGroup.glb`, 1.3 MB; 9 árboles de ~900-1300 triángulos y una plántula que no se usa).

Modificaciones: cada árbol se separa del grupo y se centra en el origen al cargar; se descarta la textura de paleta del
paquete y se colorea por vértices (tronco café, follaje verde). El escalado y la colocación se hacen en `src/scene/forestScene.ts`.

## Animal

Lobo animado: **Animal Pack Vol.2** de Quaternius (https://quaternius.com), licencia **CC0** según su página en OpenGameArt
(https://opengameart.org/content/animated-animales-low-poly). Archivo: `animals/wolf.glb` (284 KB, 622 triángulos, animaciones *Idle* y *Walking*),
convertido desde `FBX/Wolf.fbx` con assimp sin alterar la geometría. El resto del paquete (águila, perro, gato, piraña) no se usa: el águila convertida
pesa 4.6 MB.

Los conejos, mariposas y aves se generan por código (`src/scene/animals.ts`).

## Audio

Ambiente de bosque: **Birds and Wind - Ambient** de Spring Spring (https://opengameart.org/content/birds-and-wind-ambient-birds-wind-and-synth),
licencia **CC0** según su página. Archivo: `public/audio/forest-ambience.ogg` (1.9 MB, ~84 s, estéreo, en bucle). La página acredita los efectos de aves
como dominio público de isaiah658, syncopika y pauliuw.
