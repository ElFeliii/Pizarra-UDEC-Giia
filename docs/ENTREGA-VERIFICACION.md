# Verificación de la entrega

## Entrega vigente: revisión ampliada del 14 de octubre de 2026

Esta versión incorpora los seis hallazgos adicionales y el presupuesto HTTP del ranking
con revisión persistente. El código, las nuevas pruebas y las guías se entregan juntos.
No se modificaron las migraciones, dependencias, cliente, mapa ni catálogos.
Las cifras del cierre original, conservadas más abajo, son antecedentes.

| Comprobación                   | Resultado de esta versión                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Suite completa                 | **523 pruebas en 42 archivos**, ninguna fallida ni omitida; salida 0.                                                                    |
| Tipos, lint y compilación      | Salidas 0. Vite mantiene el aviso conocido de paquete mayor de 500 KB.                                                                   |
| Prettier y diff                | Archivos tocados con formato comprobado y sin errores de espacios.                                                                       |
| Regresiones                    | Doble rojo/verde de los seis hallazgos y del presupuesto del ranking.                                                                    |
| npm audit                      | Cero avisos conocidos; lockfile y dependencias sin cambios.                                                                              |
| Compose                        | Ocho comprobaciones de puerto y confianza, salida 0.                                                                                     |
| Nginx con caché de 200 por URL | Respuestas privadas con `no-store`; sin cookie reciben 401, sin feed oculto ni usuarios; también después de logout.                      |
| Nginx HTTPS/WSS/polling        | 20 controles, incluyendo firma, origen, moderación, CSV y 55 segundos de continuidad; salida 0.                                          |
| Carga WebSocket                | 600 lectores, 20 escritores, 40 publicaciones, **24.000/24.000 entregas**, cero rechazos; salida 0.                                      |
| CLI compilado                  | Otra ejecución invalida el ranking caliente; procedimiento detener/vista previa/borrar/reiniciar/comprobar ensayado con datos ficticios. |
| Guías                          | Enlaces y anclas locales, sintaxis Bash y procedimiento de mantenimiento comprobados.                                                    |

Imagen probada: `pizarra-udec:seguridad-ampliada-20261014`, identificador
`sha256:0c24aeab2f2329e7cf43f792e8001c752bf1fe99191db0824a2193f40472ccc5`, tamaño **444232817 bytes**.
Node `v22.23.3`, usuario `node`. Se reconstruyó la aplicación
usando las capas existentes; no se presenta como una actualización nueva de Debian.
El inventario Debian y la versión Node coinciden con la imagen del cierre original:
huella del inventario `5cb45e2688001a0fe4d366d89e8be9268cc2be43357bb1f4d020f2f03d8e4438`.

La carga final conectó 600 lectores en 1,8 segundos: p50 939 ms, p95 1621 ms,
p99 2152 ms y máximo 2183 ms. El generador y los contenedores usaron la misma máquina;
estas cifras no garantizan la capacidad del anfitrión institucional ni de polling masivo.

No se repitió Trivy para esta reconstrucción. El informe fechado anterior conserva
228 avisos Debian/99 identificadores, sin versión corregida indicada, y cero avisos Node
en ese escaneo. Que los inventarios coincidan no reemplaza un escaneo actualizado ni la
evaluación de aplicabilidad y del host por GIIA. No certificar cero vulnerabilidades.

Los ensayos se hicieron exclusivamente con claves, datos y volúmenes ficticios. La prueba
de caché configura deliberadamente un proxy que intenta guardar respuestas 200; prueba la
protección de la aplicación, sin afirmar cómo está configurado el Nginx institucional.
La cabecera nueva no purga datos API antiguos: GIIA debe invalidarlos al actualizar.

La guía principal sigue siendo [GUIA-INFORMATICA.md](GUIA-INFORMATICA.md).
El detalle está en [REVISION-SEGURIDAD-AMPLIADA.md](REVISION-SEGURIDAD-AMPLIADA.md).
Ticket, recursos, dominio, TLS, topología y aceptación reales, avisos, monitoreo y operación
institucional siguen pendientes como se indica al final de la guía.

## Antecedente: cierre original de auditoría del 14 de octubre

Cierre de la auditoría: **14 de octubre de 2026**. Responde al informe del 12 de octubre
y a la observación sobre Nginx. Se conserva la arquitectura, el mapa y las migraciones
publicadas; v6 se agrega al final. Todos los ensayos utilizaron datos, claves y volúmenes
ficticios, separados del evento y de la infraestructura institucional.

| Comprobación                        | Resultado                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                          | **491 pruebas en 37 archivos**, ninguna fallida ni omitida; salida 0                                                                                |
| `npm run typecheck`, `npm run lint` | Tipos compartidos, servidor y cliente; salidas 0                                                                                                    |
| `npm run build`                     | Cliente y servidor construidos; salida 0                                                                                                            |
| Prettier y `git diff --check`       | Formato de los archivos modificados y espacios revisados                                                                                            |
| `npm audit --json`                  | Cero avisos conocidos en el árbol completo; salida 0                                                                                                |
| `npm run verificar:despliegue`      | Ocho comprobaciones de puertos y confianza del proxy; salida 0                                                                                      |
| Regresiones de auditoría            | Defectos reintroducidos y correcciones restauradas en dos ciclos rojo/verde; incluyen origen HTTP administrativo                                    |
| Docker                              | Construcción Linux con `--pull --no-cache`, actualizaciones APT y dependencias del lockfile; salida 0                                               |
| Usuario del contenedor              | `node`, UID/GID 1000, sin modo privilegiado; secreto con permisos 600                                                                               |
| Nginx local y HTTPS                 | **20 controles**, incluyendo WSS, polling, cookies Secure, rechazo de origen, moderación, reportes, CSV y continuidad durante 55 segundos; salida 0 |
| Cabeceras de proxy                  | IP efectiva conservada; se descartaron IP de proxy y cabecera falsificada                                                                           |
| Arranque compilado sin NODE_ENV     | Rechaza ausencia de credenciales, maestra corta y clave individual de desarrollo antes de escuchar                                                  |
| Rotación real en Docker             | Recrear invalida cookie y clave antiguas, admite clave nueva y firma maestra Emergencia; conserva el secreto                                        |
| Carga a través de Nginx             | 600 lectores, 20 escritores, 40 publicaciones y **24.000/24.000 entregas**, cero rechazos; salida 0                                                 |
| SQLite y recuperación               | Copia caliente, respaldo completo en frío, esquema v6 e integridad; imagen exacta importada y datos/secreto recuperados en otro volumen             |
| Validación del respaldo             | Bind de sólo lectura, copia DB/WAL/SHM en tmpfs y UID 65534; huellas del respaldo sin cambios                                                       |
| Navegador                           | Página y panel renderizados; acceso legítimo desde navegador comprobado detrás de Nginx local                                                       |

