import { buildApp } from './app';
import { loadConfig, loadDotEnv } from './config';

loadDotEnv();
const config = loadConfig();
const { app } = await buildApp(config);

if (config.env !== 'production' && !process.env.MOD_PASSWORD) {
  app.log.warn('MOD_PASSWORD no definida: usando la contraseña de desarrollo "moderador-dev".');
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
