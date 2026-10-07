# Edificios del mapa

> Generado por `npm run fotos:inventario`. No lo edites a mano.

85 edificios con nombre, tomados de OpenStreetMap. **Con foto: 23.
Con descripción: 38.**

Todos los edificios identificados se pueden abrir desde su silueta, su nombre o el buscador,
incluso si falta contenido. Las fotos y descripciones disponibles viven en
`client/src/map/edificios.json`; los campos pendientes se indican en la ficha.

## Cómo agregar una foto propia

1. Deja el archivo en `client/public/edificios/` (JPG, ~900 px de ancho, menos de 300 KB).
2. Anótalo en `client/src/map/edificios.json`:

```json
"edificio-gimnasio-c": {
  "descripcion": "Texto que se muestra en la ventana del edificio.",
  "fotos": [{ "archivo": "gimnasio-c.jpg" }]
}
```

Una foto tomada por el equipo no lleva `autor`, `licencia` ni `fuente`: son para material de
terceros. Si la foto es de otra persona (incluida la Dirección de Comunicaciones de la UdeC),
pide autorización por escrito y anota el crédito en esos tres campos.

**No sirven las fotos de Google Maps, Street View, Instagram ni sitios de noticias**: tienen
derechos de autor y publicarlas en el sitio de la Universidad la expone a un reclamo. Las que
ya están vinieron de Wikimedia Commons, con licencia libre y su crédito visible en la ficha.

3. Corre `npm test` (hay pruebas que verifican que cada foto anotada exista) y
   `npm run fotos:inventario` para actualizar esta lista.

## Lista

