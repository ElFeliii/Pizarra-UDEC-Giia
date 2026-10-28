import type {
  BannedWord,
  BannedWordMode,
  ErrorCode,
  EstadoSeccion,
  Institution,
  ModContentItem,
  ModReportItem,
  ModStats,
  ModUser,
  PinsSnapshot,
  PublicUser,
  ResumenIa,
  Seccion,
  Tema,
  SearchHit,
  SessionInput,
  TargetType,
  Thread,
  TopWord,
} from '@pizarra/shared';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('NETWORK', 'Sin conexión con el servidor.', 0);
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : undefined;
  if (!res.ok) {
    const err = (data as { error?: { code: ErrorCode; message: string } } | undefined)?.error;
    throw new ApiError(err?.code ?? 'INTERNAL', err?.message ?? 'Error del servidor.', res.status);
  }
  return data as T;
}

const get = <T>(url: string, token?: string) => request<T>('GET', url, { token });
const post = <T>(url: string, body?: unknown) => request<T>('POST', url, { body });

export const api = {
  institutions: () => get<Institution[]>('/api/institutions'),
  createSession: (input: SessionInput) =>
    post<{ token: string; user: PublicUser }>('/api/session', input),
  verifySession: (token: string) =>
    get<{ user: PublicUser; silenced: boolean }>('/api/session', token),
  pins: (seccion: string, since?: number) =>
    get<PinsSnapshot>(`/api/pins?seccion=${seccion}${since ? `&since=${since}` : ''}`),
  thread: (pinId: number) => get<Thread>(`/api/pins/${pinId}/thread`),
  search: (q: string, seccion: string) =>
    get<SearchHit[]>(`/api/search?seccion=${seccion}&q=${encodeURIComponent(q)}`),
  topWords: () => get<TopWord[]>('/api/words/top'),
  secciones: () => get<Seccion[]>('/api/secciones'),
  temas: () => get<Tema[]>('/api/temas'),

  admin: {
    me: () => get<{ name: string }>('/api/admin/me'),
    login: (password: string, moderatorName: string) =>
      post<{ name: string }>('/api/admin/login', { password, moderatorName }),
    logout: () => post<{ ok: true }>('/api/admin/logout'),
    reports: () => get<ModReportItem[]>('/api/admin/reports'),
    feed: (limit = 150) => get<ModContentItem[]>(`/api/admin/feed?limit=${limit}`),
    content: (type: TargetType, id: number, action: 'hide' | 'restore' | 'dismiss') =>
      post<{ changed: boolean }>(`/api/admin/content/${type}/${id}/${action}`),
    users: (q: string, silencedOnly: boolean) =>
      get<ModUser[]>(
        `/api/admin/users?q=${encodeURIComponent(q)}${silencedOnly ? '&silenced=1' : ''}`,
      ),
    silence: (userId: number, silenced: boolean) =>
      post<{ changed: boolean }>(
        `/api/admin/users/${userId}/${silenced ? 'silence' : 'unsilence'}`,
      ),
    secciones: () =>
      get<{
        secciones: Seccion[];
        presets: { id: string; nombre: string; descripcion: string }[];
      }>('/api/admin/secciones'),
    setEstadoSeccion: (id: string, estado: EstadoSeccion) =>
      post<Seccion>(`/api/admin/secciones/${id}`, { estado }),
    aplicarPreset: (preset: string) =>
      post<{ cambiadas: Seccion[] }>(`/api/admin/secciones/preset/${preset}`),
    temas: () => get<Tema[]>('/api/admin/temas'),
    agregarPregunta: (nombre: string) => post<Tema>('/api/admin/secciones/faq/temas', { nombre }),
    ocultarPregunta: (id: string, oculto: boolean) =>
      post<Tema>(`/api/admin/temas/${id}/estado`, { oculto }),
    words: () => get<BannedWord[]>('/api/admin/words'),
    addWord: (term: string, mode: BannedWordMode) =>
      post<BannedWord>('/api/admin/words', { term, mode }),
    removeWord: (id: number) => request<{ ok: true }>('DELETE', `/api/admin/words/${id}`),
    applyWord: (id: number) =>
      post<{ pins: number; replies: number }>(`/api/admin/words/${id}/apply`),
    stats: () => get<ModStats>('/api/admin/stats'),
    ia: () => get<ResumenIa>('/api/admin/ia'),
  },
};
