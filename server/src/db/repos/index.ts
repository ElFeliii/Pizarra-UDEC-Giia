import type { DB } from '../db';
import { createModRepo } from './mod';
import { createModLogRepo } from './modlog';
import { createPinsRepo } from './pins';
import { createRepliesRepo } from './replies';
import { createReportsRepo } from './reports';
import { createSeccionesRepo } from './secciones';
import { createSearchRepo } from './search';
import { crearTemasRepo } from './temas';
import { createUsersRepo } from './users';
import { createBannedWordsRepo, createWordCountsRepo } from './words';

/** Todas las sentencias se preparan una sola vez al arrancar. */
export function createRepos(db: DB) {
  return {
    users: createUsersRepo(db),
    pins: createPinsRepo(db),
    replies: createRepliesRepo(db),
    reports: createReportsRepo(db),
    secciones: createSeccionesRepo(db),
    temas: crearTemasRepo(db),
    bannedWords: createBannedWordsRepo(db),
    wordCounts: createWordCountsRepo(db),
    search: createSearchRepo(db),
    modLog: createModLogRepo(db),
    mod: createModRepo(db),
  };
}
export type Repos = ReturnType<typeof createRepos>;
