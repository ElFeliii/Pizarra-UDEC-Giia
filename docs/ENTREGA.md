# Entrega de Pizarra UdeC a GIIA

La Célula de Infraestructura y Seguridad realiza el levantamiento, previa solicitud y
aprobación por su plataforma de tickets. Esta guía sigue el Manual de Trabajo 1.0 del
15 de junio de 2026. No se necesita modificar el código para escoger el puerto del servidor.

Revisión documental: **14 de octubre de 2026**. Documento principal con instalación,
funcionamiento y precauciones: [GUIA-INFORMATICA.md](GUIA-INFORMATICA.md). La respuesta a los
apartados del informe del 12 de octubre está en [RESPUESTA-AUDITORIA.md](RESPUESTA-AUDITORIA.md).
Los resultados de pruebas, imagen y ensayos tienen su fecha y alcance en
[ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md); no confundir una comprobación local con
la aceptación del servidor institucional.

Correcciones adicionales y condiciones de actualización:
[REVISION-SEGURIDAD-AMPLIADA.md](REVISION-SEGURIDAD-AMPLIADA.md). Incluye caché privada,
reconexión, reportes, estadísticas de borrados, presupuesto de temas/ranking y CSV.

## Información para el ticket

| Dato                          | Solicitud                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto y objetivo           | Pizarra UdeC: participación en un evento universitario de puertas abiertas mediante notas, mapa del campus y contenido orientador, con moderación y tiempo real               |
| Responsable y fechas          | Completar por el equipo organizador en el ticket                                                                                                                              |
| Repositorio público           | [Pizarra-UDEC-Giia](https://github.com/ElFeliii/Pizarra-UDEC-Giia); código saneado disponible para lectura pública; la Célula define accesos administrativos                  |
| Versión                       | Identificar el commit publicado aprobado antes de instalar                                                                                                                    |
| Recursos iniciales propuestos | 1 vCPU, 1 GB de RAM y 2 GB de disco para aplicación e imagen; confirmar capacidad y espacio adicional para logs y respaldos con GIIA                                          |
| Directorio                    | `/var/src/pizarra-udec`                                                                                                                                                       |
| Servicios                     | Un contenedor Node sirve la página, la API, Socket.IO/WebSocket y `/moderador`; SQLite persiste en `data/`                                                                    |
| Subdominio solicitado         | Uno dentro de `.giia.udec.cl`; `pizarra.giia.udec.cl` es una propuesta todavía no asignada                                                                                    |
| Documentación                 | [Verificación actual](ENTREGA-VERIFICACION.md), esta guía, [DESPLIEGUE.md](DESPLIEGUE.md), [PRIVACIDAD.md](PRIVACIDAD.md), [SEGURIDAD.md](SEGURIDAD.md) y el resto de `docs/` |

El repositorio se confirmó **público** mediante la API de GitHub el 13 de octubre de 2026.
Eso permite descargar el código sin publicar credenciales ni datos operativos. El nombre
del repositorio no es el dominio del evento. La URL definitiva será
`https://<subdominio-asignado>.giia.udec.cl`, con el panel en `/moderador`.

## Puertos y variables

| Puerto                         | Uso y acceso                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 443/TCP                        | Página, API y WebSocket públicos por HTTPS, en el proxy administrado por GIIA                            |
| 80/TCP                         | Opcional, si el proxy lo necesita para redirección o certificados                                        |
| `PUERTO_PUBLICADO`/TCP         | Puerto del servidor anfitrión que GIIA asigna en `.env`; 3000 por defecto, publicado solo en `127.0.0.1` |
| 3000/TCP dentro del contenedor | Proceso Node; no se cambia al ajustar el puerto del anfitrión                                            |
| 5173/TCP                       | Vite de desarrollo; no se utiliza en producción                                                          |

La configuración supone un proxy HTTPS en el mismo servidor que Docker. Si el proxy está
en otra máquina, la Célula debe acordar la interfaz privada, el firewall y `TRUST_PROXY`;
el localhost de esa otra máquina no apunta al contenedor. No abrir directamente el backend
al público. Página, API y WebSocket comparten un único puerto de aplicación.

| Variable            | Configuración                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PUERTO_PUBLICADO`  | Puerto libre aprobado por GIIA; 3000 por defecto                                                                                  |
| `MOD_USERS`         | Lista `nombre:clave`; mínimo 12 caracteres en producción, claves aleatorias entregadas por canal privado                          |
| `MOD_PASSWORD`      | Clave de emergencia opcional; dejar vacía por omisión. Si se activa, mínimo 12 caracteres; identidad fija `Emergencia`            |
| `SESSION_SECRET`    | Vacía: se genera en `data/session-secret`; si se fija, mínimo 32 caracteres aleatorios                                            |
| `TRUST_PROXY`       | `1` para un único proxy local con el backend en loopback; adaptar a la topología real                                             |
| `AUTO_HIDE_REPORTS` | `3` por defecto; `0` desactiva el autoocultado. Los avisos con firma auténtica siguen reportables, pero requieren ocultado manual |

## Primera instalación

GIIA prepara `/var/src` y los permisos de la cuenta personal autorizada para este proyecto.
Los siguientes comandos se ejecutan después de la aprobación; no crean usuarios ni
instalan servicios del sistema:

```bash
cd /var/src
git clone https://github.com/ElFeliii/Pizarra-UDEC-Giia pizarra-udec
cd /var/src/pizarra-udec
test -e .env || cp .env.example .env
chmod 600 .env
mkdir -p data
```

Editar `.env`, seleccionar `PUERTO_PUBLICADO` y completar `MOD_USERS`, que viene vacío.
Usar claves individuales aleatorias y largas desde el evento: mínimo 12 caracteres en
producción; se recomiendan 24 bytes aleatorios codificados en base64url. No se admiten
la clave de desarrollo ni marcadores de ejemplo. La coma separa moderadores: no usarla
en las claves, ni dos puntos en los nombres. Mantener los valores entre comillas simples
en `.env` para evitar que Compose interprete caracteres especiales. No incluir claves
en el ticket, GitHub ni capturas. Ver el generador de [DESPLIEGUE.md](DESPLIEGUE.md#2-ajustes-opcionales).

El contenedor usa UID/GID 1000. La Célula asigna los permisos de su carpeta de datos:

```bash
sudo chown 1000:1000 data
sudo chmod 700 data
```

Estos permisos requieren autorización de la Célula. Para una instalación existente,
respaldar y conservar los datos antes de adaptar su propietario.

```bash
docker compose up -d --build --wait --wait-timeout 120
docker compose ps
docker compose port pizarra 3000
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

El servicio debe quedar `healthy`. La consulta descubre el puerto publicado desde Compose,
por lo que funciona también si GIIA asignó uno diferente de 3000. El contenedor genera y
conserva el secreto de sesiones automáticamente si no se define por entorno.

La Célula configura DNS, certificado y proxy. Los ejemplos de
[DESPLIEGUE.md](DESPLIEGUE.md#3-proxy-con-websocket) usan el puerto de ejemplo 3000: sustituirlo
por `PUERTO_PUBLICADO` y reemplazar el subdominio por el asignado. Pasar `Host`,
`X-Forwarded-For` y `X-Forwarded-Proto`, y permitir WebSocket.

## Actualizar

Esta versión exige claves individuales de al menos 12 caracteres y rechaza credenciales
de desarrollo y marcadores de ejemplo. `MOD_PASSWORD` queda vacía por omisión; si se conserva,
también exige al menos 12 caracteres y registra todas sus acciones como **Emergencia**, sin
permitir atribuirlas al nombre enviado en el login. Antes de actualizar, revisar `MOD_USERS`
y `MOD_PASSWORD`: sustituir las credenciales incompatibles en el `.env` existente por claves
aleatorias largas. Conservar las demás variables, mantener permisos `600` y entregar las nuevas claves
por el canal privado del equipo. Un `.env` antiguo no debe sobrescribirse con el ejemplo;
si conserva credenciales incompatibles, el servicio rechazará el inicio.

Antes de actualizar, obtener un respaldo completo protegido y guardar la imagen y el commit
actuales. Incluye SQLite, WAL/SHM si existen, secreto, `.env`, Compose y configuración de
instituciones. Los comandos de [respaldo, restauración y rollback](DESPLIEGUE.md#5-respaldo-y-exportación)
no requieren que la cuenta SSH tenga UID 1000. Reservar espacio adicional para estas copias;
los 2 GB propuestos no incluyen los respaldos. Una restauración conserva la instalación
anterior y recupera juntos código, imagen, configuración y datos del mismo respaldo.

```bash
cd /var/src/pizarra-udec
git pull --ff-only
docker compose up -d --build --wait --wait-timeout 120
docker compose ps
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

`--build` incorpora el código nuevo; los datos persisten y las migraciones se aplican al
iniciar. Esta entrega añade **v6** al final, sin modificar v1 a v5: crea el índice de avisos
firmados visibles y retira identificadores de visitas de notas que ya llegaron a 300.
Conserva sus contadores históricos, contenido y firmas. Las visitas nuevas se acotan a 300
por nota, independientemente de sus respuestas, conservando el crecimiento visual de hasta 5×.
Esta métrica no certifica asistencia ni evita fraude; el identificador anónimo puede renovarse.
Antes de aplicar v6, conservar y validar el respaldo completo. Para volver atrás, recuperar
juntos imagen, código, configuración y datos del mismo respaldo; una imagen antigua por sí
sola no revierte el esquema. Los moderadores vuelven a entrar después de un reinicio porque sus sesiones viven
en memoria. Las futuras publicaciones deben continuar el historial saneado existente.
El historial local de desarrollo no se publica ni se instala en el servidor.

### Credenciales y mantenimiento de datos

Para retirar o rotar claves, editar `.env` por el canal administrativo y **recrear** el
servicio según [DESPLIEGUE.md](DESPLIEGUE.md#rotar-o-retirar-una-credencial). Esto carga los
nuevos valores y elimina las sesiones de moderación en memoria. Editar el archivo o hacer
sólo `docker compose restart` no carga las nuevas variables del contenedor.

El borrado de asistentes o contenido ahora contempla visitas, respuestas, reportes e índice
de búsqueda en una transacción. Requiere respaldo, decisión del responsable y una ventana
sin participantes. Ejecutar la herramienta con la aplicación detenida y volver a iniciarla
para renovar los estados y el ranking en memoria; no realizar borrados mientras el evento
está activo. Ver [operaciones después del evento](DESPLIEGUE.md#10-después-del-evento-qué-hacer-con-los-datos).
La herramienta local puede trabajar sobre una base indicada sin habilitar cuentas de desarrollo
ni exigir claves de moderación. No usarla sobre la base del evento para ensayos.

### Una vez: pasar desde la primera publicación a la entrega saneada

Solo aplica a una instalación antigua anterior al saneamiento del historial, no a nuevos
clones ni a actualizaciones normales. Si `git pull --ff-only` detecta historiales incompatibles,
conservar la carpeta anterior y respaldar los datos, `.env` y secreto. La Célula prepara un
clon nuevo bajo `/var/src`, detiene la instalación anterior y transfiere el respaldo con sus
permisos antes de levantarlo. No usar `reset --hard`, borrar datos o forzar un nuevo historial.

## Aceptación del tiempo real detrás de Nginx

Nginx puede reenviar WebSocket, pero su configuración institucional todavía requiere ensayo.
Reenviar `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `Upgrade` y `Connection`, usar HTTP/1.1
hacia el backend y tiempos de lectura/envío de 75 segundos. Mantener página, API, panel y
Socket.IO en el mismo origen. El ejemplo está en
[DESPLIEGUE.md](DESPLIEGUE.md#3-proxy-con-websocket); no sustituye la configuración aprobada.

El cliente admite respaldo HTTP long-polling cuando falla WebSocket. Comprobar ambos
transportes, el respaldo automático, cookies seguras, rechazo de origen ajeno, IP efectiva,
reconexión y comunicación entre navegadores/celular. Los GET/POST de `/socket.io/` deben
atravesar el proxy; que la página o `/api/health` responda no prueba el tiempo real.
La suite de configuración Compose contempla ocho casos, pero validar Compose no ensaya
por sí solo su Nginx. Los resultados locales vigentes y sus limitaciones se consignan en
[ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md).

## Documentos que se entregan

Entregar [GUIA-INFORMATICA.md](GUIA-INFORMATICA.md) como punto de entrada, este archivo y la carpeta `docs/` de la copia saneada,
con `DESPLIEGUE.md`, `SEGURIDAD.md`, `ENTREGA-VERIFICACION.md`, `CUMPLIMIENTO-GIIA.md`,
`PRIVACIDAD.md`, `RESPUESTA-AUDITORIA.md` y `seguridad-imagen.json`. El código y `.env.example`
están en el repositorio público saneado. El ZIP de la versión aprobada debe contener esa misma
documentación y fuentes; revisar el commit y la evidencia de verificación antes de instalar. `CONTINUAR.md` es interno y no pertenece a la entrega; tampoco se
comparten `.env`, datos ni respaldos mediante GitHub o el ticket. Las credenciales y copias
operativas se transfieren exclusivamente por el canal protegido que autorice la Célula.

## Pendientes administrativos de GIIA

**Todavía no existe ticket aprobado ni dominio asignado. El código y esta guía no los crean.**

- Ingresar y aprobar el ticket; obtener la aprobación formal de la Célula Estratégica de Proyectos y del Comité Directivo de GIIA.
- Aprobar CPU, RAM, disco, puerto y fechas; disponer de Docker y Compose, y de salida a internet para la construcción o autorizar la transferencia de una imagen.
- Asignar subdominio, DNS, certificado HTTPS y proxy con WebSocket; confirmar su topología.
- Realizar el levantamiento en `/var/src` y asegurar acceso al código y autorizar cuentas SSH personales, permisos Docker y grupos Linux, con acceso de inspección y administración para la Célula.
- Definir responsable y canal para reportar inmediatamente errores, accesos sospechosos o pérdida de credenciales a la Célula; acordar la atención de incidentes y la revocación o rotación necesaria sin adjuntar secretos al ticket.
- Disponer de acceso de lectura Git para recuperar el commit público de un respaldo; si el servidor está aislado, preparar un mirror del repositorio saneado. Los permisos de escritura y administración siguen siendo exclusivos de las cuentas autorizadas. Transferir la imagen Docker por sí sola no sustituye ese acceso al código.
- Revisar la seguridad del proyecto, contenedor y servidor, incluida la aplicabilidad de los avisos Debian documentados en [SEGURIDAD.md](SEGURIDAD.md); acordar actualizaciones los viernes fuera de horario y respuesta urgente ante vulnerabilidades.
- Establecer monitoreo externo de CPU, RAM, disco y red. El endpoint de salud y `docker stats` son herramientas auxiliares, no el monitoreo externo continuo.
- Definir rotación automática de logs en un máximo de 365 días y revisión periódica. Compose ya limita el tamaño a cinco archivos de 10 MB; eso no limita su antigüedad.
- Programar respaldos al final de cada mes según 3-2-1, incluyendo configuraciones, SQLite, `.env` y secreto persistente, con destinos y acceso protegidos y restauración ensayada.
- Comprobar la URL pública desde fuera de la universidad, en computador y celular, y el funcionamiento del proxy, moderación y tiempo real antes del evento; notificar el resultado por el ticket.
