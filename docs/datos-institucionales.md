# Datos institucionales reales — Administración Industrial

Datos oficiales del programa, extraídos de documentos institucionales. **No son provisionales:
son los valores reales.** El seed del backend los carga en `src/datos-iniciales/` (`programa.ts`
como datos base y `demostracion.ts` como datos de demostración).

Los dos repositorios son públicos. Por eso esta copia no nombra a ninguna persona: los
responsables de las fuentes y la asignación de líderes y docentes se describen por su función
(Ley 1581 de 2012).

Fuentes:

- `Matriz Consistencia RAP` — Vicerrectoría de Docencia, Desarrollo Profesoral.
  Responsables: dos docentes del programa, los líderes del RAP 3.
- `INFORME EVALUACIÓN RAP 2023-II — Administración Industrial`.
- `Producto 1 — Arquitectura del Negocio URAP` (revisado, v2), Tablas 16 y 17.
- `FO-DO/PC-023 v00` — Medición de resultado de aprendizaje del programa por asignatura.
- `FO-DO/PC-023 diligenciado` — medición del RAP 2 en Finanzas de corto plazo, primer período
  de 2024, entregado por la docente que diligenció la medición. **Contiene los nombres reales de 34
  estudiantes: ese archivo no entra al repositorio, ni siquiera a `docs/fuentes/`.** Aquí solo
  están sus datos agregados.
- `Acuerdo No. 46 del 26 de mayo de 2026` — Consejo Académico, calendario académico 2026-2.

Al final está **lo que todavía no existe** y hay que pedirle al programa. No lo inventes.

---

## 1. Matriz de permisos por rol

Fuente: Producto 1, Tabla 17 «Matriz general de permisos por rol», y Tabla 16 «Catálogo de
roles». Esta es la matriz que faltaba para HU-01-03.

**Convenciones:** `ADM` = administrar · `R` = registrar · `E` = editar · `A` = aprobar ·
`G` = generar · `C` = consultar · `—` = sin acceso.

| Módulo | Administrador | Docente | Líder RAP | Departamento | Dirección | Estudiante |
|---|---|---|---|---|---|---|
| Usuarios y roles | ADM | — | — | C | C | — |
| Estructura académica | ADM | C | C | C | C | C |
| Proyectos docentes | ADM/C | E propios | C | R/A/C | C | C publicados |
| Plan de curso | ADM/C | R/E propios | C | A/C | C | C publicado |
| RAP y RAC | ADM | R/E RAC propios | C RAP asignados | A/C | C | C autorizado |
| Registro de clases | ADM/C | R/E propios | C | C | C | — |
| Documentos | ADM/C | R/E propios | C autorizados | C | C | C autorizados |
| Reportes | ADM | C propios | C RAP asignados | G/C | C | — |
| Auditoría | ADM/C | — | — | C restringida | C restringida | — |

Los seis roles corresponden uno a uno con los actores de la especificación: Administrador =
ACT-03, Docente = ACT-01, Líder RAP = ACT-05, Departamento = ACT-02, Dirección = ACT-06,
Estudiante = ACT-04. ACT-07 son sistemas externos y no es un rol con credenciales.

**Corrección de la fila «Proyectos docentes» (v2 del Producto 1).** La versión original decía
Docente `R/E propios` y Departamento `A/C`, que es el supuesto inicial del equipo antes de la
sesión con la docente que diligenció la medición del RAP 2. Lo correcto es Docente `E propios` y Departamento `R/A/C`:
el proyecto docente lo crea el departamento académico (RF-08 asistente, RF-09 duplicación,
RF-10 carga desde Excel; HU-05-01 a HU-05-06) y el docente lo diligencia (RF-11 a RF-16). La
consecuencia para los guards es directa: **crear, duplicar y cargar desde Excel son del
Departamento** (y del Administrador por `ADM`); **el Docente no puede crear un proyecto docente
por ninguna vía**, solo editar aquellos en los que figura en `proyecto_docente_docente`. Si el
seed de permisos de HU-01-03 le dio al Docente un permiso de creación sobre proyectos, hay que
quitárselo. Las filas «Plan de curso» y «RAP y RAC» no cambian: ahí el `R` del Docente es
registrar contenidos y RAC dentro de su proyecto, que sí le corresponde.

