# Mapa del campus (parte C)

El mapa se arma en dos pasos: una **base automática desde OpenStreetMap** y, encima,
**correcciones contra el plano oficial** de la universidad.

## 1. Base: OpenStreetMap

```bash
npm run mapa           # regenera desde la copia local descargada
npm run mapa -- --fetch          # vuelve a descargar de OpenStreetMap
npm run mapa -- --fetch --margin 100
```

Genera:

| Archivo                          | Qué es                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| `client/src/map/campus.json`     | Formas y edificios del mapa (se sube al repositorio)              |
| `shared/src/campus-area.json`    | Contorno del campus: define dónde se pueden poner pines (se sube) |
| `assets/mapa/campus-preview.svg` | Vista para revisar el resultado (no se sube)                      |
| `assets/mapa/osm-campus.json`    | Copia cruda de OpenStreetMap (no se sube)                         |

Estado actual: **950 formas y 85 edificios con nombre**, 135 KB, en un lienzo de 1000 × 1455 m
que cubre el campus completo (del Arco hasta el extremo sur) más 70 m de margen.

### Formato de `campus.json`

```jsonc
{
  "center": [-73.0364, -36.829], // punto de referencia (lon, lat) del centro del campus
  "viewBox": [0, 0, 1000.3, 1455.5], // METROS: 1 unidad = 1 metro; el contorno define el tamaño
  "features": [
    // orden de pintado: agua, verde, calle, sendero, edificio
    {
      "k": "edificio",
      "d": "M…Z",
      "id": "edificio-biblioteca-central…",
      "n": "Biblioteca Central…",
    },
  ],
  "buildings": [
    // solo los que tienen nombre y caben enteros en el lienzo
    { "id": "…", "name": "…", "cx": 526.5, "cy": 767.4, "area": 2677 },
  ],
  "minLabelArea": 150, // desde qué superficie conviene rotular
}
```

- Las coordenadas están en **metros y son positivas**, con Y hacia abajo como en SVG.
  Ese es el sistema donde se anclan los pines de la superficie `map`, y por eso cumplen las
  mismas reglas de validación que los de la pizarra.
- Los `id` son estables (`edificio-<nombre>`), así que la información de cada edificio
  (descripción, fotos) se asocia por id.
- Un edificio cortado por el borde del recorte se dibuja, pero no entra en `buildings`: su
  centro caería fuera del lienzo y no se podría rotular ni abrir.
- Los colores no van en los datos: se controlan desde el CSS con la clase `k`.

### El límite de la universidad

`shared/src/campus-area.json` (también generado) trae el **contorno oficial del campus** en las
mismas coordenadas, y `shared/src/campusArea.ts` la función `isInsideCampus(x, y)`.

- La cámara puede salirse un poco del campus, pero **los pines solo se pueden poner dentro del
  contorno**. Fuera aparece "No puedes poner un pin fuera de la universidad".
- Lo comprueba el cliente (para avisar antes) y **también el servidor**, que es el que manda:
  el mismo esquema de validación lo aplica a todo pin de la superficie `map`.
- El contorno sale de la vía `113312181` de OpenStreetMap (`amenity=university`, UdeC). Si
  cambia, se ajusta `BOUNDARY_WAY` en `scripts/mapa/build.ts`.

> **Cuidado:** el origen de coordenadas depende del contorno y del margen. Si regeneras el mapa
> con otro margen o con un contorno distinto **después** de que haya pines puestos, esos pines
> quedan corridos. Conviene dejar el mapa fijo antes del evento.

### Atribución obligatoria

Los datos son de OpenStreetMap bajo licencia **ODbL**. La página debe mostrar
**"© colaboradores de OpenStreetMap"** de forma visible en la vista del mapa, y el mapa
derivado queda bajo la misma licencia. El texto viene en `campus.json` (`attribution`).

## 2. Fichas de edificios (nombre, foto y descripción)

Los **85 edificios identificados** se pueden abrir desde su silueta, su nombre visible o el
buscador, incluso si aún falta una foto o una descripción. También admiten Enter y espacio.
Al colocar un pin, los clics pasan al lienzo para publicar sobre un edificio. Las fichas viven en
[client/src/map/edificios.json](../client/src/map/edificios.json), con el **id del edificio** como clave:

```json
{
  "edificio-biblioteca-central-luis-david-cruz-ocampo": {
    "descripcion": "Principal biblioteca del campus. Salas de estudio y préstamo de libros.",
    "fotos": [
      {
        "archivo": "biblioteca-central-luis-david-cruz-ocampo.jpg",
        "autor": "Tomás Jorquera",
        "licencia": "CC BY 2.0",
        "fuente": "https://commons.wikimedia.org/wiki/File:Biblioteca_Central_UdeC.jpg"
      }
    ]
  }
}
```

- Los ids salen de `campus.json` (o del listado que imprime `npm run mapa`). Ejemplos:
  `edificio-facultad-de-ingenieria`, `edificio-eula-1`, `edificio-casa-del-deporte`.
- `fuenteDescripcion` es un enlace institucional opcional que aparece junto al texto.
- Las **fotos** se guardan en `client/public/edificios/`. Se muestran todas, una bajo otra.
- `autor`, `licencia` y `fuente` son para material de terceros: el crédito se imprime bajo la
  foto porque las licencias Creative Commons lo exigen. Una foto propia del equipo solo lleva
  `archivo`.
- Mientras `descripcion` esté vacía o no haya fotos, la ficha muestra "Descripción pendiente" y
  el espacio reservado para la imagen.
- Pruebas automáticas verifican que cada ficha corresponda a un edificio real del mapa, que el
  archivo de cada foto exista y que las de terceros lleven autor y licencia.

