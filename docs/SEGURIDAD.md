# Dependencias y revisión de seguridad

Las claves reales y los datos del evento no se incluyen en Git ni en la imagen. Mantener
`.env` y `data/` fuera del repositorio, usar las credenciales individuales por un canal privado
y conservar el historial saneado para publicar. Ver [PRIVACIDAD.md](PRIVACIDAD.md).

## Herramientas de desarrollo y construcción

Se actualizaron las siguientes dependencias transitivas. El archivo raíz `package.json`
fija `shell-quote` y `esbuild` mediante `overrides`, porque las herramientas todavía solicitan
versiones afectadas; `source-map-js` se actualizó en el lockfile:

- `concurrently` usa `shell-quote@1.11.0`: corrige el [aviso de inyección de comandos](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).
- Las herramientas usan `esbuild@0.28.2`, incluido el hijo de `tsup`: corrige el [aviso del servidor de desarrollo en Windows](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
- `source-map-js@1.2.2` queda registrado en `package-lock.json`: corrige el [aviso de denegación de servicio al procesar mapas de código](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

No se cambiaron los frameworks de la aplicación. La imagen final instala solo dependencias
de producción del servidor con `--omit=dev --ignore-scripts`; las herramientas anteriores
se usan durante desarrollo o construcción. Revisar tanto esas herramientas como producción:

```bash
npm ci --ignore-scripts
npm audit
npm audit --omit=dev
npm test
npm run typecheck
npm run lint
npm run build
npm run verificar:despliegue
```

Antes de retirar los `overrides`, confirmar que las herramientas superiores ya incorporan
versiones corregidas y repetir pruebas, compilación, Docker y revisión en navegador.
No usar `npm audit fix --force` como sustituto de esa revisión: puede cambiar versiones mayores.

## Prueba de credenciales y alcance

El detector de cadenas numéricas en la configuración tiene casos de prueba con muestras
ficticias, distintos delimitadores y números que no representan contraseñas. Complementa
la inspección del repositorio; no detecta cualquier secreto ni certifica un historial entero.

La revisión npm cubre los avisos conocidos de su registro en el momento de la consulta.
La Célula inspecciona también el sistema operativo de la imagen, el host, los accesos,
el proxy y las configuraciones reales antes de aprobar el levantamiento. Los permisos,
actualizaciones, monitoreo, logs y respaldos siguen el manual y la lista final de
[ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).