**Importante sobre la granularidad.** Esta matriz es por módulo, no por endpoint. Define el
marco y resuelve los casos de alcance («propios», «RAP asignados», «publicados»), que es lo
difícil. El detalle por operación sale del requisito funcional correspondiente: la matriz dice
que el Docente registra y edita *sus* proyectos, y el RF-11 dice en qué estados puede hacerlo.
Si la matriz y un RF se contradicen, para y pregunta: casi siempre significa que hay una
decisión pendiente, no un error de transcripción.

**Los alcances condicionados no son adjetivos, son filtros.** «R/E propios» significa que el
guard tiene que comprobar que el usuario está en `proyecto_docente_docente`, no solo que tenga
el rol Docente. «C RAP asignados» se resuelve contra los RAP que el usuario lidera. Un endpoint
que verifique el rol pero no el alcance está incompleto.

### Catálogo de roles

| Rol | Responsabilidad | Alcance funcional |
|---|---|---|
| Administrador | Configura el sistema y administra información base. | Usuarios, roles, programas, asignaturas, períodos, parámetros, auditoría y soporte. |
| Docente responsable | Planea y ejecuta el proyecto docente de sus asignaturas. | Diligenciar los proyectos docentes que tiene asignados, registrar RAC, contenidos, clases y evidencias, y consultar reportes propios. |
| Líder RAP | Realiza seguimiento a los resultados de aprendizaje asignados. | Consultar proyectos relacionados, revisar RAC/RAP, evidencias, indicadores y reportes de los RAP asignados. |
| Departamento académico | Crea los proyectos docentes y supervisa la gestión académica del programa. | Crear, duplicar o cargar desde Excel los proyectos docentes y asignar sus docentes; revisarlos, aprobarlos o solicitar ajustes; consultar información consolidada y generar reportes. |
| Dirección del programa | Consulta información estratégica para decisiones. | Acceso de consulta a indicadores, reportes consolidados y estado general de los proyectos. |
| Estudiante | Consulta información expresamente autorizada. | Acceso de solo lectura a contenidos o proyectos publicados, si el programa habilita este alcance. |

---

## 2. Resultados de Aprendizaje del Programa (RAP 1 a 7)

Texto oficial, literal, de la Matriz de Consistencia del programa. Son siete y no cambian por
asignatura ni por período: pertenecen al programa.

| N° | Texto oficial |
|---|---|
| RAP 1 | Comprende, aplica y valora los conceptos matemáticos, estadísticos y el método científico en el ámbito organizacional. |
| RAP 2 | Identifica, interpreta y evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, así como su incidencia en la toma de decisiones gerenciales. |
| RAP 3 | Propone y valora alternativas de mejora en la gestión integral de las organizaciones en los ámbitos local, nacional e internacional. |
| RAP 4 | Comprende, analiza, aplica y evalúa los conceptos, principios, métodos y herramientas de la producción y las operaciones en las organizaciones. |
| RAP 5 | Comprende y aplica los conocimientos del mercadeo y del entorno digital en el desarrollo de estrategias de valor para las organizaciones. |
| RAP 6 | Define, describe y aplica los procesos de la gestión humana, desde una visión integral de las personas, apoyado en la legislación laboral vigente. |
| RAP 7 | Evalúa y aplica técnicas de comunicación asertivas (oral y escrita), así como los conceptos asociados a las ciencias sociales y jurídicas y al desarrollo sostenible, bajo principios y valores éticos. |

### Número de indicadores de desempeño por RAP

Medición 2023-II. Cada RAP se mide con 3 o 4 indicadores, nunca más de cuatro: el formato
FO-DO/PC-023 solo tiene cuatro columnas de indicador.

