# Verificación de la entrega

Fecha: 7 de octubre de 2026. Esta revisión comprueba las correcciones locales derivadas
del Manual de Trabajo 1.0: puerto configurable, instrucciones de instalación en GIIA,
detector de credenciales numéricas, dependencias e imagen de ejecución. También cubre
el catálogo de edificios y un ensayo de carga de esta versión. La comprobación usa
datos y credenciales ficticios en un contenedor separado del evento.

| Comprobación                            | Resultado                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                              | 361 pruebas en 27 archivos, salida 0                                                                                                                                      |
| `npm run typecheck`                     | Cliente, servidor y tipos compartidos: salida 0                                                                                                                           |
| `npm run lint`                          | Salida 0                                                                                                                                                                  |
| `npm run build`                         | Cliente y servidor construidos, salida 0                                                                                                                                  |
| Prettier                                | Aplicado y comprobado sobre los archivos modificados que tienen formato compatible                                                                                        |
| `git diff --check`                      | Sin errores de espacios                                                                                                                                                   |
| `npm audit --json`                      | Cero vulnerabilidades conocidas en el árbol completo                                                                                                                      |
| Instalación npm de producción en Docker | Cero vulnerabilidades conocidas informadas durante la construcción; npm se retira después                                                                                 |
| `npm run verificar:despliegue`          | Cuatro comprobaciones: puerto por defecto, puerto alternativo, valor vacío y rechazo de un puerto fuera de rango; salida 0                                                |
| Regresiones                             | Fichas incompletas y falso éxito de carga probados con defecto restaurado y corregido dos veces; los casos de detector y puerto se verificaron en la revisión anterior    |
| Construcción Docker                     | Instalación desde el lockfile en Linux, cliente y servidor compilados e imagen exportada; salida 0                                                                        |
| Compose                                 | Contenedor `healthy`; puerto real `127.0.0.1:3189` elegido por `.env`, sin sobrescribir `ports` en la configuración de prueba                                             |
| HTTP y WebSocket                        | Once comprobaciones correctas de salud, página, cabeceras, acceso protegido, login, control de sección, sesión, comunicación entre dos clientes, moderación y exportación |
| Usuario del contenedor                  | `node`, sin ejecutar la aplicación como root                                                                                                                              |
| Respaldo y restauración                 | SQLite en versión 5, `integrity_check=ok`, copia en caliente restaurada y contenido conservado                                                                            |
| Reinicio                                | Conserva datos y secreto persistente; permisos del secreto `600`                                                                                                          |
| Limpieza de pruebas                     | Contenedor, volumen y red separados retirados; imagen verificada conservada localmente                                                                                    |
| Navegador                               | Fotos nuevas y descripciones renderizadas en escritorio y tamaño móvil 390×844; ficha sin foto legible; cero avisos o errores de consola                                  |

Imagen verificada: `pizarra-udec:entrega-final-20261007`.
Identificador: `sha256:c9785f7f4502fe6dcced32b1243566ee755e4942b6bfc94d01ba6ccd16b84936`.
Tamaño reportado por Docker: 444171332 bytes. Motor Docker 29.8.0 y Compose 5.5.1.
Ensayo actual: `URL=http://127.0.0.1:3189 READERS=600 WRITERS=20 npm run loadtest`.
Los 600 lectores se conectaron en 1,1 segundos; se publicaron 40 pines y se recibieron
**24.000 de 24.000 entregas, sin rechazos**, salida 0. Latencia p50: 248 ms; p95: 716 ms;
p99: 765 ms; máxima: 779 ms. La muestra de RAM tomada después fue de 92,88 MiB;
no representa el máximo durante el ensayo. El generador y Docker corrieron en la misma
máquina: esto no garantiza el rendimiento del host, la red ni el proxy de GIIA.

Catálogo: 85 descripciones con fuente, 34 fotografías libres en 25 edificios. Se mantiene
una lista explícita de 60 edificios sin foto validada; ver [FOTOS-PENDIENTES.md](FOTOS-PENDIENTES.md).
Las 48 fuentes institucionales distintas respondieron por HTTP después de sustituir dos
enlaces que devolvían 404. Las otras 11 fichas usan las referencias OSM del catálogo local.
Las nuevas pruebas exigen descripción y fuente HTTPS para todos los edificios. El ensayo
de carga ahora falla ante rechazos o entregas incompletas, en lugar de reducir su meta.

Escaneo de imagen: Trivy 0.75.0 sin red, salida 0. Paquetes Node: cero avisos. Debian:
222 avisos por paquete, 93 identificadores distintos y cero con versión corregida indicada
por la base consultada. La salida 0 significa que terminó el análisis, **no que no haya
avisos**. Ver aplicabilidad de MiniZip y limitaciones en [SEGURIDAD.md](SEGURIDAD.md).

La configuración de prueba reemplaza únicamente nombre, imagen, credenciales y volumen
de datos. El puerto 3189 procede de `PUERTO_PUBLICADO` en un archivo de entorno ficticio;
la configuración Compose del proyecto conserva el puerto interno 3000 y la escucha en
loopback. No se abrió el backend a otras máquinas ni se utilizaron datos del evento.

## Alcance y límites

- Prettier no admite archivos `.env`; ese ejemplo se revisó junto con la configuración Compose. El lockfile lo genera npm y se excluye del formateo por la configuración del proyecto.
- Vite mantiene el aviso de paquetes mayores de 500 KB. La capa de ciudad se carga aparte; no se cambió la arquitectura del mapa.
- La auditoría npm indica vulnerabilidades conocidas de sus paquetes a la fecha de revisión; no certifica la imagen base, el sistema operativo, el proxy ni futuras versiones. Ver [SEGURIDAD.md](SEGURIDAD.md).
- Se comprobó el navegador en escritorio y tamaño móvil contra HTTP local. El proxy real, HTTPS, DNS, certificado y acceso público requieren el servidor y dominio asignados por GIIA.
- La copia de entrega continúa el historial saneado existente y excluye el historial de desarrollo. Las actualizaciones se publican desde esa copia separada, conservando su historial saneado. Ver [PRIVACIDAD.md](PRIVACIDAD.md).
- La imagen de prueba queda disponible localmente. El paquete de entrega contiene fuentes para construirla; no incluye el archivo de imagen Docker, datos ni credenciales del evento.

**Pendientes de GIIA:** ticket y aprobaciones, recursos y puerto asignados, acceso autorizado,
instalación en `/var/src`, dominio, DNS, HTTPS y proxy, revisión de seguridad, actualizaciones,
monitoreo externo, rotación de logs por antigüedad y respaldos mensuales 3-2-1. El detalle
para remitir a la Célula está al final de [ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).
