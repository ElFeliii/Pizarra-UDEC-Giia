# Descripciones de edificios

Revisión del 6 de octubre de 2026. Hay **38 edificios con descripción** en
`client/src/map/edificios.json`. Se incorporaron 15 fichas nuevas y se corrigió el uso del
Edificio Ingeniería de Sistemas según el inventario institucional de Ingeniería.

Los textos nuevos describen la función de cada unidad para visitantes del campus. Su enlace
oficial aparece en la ficha. No se atribuye una carrera a una facultad solo por cercanía física.
En particular, la FAUG presenta Arquitectura y Geografía.

## Textos con fuente institucional incorporados en esta revisión

### Edificio Tecnológico Mecánico

Aquí se realizan prácticas de ingeniería en laboratorios de electricidad, electrónica, mecánica y telecomunicaciones. Es parte de la infraestructura de la Facultad de Ingeniería.

[Fuente institucional](https://fi.udec.cl/facultad/infraestructura/edificios/).

### Facultad de Arquitectura, Urbanismo y Geografía

La FAUG forma profesionales de Arquitectura y Geografía. Sus departamentos estudian los edificios, las ciudades y el territorio, con énfasis en un desarrollo sostenible.

[Fuente institucional](https://faug.udec.cl/quienes-somos/).

### Edificio Ingeniería Metalúrgica

Sede del Departamento de Ingeniería Metalúrgica, con laboratorios y oficinas. Fue renombrado Edificio Alexander Sutulov Popov en 2024.

[Fuente institucional](https://fi.udec.cl/emotiva-ceremonia-oficializa-el-cambio-de-nombre-del-edificio-del-departamento-de-ingenieria-metalurgica-a-alexander-sutulov-p-y-el-auditorio-dr-fernando-concha-a/).

### Edificio Virginio Gómez

Este antiguo hogar universitario, inaugurado en 1952, forma parte de la historia del campus. En su primer piso funciona el Archivo Central de la Universidad.

[Fuente institucional](https://fp.udec.cl/index.php/archivo-central-de-la-universidad-de-concepcion-chile).

### Facultad de Educación

Forma docentes para educación parvularia, básica, diferencial y enseñanza media. Sus pedagogías abarcan ciencias, humanidades, artes y educación física.

[Fuente institucional](https://educacion.udec.cl/carreras/).

### Edificio de Ingeniería Civil e Ingeniería Civil Aeroespacial

Ubicado en el extremo sur del campus, alberga salas de clases y laboratorios de Ingeniería Civil e Ingeniería Civil Aeroespacial.

[Fuente institucional](https://fi.udec.cl/facultad/infraestructura/edificios/).

### Facultad de Ciencias Sociales

Reúne Antropología, Periodismo, Psicología, Trabajo Social y Sociología. Su docencia e investigación ayudan a comprender la sociedad y sus vínculos con las comunidades.

[Fuente institucional](https://www.udec.cl/facultades/facultad-de-ciencias-sociales/).

### Dirección de Tecnologías de Información

La DTI mantiene servicios tecnológicos de la Universidad, como la cuenta institucional y sus plataformas digitales. Apoya a estudiantes y funcionarios en el uso de estas herramientas.

[Fuente institucional](https://educacion.udec.cl/induccion/).

### Edificio Ingeniería de Sistemas

Alberga laboratorios de Ingeniería Civil Biomédica, aulas, espacios de estudio y salas de computación. Se conecta con oficinas de Biomédica y Telecomunicaciones.

[Fuente institucional](https://fi.udec.cl/facultad/infraestructura/edificios/).

### Edificio Tecnológico Químico Gustavo Pizarro Castro

Sede del Departamento de Ingeniería Química, inaugurada en 1959. Lleva el nombre de Gustavo Pizarro Castro por su contribución a la carrera.

[Fuente institucional](https://fi.udec.cl/facultad/infraestructura/edificios/).

### Edificio EULA 1

Parte del Centro de Ciencias Ambientales EULA-Chile. El centro desarrolla investigación aplicada, análisis de laboratorio y asistencia técnica sobre problemas ambientales.

[Fuente institucional](https://eula.udec.cl/).

### Edificio EULA 2

Parte del Centro de Ciencias Ambientales EULA-Chile. El centro desarrolla investigación aplicada, análisis de laboratorio y asistencia técnica sobre problemas ambientales.

[Fuente institucional](https://eula.udec.cl/).

### Edificio EULA 3

Parte del Centro de Ciencias Ambientales EULA-Chile. El centro desarrolla investigación aplicada, análisis de laboratorio y asistencia técnica sobre problemas ambientales.

[Fuente institucional](https://eula.udec.cl/).

### Centro de Investigación en Ingeniería Matemática (CI²MA)

El CI²MA desarrolla investigación en matemáticas aplicadas. Reúne investigadores, estudiantes de postgrado y visitantes que trabajan en modelos y métodos para resolver problemas científicos.

[Fuente institucional](https://www.ci2ma.udec.cl/).

### Dirección de Docencia

Esta dirección impulsa la política de docencia de pregrado y su mejoramiento continuo. Sus unidades apoyan la enseñanza y la formación universitaria.

[Fuente institucional](https://dirdocweb.udec.cl/).

### CapsiUdeC

Centro clínico docente de atención psicológica de la Universidad. Ofrece atención a la comunidad y servicios con arancel diferenciado para estudiantes.

[Fuente institucional](https://educacion.udec.cl/saludmental/).

## Contenido previo y lo que falta

Los otros 22 textos existentes se conservaron. Sus referencias y usos actuales requieren
una revisión institucional posterior; esta actualización no certifica datos históricos del
catálogo anterior. Los 47 edificios restantes muestran «Descripción pendiente» y pueden
abrirse igualmente. Ver el inventario completo en [EDIFICIOS.md](EDIFICIOS.md).

Para completar una descripción, editar `descripcion` y, cuando exista, `fuenteDescripcion`
en la ficha. Usar información oficial, evitar inferir usos de una fotografía y conservar el
identificador del mapa. Después ejecutar las comprobaciones del proyecto y regenerar
el inventario con `npm run fotos:inventario`.