| RAP | Asignaturas vinculadas | Indicadores de desempeño |
|---|---|---|
| 1 | 7 | 4 |
| 2 | 8 | 4 |
| 3 | 16 | 4 |
| 4 | 18 | 4 |
| 5 | 3 | 3 |
| 6 | 5 | 3 |
| 7 | 16 | 3 |
| **Total** | **73** | **25** |

### Rúbrica real del RAP 2

Es la rúbrica con la que se midió el RAP 2 en Finanzas de corto plazo en 2024-1, tomada del
formato FO-DO/PC-023 diligenciado. Va al seed como versión 1 de la rúbrica del RAP 2 (RF-06).

| Indicador | Texto |
|---|---|
| 1 | Identifica las variables del entorno económico y financiero de las organizaciones |
| 2 | Interpreta las variables del entorno económico y financiero que inciden en las organizaciones |
| 3 | Aplica principios económicos y financieros para la definición de alternativas que contribuyan a la toma de decisiones gerenciales en las organizaciones |
| 4 | Evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, a partir de las variables identificadas |

Los descriptores de cada nivel son el texto del indicador, con la primera letra en minúscula,
precedido de un adverbio de frecuencia: «No» (1 Principiante), «Raras veces» (2 En Desarrollo),
«Frecuentemente» (3 Competente) y «Siempre» (4 Ejemplar). El indicador 1 en nivel 2, por
ejemplo, dice literalmente «Raras veces identifica las variables del entorno económico y
financiero de las organizaciones». Así están en la rúbrica oficial: genera los dieciséis textos
con esa regla.

Las rúbricas de los otros seis RAP existen (el informe 2023-II reporta sus indicadores), pero no
las tenemos. Hasta que lleguen, sus textos en el seed empiezan con «PROVISIONAL —», para que
nadie las confunda con las reales en una demostración.

---

## 3. Escala de valoración del programa

Cuatro niveles. Es la escala de Administración Industrial; otro programa puede definir la suya,
por eso vive en `escala_valoracion` / `nivel_escala` y no en el código.

| Valor | Etiqueta | Rango de calificación |
|---|---|---|
| 1 | Principiante | 0 ≤ nota < 3,0 |
| 2 | En Desarrollo | 3,0 ≤ nota < 3,5 |
| 3 | Competente | 3,5 ≤ nota < 4,3 |
| 4 | Ejemplar | nota ≥ 4,3 |

**Decidido: el docente registra el nivel, no la nota.** El instructivo del formato FO-DO/PC-023
lo dice («Valor numérico, según el nivel de desempeño (1: Principiante, 2: En Desarrollo…)») y la
medición real del RAP 2 de 2024-1 lo confirma: cada estudiante tiene un nivel de 1 a 4 por
indicador, sin ninguna nota. Es lo que ya guarda `valoracion_estudiante.id_nivel`. La tabla de
rangos de nota de arriba es solo la conversión que usó el informe 2023-II para consolidar
resultados: **no implementes conversión de notas.**

### Cómo se mide el cumplimiento de un RAP

La hoja Evaluación del formato calcula, por indicador, «Nivel 3 + 4»: el porcentaje de
estudiantes en Competente más el porcentaje en Ejemplar (la fórmula es `=D22+E22`). Ese valor se
compara con la casilla «Nivel de Desempeño Esperado (%)», que según el instructivo es el «nivel
de desempeño esperado definido para el RAP por el programa».

El modelo ya tiene las tres piezas: `escala_valoracion.umbral_cumplimiento = 3` (desde qué nivel
cuenta como logrado), `escala_valoracion.porcentaje_esperado` (el valor que fija el programa) y
`medicion_rap.porcentaje_esperado` (la copia congelada en cada medición, para que cambiar la meta
no reescriba las mediciones pasadas). **Lo único que falta es el número**: en la medición real
de 2024-1 la casilla quedó en cero. Déjalo sin valor por defecto y que la pantalla diga «meta no
definida por el programa». Si el programa responde que la meta es distinta para cada RAP, se
agrega un `porcentaje_esperado` opcional en `rap` que prevalece sobre el de la escala; ese cambio
entra primero al DBML, así que no lo hagas antes de la respuesta.

