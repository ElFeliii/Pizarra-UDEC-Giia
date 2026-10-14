# Correcciones de la revisión ampliada de seguridad

Fecha: **14 de octubre de 2026**. Esta revisión complementa la
[respuesta al informe de GIIA](RESPUESTA-AUDITORIA.md). Conserva la arquitectura, las
dependencias y las migraciones publicadas; no necesita una migración nueva.

## Cambios y comprobaciones

| Área                 | Comportamiento corregido                                                                                                                                                                 | Regresión                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Caché privada        | La API dinámica envía `Cache-Control: no-store`, incluyendo panel, sesiones, errores, hilos y búsqueda. Las guías desactivan caché compartida del proxy.                                 | `cacheApi.test.ts`; prueba con Nginx que intenta almacenar respuestas 200.                                   |
| Reconexión Socket.IO | Cada CONNECT posterior dentro del mismo transporte consume presupuesto antes de consultar el token. Eventos y rechazos conservan su presupuesto en ese transporte.                       | `reconexionProtocolo.test.ts`, WebSocket y polling.                                                          |
| Reportes             | Requieren objetivo y padre públicos, con sección y tema visibles; objetivos ocultos devuelven `NOT_FOUND` sin reportes ni autoocultado.                                                  | `reportesVisibilidad.test.ts`; incluye secciones solo de lectura y deduplicación legítima.                   |
| Borrados y ranking   | Reparan estadísticas con los textos visibles supervivientes dentro de la transacción. Una revisión persistente invalida la caché incluso si borra otro proceso.                          | `retencionPalabras.test.ts`; caché caliente, rollback, otra conexión y CLI aislado.                          |
| Catálogo de temas    | Filtra visibilidad mediante un JOIN; no consulta la sección una vez por tema. Aplica el presupuesto HTTP antes de SQLite; el ranking también protege su lectura de revisión persistente. | `catalogoTemas.test.ts` y `cacheApi.test.ts`; catálogo grande, cambios de visibilidad y presupuesto agotado. |
| Exportaciones        | Sólo se aceptan propiedades propias del catálogo de exportación. Selectores desconocidos devuelven 404 y las exportaciones válidas siguen funcionando.                                   | `cacheApi.test.ts`.                                                                                          |

Los archivos de prueba están en `server/test/`. Los defectos se reintrodujeron en ensayos
controlados y las pruebas detectaron los fallos; al restaurar las correcciones pasaron.
El informe fechado [ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md) registra la suite y
los ensayos completos de la versión entregada. Las pruebas usan datos y credenciales ficticios.

## Caché y despliegue

El problema de privacidad requería habilitar una caché compartida de respuestas 200 por URL
sin excluir datos autenticados. Se reprodujo con un Nginx local; no se comprobó una
filtración en el servidor institucional. La cabecera nueva evita guardar las respuestas
dinámicas si el proxy respeta los controles del origen. El catálogo de instituciones y
los archivos estáticos con hash conservan su política de caché pública.

La Célula debe desactivar la caché compartida de `/api/` y `/socket.io/`, conservar las
cabeceras y **vaciar cualquier respuesta API guardada antes de actualizar**. Una cabecera
nueva no retira entradas previas. No configurar `proxy_ignore_headers Cache-Control`
para estas rutas. Ver [DESPLIEGUE](DESPLIEGUE.md#caché-y-contenido-privado).

Comprobar las mismas URL administrativas primero con cookie válida y luego sin cookie:
la segunda petición debe recibir 401, sin contenido oculto ni lista de asistentes.
Después de logout se exige el mismo rechazo. Verificar también ocultado de hilo/búsqueda.

## Presupuestos y visibilidad

El primer CONNECT conserva el token que pagó el handshake Engine.IO; no cobra dos veces
ni reduce la cuota de los asistentes que comparten WiFi. Reconectar el namespace dentro
del mismo transporte conserva el presupuesto de 60 eventos y sus rechazos consecutivos.
Un WeakMap vincula ese estado a la vida del transporte. No cambia el respaldo por polling,
el control de origen ni la revalidación de firmas y sesiones.

El catálogo usa una lectura SQL y aplica el mismo presupuesto de contenido HTTP. Sus
cambios de visibilidad se reflejan en la siguiente solicitud sin una caché adicional.
Los reportes consultan la visibilidad existente de las notas; en una sección solo de
lectura se puede seguir reportando contenido público. Las firmas auténticas mantienen
la protección frente al autoocultado y permiten revisión manual.

Estos controles reducen trabajo dentro del proceso; no sustituyen firewall, protección
de red ni ensayo de carga en el servidor real.

## Borrado y operación

La herramienta conserva los límites de confirmación y acceso administrativo local.
Al retirar una persona, reconstruye las estadísticas con el contenido superviviente y
el filtro vigente. La revisión del ranking se guarda en `app_meta` dentro de la misma
transacción; un fallo revierte borrado, agregados y señal. Consultar o difundir el ranking
detecta la revisión incluso desde otra conexión SQLite. Publicar normalmente conserva
actualización incremental y caché, sin reconstruir todos los textos.

Los borrados se ejecutan en una ventana sin participantes, con respaldo validado y el
servicio detenido. La invalidación del ranking no retira una vista ya dibujada en un
navegador ni reemplaza cerrar sockets. Seguir el
[procedimiento operativo](DESPLIEGUE.md#borrar-con-el-servicio-detenido), reiniciar y
comprobar notas, respuestas, búsqueda y palabras. No borrar el volumen para resolver errores.

## Límites y pendientes de GIIA

La verificación local no certifica ausencia universal de vulnerabilidades ni acepta el
servidor institucional. Continúan pendientes ticket, dominio/DNS/TLS, topología y configuración
efectiva del proxy, invalidación de su caché previa, capacidad y carga reales, revisión del
host y de avisos de imagen, monitoreo, mantenimiento, respaldos e incidentes.

No se publican secretos ni datos del evento. El paquete de fuentes permite construir la
imagen; los respaldos y las credenciales se entregan por canal privado y separado.
