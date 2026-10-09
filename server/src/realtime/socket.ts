import {
  threadRefSchema,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@pizarra/shared';
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';
import proxyaddr from 'proxy-addr';
import { Server, type Socket } from 'socket.io';
import type { Broadcaster, AppContext } from '../context';
import { MOD_COOKIE, type ModSessions } from '../http/auth';
import {
  createNota,
  createPin,
  createReply,
  findUserByToken,
  notaVisible,
  registrarVista,
} from '../services/content';
import { fail } from '../services/errors';
import { reportContent } from '../services/moderation';
import { makeTrust } from '../trust';

interface SocketData {
  userId: number | null;
  moderator: string | null;
  ip: string;
  threadId: number | null;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ClientSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const COUNTS_FLUSH_MS = 500;
const PRESENCE_MS = 5_000;
const TOP_WORDS_MS = 10_000;
const SWEEP_MS = 60_000;

export interface Realtime {
  io: IO;
  broadcaster: Broadcaster;
  close(): Promise<void>;
}

export function attachRealtime(
  app: FastifyInstance,
  ctx: AppContext,
  modSessions: ModSessions,
): Realtime {
  const trust = makeTrust(ctx.config.trustProxy);

  // SameSite no separa subdominios hermanos; WebSocket requiere comprobar el origen.
  function origenPermitido(solicitud: IncomingMessage): boolean {
    const cabecera = solicitud.headers.origin;
    // Los clientes CLI no envían Origin; los navegadores sí lo envían en WebSocket.
    if (cabecera === undefined) return true;
    try {
      const origen = new URL(cabecera);
      if (origen.origin !== cabecera || !['http:', 'https:'].includes(origen.protocol))
        return false;
      let protocolo = (solicitud.socket as { encrypted?: boolean }).encrypted ? 'https:' : 'http:';
      const reenviado = solicitud.headers['x-forwarded-proto'];
      const direccion = solicitud.socket.remoteAddress;
      if (direccion && trust(direccion, 0) && (reenviado === 'https' || reenviado === 'http')) {
        protocolo = `${reenviado}:`;
      }
      const anfitrion = solicitud.headers.host;
      if (!anfitrion) return false;
      const destino = new URL(`${protocolo}//${anfitrion}`);
      if (destino.username || destino.password) return false;
      if (origen.origin === destino.origin) return true;
      return (
        ctx.config.env === 'development' &&
        origen.protocol === protocolo &&
        origen.hostname === destino.hostname &&
        origen.port === '5173'
      );
    } catch {
      return false;
    }
  }

  const io: IO = new Server(app.server, {
    serveClient: false,
    allowRequest: (solicitud, responder) => responder(null, origenPermitido(solicitud)),
    maxHttpBufferSize: 16_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });
  function moderatorFromCookie(header: string | undefined): string | null {
    if (!header) return null;
    const raw = app.parseCookie(header)[MOD_COOKIE];
    if (!raw) return null;
    const res = app.unsignCookie(raw);
    return (res.valid && res.value && modSessions.get(res.value)) || null;
  }

  function pinPublico(id: number): boolean {
    const pin = ctx.repos.pins.get(id);
    return !!pin && notaVisible(ctx, pin);
  }

  function respuestaPublica(id: number, pinId: number): boolean {
    return ctx.repos.replies.get(id)?.hiddenAt === null && pinPublico(pinId);
  }

  // Revalidar antes de cada difusión: el barrido periódico no revoca una sesión a tiempo.
  function moderadoresVigentes(): ClientSocket[] {
    const vigentes: ClientSocket[] = [];
    for (const socket of io.sockets.sockets.values()) {
      if (!socket.rooms.has('mods')) continue;
      const nombre = moderatorFromCookie(socket.request.headers.cookie);
      socket.data.moderator = nombre;
      if (nombre) vigentes.push(socket);
      else void socket.leave('mods');
    }
    return vigentes;
  }

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const user = findUserByToken(ctx, auth?.token);
    socket.data.userId = user?.id ?? null;
    socket.data.moderator = moderatorFromCookie(socket.request.headers.cookie);
    socket.data.ip = proxyaddr(socket.request, trust);
    socket.data.threadId = null;
    next();
  });

  /** Ejecuta un handler y responde por el ack; nunca deja una excepción sin respuesta. */
  function respond<T>(socket: ClientSocket, ack: unknown, fn: () => Ack<T>): void {
    if (typeof ack !== 'function') return;
    try {
      ack(fn());
    } catch (err) {
      app.log.error({ err, socket: socket.id }, 'error en handler de socket');
      ack(fail('INTERNAL'));
    }
  }

  let presenceDirty = true;

  io.on('connection', (socket) => {
    const { userId, moderator, ip } = socket.data;
    if (userId) void socket.join(`user:${userId}`);
    if (moderator) void socket.join('mods');
    presenceDirty = true;
    socket.emit('presence:count', io.engine.clientsCount);

    socket.on('pin:create', (input, ack) =>
      respond(socket, ack, () =>
        userId
          ? createPin(ctx, userId, input, ip, moderatorFromCookie(socket.request.headers.cookie))
          : fail('NO_SESSION'),
      ),
    );
    socket.on('nota:create', (input, ack) =>
      respond(socket, ack, () =>
        userId
          ? createNota(ctx, userId, input, ip, moderatorFromCookie(socket.request.headers.cookie))
          : fail('NO_SESSION'),
      ),
    );
    socket.on('reply:create', (input, ack) =>
      respond(socket, ack, () =>
        userId
          ? createReply(ctx, userId, input, ip, moderatorFromCookie(socket.request.headers.cookie))
          : fail('NO_SESSION'),
      ),
    );
    socket.on('pin:visto', (input) => {
      try {
        registrarVista(ctx, input, ip);
      } catch (err) {
        app.log.error({ err, socket: socket.id }, 'error contando una visita');
      }
    });

    socket.on('report:create', (input, ack) =>
      respond(socket, ack, () =>
        userId ? reportContent(ctx, userId, input, ip) : fail('NO_SESSION'),
      ),
    );

    // Un socket sigue un solo hilo a la vez: evita que un cliente se suscriba a miles de salas.
    socket.on('thread:join', (payload) => {
      const p = threadRefSchema.safeParse(payload);
      if (!p.success || !pinPublico(p.data.pinId)) return;
      if (socket.data.threadId !== null) void socket.leave(`pin:${socket.data.threadId}`);
      socket.data.threadId = p.data.pinId;
      void socket.join(`pin:${p.data.pinId}`);
    });
    socket.on('thread:leave', (payload) => {
      const p = threadRefSchema.safeParse(payload);
      if (!p.success || socket.data.threadId !== p.data.pinId) return;
      void socket.leave(`pin:${p.data.pinId}`);
      socket.data.threadId = null;
    });

    socket.on('disconnect', () => {
      presenceDirty = true;
    });
  });

  // ---------- Difusión ----------

  /** Contadores por pin pendientes de enviar. Se fusionan: lo último de cada uno gana. */
  const pendingCounts = new Map<number, { replyCount?: number; vistas?: number }>();
  const acumular = (id: number, patch: { replyCount?: number; vistas?: number }) =>
    pendingCounts.set(id, { ...pendingCounts.get(id), ...patch });

  const broadcaster: Broadcaster = {
    pinCreated: (pin) => {
      if (pinPublico(pin.id)) io.emit('pin:created', pin);
    },
    replyCountChanged: (id, replyCount) => acumular(id, { replyCount }),
    vistasChanged: (id, vistas) => acumular(id, { vistas }),
    pinRemoved: (id) => {
      pendingCounts.delete(id);
      io.emit('pin:removed', { id });
    },
    pinRestored: (pin) => {
      if (pinPublico(pin.id)) io.emit('pin:restored', pin);
    },
    replyCreated: (reply) => {
      if (respuestaPublica(reply.id, reply.pinId))
        io.to(`pin:${reply.pinId}`).emit('reply:created', reply);
    },
    replyRemoved: (id, pinId) => io.to(`pin:${pinId}`).emit('reply:removed', { id, pinId }),
    replyRestored: (reply) => {
      if (respuestaPublica(reply.id, reply.pinId))
        io.to(`pin:${reply.pinId}`).emit('reply:restored', reply);
    },
    userSilenced: (uid, silenced) =>
      io.to(`user:${uid}`).emit(silenced ? 'session:silenced' : 'session:unsilenced'),
    seccionChanged: (seccion) => io.emit('seccion:estado', seccion),
    temaActualizado: (tema) => {
      const publico = !tema.oculto && ctx.repos.secciones.get(tema.seccion)?.estado !== 'oculta';
      // El cliente retira por id y oculto: no necesita recibir el título ocultado.
      io.emit(
        'tema:actualizado',
        publico
          ? tema
          : {
              id: tema.id,
              seccion: tema.seccion,
              oculto: true,
              nombre: '',
              grupo: null,
              campus: null,
              orden: 0,
            },
      );
    },
    modFeed: (item) => {
      for (const socket of moderadoresVigentes()) socket.emit('mod:feed', item);
    },
    modReport: (type, id, autoHidden) => {
      for (const socket of moderadoresVigentes())
        socket.emit('mod:report', { type, id, autoHidden });
    },
    modChanged: (type, id, hiddenAt, hiddenReason) => {
      for (const socket of moderadoresVigentes())
        socket.emit('mod:changed', { type, id, hiddenAt, hiddenReason });
    },
  };

  // Los contadores de respuestas viajan en lotes: con mucho tráfico se envía un mensaje cada
  // 500 ms en vez de uno por respuesta.
  const timers = [
    setInterval(() => {
      if (pendingCounts.size === 0) return;
      const updates = [...pendingCounts]
        .filter(([id]) => pinPublico(id))
        .map(([id, patch]) => ({ id, ...patch }));
      pendingCounts.clear();
      io.emit('pins:updated', updates);
    }, COUNTS_FLUSH_MS),
    setInterval(() => {
      if (!presenceDirty) return;
      presenceDirty = false;
      io.emit('presence:count', io.engine.clientsCount);
    }, PRESENCE_MS),
    setInterval(() => {
      const top = ctx.topWords.takeChanged();
      if (top) io.emit('words:top', top);
    }, TOP_WORDS_MS),
    setInterval(() => {
      for (const l of Object.values(ctx.limiters)) l.sweep();
      modSessions.sweep();
    }, SWEEP_MS),
  ];
  for (const t of timers) t.unref();

  return {
    io,
    broadcaster,
    async close() {
      for (const t of timers) clearInterval(t);
      await io.close();
    },
  };
}
