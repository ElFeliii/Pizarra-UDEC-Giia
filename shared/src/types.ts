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
export type HiddenReason = 'mod' | 'reports' | 'word';

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