### 2.1 Fotos con licencia libre (Wikimedia Commons)

```bash
npm run fotos              # descarga las curadas en scripts/fotos/fuentes.json
npm run fotos:inventario   # regenera docs/EDIFICIOS.md
```

`scripts/fotos/fuentes.json` es una lista revisada a mano: se descartaron planos de archivo,
placas e interiores poco reconocibles. El script solicita 1200 px por defecto (se puede indicar `--ancho 960`) y
escribe el crédito que devuelve la API de Commons, conservando descripciones y enlaces
institucionales. Añadir títulos al final de cada lista conserva los nombres de archivo:
reordenarlos requiere volver a descargar las fotos para no atribuir un archivo a otro autor.

**No se pueden usar fotos de Google Maps, Street View, Instagram ni de medios de prensa**: son
obras protegidas y publicarlas en el sitio de la Universidad expone a un reclamo. Lo que falta
se cubre con fotos del equipo o del banco de imágenes de la UdeC (con autorización escrita).

Qué edificio tiene foto y cuál no: [EDIFICIOS.md](EDIFICIOS.md).

## 3. Corrección con el plano oficial (DWG)

El plano `Campus UdeC.dwg` (AutoCAD 2018) sirve para verificar y completar lo que falte en
OpenStreetMap: edificios nuevos, nombres oficiales, siluetas mal dibujadas.

### 3.1 DWG → DXF

Con **ODA File Converter** (gratuito) o desde AutoCAD:

- Input: la carpeta con el `.dwg` · Output: `assets/mapa/`
- Output version: `ACAD2013` · Output file type: `DXF` · Audit: activado

### 3.2 Ver qué trae el plano

```bash
npx tsx scripts/dxf/inventory.ts "assets/mapa/Campus UdeC.dxf"
```

Imprime las capas con su cantidad y tipos de elementos, y deja en `assets/mapa/capas/` una
vista previa SVG por capa más una página `capas.html` para mirarlas todas juntas. Los rótulos
de texto se dibujan, así que sirven para identificar edificios.

Opciones: `--out <dir>`, `--top N`, y `--layers A,B --svg salida.svg` para exportar capas
concretas a un SVG combinado que se puede abrir en Inkscape como plantilla.

## Notas técnicas

- El lector de DXF (`scripts/dxf/parse.ts`) interpreta LINE, LWPOLYLINE, CIRCLE, ARC, SOLID,
  POINT y TEXT, y expande bloques (INSERT) con traslación, escala y rotación. Los HATCH y
  SPLINE se cuentan pero no se dibujan: para elegir capas es suficiente.
- En CAD el eje Y crece hacia arriba y en SVG hacia abajo: ambas herramientas ya lo invierten.
- La proyección de OpenStreetMap es plana local (equirrectangular centrada en el campus). A
  esta escala el error es de centímetros.

## Presentación y lectura del mapa

Los edificios usan tonos neutros para destacar los pines. La leyenda muestra Mensaje
(verde), Ubicación (rojo), Evento (azul) y Pregunta (morado), definidos en `shared`.
Los pines mantienen su crecimiento por visitas, un halo blanco y un área táctil mínima
de 44 píxeles. El texto previo aparece al señalar, enfocar o seleccionar el pin.

`client/src/map/rotulos.ts` selecciona nombres por zoom y tamaño de pantalla, prioriza
referencias del campus y el edificio seleccionado, y descarta cajas superpuestas. Usa
como máximo dos líneas; búsqueda y ficha conservan el nombre completo. Sus pruebas
comprueban también los edificios reales sin alterar sus coordenadas.

En celular, las pestañas ocupan una segunda fila y la leyenda queda sobre las acciones.
Acercar, alejar y encuadrar los pines están disponibles. El lienzo conserva el centro y
el zoom al cambiar de tamaño, por ejemplo al girar el teléfono. Este pulido no modifica
`campus.json`, los límites de publicación ni las fichas y créditos de las fotografías.

## Entorno de Concepción sin mover el campus

El botón **Ciudad** encuadra el entorno; **Ver todos los pines** vuelve al campus o las notas.
Se puede navegar por calles y parques fuera de la U, pero la publicación sigue limitada al
contorno original, comprobado también en el servidor.

La capa `client/src/map/entorno.json` contiene 8674 formas y 277 referencias de OpenStreetMap,
bajo ODbL. Se carga en un paquete separado al abrir el mapa (aproximadamente 381 KB con gzip).
El fondo del campus se recorta a su caja para que sus formas no tapen los rótulos de la ciudad.
Las riberas abiertas se dibujan como líneas: cerrarlas crearía superficies de agua falsas.

```bash
npm run mapa:entorno              # copia local assets/mapa/osm-entorno.json
npm run mapa:entorno -- --fetch    # actualiza desde OpenStreetMap
```

El generador reusa `buildCampusMap` y comprueba el origen contra el contorno congelado de
`assets/mapa/osm-campus.json`. Falla si esa copia no corresponde a `shared/src/campus-area.json`.
No modifica `campus.json`, los edificios existentes ni `campus-area.json`. La cámara amplía
sus límites en 1830 metros por lado; las coordenadas guardadas siguen siendo las mismas.

## Alejamiento máximo

El mapa muestra como máximo una región de 3300 metros de ancho y 1750 de alto, tomando
como referencia el encuadre acordado del campus y sus alrededores. El mínimo de zoom se
calcula según la ventana; rueda, gestos, botones, Ciudad, encuadre automático y giro del
celular respetan ese mismo límite. La pizarra conserva su zoom anterior. No se modifican
la geometría del campus ni las coordenadas guardadas.