Imagen: `pizarra-udec:auditoria-20261014`. Identificador:
`sha256:d3d9ca54bee9a79e7a5da827137f79e5b45caeaa97429c4dde82859b73046f68`. Tamaño Docker: **444218842 bytes**.
Motor 29.8.0 y Compose 5.5.1. La imagen incluye todas las correcciones del servidor;
la documentación se entrega con las fuentes y no entra en la imagen.

## Tiempo real y capacidad

La configuración ensayada usa un solo Nginx, backend aislado y `TRUST_PROXY=1`.
Los puertos de prueba quedaron en loopback: HTTP 3188, HTTPS 3443, backend 3189;
otro listener bloqueó deliberadamente Upgrade para comprobar el respaldo automático.
Estos puertos son del ensayo y no una asignación de GIIA.

El cliente conectado con WebSocket bloqueado pasó automáticamente a polling antes de
ocho segundos, conservó la autenticación y difundió publicaciones hacia otro cliente WSS.
También funcionaron respuestas, filtro Unicode, reportes y ocultado/restauración manual.
Las dos conexiones permanecieron disponibles durante 55 segundos. Un origen ajeno no
puede establecer WSS ni realizar acciones administrativas con una cookie válida.
Una ráfaga de mil eventos desconocidos se desconectó sin perder la salud ni el lector legítimo.

La carga conectó 600 lectores en 1,7 segundos. Latencias de difusión: p50 **619 ms**,
p95 **1154 ms**, p99 **1232 ms**, máxima **1253 ms**. La muestra posterior de memoria fue
43,61 MiB para la aplicación y 4,715 MiB para Nginx; no mide el pico del ensayo.
Generador y contenedores corrieron en la misma máquina. La carga representa lectores
conectados y 20 altas/escritores, no 600 registros simultáneos. La carga masiva se ensayó
por WebSocket; polling se verificó funcionalmente, sin certificar igual capacidad.

## Seguridad y actualización

Las correcciones de los siete hallazgos y los controles adicionales de lectura HTTP,
origen administrativo y borrado transaccional están en [RESPUESTA-AUDITORIA.md](RESPUESTA-AUDITORIA.md).
V6 se probó sobre una base v5 con contenido y visitas; conserva contadores históricos y
firmas, limita nuevas visitas a 300 e incorpora el índice de avisos. No se modifican v1 a v5.
Antes de actualizar, respaldar imagen, commit, configuración y datos compatibles.

Trivy 0.75.0 analizó la imagen exportada sin red: **228 avisos por paquete
Debian, 99 identificadores distintos y cero avisos de paquetes Node**. La base
consultada no indicó versiones corregidas. Los detalles y la fecha de la base están en
[seguridad-imagen.json](seguridad-imagen.json); aplicabilidad de MiniZip y tratamiento en
[SEGURIDAD.md](SEGURIDAD.md). Un escaneo finalizado no certifica ausencia de vulnerabilidades.

La recuperación importó la imagen guardada y reconstruyó la instalación desde el respaldo
en otro volumen, conservando datos, secreto, permisos e integridad. El volumen anterior
permaneció separado durante el ensayo. Rutas `/var/src`, cuentas, sudo, permisos del host,
destinos externos y programación 3-2-1 necesitan ensayo y autorización institucional.

Contenedores, tres volúmenes ficticios y red del ensayo retirados tras verificar sus etiquetas. La imagen final queda conservada localmente.

## Alcance y pendientes

- El navegador se comprobó por HTTP local; HTTPS y cookies seguras se comprobaron con clientes automatizados que confiaban exclusivamente en el certificado ficticio. No se instalaron certificados ni se omitieron barreras del navegador.
- Vite conserva su aviso por paquetes mayores de 500 KB; la capa de ciudad se descarga aparte.
- El catálogo mantiene 85 descripciones y 34 fotografías libres en 25 edificios. Permanecen 60 fotos pendientes de identidad/licencia; [FOTOS-PENDIENTES.md](FOTOS-PENDIENTES.md).
- La entrega excluye datos, secretos reales, documento interno e historial privado; [PRIVACIDAD.md](PRIVACIDAD.md).
- El ZIP contiene fuentes y documentación para construir; no incluye imagen Docker ni respaldos operativos.

**Pendientes GIIA:** ticket y aprobaciones, recursos, accesos, instalación institucional,
dominio/DNS/TLS, configuración y aceptación de su Nginx, evaluación de avisos de imagen y host,
mantenimiento, incidentes, monitoreo externo, retención de logs y respaldos 3-2-1.
Lista operativa en [ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).
Punto de entrada para informática: [GUIA-INFORMATICA.md](GUIA-INFORMATICA.md).