### Caso de verificación real para RF-31

La medición del RAP 2 en Finanzas de corto plazo (FP15502), primer período de 2024, valoración
formativa, 34 estudiantes, dio estos conteos:

| Indicador | Principiante | En Desarrollo | Competente | Ejemplar | Nivel 3 + 4 |
|---|---|---|---|---|---|
| 1 | 0 | 5 | 29 | 0 | 85,29 % |
| 2 | 0 | 10 | 24 | 0 | 70,59 % |
| 3 | 0 | 17 | 17 | 0 | 50,00 % |
| 4 | 0 | 17 | 17 | 0 | 50,00 % |

Úsalo como prueba de aceptación de RF-31: genera 34 estudiantes ficticios, asígnales niveles de
forma arbitraria que reproduzcan los conteos de cada indicador, y verifica que el consolidado dé
exactamente esos cuatro porcentajes. En esa medición el tamaño de la muestra y el de la cohorte
fueron iguales (34): el docente valoró al grupo completo.

---

## 4. Plan de estudios y mapeo curricular

69 asignaturas en 10 semestres, cada una tributando a uno o más RAP, para un total de 73
vínculos asignatura–RAP. Esta es la tabla de `asignatura` y de `asignatura_rap` del seed.
Los dos números cuadran con el informe 2023-II, que menciona «69 asignaturas que tributan a los
RAP del programa» y contabiliza 73 vínculos.

| Sem. | Asignatura | RAP |
|---|---|---|
| I | Fundamentos de economía | 2 |
| I | Fundamentos de contabilidad | 2 |
| I | Fundamentos de Administración | 3 |
| I | Matemáticas I | 1 |
| I | Comprensión y producción de textos I | 7 |
| I | Cátedra institucional | 7 |
| I | Curso libre I | 7 |
| II | Fundamentos de costos | 2 |
| II | Teoría general de la administración | 3 |
| II | Matemáticas II | 1 |
| II | Estadística I | 1 |
| II | Comprensión y producción de textos II | 7 |
| II | Humanidades I | 7 |
| II | Derecho constitucional | 7 |
| III | Planeación y control | 3 |
| III | Ética | 7 |
| III | Matemáticas III | 1 |
| III | Estadística II | 1 |
| III | Fundamentos de investigación | 1, 7 |
| III | Humanidades II | 7 |
| III | Curso libre II | 7 |
| IV | Microeconomía | 2 |
| IV | Organización y dirección | 3, 7 |
| IV | Matemática financiera | 2 |
| IV | Lógica y programación | 3 |
| IV | Investigación aplicada | 1, 7 |
| IV | Curso libre III | 7 |
| IV | Curso libre IV (Dibujo técnico) | 4 |
| V | Macroeconomía | 2 |
| V | Finanzas a corto plazo | 2 |
| V | Comportamiento organizacional | 6 |
| V | Química industrial | 4 |
| V | Sistemas de producción | 4 |
| V | Informática aplicada | 3 |
| V | Legislación laboral | 6 |
| V | Curso libre V | 7 |
| VI | Mercados | 5 |
| VI | Finanzas y negocios internacionales | 2 |
| VI | Administración del talento humano | 6 |
| VI | Procesos industriales | 4 |
| VI | Estudio del trabajo | 4 |
| VI | Procesos de manufactura | 4 |
| VI | Curso libre VI | 7 |
| VII | Emprendimiento e innovación | 5 |
| VII | Investigación de operaciones I | 4 |
| VII | Gestión de la cadena de suministros | 3 |
| VII | Planeación y organización de la producción | 4 |
| VII | Taller de manufactura | 4 |
| VII | Seguridad y salud en el trabajo | 3, 6 |
| VIII | Electiva I (Estudios prospectivos) | 3 |
| VIII | Electiva I GPO (Control estadístico de la calidad) | 4 |
| VIII | Preparación y evaluación de proyectos | 5 |
| VIII | Investigación de operaciones II | 4 |
| VIII | Control de la producción | 4 |
| VIII | Gestión de la calidad | 3 |
| VIII | Gestión ambiental | 3 |
| IX | Electiva II (Administración de la calidad) | 3 |
| IX | Electiva II GPO (Mejoramiento de procesos) | 4 |
| IX | Electiva III (Sistemas de información gerencial) | 3 |
| IX | Electiva III GPO (Simulación de procesos) | 4 |
| IX | Electiva IV (Administración de sueldos y salarios) | 6 |
| IX | Electiva IV GPO (Tópicos avanzados de productividad) | 4 |
| IX | Electiva V (Gestión logística del comercio internacional) | 3 |
| IX | Electiva V GPO (Administración de mantenimiento industrial) | 4 |
| IX | Electiva VI (Sistemas para la gestión de recursos empresariales) | 3 |
| IX | Electiva VI GPO (Diseño de planta) | 4 |
| X | Electiva VII (Sistemas integrados de gestión) | 3 |
| X | Electiva VII GPO (Diseño de producto) | 4 |
| X | Prácticas profesionales | 7 |

