import type {
  PinColorId,
  PinSummary,
  PinsSnapshot,
  PublicUser,
  Seccion,
  Tema,
  Surface,
  TopWord,
} from '@pizarra/shared';
import { create } from 'zustand';
import { storage } from '../lib/storage';

const SESSION_KEY = 'pizarra.session.v1';

/** Con qué se abre la página: lo primero que se ve son los pines sobre el mapa. */
export const SECCION_INICIAL = 'mapa';

/** La superficie del lienzo que le corresponde a una sección. */
function superficieDe(seccion: string): Surface {
  return seccion === 'mapa' ? 'map' : 'board';
}

export interface Session {
  token: string;
  user: PublicUser;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

/**
 * Lo que hay que hacer cuando alguien quiere participar sin haber dado su nombre: se le pide,
 * y al terminar sigue sola la acción que lo gatilló, en vez de obligarlo a repetirla.
 */
export interface Registro {
  motivo: string;
  alTerminar?: () => void;
}

interface State {
  session: Session | null;
  /** Hoja de registro abierta, con el motivo por el que se pide. */
  registro: Registro | null;
  silenced: boolean;
  moderator: string | null;

  /** Sección que se está viendo. Es el eje: las notas, la búsqueda y los permisos cuelgan de acá. */
  seccion: string;
  /** Superficie del lienzo correspondiente. Solo se usa cuando la sección es un lienzo. */
  surface: Surface;
  /** En el mapa se pueden ocultar los pines para ubicarse mejor. */
  showPins: boolean;
  /** Edificio cuya ficha está abierta (solo en el mapa). */
  openBuildingId: string | null;

  /** Estado de cada sección, como lo dejó el moderador. */
  secciones: Map<string, Seccion>;
  seccionesCargadas: boolean;
  temas: Map<string, Tema>;
  temasCargados: boolean;
  temaId: string | null;

  pins: Map<number, PinSummary>;
  /** serverTime del último snapshot/delta: base para la sincronización incremental. */
  lastSync: number;
  loaded: boolean;
  online: number;
  connected: boolean;
  topWords: TopWord[];

  openPinId: number | null;
  /** Pines que coinciden con la búsqueda activa (null = sin filtro). */
  highlight: Set<number> | null;
  /** Pines nuevos que deben "pulsar" unos segundos. */
  fresh: Set<number>;
  placing: { color: PinColorId } | null;
  /** Texto de búsqueda activo (lo comparten la barra de búsqueda y "palabras más repetidas"). */
  search: string;
  toasts: Toast[];

