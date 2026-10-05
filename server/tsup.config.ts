import { defineConfig } from 'tsup';

export default defineConfig({
  // El servidor y la herramienta de datos posterior al evento (docs/DESPLIEGUE.md). En forma
  // de objeto para que la herramienta quede en dist/datos.js y no en dist/tools/datos.js.
  entry: { index: 'src/index.ts', datos: 'src/tools/datos.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // El paquete compartido es TypeScript sin compilar: se incluye en el bundle.
  noExternal: ['@pizarra/shared'],
});