El programa tiene dos líneas de electivas, la general y la GPO (Gestión de Producción y
Operaciones). Las electivas de IX aparecen sin número de semestre explícito en el informe
original y se ubicaron en IX por el mapeo curricular; confirmar antes de usarlo como dato
definitivo del plan de estudios.

### Asignaturas con datos completos

Cuatro asignaturas traen todos los campos del punto 1 en los formatos FO-DO/PC-001 que diligenció
el programa. Con ellas el asistente de RF-08 se puede probar de punta a punta con datos reales:
el paso 5 autocompleta exactamente estos campos.

| Asignatura | Código | Componente | Tipo | Créd. | TDE | TDP | TI | Total | Prerrequisito |
|---|---|---|---|---|---|---|---|---|---|
| Fundamentos de administración | NC2507 | Profesional | Obligatorio | 3 | 48 | 0 | 96 | 144 | — |
| Fundamentos de investigación científica | NC2505 | Profesional | Obligatorio | 3 | 48 | 0 | 96 | 144 | Comprensión y producción de textos II |
| Comportamiento organizacional | FP15503 o IX24193 | Profesional | Obligatorio | 2 | 32 | 0 | 64 | 96 | Organización y dirección |
| Gestión ambiental | FP15804 | Profesional | Obligatorio | 2 | 32 | 0 | 64 | 96 | — |

Ninguna tiene correquisitos. Las cuatro cumplen la regla de 48 horas por crédito que valida
`asignatura.horas_totales`, y en las cuatro TDE = 16 h y TI = 32 h por crédito; no generalices esa
proporción, porque las asignaturas prácticas (talleres, química, dibujo técnico) tendrán TDP.

Tres observaciones. **Comportamiento organizacional aparece con dos códigos** en dos formatos del
mismo programa y con la misma docente: no elijas uno, está preguntado al programa. El formato
nombra «Fundamentos de investigación científica» a la que el mapeo curricular llama «Fundamentos
de investigación» (III semestre); con el prerrequisito de Comprensión y producción de textos II
encaja, pero confírmalo con el plan de estudios. Y los formatos traen nombres y correos reales de
docentes: no los copies al seed.

El formato 023 de 2024-1 trae además el código de **Finanzas de corto plazo: FP15502**
(V semestre). Eso orienta el caso de Comportamiento organizacional: FP15502 y FP15503, las dos de
V semestre, y FP15804, de VIII, siguen el patrón FP15 + semestre + consecutivo, mientras que
IX24193 no se parece a ningún otro código del programa. Lo más probable es que el vigente sea
FP15503, pero sigue preguntado: no lo asumas en el seed.