| Edificio | Área (m²) | Foto | Descripción | Crédito | id |
| --- | ---: | --- | --- | --- | --- |
| Edificio Tecnológico Mecánico | 2916 | — | ✅ |  | `edificio-tecnologico-mecanico` |
| Casa del Deporte | 2678 | ✅ 1 | ✅ | Farisori (CC BY-SA 3.0) | `edificio-casa-del-deporte` |
| Biblioteca Central Luis David Cruz Ocampo | 2677 | ✅ 2 | ✅ | Tomás Jorquera (CC BY 2.0); BiblioJona (CC BY-SA 4.0) | `edificio-biblioteca-central-luis-david-cruz-ocampo` |
| Facultad de Arquitectura, Urbanismo y Geografía | 2408 | — | ✅ |  | `edificio-facultad-de-arquitectura-urbanismo-y-geografia` |
| Facultad de Odontología | 2051 | ✅ 1 | ✅ | Yordan Garrido González (CC BY-SA 4.0) | `edificio-facultad-de-odontologia` |
| Facultad de Ciencias Químicas | 2001 | ✅ 1 | ✅ | Yordan Garrido González (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-quimicas` |
| Edificio Ingeniería Metalúrgica | 2001 | — | ✅ |  | `edificio-ingenieria-metalurgica` |
| Facultad de Medicina UdeC | 1851 | ✅ 1 | ✅ | Farisori (CC BY-SA 3.0) | `edificio-facultad-de-medicina-udec` |
| Edificio Virginio Gómez | 1794 | — | ✅ |  | `edificio-virginio-gomez` |
| Facultad de Educación | 1792 | — | ✅ |  | `edificio-facultad-de-educacion` |
| Edificio de Ingeniería Civil e Ingeniería Civil Aeroespacial | 1779 | — | ✅ |  | `edificio-de-ingenieria-civil-e-ingenieria-civil-aeroespacial` |
| Casa del Arte José Clemente Orozco | 1708 | ✅ 2 | ✅ | Fotografía tomada por User:Farisori ; Arquitectos: Osvaldo Cáceres y Alejandro Rodríguez; Propiedad de la Universidad de Concepción , Chile (Public domain); LuisCG11 (CC BY-SA 3.0) | `edificio-casa-del-arte-jose-clemente-orozco` |
| Facultad de Ciencias Físicas y Matemáticas | 1670 | ✅ 1 | ✅ | Gnzlndrs (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-fisicas-y-matematicas` |
| Facultad de Ciencias Económicas y Administrativas | 1645 | ✅ 1 | ✅ | Yordan Garrido González (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-economicas-y-administrativas` |
| Facultad de Ciencias Químicas | 1578 | — | — |  | `edificio-facultad-de-ciencias-quimicas-2` |
| Facultad de Ciencias Biológicas (Arco) | 1574 | ✅ 4 | ✅ | BiblioJona (CC BY 4.0); @lasfotosde_conce ; Andrés Pacheco Cádiz (CC BY-SA 4.0); BiblioJona (CC BY 4.0); BiblioJona (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-biologicas-arco` |
| Edificio de Aulas Salvador Gálvez | 1543 | ✅ 1 | ✅ | Ivotoledo45 (CC BY-SA 4.0) | `edificio-de-aulas-salvador-galvez` |
| Facultad de Ciencias Naturales y Oceanográficas | 1525 | ✅ 2 | ✅ | BiblioJona (CC BY-SA 4.0); Gnzlndrs (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-naturales-y-oceanograficas` |
| Centro de Biotecnología | 1524 | ✅ 1 | ✅ | Gnzlndrs (CC BY-SA 4.0) | `edificio-centro-de-biotecnologia` |
| Mozatschule Concepción | 1489 | — | — |  | `edificio-mozatschule-concepcion` |
| Facultad de Ciencias Forestales | 1390 | ✅ 1 | ✅ | Gnzlndrs (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-forestales` |
| Facultad de Farmacia | 1297 | ✅ 2 | ✅ | Tamara biblio (CC BY-SA 4.0); Farisori (CC BY-SA 3.0) | `edificio-facultad-de-farmacia` |
| Facultad de Ciencias Sociales | 1270 | — | ✅ |  | `edificio-facultad-de-ciencias-sociales` |
| Edificio de Anatomía | 1264 | ✅ 1 | ✅ | Tamara biblio (CC BY-SA 4.0) | `edificio-de-anatomia` |
| Dirección de Tecnologías de Información | 1193 | — | ✅ |  | `edificio-direccion-de-tecnologias-de-informacion` |
| Facultad de Ciencias Jurídicas y Sociales | 1191 | ✅ 2 | ✅ | Yordan Garrido González (CC BY-SA 4.0); BiblioJona (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-juridicas-y-sociales` |
| Facultad de Ingeniería | 1187 | ✅ 1 | ✅ | Farisori (CC BY-SA 3.0) | `edificio-facultad-de-ingenieria` |
| Edificio Ingeniería de Sistemas | 1157 | ✅ 1 | ✅ | Farisori (CC BY-SA 3.0) | `edificio-ingenieria-de-sistemas` |
| Facultad de Humanidades y Arte | 1152 | ✅ 1 | ✅ | BiblioJona (CC BY-SA 4.0) | `edificio-facultad-de-humanidades-y-arte` |
| Edificio Tecnológico Químico Gustavo Pizarro Castro | 1148 | — | ✅ |  | `edificio-tecnologico-quimico-gustavo-pizarro-castro` |
| Block 3 Plaza Perú | 976 | — | — |  | `edificio-block-3-plaza-peru` |
| Central Térmica | 951 | — | — |  | `edificio-central-termica` |
| Edificio de Aulas N° 4 | 881 | — | — |  | `edificio-de-aulas-n-4` |
| Gimnasio E | 864 | — | — |  | `edificio-gimnasio-e` |
| Gimnasio C | 809 | — | — |  | `edificio-gimnasio-c` |
| Centro de Formación y Recursos Didácticos | 799 | ✅ 1 | ✅ | No machine-readable author provided. CFRD assumed (based on copyright claims). (CC BY-SA 3.0) | `edificio-centro-de-formacion-y-recursos-didacticos` |
| Edificio Emprendo Incuba | 793 | — | — |  | `edificio-emprendo-incuba` |
| Departamento de Oceanografía | 776 | — | — |  | `edificio-departamento-de-oceanografia` |
| EmpreUdeC | 730 | — | — |  | `edificio-empreudec` |
| Gimnasio D | 702 | — | — |  | `edificio-gimnasio-d` |
| Iglesia Santa Mónica (Agustinos) | 668 | — | — |  | `edificio-iglesia-santa-monica-agustinos` |
| Block 4 Plaza Perú | 660 | — | — |  | `edificio-block-4-plaza-peru` |
| Facultad de Ciencias Veterinarias | 654 | ✅ 1 | ✅ | Gnzlndrs (CC BY-SA 4.0) | `edificio-facultad-de-ciencias-veterinarias` |
| Departamento de Educación Física | 637 | — | — |  | `edificio-departamento-de-educacion-fisica` |
| Edificio Víctor Lamas | 630 | — | — |  | `edificio-victor-lamas` |
| Edificio EULA 1 | 616 | — | ✅ |  | `edificio-eula-1` |
| Clínica Veterinaria | 558 | — | — |  | `edificio-clinica-veterinaria` |
| Edificio Enlaces | 556 | — | — |  | `edificio-enlaces` |
| Planta Piloto "Igor Wilkomirsky" | 548 | — | — |  | `edificio-planta-piloto-igor-wilkomirsky` |
| Edificio EULA 2 | 547 | — | ✅ |  | `edificio-eula-2` |
| Edificio de Aulas Nº 5 | 541 | — | — |  | `edificio-de-aulas-n-5` |
| Edificio EULA 3 | 518 | — | ✅ |  | `edificio-eula-3` |
| Edificio de Aulas N° 1 | 486 | — | — |  | `edificio-de-aulas-n-1` |
| Edificio de Aulas N° 2 | 464 | — | — |  | `edificio-de-aulas-n-2` |
| Estudio TVU | 456 | — | — |  | `edificio-estudio-tvu` |
| Edificio de Aulas N° 3 | 452 | — | — |  | `edificio-de-aulas-n-3` |
| Incubadora Idea | 434 | — | — |  | `edificio-incubadora-idea` |
| Edificio Docente Biología Molecular | 423 | — | — |  | `edificio-docente-biologia-molecular` |
| Departamento de Filosofía UDEC | 413 | — | — |  | `edificio-departamento-de-filosofia-udec` |
| Departamento de Ciencias de la Tierra | 412 | — | — |  | `edificio-departamento-de-ciencias-de-la-tierra` |
| Facultad de Agronomía | 393 | — | — |  | `edificio-facultad-de-agronomia` |
| Centro de Investigación en Ingeniería Matemática (CI²MA) | 392 | — | ✅ |  | `edificio-centro-de-investigacion-en-ingenieria-matematica-ci-ma` |
| Centro Médico Emsa | 380 | — | — |  | `edificio-centro-medico-emsa` |
| Departamento de Astronomía, Facultad de Ciencias Físicas y Matemáticas | 362 | ✅ 1 | ✅ | Gnzlndrs (CC BY-SA 4.0) | `edificio-departamento-de-astronomia-facultad-de-ciencias-fisicas-y-matematicas` |
| Aula 9 | 360 | — | — |  | `edificio-aula-9` |
| TVU | 319 | — | — |  | `edificio-tvu` |
| Dirección de Docencia | 316 | — | ✅ |  | `edificio-direccion-de-docencia` |
| CapsiUdeC | 298 | — | ✅ |  | `edificio-capsiudec` |
| Laboratorio Silvotecnológico de la Madera | 285 | — | — |  | `edificio-laboratorio-silvotecnologico-de-la-madera` |
| Casa Enrique Molina | 285 | — | — |  | `edificio-casa-enrique-molina` |
| Parroquia Universitaria Concepción | 280 | — | — |  | `edificio-parroquia-universitaria-concepcion` |
| Programa de Estudios sobre la Responsabilidad Social y Programa Talentos UdeC | 223 | — | — |  | `edificio-programa-de-estudios-sobre-la-responsabilidad-social-y-programa-talentos-udec` |
| Casa del Donante | 207 | — | — |  | `edificio-casa-del-donante` |
| Asociación del Personal Docente y Administrativo UdeC | 206 | — | — |  | `edificio-asociacion-del-personal-docente-y-administrativo-udec` |
| Secretaría Acedémica Facultad de Ingeniería UdeC | 191 | — | — |  | `edificio-secretaria-acedemica-facultad-de-ingenieria-udec` |
| Centro Mandala | 170 | — | — |  | `edificio-centro-mandala` |
| UdeC Capacita | 167 | — | — |  | `edificio-udec-capacita` |
| Residencia Universitaria Valentín Letelier | 164 | — | — |  | `edificio-residencia-universitaria-valentin-letelier` |
| Barrio Lola | 157 | — | — |  | `edificio-barrio-lola` |
| Casa Minga | 123 | — | — |  | `edificio-casa-minga` |
| Completex | 119 | — | — |  | `edificio-completex` |
| Instituto de Investigaciones Tecnológicas UdeC | 114 | — | — |  | `edificio-instituto-de-investigaciones-tecnologicas-udec` |
| Mediación Universitaria UdeC | 110 | — | — |  | `edificio-mediacion-universitaria-udec` |
| Centro de Extensionismo Tecnológico en Manufactura | 55 | — | — |  | `edificio-centro-de-extensionismo-tecnologico-en-manufactura` |
| Campanil | 23 | ✅ 2 | ✅ | Jfriz (CC BY-SA 4.0); Tomás Jorquera from Chile (CC BY 2.0) | `edificio-campanil` |
