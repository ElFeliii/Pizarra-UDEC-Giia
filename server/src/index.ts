import { buildApp } from './app';
import { loadConfig, loadDotEnv } from './config';

loadDotEnv();
const config = loadConfig();
const { app } = await buildApp(config);

if (config.env === 'development' && !process.env.MOD_USERS) {
  app.log.warn(
    'Modo desarrollo explícito: los moderadores de prueba no deben usarse en el evento.',
  );
}

await app.listen({ host: config.host, port: config.port });

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} recibido, cerrando…`);
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        app.log.error(err);
        process.exit(1);
      });
  });
}
