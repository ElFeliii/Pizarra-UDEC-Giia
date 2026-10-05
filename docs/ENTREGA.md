# Entrega de Pizarra UdeC al administrador

## Repositorio y dirección

- Repositorio privado: https://github.com/ElFeliii/Pizarra-UDEC-Giia. Dar acceso a la cuenta de quien despliega; no enviar claves en el repositorio.
- Dirección pública solicitada: un subdominio que termine en **.giia.udec.cl**.
- Ejemplo pendiente de asignación: **https://pizarra.giia.udec.cl**. El nombre del repositorio no es el dominio del sitio.
- Panel de moderación: `/moderador` en ese mismo dominio.

La versión de entrega se prepara desde una copia limpia, sin historial de desarrollo ni
credenciales. Consultar el estado de publicación y la revisión en [PRIVACIDAD.md](PRIVACIDAD.md).

## Requisitos y puertos

Docker con Compose, un servidor Linux con escritura en la carpeta del proyecto, salida a
internet para construir la imagen y un proxy HTTPS con WebSocket. Reservar al menos
1 vCPU, 1 GB de RAM y 2 GB de disco; ensayar la versión actual antes del evento.

| Puerto   | Uso                                              | Acceso                                               |
| -------- | ------------------------------------------------ | ---------------------------------------------------- |
| 443/TCP  | Página, API y WebSocket por HTTPS                | Público, en el proxy de la Universidad               |
| 80/TCP   | Redirección a HTTPS o validación del certificado | Solo si lo usa el administrador del proxy            |
| 3000/TCP | Aplicación Docker                                | Solo `127.0.0.1` del servidor; no abrirlo al público |
| 5173/TCP | Vite de desarrollo                               | No se utiliza en producción                          |

La configuración suministrada supone **un proxy HTTPS en el mismo servidor que Docker**.
Si el proxy está en otra máquina, el administrador debe adaptar el enlace privado y
`TRUST_PROXY`; no basta con apuntar al localhost de esa otra máquina.

## Primera instalación

```bash
git clone https://github.com/ElFeliii/Pizarra-UDEC-Giia pizarra-udec
cd pizarra-udec
cp .env.example .env
chmod 600 .env
# En Linux: el contenedor ejecuta Node con UID/GID 1000.
mkdir -p data
sudo chown 1000:1000 data
sudo chmod 700 data
```

El administrador debe autorizar esos permisos de `data/`. No cambiar permisos de una
base existente sin respaldo; al migrarla, conservar o adaptar su propietario para el
UID 1000 del contenedor.

Editar `.env` antes de continuar:

```dotenv
MOD_USERS=Moderador 1:REEMPLAZAR-CON-CLAVE-DEL-EQUIPO
TRUST_PROXY=1
```

`MOD_USERS` es obligatorio si no se configura la llave maestra opcional `MOD_PASSWORD`.
El ejemplo no es una clave válida para el evento: sustituirla por las credenciales que el
organizador entregue por separado. Para claves que contengan coma, elegir otra clave, pues
la coma separa moderadores. Cada entrada usa `nombre:clave`.

| Variable            | Configuración                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `MOD_USERS`         | Lista de moderadores y sus claves; completar en el servidor                              |
| `TRUST_PROXY`       | `1` para un único proxy local y el puerto Docker solo en localhost                       |
| `MOD_PASSWORD`      | Vacía si no se necesita llave maestra; si se usa, mínimo 8 caracteres                    |
| `SESSION_SECRET`    | Puede quedar vacía: se genera en `data/session-secret`; si se fija, mínimo 32 caracteres |
| `AUTO_HIDE_REPORTS` | `3` por defecto; `0` desactiva el ocultado automático por reportes                       |

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

El servicio debe quedar `healthy`. El administrador configura DNS, certificado y proxy;
los ejemplos Nginx/Apache están en [DESPLIEGUE.md](DESPLIEGUE.md#3-proxy-con-websocket).
El proxy debe pasar `Host`, `X-Forwarded-For` y `X-Forwarded-Proto`, además de permitir
WebSocket. No hace falta un puerto adicional para Socket.IO.

## Actualizar

Antes de cambiar la versión, hacer un respaldo de SQLite y conservar `.env` y
`data/session-secret` por un canal privado (procedimiento en [DESPLIEGUE.md](DESPLIEGUE.md#5-respaldo-y-exportación)).

```bash
cd pizarra-udec
git pull --ff-only
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

Se necesita `--build` para incorporar el código nuevo. Los datos de `data/` sobreviven;
las migraciones se aplican al iniciar. Las sesiones de moderación viven en memoria:
tras reiniciar, los moderadores vuelven a entrar.

Las actualizaciones siguientes conservan el historial de la copia limpia: no publicar el
historial de desarrollo ni volver a reemplazarlo por un commit raíz.

### Una vez: pasar desde la primera publicación a la entrega saneada

La primera publicación tiene un único commit cuyo mensaje contiene metadatos que deben
retirarse. La entrega saneada reemplaza esa raíz, por lo que una instalación anterior no
puede pasar a ella con `git pull --ff-only`. Antes de hacerlo, respaldar SQLite, `.env` y
`data/session-secret` con el procedimiento de respaldo de DESPLIEGUE.md.

Con la instalación anterior en `pizarra-udec` y sin usar todavía la carpeta nueva:

```bash
# Desde la carpeta que contiene pizarra-udec.
git clone https://github.com/ElFeliii/Pizarra-UDEC-Giia pizarra-udec-actual
docker compose -f pizarra-udec/docker-compose.yml down
cp -a pizarra-udec/data pizarra-udec-actual/data
cp -p pizarra-udec/.env pizarra-udec-actual/.env
cd pizarra-udec-actual
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

La copia anterior queda disponible como respaldo. Después, ejecutar las actualizaciones
normales desde `pizarra-udec-actual`; no usar `reset --hard` ni borrar la carpeta de datos.

## Comprobación de entrega

1. Acceso al repositorio privado concedido y versión publicada identificada.
2. `.env` completado, servicio `healthy` y endpoint de salud disponible.
3. Dominio asignado dentro de `.giia.udec.cl`, DNS y certificado válidos.
4. Página y `/moderador` accesibles por HTTPS desde fuera de la Universidad.
5. Publicar una nota desde un navegador y verla en otro sin recargar.
6. Comprobar coronita de moderador, filtro, FAQ, mapa y exportación CSV.
7. Respaldo realizado y restauración ensayada antes del evento.

La asignación del dominio, el acceso al servidor, el certificado y la concesión de acceso
al repositorio dependen del equipo y del administrador. Esta guía no los crea.
