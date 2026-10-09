# Verificación de la entrega

Cierre documental y comprobación del código: **9 de octubre de 2026**. Se volvió a leer
el Manual de Trabajo 1.0 completo y se contrastó con configuración, código y guías.
La imagen, la carga, la recuperación y el navegador se ensayaron el **8 de octubre**;
el 9 se volvió a iniciar la imagen recuperada y se repitieron los once controles HTTP/WebSocket.
Todas las operaciones usaron credenciales y datos ficticios, separados del evento.

| Comprobación                        | Resultado                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                          | 394 pruebas en 30 archivos; ninguna fallida ni omitida, salida 0                                                                                                                          |
| `npm run typecheck`                 | Cliente, servidor y tipos compartidos: salida 0                                                                                                                                           |
| `npm run lint`                      | Salida 0                                                                                                                                                                                  |
| `npm run build`                     | Cliente y servidor construidos; salida 0                                                                                                                                                  |
| Prettier y `git diff --check`       | Archivos modificados con formato compatible comprobados; sin errores de espacios                                                                                                          |
| `npm audit --json`                  | Cero vulnerabilidades conocidas en el árbol completo; salida 0                                                                                                                            |
| Instalación de producción en Docker | Cero avisos npm durante la construcción; npm y Corepack retirados de la etapa final                                                                                                       |
| `npm run verificar:despliegue`      | Puerto por defecto, alternativo, vacío y rechazo de fuera de rango; cuatro casos, salida 0                                                                                                |
| Regresiones nuevas                  | Revocación de sesiones, origen WebSocket, difusión y ranking ocultos, claves de producción y consultas administrativas inválidas; defecto reintroducido y corrección restaurada dos veces |
| Construcción Docker                 | `--pull --no-cache`, dependencias del lockfile, actualizaciones APT y compilación Linux; salida 0                                                                                         |
| Compose                             | `healthy`; puerto real `127.0.0.1:3189` elegido por entorno, sin reemplazar `ports`                                                                                                       |
| HTTP y WebSocket                    | Once controles: salud, HTML/cabeceras, acceso protegido, login, secciones, sesión, transmisión entre clientes, moderación y CSV sin IP                                                    |
| Usuario del contenedor              | `node`, UID/GID 1000; sin modo privilegiado                                                                                                                                               |
| Copia en caliente                   | Copia SQLite legible, esquema v5, integridad y contenido conservados                                                                                                                      |
| Respaldo completo en frío           | Copia de todo el volumen con Compose, configuración ficticia y exportación de la imagen exacta                                                                                            |
| Validación del respaldo             | Fragmento exacto de DESPLIEGUE ejecutado con UID 65534: copia temporal de DB/WAL/SHM, integridad correcta y huellas del respaldo sin cambios                                              |
| Recuperación                        | Imagen importada sin reconstruir, datos y secreto recuperados en otro volumen, permisos del secreto 600 y volumen anterior conservado durante el ensayo                                   |
| Limpieza                            | Contenedor, ambos volúmenes ficticios y red retirados; imagen probada conservada localmente                                                                                               |
| Navegador                           | Fichas con fotos/descripciones en escritorio y 390×844; login, creación, ocultación y restauración de FAQ entre dos pestañas; cero avisos o errores de consola                            |

Imagen: `pizarra-udec:revision-20261008`.
Identificador: `sha256:48053127d6e3a276603365848b7add1f5701a590a001e8690ebfc12481668a4a`.
Tamaño informado por Docker: **444201242 bytes**. Motor 29.8.0 y Compose 5.5.1.
La imagen incluye las correcciones actuales del servidor; las guías quedan fuera de su contexto.

## Carga y recuperación

El ensayo `URL=http://127.0.0.1:3189 READERS=600 WRITERS=20 npm run loadtest` conectó
600 lectores en 1,1 segundos, publicó 40 pines y recibió **24.000 de 24.000 entregas,
sin rechazos**, salida 0. Latencia p50: 313 ms; p95: 767 ms; p99: 817 ms; máxima: 827 ms.
La muestra posterior de RAM fue 79,99 MiB: no mide el máximo durante la prueba.
Generador y Docker corrieron en la misma máquina; esto no garantiza la capacidad de GIIA.

La recuperación cambió primero el servicio ficticio a otra imagen y después recuperó el
identificador guardado mediante `docker image load`, sin reconstruir. Se compararon datos,
secreto e integridad con el estado anterior. Se corrigió el paso de validación de la guía:
una base en modo WAL puede necesitar auxiliares aunque se abra de sólo lectura.
El bind del respaldo conserva sólo lectura y la verificación usa una copia temporal.

Se verificaron los mecanismos de copia, importación y recuperación en Docker local.
Las rutas `/var/src`, `sudo`, cuentas y permisos del anfitrión Linux, renombrado de directorios,
configuración institucional y destinos externos requieren un ensayo de la Célula.

## Seguridad y catálogo

El servidor revalida sesiones antes de enviar eventos privados y comprueba el origen de
WebSocket. Las notas y respuestas se difunden sólo si su padre, sección y tema son públicos.
Las retiradas de preguntas no transmiten títulos privados; el ranking excluye contenido oculto
y repara contadores anteriores al arrancar. Las claves individuales de producción deben tener
12 caracteres como mínimo y se rechazan los marcadores de desarrollo/ejemplo. Las consultas
administrativas inválidas responden 400 en lugar de 500. Estas pruebas usan ejemplos ficticios.

Trivy 0.75.0 analizó la imagen exportada **sin red**. Paquetes Node: cero avisos.
Debian: **222 avisos por paquete, 93 identificadores distintos**, sin versión corregida indicada
en la base consultada. Salida 0 significa análisis terminado, no ausencia de avisos.
La fecha de la base y el detalle están en [seguridad-imagen.json](seguridad-imagen.json).
Ver aplicabilidad de MiniZip y límites en [SEGURIDAD.md](SEGURIDAD.md).

El catálogo conserva 85 descripciones con fuente y 34 fotos libres en 25 edificios.
Quedan 60 edificios sin fotografía libre validada: [FOTOS-PENDIENTES.md](FOTOS-PENDIENTES.md).
No se modificaron geometría, IDs del mapa ni migraciones publicadas.

## Límites de la entrega

- Vite conserva su aviso de paquetes mayores de 500 KB; la capa de ciudad se descarga aparte.
- Prettier no admite `.env`; el ejemplo se revisa como configuración. npm genera el lockfile.
- Los controles locales y npm no certifican ausencia de vulnerabilidades ni validan el host o proxy.
- El navegador se comprobó contra HTTP local: dominio, DNS, HTTPS y acceso externo siguen pendientes.
- La entrega excluye historial de desarrollo, documento interno, datos y credenciales; conserva el historial saneado de publicación. Ver [PRIVACIDAD.md](PRIVACIDAD.md).
- El paquete contiene fuentes para construir la imagen; no incluye `imagen.tar` ni respaldos operativos.

**Pendientes GIIA:** ticket, aprobaciones, recursos, accesos, instalación en `/var/src`, dominio,
DNS, TLS/proxy, evaluación de avisos y host, mantenimiento, incidentes, monitoreo externo,
retención de logs y respaldos mensuales 3-2-1. Lista en [ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).
Documento principal para informática: [GUIA-INFORMATICA.md](GUIA-INFORMATICA.md).
