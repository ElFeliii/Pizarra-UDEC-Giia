/** Tamaño del lienzo en unidades de mundo (cuadrado). */
export const BOARD_SIZE = 8000;

/** Superficies donde puede vivir un pin: la pizarra libre y el mapa del campus. */
export const SURFACES = ['board', 'map'] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * Estado de una sección, que fija el moderador y manda sobre todos por igual:
 *  - `abierta`      se lee y se escribe;
 *  - `solo_lectura` se lee, no se publica (es el modo del día de puertas abiertas);
 *  - `oculta`       no aparece en la navegación.
 */
export const ESTADOS_SECCION = ['abierta', 'solo_lectura', 'oculta'] as const;
export type EstadoSeccion = (typeof ESTADOS_SECCION)[number];

/**
 * Cómo se dibuja una sección:
 *  - `lienzo`   notas con coordenadas que se arrastran (la pizarra y el mapa);
 *  - `muro`     notas en lista, agrupadas o no por un tema;
 *  - `encuesta` preguntas prediseñadas con opciones y votos.
 */
export const TIPOS_SECCION = ['lienzo', 'muro', 'encuesta'] as const;
export type TipoSeccion = (typeof TIPOS_SECCION)[number];

/** Las dos superficies del lienzo son secciones como cualquier otra. */
export const SECCION_DE_SUPERFICIE: Record<Surface, string> = {
  board: 'pizarra',
  map: 'mapa',
};

/**
 * Los cuatro colores, y lo que significa cada uno. No son decoración: quien mira el mapa
 * entiende de qué se trata cada pin sin abrirlo, y por eso se eligen por su significado.
 *
 * `hex` es el color del pin (mapa) y `paper` el tono de papel del post-it (pizarra); el
 * garabato se dibuja con `hex` a baja opacidad.
 */
export const PIN_COLORS = [
  {
    id: 'verde',
    label: 'Mensaje',
    significado: 'Una idea, un comentario o un saludo',
    hex: '#30A46C',
    paper: '#C2EDD5',
  },
  {
    id: 'rojo',
    label: 'Ubicación',
    significado: 'Dónde queda algo, o cómo llegar',
    hex: '#E5484D',
    paper: '#FFC9C7',
  },
  {
    id: 'azul',
    label: 'Evento',
    significado: 'Algo que pasa en la Universidad',
    hex: '#3E63DD',
    paper: '#CFD9FB',
  },
  {
    id: 'morado',
    label: 'Pregunta',
    significado: 'Una duda que alguien puede responder',
    hex: '#8E4EC6',
    paper: '#E2D0F6',
  },
] as const;
export type PinColorId = (typeof PIN_COLORS)[number]['id'];
export const PIN_COLOR_IDS = PIN_COLORS.map((c) => c.id) as [PinColorId, ...PinColorId[]];
export const PIN_COLOR_HEX: Record<PinColorId, string> = Object.fromEntries(
  PIN_COLORS.map((c) => [c.id, c.hex]),
) as Record<PinColorId, string>;
export const PAPER_HEX: Record<PinColorId, string> = Object.fromEntries(
  PIN_COLORS.map((c) => [c.id, c.paper]),
) as Record<PinColorId, string>;

export const LIMITS = {
  name: { min: 2, max: 40 },
  institutionOther: { min: 2, max: 80 },
  pin: { min: 1, max: 280 },
  reply: { min: 1, max: 500 },
  reportReason: { max: 200 },
  search: { min: 2, max: 60 },
  moderatorName: { min: 2, max: 40 },
  bannedTerm: { min: 2, max: 60 },
  /** Largo del preview que viaja en los resúmenes de pin. */
  preview: 80,
} as const;

export const ZOOM = {
  min: 0.1,
  max: 4,
  /** Bajo este zoom los pines se dibujan como puntos. */
  lodDot: 0.4,
  /** Desde este zoom se muestra la etiqueta con el preview (la vista inicial es 1). */
  lodLabel: 0.9,
} as const;

export const PIN_RADIUS = { base: 12, k: 5, max: 48 } as const;

/** Radio del pin según su número de respuestas visibles. Crece con la raíz para no tapar la pizarra. */
export function pinRadius(replyCount: number): number {
  const n = Math.max(0, replyCount);
  return Math.min(PIN_RADIUS.max, PIN_RADIUS.base + PIN_RADIUS.k * Math.sqrt(n));
}

/**
 * Cuánto pesa una nota. Una respuesta vale varias visitas: quien se toma el trabajo de
 * contestar dice más sobre el interés que quien solo abrió.
 */
export const PESO = { porRespuesta: 3, maximo: 300, curva: 0.75 } as const;

/** Tamaño base del post-it en unidades de mundo, y cuánto puede llegar a crecer. */
export const POSTIT = { base: 64, escalaMaxima: 5 } as const;

/**
 * Cuánto se agranda una nota respecto de su tamaño base, entre 1 y 5.
 *
 * La curva se aplana hacia arriba: las primeras visitas casi no se notan y el tamaño hay que
 * ganárselo, pero una nota muy popular tampoco se come la pizarra. Con el tope en 300 de peso,
 * en un evento de varios cientos de personas solo unas pocas notas llegan al máximo, que es
 * justo lo que las hace destacar.
 *
 * Vive acá, en el paquete compartido, porque el cliente la usa para dibujar y el servidor para
 * ordenar: tienen que coincidir.
 */
export function escalaNota(replyCount = 0, vistas = 0): number {
  const peso = Math.max(0, replyCount) * PESO.porRespuesta + Math.max(0, vistas);
  const avance = Math.min(1, Math.pow(peso / PESO.maximo, PESO.curva));
  return 1 + (POSTIT.escalaMaxima - 1) * avance;
}

/** Lado del post-it de la pizarra, en unidades de mundo. */
export function postitSize(replyCount = 0, vistas = 0): number {
  return POSTIT.base * escalaNota(replyCount, vistas);
}

/** Id de la opción "Otra" en la lista de instituciones (activa el campo de texto libre). */
export const OTHER_INSTITUTION_ID = 'otra';

export const TOP_WORDS_COUNT = 20;
