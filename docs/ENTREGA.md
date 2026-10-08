# Entrega de Pizarra UdeC a GIIA

La Célula de Infraestructura y Seguridad realiza el levantamiento, previa solicitud y
aprobación por su plataforma de tickets. Esta guía sigue el Manual de Trabajo 1.0 del
15 de junio de 2026. No se necesita modificar el código para escoger el puerto del servidor.

## Información para el ticket

| Dato                          | Solicitud                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto y objetivo           | Pizarra UdeC: participación en un evento universitario de puertas abiertas mediante notas, mapa del campus y contenido orientador, con moderación y tiempo real               |
| Responsable y fechas          | Completar por el equipo organizador en el ticket                                                                                                                              |
| Repositorio privado           | [Pizarra-UDEC-Giia](https://github.com/ElFeliii/Pizarra-UDEC-Giia); autorizar la cuenta de quien despliega y de la Célula                                                     |
| Versión                       | Identificar el commit publicado aprobado antes de instalar                                                                                                                    |
| Recursos iniciales propuestos | 1 vCPU, 1 GB de RAM y 2 GB de disco para aplicación e imagen; confirmar capacidad y espacio adicional para logs y respaldos con GIIA                                          |
| Directorio                    | `/var/src/pizarra-udec`                                                                                                                                                       |
| Servicios                     | Un contenedor Node sirve la página, la API, Socket.IO/WebSocket y `/moderador`; SQLite persiste en `data/`                                                                    |
| Subdominio solicitado         | Uno dentro de `.giia.udec.cl`; `pizarra.giia.udec.cl` es una propuesta todavía no asignada                                                                                    |
| Documentación                 | [Verificación actual](ENTREGA-VERIFICACION.md), esta guía, [DESPLIEGUE.md](DESPLIEGUE.md), [PRIVACIDAD.md](PRIVACIDAD.md), [SEGURIDAD.md](SEGURIDAD.md) y el resto de `docs/` |

El nombre del repositorio no es el dominio del evento. La URL definitiva será
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

| Variable            | Configuración                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `PUERTO_PUBLICADO`  | Puerto libre aprobado por GIIA; 3000 por defecto                                          |
| `MOD_USERS`         | Lista `nombre:clave` con las credenciales individuales entregadas por un canal privado    |
| `MOD_PASSWORD`      | Llave maestra opcional; dejar vacía si no se necesita. Si se utiliza, mínimo 8 caracteres |
| `SESSION_SECRET`    | Vacía: se genera en `data/session-secret`; si se fija, mínimo 32 caracteres aleatorios    |
| `TRUST_PROXY`       | `1` para un único proxy local con el backend en loopback; adaptar a la topología real     |
| `AUTO_HIDE_REPORTS` | `3` por defecto; `0` desactiva el ocultado automático por reportes                        |

## Primera instalación

GIIA prepara `/var/src` y los permisos de la cuenta personal autorizada para este proyecto.
Los siguientes comandos se ejecutan después de la aprobación; no crean usuarios ni
instalan servicios del sistema:

```bash
cd /var/src
git clone https://github.com/ElFeliii/Pizarra-UDEC-Giia pizarra-udec
cd /var/src/pizarra-udec
cp .env.example .env
chmod 600 .env
mkdir -p data
```

Editar `.env`, seleccionar `PUERTO_PUBLICADO` y completar `MOD_USERS`. El ejemplo
`Moderador 1:REEMPLAZAR-CON-CLAVE-DEL-EQUIPO` es un marcador; sustituirlo por una clave propia,
protegida y distinta de la de desarrollo. No incluir claves en el ticket, GitHub ni capturas.
La coma separa moderadores: las claves de esa lista no pueden contener comas.

El contenedor usa UID/GID 1000. La Célula asigna los permisos de su carpeta de datos:

```bash
sudo chown 1000:1000 data
sudo chmod 700 data
```

Estos permisos requieren autorización de la Célula. Para una instalación existente,
respaldar y conservar los datos antes de adaptar su propietario.

```bash
docker compose up -d --build
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

Respaldar SQLite y conservar `.env` y `data/session-secret` con acceso protegido;
ver [respaldo y exportación](DESPLIEGUE.md#5-respaldo-y-exportación).

```bash
cd /var/src/pizarra-udec
git pull --ff-only
docker compose up -d --build
docker compose ps
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

`--build` incorpora el código nuevo; los datos persisten y las migraciones se aplican al
iniciar. Los moderadores vuelven a entrar después de un reinicio porque sus sesiones viven
en memoria. Las futuras publicaciones deben continuar el historial saneado existente.
El historial local de desarrollo no se publica ni se instala en el servidor.

### Una vez: pasar desde la primera publicación a la entrega saneada

Solo aplica a una instalación antigua anterior al saneamiento del historial, no a nuevos
clones ni a actualizaciones normales. Si `git pull --ff-only` detecta historiales incompatibles,
conservar la carpeta anterior y respaldar los datos, `.env` y secreto. La Célula prepara un
clon nuevo bajo `/var/src`, detiene la instalación anterior y transfiere el respaldo con sus
permisos antes de levantarlo. No usar `reset --hard`, borrar datos o forzar un nuevo historial.

## Pendientes administrativos de GIIA

**Todavía no existe ticket aprobado ni dominio asignado. El código y esta guía no los crean.**

- Ingresar y aprobar el ticket; obtener la aprobación formal de la Célula Estratégica de Proyectos y del Comité Directivo de GIIA.
- Aprobar CPU, RAM, disco, puerto y fechas; disponer de Docker y Compose, y de salida a internet para la construcción o autorizar la transferencia de una imagen.
- Asignar subdominio, DNS, certificado HTTPS y proxy con WebSocket; confirmar su topología.
- Realizar el levantamiento en `/var/src` y autorizar acceso al repositorio, cuentas SSH personales, permisos Docker y grupos Linux, con acceso de inspección y administración para la Célula.
- Revisar la seguridad del proyecto, contenedor y servidor, incluida la aplicabilidad de los avisos Debian documentados en [SEGURIDAD.md](SEGURIDAD.md); acordar actualizaciones los viernes fuera de horario y respuesta urgente ante vulnerabilidades.
- Establecer monitoreo externo de CPU, RAM, disco y red. El endpoint de salud y `docker stats` son herramientas auxiliares, no el monitoreo externo continuo.
- Definir rotación automática de logs en un máximo de 365 días y revisión periódica. Compose ya limita el tamaño a cinco archivos de 10 MB; eso no limita su antigüedad.
- Programar respaldos al final de cada mes según 3-2-1, incluyendo configuraciones, SQLite, `.env` y secreto persistente, con destinos y acceso protegidos y restauración ensayada.
- Comprobar la URL pública desde fuera de la universidad, en computador y celular, y el funcionamiento del proxy, moderación y tiempo real antes del evento; notificar el resultado por el ticket.
