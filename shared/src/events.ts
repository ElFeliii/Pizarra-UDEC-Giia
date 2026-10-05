import type { NotaInput, PinInput, ReplyInput, ReportInput, VistaInput } from './schemas';
import type {
  Ack,
  Seccion,
  Tema,
  ModContentItem,
  ModReportItem,
  PinSummary,
  Reply,
  TargetType,
  TopWord,
} from './types';

export interface ServerToClientEvents {
  'pin:created': (pin: PinSummary) => void;
  /** Lote de cambios de contador, emitido como máximo cada 500 ms. Solo viaja lo que cambió. */
  'pins:updated': (updates: { id: number; replyCount?: number; vistas?: number }[]) => void;
  'pin:removed': (payload: { id: number }) => void;
  'pin:restored': (pin: PinSummary) => void;
  /** Solo a la sala del hilo (`pin:<id>`). */
  'reply:created': (reply: Reply) => void;
  'reply:removed': (payload: { id: number; pinId: number }) => void;
  'reply:restored': (reply: Reply) => void;
  /** El moderador abrió o cerró una sección: se aplica sin recargar. */
  'seccion:estado': (seccion: Seccion) => void;
  'tema:actualizado': (tema: Tema) => void;
  'words:top': (words: TopWord[]) => void;
  'presence:count': (count: number) => void;
  'session:silenced': () => void;
  'session:unsilenced': () => void;
  // Solo sala "mods"
  'mod:feed': (item: ModContentItem) => void;
  'mod:report': (item: { type: TargetType; id: number; autoHidden: boolean }) => void;
  'mod:changed': (item: Pick<ModReportItem, 'type' | 'id' | 'hiddenAt' | 'hiddenReason'>) => void;
}

export interface ClientToServerEvents {
  'pin:create': (input: PinInput, ack: (res: Ack<PinSummary>) => void) => void;
  /** Publicar en un muro: como `pin:create`, pero sin lugar. */
  'nota:create': (input: NotaInput, ack: (res: Ack<PinSummary>) => void) => void;
  'reply:create': (input: ReplyInput, ack: (res: Ack<Reply>) => void) => void;
  'report:create': (input: ReportInput, ack: (res: Ack<{ received: true }>) => void) => void;
  /** "Abrí esta nota": no lleva ack, es un aviso suelto. */
  'pin:visto': (input: VistaInput) => void;
  'thread:join': (payload: { pinId: number }) => void;
  'thread:leave': (payload: { pinId: number }) => void;
}
