import type { EstadoSeccion, PinColorId, Surface, TipoSeccion } from './constants';

/** Una sección de la página, con el estado que fija el moderador. */
export interface Seccion {
  id: string;
  tipo: TipoSeccion;
  nombre: string;
  orden: number;
  estado: EstadoSeccion;
  updatedAt: number;
}

export interface Tema {
  id: string;
  seccion: string;
  nombre: string;
  /** Facultad o escuela del catálogo oficial de carreras. */
  grupo: string | null;
  campus: string | null;
  orden: number;
  oculto: boolean;
}

export type InstitutionType = 'colegio' | 'universidad' | 'otra';

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  /** Comuna del establecimiento: distingue colegios que se llaman igual. */
  comuna?: string;
}

export interface PublicUser {
  id: number;
  name: string;
  institutionName: string;
}

/** Lo mínimo para dibujar un pin en la pizarra. */
export interface PinSummary {
  id: number;
  /** Sección donde vive: 'pizarra', 'mapa', 'consejos'… */
  seccion: string;
  temaId: string | null;
  /** Superficie del lienzo. Solo significa algo en la pizarra y el mapa. */
  surface: Surface;
  x: number;
  y: number;
  color: PinColorId;
  replyCount: number;
  /** Personas distintas que abrieron la nota. Junto a las respuestas define su tamaño. */
  vistas: number;
  preview: string;
  authorId: number;
  authorName: string;
  /** Nombre autenticado al publicar; no se deduce del nombre del asistente. */
  autorModerador?: string | null;
  institutionName: string;
  createdAt: number;
  updatedAt: number;
}

export interface PinDetail extends PinSummary {
  text: string;
}

export interface Reply {
  id: number;
  pinId: number;
  text: string;
  authorId: number;
  authorName: string;
  /** Nombre autenticado al publicar; no se deduce del nombre del asistente. */
  autorModerador?: string | null;
  institutionName: string;
  createdAt: number;
}

export interface Thread {
  pin: PinDetail;
  replies: Reply[];
}

export interface PinsSnapshot {
  pins: PinSummary[];
  /** Ids ocultados desde `since` (solo en sincronización incremental). */
  removed: number[];
  serverTime: number;
}

export interface TopWord {
  word: string;
  count: number;
}

export interface SearchHit {
  kind: 'pin' | 'reply';
  refId: number;
  pinId: number;
  snippet: string;
  authorName: string;
  institutionName: string;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'CENSORED'
  | 'IA_RECHAZADO'
  | 'EN_REVISION'
  | 'LINKS'
  | 'PERSONAL_DATA'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'SILENCED'
  | 'SECCION_CERRADA'
  | 'NO_SESSION'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'INTERNAL';

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// ---------- Moderación ----------

export type TargetType = 'pin' | 'reply';
/** `pendiente`: la IA no respondió y el mensaje espera que un moderador lo apruebe. */
export type HiddenReason = 'mod' | 'reports' | 'word' | 'pendiente';

export interface ModContentItem {
  type: TargetType;
  id: number;
  pinId: number;
  text: string;
  authorId: number;
  authorName: string;
  institutionName: string;
  createdAt: number;
  hiddenAt: number | null;
  hiddenReason: HiddenReason | null;
  hiddenBy: string | null;
  reportCount: number;
}

export interface ModReportItem {
  type: TargetType;
  id: number;
  pinId: number;
  text: string;
  authorId: number;
  authorName: string;
  institutionName: string;
  createdAt: number;
  hiddenAt: number | null;
  hiddenReason: HiddenReason | null;
  reportCount: number;
  reasons: string[];
  lastReportAt: number;
}

export type BannedWordMode = 'exact' | 'prefix' | 'contains';

export interface BannedWord {
  id: number;
  term: string;
  mode: BannedWordMode;
  createdBy: string;
  createdAt: number;
}

export interface ModUser {
  id: number;
  name: string;
  institutionName: string;
  createdAt: number;
  silencedAt: number | null;
  pinCount: number;
  replyCount: number;
}

/** Qué se hizo con un mensaje tras consultar a la IA. */
export type DecisionIa = 'publicar' | 'rechazar' | 'revisar';

/** Una consulta a la API de moderación, tal como la ve el panel. */
export interface RegistroIa {
  at: number;
  decision: DecisionIa;
  /** Cuánto tardó OpenAI en responder (o en fallar). */
  ms: number;
  autor: string;
  texto: string;
  /** Categorías que OpenAI marcó. */
  categorias: string[];
  /** Las categorías con mayor puntaje (0 a 1), aunque no se hayan marcado. */
  puntajes: { categoria: string; puntaje: number }[];
  /** Motivo de la falla cuando la decisión es `revisar`. */
  error: string | null;
}

export interface ResumenIa {
  activa: boolean;
  /** `moderation`: API de moderación. `decision`: API Decisions con las normas propias. */
  modo: 'moderation' | 'decision' | null;
  modelo: string | null;
  /** Totales desde que arrancó el servidor. */
  totales: Record<DecisionIa, number>;
  msPromedio: number | null;
  /** Las consultas más recientes primero. */
  registros: RegistroIa[];
}

export interface ModStats {
  users: number;
  pins: number;
  replies: number;
  hiddenPins: number;
  hiddenReplies: number;
  pendingReports: number;
  online: number;
  byInstitution: { institutionName: string; users: number; pins: number; replies: number }[];
}
