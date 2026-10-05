import type {
  HiddenReason,
  ModContentItem,
  PinSummary,
  Reply,
  Seccion,
  Tema,
  TargetType,
} from '@pizarra/shared';
import type { Config } from './config';
import { openDatabase, type DB } from './db/db';
import { createRepos, type Repos } from './db/repos';
import { loadInstitutions, type InstitutionCatalog } from './institutions';
import { Censor } from './moderation/censor';
import { createLimiters, type Limiters } from './moderation/rateLimit';
import { TopWords } from './stats/topWords';

/** Salida de eventos en tiempo real. Los servicios no conocen Socket.IO. */
export interface Broadcaster {
  pinCreated(pin: PinSummary): void;
  replyCountChanged(pinId: number, replyCount: number): void;
  vistasChanged(pinId: number, vistas: number): void;
  pinRemoved(id: number): void;
  pinRestored(pin: PinSummary): void;
  replyCreated(reply: Reply): void;
  replyRemoved(id: number, pinId: number): void;
  replyRestored(reply: Reply): void;
  userSilenced(userId: number, silenced: boolean): void;
  /** Una sección se abrió o se cerró: lo ven todos, sin recargar. */
  seccionChanged(seccion: Seccion): void;
  temaActualizado(tema: Tema): void;
  modFeed(item: ModContentItem): void;
  modReport(type: TargetType, id: number, autoHidden: boolean): void;
  modChanged(
    type: TargetType,
    id: number,
    hiddenAt: number | null,
    hiddenReason: HiddenReason | null,
  ): void;
}

const noop = () => {};
export const nullBroadcaster: Broadcaster = {
  pinCreated: noop,
  replyCountChanged: noop,
  vistasChanged: noop,
  pinRemoved: noop,
  pinRestored: noop,
  replyCreated: noop,
  replyRemoved: noop,
  replyRestored: noop,
  userSilenced: noop,
  seccionChanged: noop,
  temaActualizado: noop,
  modFeed: noop,
  modReport: noop,
  modChanged: noop,
};

export interface AppContext {
  config: Config;
  db: DB;
  repos: Repos;
  censor: Censor;
  limiters: Limiters;
  topWords: TopWords;
  institutions: InstitutionCatalog;
  broadcaster: Broadcaster;
  /** Conexiones activas (lo provee la capa de tiempo real). */
  online: () => number;
  now: () => number;
}

export function createContext(config: Config, now: () => number = Date.now): AppContext {
  const db = openDatabase(config.dbPath);
  const repos = createRepos(db);
  const censor = new Censor();
  return {
    config,
    db,
    repos,
    censor,
    limiters: createLimiters(now),
    topWords: new TopWords(repos.wordCounts, censor),
    institutions: loadInstitutions(config.institutionsPath),
    broadcaster: nullBroadcaster,
    online: () => 0,
    now,
  };
}