  setSession(s: Session | null): void;
  /** Abre la hoja de registro. Si ya hay sesión, ejecuta la acción de inmediato. */
  pedirRegistro(motivo: string, alTerminar?: () => void): void;
  cerrarRegistro(): void;
  setSilenced(v: boolean): void;
  setModerator(name: string | null): void;
  setSeccion(id: string): void;
  setSecciones(list: Seccion[]): void;
  applySeccion(seccion: Seccion): void;
  setTemas(temas: Tema[]): void;
  aplicarTema(tema: Tema): void;
  elegirTema(id: string | null): void;
  togglePins(): void;
  openBuilding(id: string): void;
  closeBuilding(): void;
  applySnapshot(snap: PinsSnapshot, full: boolean): void;
  upsertPin(pin: PinSummary, fresh?: boolean): void;
  removePin(id: number): void;
  updateCounts(updates: { id: number; replyCount?: number; vistas?: number }[]): void;
  setOnline(n: number): void;
  setConnected(v: boolean): void;
  setTopWords(w: TopWord[]): void;
  openPin(id: number | null): void;
  setHighlight(ids: Set<number> | null): void;
  startPlacing(color: PinColorId): void;
  setPlacingColor(color: PinColorId): void;
  cancelPlacing(): void;
  setSearch(q: string): void;
  toast(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

let toastSeq = 0;
const FRESH_MS = 3000;

export const useStore = create<State>()((set, get) => ({
  session: storage.get<Session>(SESSION_KEY),
  registro: null,
  silenced: false,
  moderator: null,
  seccion: SECCION_INICIAL,
  surface: superficieDe(SECCION_INICIAL),
  showPins: true,
  openBuildingId: null,
  secciones: new Map(),
  seccionesCargadas: false,
  temas: new Map(),
  temasCargados: false,
  temaId: null,
  pins: new Map(),
  lastSync: 0,
  loaded: false,
  online: 0,
  connected: false,
  topWords: [],
  openPinId: null,
  highlight: null,
  fresh: new Set(),
  placing: null,
  search: '',
  toasts: [],

  setSession(s) {
    if (s) storage.set(SESSION_KEY, s);
    else storage.remove(SESSION_KEY);
    const pendiente = s ? get().registro?.alTerminar : undefined;
    set({ session: s, silenced: false, registro: null });
    // Se retoma lo que la persona estaba haciendo cuando se le pidió el nombre.
    if (pendiente) pendiente();
  },

  pedirRegistro(motivo, alTerminar) {
    if (get().session) {
      alTerminar?.();
      return;
    }
    set({ registro: { motivo, alTerminar }, placing: null });
  },
  cerrarRegistro: () => set({ registro: null }),
  setSilenced: (silenced) => set({ silenced }),
  setModerator: (moderator) => set({ moderator }),

  setSeccion(id) {
    if (get().seccion === id) return;
    // Cada sección tiene sus propias notas: se vacían y se vuelven a pedir.
    set({
      seccion: id,
      temaId: null,
      registro: null,
      surface: superficieDe(id),
      pins: new Map(),
      lastSync: 0,
      loaded: false,
      openPinId: null,
      openBuildingId: null,
      placing: null,
      highlight: null,
      search: '',
    });
  },
  setSecciones(list) {
    set({ secciones: new Map(list.map((x) => [x.id, x])), seccionesCargadas: true });
    if (
      !get().secciones.has(get().seccion) ||
      get().secciones.get(get().seccion)?.estado === 'oculta'
    ) {
      const siguiente = ordenarSecciones(get().secciones)[0];
      if (siguiente) get().setSeccion(siguiente.id);
      else set({ pins: new Map(), openPinId: null, temaId: null, registro: null, placing: null });
    }
  },
  applySeccion(seccion) {
    const secciones = new Map(get().secciones);
    secciones.set(seccion.id, seccion);
    // Si cerraron la sección mientras alguien escribía, se cancela lo que tenía a medias.
    const enEstaSeccion = get().seccion === seccion.id;
    get().setSecciones([...secciones.values()]);
    set({
      placing: enEstaSeccion && seccion.estado !== 'abierta' ? null : get().placing,
    });
  },

  setTemas(temas) {
    const mapa = new Map(temas.map((tema) => [tema.id, tema]));
    const temaId = get().temaId;
    const pins = new Map([...get().pins].filter(([, pin]) => !pin.temaId || mapa.has(pin.temaId)));
    const openPinId = get().openPinId;
    set({
      temas: mapa,
      temasCargados: true,
      pins,
      openPinId: openPinId !== null && !pins.has(openPinId) ? null : openPinId,
    });
    if (temaId && !mapa.has(temaId)) get().elegirTema(null);
  },
  aplicarTema(tema) {
    const temas = new Map(get().temas);
    if (tema.oculto) temas.delete(tema.id);
    else temas.set(tema.id, tema);
    const pins = new Map(get().pins);
    if (tema.oculto) for (const [id, pin] of pins) if (pin.temaId === tema.id) pins.delete(id);
    const openPinId = get().openPinId;
    set({ temas, pins, openPinId: openPinId !== null && !pins.has(openPinId) ? null : openPinId });
    if (tema.oculto && get().temaId === tema.id) get().elegirTema(null);
  },
  elegirTema(temaId) {
    const tema = temaId ? get().temas.get(temaId) : undefined;
    if (temaId && (!tema || tema.oculto || tema.seccion !== get().seccion)) return;
    set({ temaId, registro: null, openPinId: null, highlight: null, search: '' });
  },

  togglePins: () => set({ showPins: !get().showPins, openPinId: null }),
  openBuilding: (openBuildingId) => set({ openBuildingId, openPinId: null }),
  closeBuilding: () => set({ openBuildingId: null }),

  applySnapshot(snap, full) {
    const pins = full ? new Map<number, PinSummary>() : new Map(get().pins);
    for (const p of snap.pins) {
      if (p.temaId && get().temasCargados && !get().temas.has(p.temaId)) continue;
      const anterior = pins.get(p.id);
      pins.set(p.id, anterior && anterior.updatedAt > p.updatedAt ? anterior : p);
    }
    for (const id of snap.removed) pins.delete(id);
    const openPinId = get().openPinId;
    set({
      pins,
      lastSync: snap.serverTime,
      loaded: true,
      openPinId: openPinId !== null && !pins.has(openPinId) ? null : openPinId,
    });
  },

  upsertPin(pin, fresh = false) {
    if (pin.temaId && get().temasCargados && !get().temas.has(pin.temaId)) return;
    const pins = new Map(get().pins);
    const prev = pins.get(pin.id);
    // Un evento atrasado no debe pisar un contador más nuevo.
    pins.set(pin.id, prev && prev.updatedAt > pin.updatedAt ? prev : pin);
    const patch: Partial<State> = { pins };
    if (fresh && !prev) {
      const f = new Set(get().fresh);
      f.add(pin.id);
      patch.fresh = f;
      setTimeout(() => {
        const next = new Set(get().fresh);
        next.delete(pin.id);
        set({ fresh: next });
      }, FRESH_MS);
    }
    set(patch);
  },

  removePin(id) {
    if (!get().pins.has(id)) return;
    const pins = new Map(get().pins);
    pins.delete(id);
    set({ pins, openPinId: get().openPinId === id ? null : get().openPinId });
  },

  updateCounts(updates) {
    const current = get().pins;
    let pins: Map<number, PinSummary> | null = null;
    for (const u of updates) {
      const p = current.get(u.id);
      if (!p) continue;
      const replyCount = u.replyCount ?? p.replyCount;
      const vistas = u.vistas ?? p.vistas;
      if (replyCount === p.replyCount && vistas === p.vistas) continue;
      pins ??= new Map(current);
      pins.set(u.id, { ...p, replyCount, vistas });
    }
    if (pins) set({ pins });
  },

  setOnline: (online) => set({ online }),
  setConnected: (connected) => set({ connected }),
  setTopWords: (topWords) => set({ topWords }),
  openPin: (openPinId) => set({ openPinId }),
  setHighlight: (highlight) => set({ highlight }),
  startPlacing: (color) => set({ placing: { color }, openPinId: null }),
  setPlacingColor: (color) => set({ placing: { color } }),
  cancelPlacing: () => set({ placing: null }),
  setSearch: (search) => set(search.trim() ? { search } : { search, highlight: null }),

  toast(message, kind = 'info') {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-2), { id, message, kind }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** true si en la sección que se está viendo se puede publicar ahora. */
export function puedePublicar(state: State): boolean {
  return state.secciones.get(state.seccion)?.estado === 'abierta';
}

/**
 * Las secciones en orden, para la navegación.
 *
 * Recibe el mapa y no el estado completo a propósito: devuelve un arreglo nuevo cada vez, así
 * que tiene que usarse con `useMemo` sobre el mapa, que sí es estable. Pasárselo a `useStore`
 * directamente provoca un bucle infinito de render.
 */
export function ordenarSecciones(secciones: Map<string, Seccion>): Seccion[] {
  return [...secciones.values()]
    .filter((seccion) => seccion.estado !== 'oculta')
    .sort((a, b) => a.orden - b.orden);
}
