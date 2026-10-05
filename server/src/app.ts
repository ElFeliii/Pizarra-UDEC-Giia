import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { Config } from './config';
import { createContext } from './context';
import { adminRoutes } from './http/admin';
import { ModSessions } from './http/auth';
import { publicRoutes } from './http/public';
import { attachRealtime } from './realtime/socket';
import { reloadCensor, seedWordlist } from './services/moderation';
import { seedSecciones } from './services/secciones';
import { seedTemas } from './services/temas';
import { makeTrust } from './trust';

export async function buildApp(config: Config) {
  const ctx = createContext(config);
  const nuevas = seedWordlist(ctx);
  const nuevasSecciones = seedSecciones(ctx, config.seccionesPath);
  seedTemas(ctx, config.carrerasPath, 'carreras');
  seedTemas(ctx, config.faqPath, 'faq');
  reloadCensor(ctx);

  const app = Fastify({
    logger:
      config.env === 'test' ? false : { level: config.env === 'production' ? 'info' : 'debug' },
    trustProxy: makeTrust(config.trustProxy),
    bodyLimit: 16 * 1024,
  });

  if (nuevas > 0) app.log.info(`Lista de palabras: ${nuevas} términos nuevos agregados.`);
  if (nuevasSecciones > 0) app.log.info(`Secciones: ${nuevasSecciones} agregadas.`);

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(compress, { threshold: 1024 });

  const modSessions = new ModSessions();
  publicRoutes(app, ctx);
  await app.register(adminRoutes, { ctx, modSessions });

  // Cliente compilado (en producción el mismo servidor entrega la página).
  if (existsSync(join(config.clientDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: config.clientDist,
      wildcard: false,
      // Los archivos de assets/ llevan hash en el nombre: se pueden cachear para siempre.
      setHeaders(reply, path) {
        reply.header(
          'cache-control',
          path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/socket.io')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No encontrado.' } });
      }
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  }

  const realtime = attachRealtime(app, ctx, modSessions);
  ctx.broadcaster = realtime.broadcaster;
  ctx.online = () => realtime.io.engine.clientsCount;

  app.addHook('onClose', async () => {
    await realtime.close();
    ctx.db.close();
  });

  return { app, ctx, io: realtime.io };
}