El código va en `asignatura.codigo_interno`, único por programa. Que una asignatura tenga dos
códigos sugiere que cambian entre versiones del plan de estudios: no lo uses como identificador
estable en ninguna relación ni en ninguna URL.

---

## 5. Líderes de RAP y docentes vinculados

El informe 2023-II trae la asignación vigente en ese período: quién lidera cada RAP y qué docente
dictó cada asignatura evaluada. **Esta copia no trae los nombres** y el seed no los carga: los
usuarios de demostración son ficticios (`*.demo@urap.local`). Lo que sí sirve para el diseño es
la forma de la asignación:

| RAP | Líderes | Asignaturas evaluadas en 2023-II |
|---|---|---|
| 1 | 1 | Matemáticas III; Investigación aplicada |
| 2 | 1 | Finanzas a corto plazo; Finanzas y negocios internacionales |
| 3 | 2 | Organización y dirección; Gestión ambiental; Electiva II (Administración de la calidad); Electiva VII (Sistemas integrados de gestión) |
| 4 | 2 | Investigación de operaciones II; Electiva II GPO (Mejoramiento de procesos); Planeación y organización de la producción; Electiva VII GPO (Diseño de producto) |
| 5 | 2 | Mercados; Emprendimiento e innovación; Preparación y evaluación de proyectos |
| 6 | 1 | Administración del talento humano; Electiva IV (Administración de sueldos y salarios) |
| 7 | 2 | Comprensión y producción de textos II; Organización y dirección; Investigación aplicada |

Dos cosas que el modelo tiene que soportar:

- **Un RAP puede tener dos líderes, y una persona puede liderar varios RAP y además dictar
  asignaturas.** En 2023-II, una de las líderes del RAP 3 dictaba Organización y dirección, que
  tributa a los RAP 3 y 7; otras personas lideraban dos RAP o lideraban uno y dictaban
  asignaturas de otro. Es el caso de varios roles por usuario (`usuario_rol`) y de varios líderes
  por RAP (`lider_rap`).
- **La asignación es de 2023-II y puede haber cambiado.** Hay que confirmarla con el programa
  antes de cualquier demostración ante él.

---

## 6. Calendario académico 2026-2 (programas presenciales)

Fuente: Acuerdo No. 46 del 26 de mayo de 2026 del Consejo Académico. Administración Industrial
es un programa presencial; el acuerdo trae además calendarios de distancia, Odontología y
Medicina, que aquí no aplican.

| Actividad | Desde | Hasta |
|---|---|---|
| Período académico (clases) | lun 3 ago 2026 | vie 27 nov 2026 |
| Inclusión de asignaturas | lun 3 ago | mié 12 ago |
| Retiro de asignaturas | lun 3 ago | lun 31 ago |
| Parciales primer corte | lun 7 sep | vie 18 sep |
| Parciales segundo corte | mar 13 oct | vie 23 oct |
| Receso de fiestas novembrinas | lun 9 nov | sáb 14 nov |
| Parciales finales | lun 30 nov | vie 11 dic |
| Evaluación docente | mar 6 oct | vie 6 nov |
| Receso docente | jue 24 dic 2026 | lun 18 ene 2027 |
| Cierre académico | mar 12 ene 2027 | mar 19 ene 2027 |

Festivos nacionales dentro del período, con el traslado de la Ley 51 de 1983: vie 7 ago (Batalla
de Boyacá), lun 17 ago (Asunción), lun 12 oct (Día de la Raza), lun 2 nov (Todos los Santos) y
lun 16 nov (Independencia de Cartagena). En la ventana de parciales finales cae el mar 8 dic
(Inmaculada Concepción). Por eso el segundo corte empieza un martes: el lunes 12 es festivo.

**Cómo se carga.** `periodo_academico`: código `2026-2`, `fecha_inicio` 2026-08-03, `fecha_fin`
2026-11-27, `numero_semanas` 16. `dia_festivo`: los seis festivos con origen `ley`, y los seis
días del receso (9 al 14 de noviembre) con origen `institucional`, para que RF-19 los marque
igual que un festivo.

