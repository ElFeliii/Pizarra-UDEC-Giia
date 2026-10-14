# Respuesta técnica a la auditoría de Pizarra UdeC

Cierre: **14 de octubre de 2026**. Referencia: informe «AUDITORIA Pizarra UdeC» del
**12 de octubre de 2026**, apartados I a VII, y observación del equipo sobre su proxy Nginx.
Este documento explica las correcciones y las condiciones de aceptación. La evidencia
fechada de cada entrega está en [ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md).

Se conserva la arquitectura existente: un contenedor Node 22/Fastify/Socket.IO, cliente
React y SQLite. El código, las pruebas y estas instrucciones se entregan en el historial
saneado de [Pizarra-UDEC-Giia](https://github.com/ElFeliii/Pizarra-UDEC-Giia). El código
publicable no debe incluir `.env`, credenciales reales, datos del evento ni respaldos.
Las claves que aparecen en las pruebas son ficticias. La revisión de seguridad no equivale
a certificar ausencia absoluta de vulnerabilidades ni autoriza el despliegue institucional.

## Revisión complementaria

La revisión ampliada del 14 de octubre añade correcciones de caché, reconexión del
namespace sobre el mismo transporte, visibilidad de reportes, estadísticas de borrados,
catálogo de temas y exportaciones. Ver
[REVISION-SEGURIDAD-AMPLIADA.md](REVISION-SEGURIDAD-AMPLIADA.md) y la evidencia de la
versión correspondiente; los ensayos anteriores se conservan como antecedentes.

## I. Saturación por eventos y consultas

Se agrega un presupuesto antes de los handlers de Socket.IO y de SQLite. Cuenta también
mensajes inválidos, suscripciones anónimas y eventos desconocidos. Al superar el límite,
se responde `RATE_LIMITED` cuando existe acuse; tres rechazos consecutivos desconectan la
conexión. Un presupuesto compartido por IP limita nuevas conexiones y eventos, de modo
que reconectar no permite obtener conexiones nuevas ilimitadas.

La comprobación de superposición consulta únicamente los avisos firmados y visibles de
la sección. La migración v6 añade el índice correspondiente; publicar una nota ya no
materializa todas las notas de asistentes para hacer esa comprobación. Las restricciones
de posición, firmas y crecimiento de las notas se conservan.

| Presupuesto                                | Ráfaga inicial |                Recuperación |
| ------------------------------------------ | -------------: | --------------------------: |
| Eventos por conexión Socket.IO             |             60 |      10 eventos por segundo |
| Conexiones nuevas por IP                   |          1.200 |   10 conexiones por segundo |
| Eventos de todas las conexiones de una IP  |          6.000 |   1.000 eventos por segundo |
| Lecturas HTTP públicas de contenido por IP |          2.400 | 100 solicitudes por segundo |

Son presupuestos de tokens con ráfaga y recarga, no un contador reiniciado por ventana.
Los límites de publicación, respuestas, reportes, visitas y login continúan aplicándose.
La capacidad inicial por IP contempla cientos de asistentes compartiendo WiFi; la carga
real del evento debe ensayarse en el servidor aprobado. Estos controles limitan trabajo
dentro de la aplicación; la protección de red y contra DDoS corresponde a la frontera
administrada por GIIA.

Comprobación: [limitesSocket.test.ts](../server/test/limitesSocket.test.ts) cubre límites
antes de consultar, eventos desconocidos, desconexión por abuso, reconexiones y uso normal
desde una IP compartida. La consulta de avisos y su visibilidad se comprueban también en
[visitasAcotadas.test.ts](../server/test/visitasAcotadas.test.ts).

## II. Reportes de publicaciones del equipo

Las notas y respuestas con `autorModerador` auténtico se pueden reportar y entran a la
cola de revisión, pero los reportes no las autoocultan. El moderador conserva el ocultado
manual y la restauración. La firma procede de una sesión autenticada; copiar el nombre
del equipo o enviar ese campo en JSON no concede esta protección.

Las publicaciones firmadas mantienen los filtros de contenido y los permisos de sección.
La excepción se limita al autoocultado por reportes. Las publicaciones anteriores sin firma
no se convierten en avisos del equipo por coincidir su nombre.

Comprobación: [reportesModeracion.test.ts](../server/test/reportesModeracion.test.ts)
comprueba notas y respuestas, reportes únicos, cola, ocultado manual, restauración e intento
de falsificar la firma; [firmaModeracion.test.ts](../server/test/firmaModeracion.test.ts)
cubre autenticación, filtros y secciones cerradas.

## III. Arranque seguro y credenciales de desarrollo

El arranque directo sin `NODE_ENV` selecciona producción. Si faltan credenciales válidas,
se detiene antes de escuchar. Docker mantiene `NODE_ENV=production`. Desarrollo requiere
selección explícita: `npm run dev`/`dev:lan` incorporan `--desarrollo`; también se admite
`NODE_ENV=development`. La bandera no puede degradar un entorno expresamente configurado
como producción.

Las cuentas de desarrollo no se usan en el evento. En producción, las claves individuales
requieren al menos 12 caracteres y se rechazan marcadores de desarrollo o de ejemplo.
La configuración valida pares `nombre:clave`, identidades repetidas tras normalizar y el
nombre reservado de emergencia. Generar claves aleatorias y entregarlas por canal privado,
como explica [DESPLIEGUE.md](DESPLIEGUE.md).

Comprobación: [arranqueSeguro.test.ts](../server/test/arranqueSeguro.test.ts) comprueba
selección de entorno, rechazo sin claves y rotación; [auth.test.ts](../server/test/auth.test.ts)
cubre fortaleza, formato, identidades y autenticación.

## IV. Evasiones mediante Unicode

Se aplica NFKC a la forma usada para comparar datos personales, enlaces, palabras y frases
de odio. Los dígitos Unicode decimales se convierten a su valor ASCII; los patrones numéricos
usan `\p{Nd}` con modo Unicode. Los límites son numéricos: pegar letras al RUT o al teléfono
no los vuelve invisibles para el filtro.

El texto guardado y presentado conserva NFC; no se reemplazan sus caracteres por la forma
de comparación. La ñ sigue diferenciándose de la n. Se mantienen la lista acordada y los
controles para evitar falsos positivos.

Comprobación: [unicodeSeguridad.test.ts](../server/test/unicodeSeguridad.test.ts) cubre
números de ancho completo, árabe-indios, persas, tailandeses y matemáticos, mezclas de
alfabetos, RUT, enlaces/correos, palabras y frases. Recorre los juegos decimales que reconoce
el motor; no fija una versión Unicode ni un número de juegos. Comprueba 710 nombres reales
de instituciones, edificios y ofertas de carrera, también en ancho completo, además de textos
legítimos y preservación del contenido en SQLite y en el hilo.

Se verificaron los módulos actuales del filtro en **Node 22.23.3** dentro de Docker, sin red
y montados sólo para lectura: 77 juegos decimales del motor, 15 casos de reglas y 1.426
textos legítimos. Esta comprobación de compatibilidad no sustituye el ensayo de la imagen
nueva completa. La propiedad de juegos decimales consecutivos procede de la
[especificación Unicode](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-4/).

## V. Acotar visitas sin perder el crecimiento de notas

Se conserva la deduplicación por persona y nota. Las visitas nuevas se registran hasta
alcanzar **300 visitas por nota**, independientemente de sus respuestas. Después no se
insertan identificadores nuevos. Los contadores históricos superiores a 300 se conservan;
no se reduce el tamaño de las notas ni se cambian los pesos de respuestas.

La migración v6 retira identificadores de deduplicación de notas que ya alcanzaron ese
umbral y conserva sus contadores, contenido y firmas. Las migraciones publicadas v1 a v5
permanecen intactas. Hacer un respaldo completo antes de iniciar la actualización que aplica v6.

Las visitas son una métrica acotada para el crecimiento visual. No certifican asistencia
al evento ni son un control antifraude; un visitante anónimo puede renovar su identificador.
La limitación de eventos complementa el límite de filas por nota.

Comprobación: [visitasAcotadas.test.ts](../server/test/visitasAcotadas.test.ts) verifica
unicidad, tope, respuestas e históricos; [migraciones.test.ts](../server/test/migraciones.test.ts)
aplica v6 a una base v5 con datos, revisa claves foráneas e idempotencia.

## VI. Confianza del proxy y Nginx

Compose usa `TRUST_PROXY=1` para **un único proxy local** y publica exclusivamente en
`127.0.0.1:<PUERTO_PUBLICADO>`. El código directo mantiene `loopback`; los ensayos sin
proxy deben usar `TRUST_PROXY=false`. El puente Docker puede ser el par TCP de Node, por
lo que confiar sólo en la dirección loopback dentro del contenedor no representa esta
topología. Una cadena distinta requiere revisar IP o saltos con GIIA.

Nginx debe reenviar `Host`, `X-Forwarded-For` y `X-Forwarded-Proto` coherentemente con la
cadena autorizada; el puerto externo se conserva en `Host` si difiere del estándar. Página,
API, panel y Socket.IO comparten el mismo origen. El backend permanece sin acceso público
directo; el puerto público previsto es **443/TCP** y el interno sigue en **3000/TCP**.

Para WebSocket, configurar HTTP/1.1 al backend, `Upgrade` y `Connection`, y tiempos de
lectura/envío de **75 segundos**. El ejemplo y el contexto `http` del `map` están en
[DESPLIEGUE.md, proxy con WebSocket](DESPLIEGUE.md#3-proxy-con-websocket).
[Nginx](https://nginx.org/en/docs/http/websocket.html) documenta el reenvío explícito de
estas cabeceras; [Socket.IO](https://socket.io/docs/v4/reverse-proxy/) exige un timeout
superior a `pingInterval + pingTimeout`, que en este proyecto suma 45 segundos.

El cliente intenta WebSocket y admite HTTP long-polling cuando falla el transporte inicial,
mediante `tryAllTransports`. Deben pasar los GET/POST de `/socket.io/` y las cookies; probar
polling forzado y comprobar el respaldo automático del cliente son ensayos distintos.
La [opción oficial de transportes](https://socket.io/docs/v4/client-options/#tryalltransports)
describe ese comportamiento. La configuración del cliente no certifica el Nginx institucional.

Comprobación: `npm run verificar:despliegue` comprueba Compose; las pruebas de IP/origen
se mantienen en [seguridadSocket.test.ts](../server/test/seguridadSocket.test.ts).
La aceptación de GIIA debe ensayar ambos transportes, IP real, origen HTTPS, cookies
`Secure`, reconexión y carga con su configuración efectiva.

## VII. Clave maestra e identidad de emergencia

`MOD_PASSWORD` queda vacía por omisión. Si GIIA y el equipo requieren activarla, exige
al menos 12 caracteres y la misma precaución de aleatoriedad que una credencial individual.
Toda acción con esa clave se atribuye a **Emergencia**, aunque el login envíe otro nombre.
La identidad está reservada y no se permite como cuenta individual. La operativa habitual
usa las credenciales individuales de `MOD_USERS`.

Para retirar o rotar credenciales, acordar la interrupción, editar `.env` conservando sus
permisos y recrear el servicio. Esto carga los nuevos valores y elimina **todas las sesiones
de moderación en memoria**, conservando SQLite y el secreto persistido:

```bash
docker compose up -d --force-recreate --wait --wait-timeout 120
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Editar `.env` sin recrear no revoca sesiones. `docker compose restart` conserva las variables
originales del contenedor. Después de recrear, comprobar rechazo de cookies y claves antiguas,
login con las nuevas y la firma fija del acceso de emergencia, si está habilitado.
Las claves no se adjuntan a tickets, capturas ni a este documento.

Comprobación: [auth.test.ts](../server/test/auth.test.ts) y
[arranqueSeguro.test.ts](../server/test/arranqueSeguro.test.ts).

## Corrección adicional: borrar datos con visitas existentes

Se corrige el fallo de claves foráneas al borrar un usuario o todo el contenido cuando hay
visitas. El borrado retira dependencias de visitas, respuestas, reportes e índice de búsqueda
en una transacción; el contenido ajeno que permanece conserva sus contadores correctos.
Si ocurre un error, la transacción revierte. El borrado total conserva la configuración y el
registro de moderación. La herramienta local de datos no necesita activar un servidor ni
configurar claves de moderación para trabajar sobre una base indicada.

Comprobación: [datos.test.ts](../server/test/datos.test.ts) incluye bases con visitas y
dependencias, conservación de contenido ajeno y reversión ante fallo. Los comandos siguen
en [DESPLIEGUE.md](DESPLIEGUE.md); el borrado es irreversible y requiere respaldo y decisión
del responsable del evento.

## Control adicional: lecturas HTTP costosas

Un presupuesto por IP se ejecuta antes de consultar SQLite en `GET /api/session`,
`GET /api/pins`, `GET /api/pins/:id/thread` y `GET /api/search`. Incluye consultas inválidas.
Al agotarlo, devuelve **429**, `RATE_LIMITED` y `Retry-After`. El control mantiene disponibles
salud, recursos estáticos y Engine.IO; las peticiones de transporte siguen sus controles propios.

Comprobación: [limitesLectura.test.ts](../server/test/limitesLectura.test.ts) cubre las
cuatro rutas, rechazo antes de los repositorios, consultas inválidas, recarga, independencia
de IP y el presupuesto inicial para 600 lectores con cuatro lecturas cada uno.

## Control adicional: origen de acciones administrativas

HTTP administrativo y Socket.IO comparten la validación de origen. Antes de leer el
cuerpo o autenticar, las mutaciones administrativas rechazan un origen ajeno con 403,
incluso si envía una cookie válida. Esto protege también frente a un subdominio hermano:
SameSite=Strict no lo separa del dominio del evento. Login y logout están incluidos.
Los metadatos de navegador cruzado sin Origin tampoco obtienen la excepción para CLI.
El mismo origen HTTP/HTTPS y los clientes administrativos sin Origin conservan acceso,
siempre con autenticación. La excepción del puerto Vite se limita al desarrollo explícito.

Comprobación: [origenAdministracion.test.ts](../server/test/origenAdministracion.test.ts),
17 casos y dos ciclos de regresión; Nginx HTTPS rechaza ocultado y logout ajenos sin
invalidar la sesión legítima. La suite final reúne 491 pruebas y 20 controles del proxy,
con resultados completos en [ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md).

## Evidencia de la versión y actualización

La suite y el ensayo final del servidor nuevo figuran con fecha, imagen e identificador
en [ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md). Los resultados del 8 y 9 de octubre
corresponden a la entrega anterior. La corrección de cada caso requiere regresión que falle
al reintroducir el defecto y pase tras restaurar la corrección; también tipos, lint, formato,
compilación y auditoría de dependencias. La comprobación de navegador y de comunicación
entre clientes complementa las pruebas automáticas.

Para actualizar, utilizar la [guía de informática](GUIA-INFORMATICA.md), hacer el respaldo
completo y verificar la recuperación antes de aplicar v6. Conservar la imagen, commit,
configuración y datos del mismo respaldo. Recuperar una imagen antigua sobre una base ya
migrada no reemplaza una recuperación compatible de datos. La auditoría npm y el escaneo
de imagen tienen fecha y alcance; los avisos del sistema operativo y del host necesitan
evaluación de GIIA. Ver [SEGURIDAD.md](SEGURIDAD.md).

## Pendientes de GIIA para aceptar el despliegue

**Confirmar ticket/aprobaciones, recursos, accesos, puerto y dominio; configurar DNS/TLS,
cadena de proxies y Nginx; aprobar la seguridad del host y el tratamiento de avisos; ensayar
la aplicación pública y la recuperación; establecer mantenimiento, logs, monitoreo,
respaldos 3-2-1 y responsables de incidentes.**

La validación de Nginx debe registrar configuración efectiva, topología, transporte observado,
resultado de dos navegadores/celular y carga real. Con WebSocket habilitado, comprobar
notas, respuestas, reportes y moderación sin recargar. Deshabilitar el upgrade únicamente
en el ensayo y repetir las acciones con el respaldo HTTP del cliente; restituirlo después.
Comprobar además rechazo de origen ajeno, IP efectiva y cookie segura por HTTPS. Que la
página abra o `/api/health` responda no satisface esta aceptación.

La lista operativa completa está al final de [ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).
