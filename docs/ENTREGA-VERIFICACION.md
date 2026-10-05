# Verificación de la entrega

Fecha: 5 de octubre de 2026. La entrega incorpora el límite de alejamiento del mapa, el encuadre automático y la
revisión de privacidad; se comprobó en una instancia Docker aislada.

| Comprobación                                           | Resultado                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                             | 345 pruebas en 25 archivos, salida 0                                                                                                                                   |
| `npm run typecheck`                                    | Salida 0                                                                                                                                                               |
| `npm run lint`                                         | Salida 0                                                                                                                                                               |
| Prettier sobre los documentos modificados              | Aplicado                                                                                                                                                               |
| `docker compose config --quiet`                        | Configuración original válida, salida 0                                                                                                                                |
| `docker build -t pizarra-udec:entrega-zoom-20261005 .` | Construcción de cliente y servidor y exportación de imagen, salida 0                                                                                                   |
| Compose con imagen actual y datos aislados             | `healthy`, puerto local de prueba 3187                                                                                                                                 |
| HTTP y WebSocket                                       | Salud, página, capa de ciudad, sesión, login, publicación entre dos clientes, firma del pin, firma de respuesta, filtro y lectura de hilo: 10 comprobaciones correctas |
| Reinicio del contenedor                                | Conserva pin firmado, respuesta y secreto; SQLite en versión 5                                                                                                         |
| Navegador contra el contenedor                         | Interfaz visible, límite comprobado en escritorio y celular en ambas orientaciones, pizarra conservando su zoom y consola sin errores                                  |

Imagen verificada: `sha256:7e28eea0bab4dad40d4be3c64cef2022338c6c1501699f159505422c45cd1df8`.
Tamaño reportado por Docker: 429266070 bytes. Motor Docker 29.8.0, Compose 5.5.1.
La prueba usa la configuración Compose del proyecto con nombre, imagen, puerto, volumen
vacío y credenciales sintéticas propios; no utiliza la base ni las claves del evento.

## Avisos y límites

- Vite informa paquetes mayores de 500 KB. La capa de ciudad se carga aparte: unos 381 KB con gzip.
- La construcción informa una vulnerabilidad baja de `esbuild` en herramientas de desarrollo; `npm audit --json` la identifica como GHSA-g7r4-m6w7-qqqr. No se cambiaron dependencias en esta entrega. La instalación de ejecución de Docker informa cero vulnerabilidades.
- No se comprobó el proxy real, DNS, certificado ni acceso público: el dominio dentro de `.giia.udec.cl` sigue pendiente de asignación.
- La copia para GitHub usa un historial saneado separado del desarrollo; el administrador necesita acceso al repositorio privado. Ver el alcance de revisión en PRIVACIDAD.md.
- La imagen de prueba queda disponible localmente; el ZIP contiene fuentes para construirla, no el archivo de imagen Docker.