**Por qué 16 semanas y no 17.** Entre el 3 de agosto y el 27 de noviembre hay 17 semanas
calendario y una es de receso. Quedan 16 de clase, que es lo que suponen los créditos (16 semanas
× 2 h TDE = 32 h en una asignatura de 2 créditos). Al numerar las sesiones por semana (RF-19,
p2), una semana entera sin clase por receso institucional no cuenta: la semana 15 del curso es
la que empieza el 16 de noviembre. Un festivo suelto, en cambio, no corre la numeración: solo
marca esa sesión como «Festivo» para que el docente la reprograme.

**Las ventanas de parciales no se modelan.** El docente marca la sesión como «Parcial» (RF-21) y
la ventana del acuerdo es solo referencia. Los parciales finales caen después del fin del
período, así que RF-19 no genera sesiones para ellos; si se decide que el examen final sea una
sesión, eso pide un campo nuevo en `periodo_academico` y pasa primero por el DBML.

**Dato para las pruebas de RF-19.** Con una sesión por semana, un curso de los lunes tiene 12
sesiones en 2026-2 (pierde la semana de receso y cuatro festivos), uno de los viernes 15 y uno
de martes a jueves 16. Es un buen caso de prueba, y la mejor explicación de por qué el programa
pidió precargar los festivos: el curso de los lunes tiene una cuarta parte menos de clases.

**Para qué sirve este calendario.** Las clases del 2026-2 terminan el 27 de noviembre de 2026,
así que sirve para el seed de demostración. La prueba beta con docentes reales caerá en 2027-1,
y ese calendario todavía no lo tenemos.

---

## 7. Lo que todavía NO existe y hay que pedirle al programa

Esto sí es lo único que falta. No lo inventes ni lo deduzcas.

1. **El valor del porcentaje esperado.** El formato tiene la casilla y el modelo tiene el campo
   (ver apartado 3); falta el número que fija el programa, y saber si es el mismo para los siete
   RAP o distinto para cada uno. En la medición real de 2024-1 quedó en cero. Sin valor por
   defecto: un 70 % de relleno se vuelve dato real en cuanto alguien vea la pantalla.

2. **El calendario académico 2027-1**, cuando el Consejo Académico lo apruebe. Es con el que se
   generarán las sesiones de la prueba beta. Los festivos nacionales no hay que pedirlos: se
   cargan en `dia_festivo` con origen `ley`.

3. **El plan de estudios completo.** De las 65 asignaturas sin formato diligenciado falta todo
   el punto 1: código SMA (salvo Finanzas de corto plazo, FP15502), créditos, horas TDE, TDP y
   TI, componente, tipo de curso, prerrequisitos y correquisitos, que son los campos que el
   asistente de RF-08 completa en el paso 5. Además, cuál de los dos códigos de Comportamiento
   organizacional está vigente. Hasta que llegue, las asignaturas sin datos van al seed solo con
   nombre, semestre y RAP, y el asistente debe mostrar el campo vacío, no un valor inventado.

4. **Las rúbricas de los RAP 1, 3, 4, 5, 6 y 7.** Solo tenemos la del RAP 2 (apartado 2).

5. **La lista de estudiantes matriculados por curso (SUP-03).** Sigue sin origen definido y de
   ella dependen RF-22, RF-27 y RF-30. Nunca uses nombres reales de estudiantes en seeds,
   fixtures ni capturas: Ley 1581 de 2012.

Ya no hace falta preguntar dos cosas que estaban en esta lista. **Nivel o nota** quedó resuelto
por el instructivo del formato y por la medición real de 2024-1: se registra el nivel (apartado
3). Y **«cohorte» (SUP-15)** dejó de bloquear: en esa medición, muestra y cohorte fueron iguales
(34, el grupo completo), así que `medicion_rap.tamano_cohorte` toma por defecto el tamaño de la
muestra y ningún cálculo lo usa.
