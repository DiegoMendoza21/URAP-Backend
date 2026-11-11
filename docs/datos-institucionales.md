# Datos institucionales reales — Administración Industrial

**Versión 3.2 — 10 de noviembre de 2026.** Los cambios de cada versión están al final, apartado por
apartado. **Este archivo es público:** no lleva nombres de personas, cédulas ni correos; a las
personas se las nombra por su función.

Datos oficiales del programa, extraídos de documentos institucionales. **No son provisionales:
estos son los valores reales.** Úsalos en el seed y en los catálogos base en lugar de textos
inventados.

Fuentes:

- `Matriz Consistencia RAP` — Vicerrectoría de Docencia, Desarrollo Profesoral. Responsables: el
  director del programa y una docente del programa.
- `INFORME EVALUACIÓN RAP 2023-II — Administración Industrial`.
- `Producto 1 — Arquitectura del Negocio URAP`, Tablas 10 y 11.
- `FO-DO/PC-023 v00` — Medición de resultado de aprendizaje del programa por asignatura.
- `FO-DO/PC-023 diligenciado` — medición del RAP 2 en Finanzas de corto plazo, primer período
  de 2024, entregado por una docente del programa. **Contiene los nombres reales de 34
  estudiantes: ese archivo no entra al repositorio, ni siquiera a `docs/fuentes/`.** Aquí solo
  están sus datos agregados.
- `Acuerdo No. 46 del 26 de mayo de 2026` — Consejo Académico, calendario académico 2026-2.
- `Una mirada a los resultados de aprendizaje` — Ministerio de Educación Nacional (2022),
  capítulo 2: las tablas de estrategias de enseñanza y de aprendizaje del apartado 7.
- `Programación académica por programa 2026-1` — SMA, reporte RAK152 del 27/01/2026. **Trae
  las cédulas de los docentes: no entra al repositorio, y ninguna cédula se copia a ningún
  archivo.** Aquí solo están códigos, nombres de asignatura, créditos y planes.

Al final está **lo que todavía no existe** y hay que pedirle al programa. No lo inventes.

---

## 1. Matriz de permisos por rol

Fuente: Producto 1, Tabla 11 «Matriz general de permisos por rol», y Tabla 10 «Catálogo de
roles». Esta es la matriz que faltaba para HU-01-03. En la versión revisada que circuló antes eran
las Tablas 17 y 16; el contenido es el mismo.

**Convenciones:** `ADM` = administrar · `R` = registrar · `E` = editar · `A` = aprobar ·
`G` = generar · `C` = consultar · `—` = sin acceso.

| Módulo | Administrador | Docente | Líder RAP | Departamento | Dirección | Estudiante |
|---|---|---|---|---|---|---|
| Usuarios y roles | ADM | — | — | C | C | — |
| Estructura académica | ADM | C | C | C | C | C |
| Proyectos docentes | ADM/C* | E propios | C | R/A/C | C | C publicados |
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
sesión de diseño con una docente del programa. Lo correcto es Docente `E propios` y Departamento `R/A/C`:
el proyecto docente lo crea el departamento académico (RF-08 asistente, RF-09 duplicación,
RF-10 carga desde Excel; HU-05-01 a HU-05-06) y el docente lo diligencia (RF-11 a RF-16). La
consecuencia para los guards es directa: **crear, duplicar y cargar desde Excel son del
Departamento**; **el Docente no puede crear un proyecto docente
por ninguna vía**, solo editar aquellos en los que figura en `proyecto_docente_docente`. Si el
seed de permisos de HU-01-03 le dio al Docente un permiso de creación sobre proyectos, hay que
quitárselo. Las filas «Plan de curso» y «RAP y RAC» no cambian: ahí el `R` del Docente es
registrar contenidos y RAC dentro de su proyecto, que sí le corresponde.

**`ADM` no incluye aprobar en ningún módulo (v3.2).** Aprobar es el permiso `A`, y en la matriz
solo lo tiene el Departamento, en «Proyectos docentes», «Plan de curso» y «RAP y RAC». El
Administrador administra los nueve módulos, pero no aprueba en ninguno. Es una decisión del
desarrollo, ya implementada.

**\* Excepción del Administrador en «Proyectos docentes» (v3.0).** Ahí `ADM` tampoco incluye
crear: la creación es del Departamento (RF-08). El Administrador conserva el resto de la
administración del módulo.

**Importante sobre la granularidad.** Esta matriz es por módulo, no por endpoint. Define el
marco y resuelve los casos de alcance («propios», «RAP asignados», «publicados»), que es lo
difícil. El detalle por operación sale del requisito funcional correspondiente: la matriz dice
que el Docente registra y edita *sus* proyectos, y el RF-11 dice en qué estados puede hacerlo.
Si la matriz y un RF se contradicen, para y pregunta: casi siempre significa que hay una
decisión pendiente, no un error de transcripción. Cuatro casos ya se resolvieron así y se
controlan por rol, porque el RF es más estrecho que el módulo: los matriculados los ven solo el
Administrador y los docentes del curso (datos personales, Ley 1581); las mediciones, el docente,
el líder RAP y el Departamento; el seguimiento, el Administrador, el Departamento y la Dirección;
y los reportes, los roles del programa.

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

### Un solo número por RAP

El formato da un porcentaje por indicador, pero RF-31 («el porcentaje acumulado») y RF-32 («el
porcentaje alcanzado frente al esperado», por RAP) necesitan uno solo. Regla, pendiente de
confirmación del programa:

**Logro del RAP = valoraciones en nivel ≥ `umbral_cumplimiento` ÷ total de valoraciones**,
contando juntas todas las valoraciones (estudiante × indicador) de todos los indicadores y, en
RF-32, de todas las mediciones cerradas de ese RAP en el período.

- Cuando todos los indicadores tienen el mismo número de estudiantes, coincide con el promedio
  simple de los indicadores. En la medición real de 2024-1 da 63,97 % (87 de 136).
- Entre asignaturas **no se promedian porcentajes: se suman valoraciones**. En 2023-II el RAP 3
  se midió en cuatro asignaturas, una con 8 estudiantes y otra con 39; promediando porcentajes,
  la de 8 pesaría lo mismo que la de 39. El informe 2023-II del programa sumó los estudiantes de
  todas las asignaturas de cada RAP (126 registros en el RAP 1), así que esta regla reproduce su
  método.
- El juicio de cumplimiento compara ese número con la meta. Además, **cada indicador se compara
  con la meta y se señala el que quede por debajo**, aunque el RAP cumpla: es lo que muestra el
  gráfico del formato, y es como el informe 2023-II decidió priorizar la intervención en el RAP 2
  (por su indicador 4).
- Muestra siempre la base, «87 de 136 valoraciones», y no solo el porcentaje: con grupos de 8 o
  10 estudiantes, un porcentaje suelto engaña.
- No se usa «cumple solo si cumplen todos los indicadores» como veredicto. Los RAP 1 a 4 tienen
  cuatro indicadores y los RAP 5 a 7 tres, así que esa regla castiga a los RAP con más
  indicadores, y además reduce el resultado a un sí o un no.
- La regla vive en una sola función. Si el programa elige la regla estricta, se cambia esa
  función: el detalle por indicador ya está calculado.
- En la comparación entre períodos (RF-32, p4), indica cuándo cambió la versión de la rúbrica:
  con otros indicadores, el número deja de ser comparable.

### Caso de verificación real para RF-31

La medición del RAP 2 en Finanzas de corto plazo (FP15502, plan 1702), primer período de 2024,
valoración
formativa, 34 estudiantes, dio estos conteos:

| Indicador | Principiante | En Desarrollo | Competente | Ejemplar | Nivel 3 + 4 |
|---|---|---|---|---|---|
| 1 | 0 | 5 | 29 | 0 | 85,29 % |
| 2 | 0 | 10 | 24 | 0 | 70,59 % |
| 3 | 0 | 17 | 17 | 0 | 50,00 % |
| 4 | 0 | 17 | 17 | 0 | 50,00 % |

Úsalo como prueba de aceptación de RF-31: genera 34 estudiantes ficticios, asígnales niveles de
forma arbitraria que reproduzcan los conteos de cada indicador, y verifica que el consolidado dé
exactamente esos cuatro porcentajes y, como logro del RAP, 63,97 % (87 de 136 valoraciones en
nivel 3 o 4). En esa medición el tamaño de la muestra y el de la cohorte fueron iguales (34): el
docente valoró al grupo completo.

---

## 4. Planes de estudio y mapeo curricular

**El programa tiene dos planes de estudio vigentes al mismo tiempo.** La programación académica
2026-1 del SMA (reporte RAK152, 27/01/2026) programa grupos del **plan 1702** en los semestres
6 a 10, en las electivas y en dos grupos de rezagados de 4 y 5, y del **plan 2502** en los
semestres 1 a 5. Cada estudiante cursa su plan, y la misma asignatura puede tener un código
distinto en cada uno: Comportamiento organizacional es FP15503 en el 1702 e IX24193 en el 2502.
Por eso el modelo v2.5 agrega `plan_estudio` y la asignatura cuelga del plan: el seed carga los
dos planes del programa, cada uno con sus asignaturas. Si un mismo código aparece en los dos
planes, son dos filas, una por plan.

### Plan 1702: asignaturas y mapeo a RAP

Es el plan del informe 2023-II y de la matriz de consistencia, y **el único cuyo mapeo a RAP
conocemos**: 69 asignaturas en 10 semestres y 73 vínculos asignatura–RAP (el informe menciona
«69 asignaturas que tributan a los RAP del programa»). Es la tabla de `asignatura` y de
`asignatura_rap` del plan 1702. Código y créditos salen de la programación 2026-1 y de los
formatos diligenciados; donde dice «—», ese semestre del 1702 ya no tuvo grupos en 2026-1 y el
dato hay que pedirlo.

| Sem. | Asignatura | Código | Créd. | RAP |
|---|---|---|---|---|
| I | Fundamentos de economía | — | — | 2 |
| I | Fundamentos de contabilidad | — | — | 2 |
| I | Fundamentos de Administración | — | — | 3 |
| I | Matemáticas I | — | — | 1 |
| I | Comprensión y producción de textos I | — | — | 7 |
| I | Cátedra institucional | — | — | 7 |
| I | Curso libre I | — | — | 7 |
| II | Fundamentos de costos | — | — | 2 |
| II | Teoría general de la administración | — | — | 3 |
| II | Matemáticas II | — | — | 1 |
| II | Estadística I | — | — | 1 |
| II | Comprensión y producción de textos II | — | — | 7 |
| II | Humanidades I | — | — | 7 |
| II | Derecho constitucional | — | — | 7 |
| III | Planeación y control | — | — | 3 |
| III | Ética | — | — | 7 |
| III | Matemáticas III | — | — | 1 |
| III | Estadística II | — | — | 1 |
| III | Fundamentos de investigación | — | — | 1, 7 |
| III | Humanidades II | — | — | 7 |
| III | Curso libre II | — | — | 7 |
| IV | Microeconomía | — | — | 2 |
| IV | Organización y dirección | — | — | 3, 7 |
| IV | Matemática financiera | — | — | 2 |
| IV | Lógica y programación | FP15404 | 3 | 3 |
| IV | Investigación aplicada | — | — | 1, 7 |
| IV | Curso libre III | — | — | 7 |
| IV | Curso libre IV (Dibujo técnico) | — | — | 4 |
| V | Macroeconomía | — | — | 2 |
| V | Finanzas a corto plazo | FP15502 | — | 2 |
| V | Comportamiento organizacional | FP15503 | 2 | 6 |
| V | Química industrial | — | — | 4 |
| V | Sistemas de producción | — | — | 4 |
| V | Informática aplicada | FP15506 | 3 | 3 |
| V | Legislación laboral | — | — | 6 |
| V | Curso libre V | — | — | 7 |
| VI | Mercados | FP15601 | 3 | 5 |
| VI | Finanzas y negocios internacionales | FP15602 | 3 | 2 |
| VI | Administración del talento humano | FP15603 | 3 | 6 |
| VI | Procesos industriales | FP15604 | 3 | 4 |
| VI | Estudio del trabajo | FP15605 | 3 | 4 |
| VI | Procesos de manufactura | FP15606 | 3 | 4 |
| VI | Curso libre VI | — | — | 7 |
| VII | Emprendimiento e innovación | FP17701 | 3 | 5 |
| VII | Investigación de operaciones I | FP15702 | 3 | 4 |
| VII | Gestión de la cadena de suministros | FP15703 | 2 | 3 |
| VII | Planeación y organización de la producción | FP15704 | 3 | 4 |
| VII | Taller de manufactura | FP15705 | 2 | 4 |
| VII | Seguridad y salud en el trabajo | FP15712 | 2 | 3, 6 |
| VIII | Electiva I (Estudios prospectivos) | 4917013 | 4 | 3 |
| VIII | Electiva I GPO (Control estadístico de la calidad) | 4917014 | 4 | 4 |
| VIII | Preparación y evaluación de proyectos | FP15801 | 3 | 5 |
| VIII | Investigación de operaciones II | FP15802 | 3 | 4 |
| VIII | Control de la producción | FP15803 | 3 | 4 |
| VIII | Gestión de la calidad | FP17801 | 3 | 3 |
| VIII | Gestión ambiental | FP15804 | 2 | 3 |
| IX | Electiva II (Administración de la calidad) | 4917021 | 4 | 3 |
| IX | Electiva II GPO (Mejoramiento de procesos) | 4917022 | 4 | 4 |
| IX | Electiva III (Sistemas de información gerencial) | 4917023 | 4 | 3 |
| IX | Electiva III GPO (Simulación de procesos) | 4917204 | 4 | 4 |
| IX | Electiva IV (Administración de sueldos y salarios) | 4917025 | 4 | 6 |
| IX | Electiva IV GPO (Tópicos avanzados de productividad) | 4917026 | 4 | 4 |
| IX | Electiva V (Gestión logística del comercio internacional) | 4917027 | 4 | 3 |
| IX | Electiva V GPO (Administración de mantenimiento industrial) | 4917028 | 4 | 4 |
| IX | Electiva VI (Sistemas para la gestión de recursos empresariales) | 4917029 | 4 | 3 |
| IX | Electiva VI GPO (Diseño de planta) | 4917010 | 4 | 4 |
| X | Electiva VII (Sistemas integrados de gestión) | 4917011 | 4 | 3 |
| X | Electiva VII GPO (Diseño de producto) | 4917012 | 4 | 4 |
| X | Prácticas profesionales | 4949920 | 8 | 7 |

El programa tiene dos líneas de electivas, la general y la GPO (Gestión de Producción y
Operaciones). Las electivas (4917xxx) y la práctica (4949920) salen en el reporte sin plan
(«[Pensum:XXXX]»); por sus nombres son las del 1702, valen 4 créditos y la práctica 8. Las de IX
aparecen sin número de semestre en el informe original y se ubicaron en IX por el mapeo
curricular; confírmalo con el plan oficial. El código de Electiva III GPO, 4917204, es el que
trae la programación 2026-1, pero rompe la serie de las demás electivas (4917023, 4917025): por
la serie se esperaría 4917024. Se carga como viene y se pregunta (apartado 8, pregunta 11).

### Plan 2502: lo que muestra la programación 2026-1

Solo semestres 1 a 5, porque la primera cohorte del 2502 todavía no llega al 6. Trae asignaturas
que no existen en el 1702 (Inglés I a V, Analítica de datos I y II, Desarrollo del espíritu
emprendedor, Costos) y **no tiene mapeo a RAP conocido**. Hasta que llegue, sus asignaturas van
al seed sin filas en `asignatura_rap`, y el asistente de RF-08 deja elegir entre todos los RAP
del programa. Que el 2502 use los mismos RAP 1 a 7 es un supuesto (SUP-16).

| Sem. | Código | Asignatura | Créd. |
|---|---|---|---|
| 1 | FN23003 | Inglés I | 2 |
| 1 | FN72726 | Cátedra institucional | 2 |
| 1 | FN72727 | Producción y comprensión textual I | 2 |
| 1 | NC2501 | Matemática I | 4 |
| 1 | NC2507 | Fundamentos de administración | 3 |
| 1 | NC2508 | Fundamentos de contabilidad | 3 |
| 1 | NC2509 | Fundamentos de economía | 3 |
| 2 | FN24033 | Inglés II | 2 |
| 2 | FN24047 | Humanidades | 2 |
| 2 | FN72732 | Producción y comprensión textual II | 2 |
| 2 | IX24100 | Costos | 2 |
| 2 | IX24165 | Teoría general de la administración | 3 |
| 2 | NC2502 | Matemática II | 4 |
| 2 | NC2503 | Estadística I | 3 |
| 2 | NC2506 | Derecho constitucional | 2 |
| 3 | CFBD294 | Matemáticas III | 4 |
| 3 | FN24035 | Inglés III | 2 |
| 3 | FN72725 | Ética | 2 |
| 3 | IX24182 | Planeación y control | 3 |
| 3 | IX25263 | Desarrollo del espíritu emprendedor | 2 |
| 3 | NC2504 | Estadística II | 3 |
| 3 | NC2505 | Fundamentos de investigación científica | 3 |
| 4 | CFBD297 | Investigación aplicada | 3 |
| 4 | FN24036 | Inglés IV | 2 |
| 4 | IX24184 | Organización y dirección | 3 |
| 4 | IX24185 | Matemática financiera | 3 |
| 4 | IX24186 | Analítica de datos I | 3 |
| 4 | IX24187 | Dibujo técnico - expresión gráfica | 2 |
| 4 | NC2510 | Microeconomía I | 3 |
| 5 | FN24037 | Inglés V | 2 |
| 5 | IX24188 | Química industrial | 3 |
| 5 | IX24189 | Finanzas a corto plazo | 3 |
| 5 | IX24190 | Analítica de datos II | 3 |
| 5 | IX24191 | Sistema de producción | 2 |
| 5 | IX24192 | Macroeconomía | 2 |
| 5 | IX24193 | Comportamiento organizacional | 2 |

El reporte no separa las horas TDE, TDP y TI: trae horas semanales (HRS) e intensidad (INT),
cuya relación con el formato no está documentada, así que esas columnas no se llenan con él.
También trae la ponderación de cada corte: 30 %, 30 % y 40 % en casi todas las asignaturas,
20 %, 20 %, 20 % y 40 % en algunos grupos de inglés, y todo el peso en el tercer corte para
Taller de manufactura y la práctica. Es dato del sistema académico, útil para el punto 5 del
proyecto docente; no lo conviertas en validación mientras RF-14 no la pida.

### Asignaturas con datos completos

Cinco asignaturas traen todos los campos del punto 1 en los formatos FO-DO/PC-001 diligenciados.
Con ellas el asistente de RF-08 se puede probar de punta a punta con datos reales: el paso 5
autocompleta exactamente estos campos.

| Plan | Asignatura | Código | Componente | Tipo | Créd. | TDE | TDP | TI | Total | Prerrequisito |
|---|---|---|---|---|---|---|---|---|---|---|
| 2502 | Fundamentos de administración | NC2507 | Profesional | Obligatorio | 3 | 48 | 0 | 96 | 144 | — |
| 2502 | Fundamentos de investigación científica | NC2505 | Profesional | Obligatorio | 3 | 48 | 0 | 96 | 144 | Producción y comprensión textual II |
| 2502 | Comportamiento organizacional | IX24193 | Profesional | Obligatorio | 2 | 32 | 0 | 64 | 96 | Organización y dirección |
| 1702 | Comportamiento organizacional | FP15503 | Profesional | Obligatorio | 2 | 32 | 0 | 64 | 96 | Organización y dirección |
| 1702 | Gestión ambiental | FP15804 | Profesional | Obligatorio | 2 | 32 | 0 | 64 | 96 | — |

Ninguna tiene correquisitos. Las cinco cumplen la regla de 48 horas por crédito que valida
`asignatura.horas_totales`, y en las cinco TDE = 16 h y TI = 32 h por crédito; no generalices esa
proporción, porque las asignaturas prácticas (talleres, química, dibujo técnico) tendrán TDP.

**Los dos formatos de Comportamiento organizacional son idénticos salvo el código**: la misma
docente, el mismo contenido, uno por plan. Es la mejor prueba del modelo v2.5: dos filas de
asignatura con distinto plan y código, y cada proyecto docente apuntando a la suya. El formato
de Fundamentos de investigación científica llama a su prerrequisito «Comprensión y producción de
textos II»; en el plan 2502 esa asignatura se llama Producción y comprensión textual II
(FN72732). Y los formatos traen nombres y correos reales de docentes: no los copies al seed.

El código va en `asignatura.codigo_interno`, único dentro del plan. No lo uses como
identificador estable en ninguna relación ni en ninguna URL: cambia de un plan a otro.

---

## 5. Líderes de RAP: patrones para el seed y las pruebas

La asignación real de líderes es un dato del programa que cambia cada período: se carga en
`lider_rap` desde la aplicación y no va en este archivo. De la asignación de 2023-II (informe de
evaluación) interesan los patrones, porque son los casos que el modelo de roles tiene que
soportar y que conviene reproducir con usuarios ficticios:

- **Un RAP puede tener dos líderes.** En 2023-II los tenían los RAP 3, 4, 5 y 7.
- **Una persona puede liderar dos RAP.** El RAP 7 lo compartían el líder del RAP 5 y el del RAP 6.
- **Un líder puede dictar asignaturas que tributan a su propio RAP.** Pasaba en los RAP 3, 4, 5 y
  6.
- **Un líder puede dictar una asignatura que se mide para otro RAP.** El líder del RAP 1 dictaba
  una electiva medida para el RAP 3.
- **Un docente puede tener asignaturas medidas para varios RAP y además liderar uno.** El docente
  de Investigación aplicada (medida para los RAP 1 y 7) lideraba el RAP 4.
- **Una asignatura puede medirse para dos RAP.** Organización y dirección (RAP 3 y 7) e
  Investigación aplicada (RAP 1 y 7).

Los seis usuarios de demostración pueden cubrir estos casos sin necesidad de nombres reales. Si
el programa entrega la asignación vigente, se carga por la aplicación, no por el seed.

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

## 7. Catálogo de estrategias metodológicas (RF-13)

RF-13 permite seleccionar estrategias de un «catálogo sugerido», y su comentario remite a las
estrategias de enseñanza y de aprendizaje descritas por el Ministerio de Educación Nacional. Son
las dos tablas del capítulo 2 de *Una mirada a los resultados de aprendizaje* (MEN, 2022), que a su
vez se basan en Camacho y Díaz (2013). **Esta es la «lista del MEN»: ya no hay que pedirla.** Las
descripciones están resumidas; el nombre es el del documento.

**Estrategias de enseñanza** (las propone y conduce el docente):

| Estrategia | En qué consiste |
|---|---|
| Preguntas previas y formulación de propósitos | Plantear preguntas sobre el tema y formular el propósito que se busca alcanzar. |
| Lluvia de ideas | Los estudiantes expresan lo que saben de un tema antes de abordarlo y lo socializan con el grupo. |
| Matriz C-Q-A | Tres preguntas: qué conozco y qué quiero aprender (antes) y qué aprendí (después). |
| Ilustraciones | Fotografías y medios gráficos que representan la realidad con distintos grados de fidelidad. |
| Ideogramas | Esquemas de relaciones entre conceptos: mapa mental, mapa conceptual, diagrama de flujo o mentefacto. |
| Lectura dirigida | El docente fija los parámetros y las herramientas para cada nivel de lectura: global, lineal y crítica. |
| Resúmenes | Síntesis breve y precisa del contenido, preparada por el docente. |
| Preguntas intercaladas | Preguntas a lo largo de la clase o del texto para mantener la atención y orientar el estudio. |
| Analogías | Comparación entre elementos para relacionar lo nuevo con lo que el estudiante ya conoce. |

**Estrategias de aprendizaje** (las ejecuta el estudiante):

| Estrategia | En qué consiste |
|---|---|
| Ideograma | El estudiante construye un esquema de relaciones entre conceptos. |
| Lectura autorregulada | El estudiante regula su proceso lector: formula hipótesis, las contrasta con el texto y evalúa la información. |
| Producción de textos | Resumen, reseña, ensayo y otros textos que exigen sintetizar información y argumentar. |
| Portafolio | Colección sistemática y organizada de los productos del estudiante, según las metas establecidas. |

**Cómo se carga sin tocar el modelo** (el modelo se congela el 15 de noviembre y las
funcionalidades el 18): en dos parámetros de tipo lista de `parametro_sistema`,
`catalogo_estrategias_ensenanza` y `catalogo_estrategias_aprendizaje`, con los nombres separados
por coma. Son dos porque `valor` admite 255 caracteres; las descripciones de estas tablas no se
cargan. El docente ve las sugerencias de RF-13 en tres grupos: las de enseñanza y las de
aprendizaje de este catálogo, y las estrategias que ya usaron otros proyectos del programa.

---

## 8. Lo que todavía NO existe y hay que pedirle al programa

Esto sí es lo único que falta. No lo inventes ni lo deduzcas: mientras no llegue, la aplicación
dice «no definido». La última columna dice si la respuesta cambiaría el modelo; como el modelo se
congela el 15 de noviembre (las funcionalidades, el 18), lo que lo cambie y llegue después queda
para después de la entrega.

| # | Pregunta | Mientras tanto | ¿Cambia el modelo? |
|---|---|---|---|
| 1 | Meta de cumplimiento (porcentaje esperado) y si es la misma para los siete RAP | «Meta no definida» | Solo si es distinta por RAP |
| 2 | Si se confirma la regla del logro del RAP (apartado 3) o se exige la meta a cada indicador | Regla del apartado 3 | No: una función |
| 3 | Si un miembro del Departamento puede aprobar un proyecto en el que es docente; RF-18 no lo prohíbe | No se permite: parámetro `revision_bloquear_autoaprobacion`, encendido | No: una regla y un parámetro |
| 4 | Qué es un proyecto «publicado», que es lo que ve el Estudiante (RF-27) | Propuesta: aprobado o en ejecución | Solo si exige publicar a mano |
| 5 | Los planes oficiales 1702 y 2502, con código, créditos y horas (TDE, TDP y TI) de cada asignatura. Del 1702 faltan 33 códigos y 34 créditos: el código y los créditos de todas las asignaturas de I a III, de casi todas las de IV y V y de una de VI, y los créditos de Finanzas a corto plazo, que sí tiene código | Campos vacíos | No |
| 6 | Si el plan 2502 tiene RAP propios (SUP-16) y qué asignaturas del 2502 tributan a cada RAP | RAP del programa; asignaturas del 2502 sin vínculo | Solo si tiene RAP propios |
| 7 | Las rúbricas de los RAP 1, 3, 4, 5, 6 y 7 | Textos «PROVISIONAL —» | No |
| 8 | El calendario académico 2027-1 | — | No |
| 9 | De dónde sale la lista de matriculados (SUP-03) | Carga por archivo | Puede |
| 10 | Qué significa «cohorte» en el FO-DO/PC-023 (SUP-14) | Igual a la muestra | No |
| 11 | Si el código de Electiva III GPO (Simulación de procesos) es 4917204, como sale en la programación 2026-1, o 4917024, que es el que sigue la serie | 4917204, como viene en la programación | No |
| 12 | Si un grupo con estudiantes de los dos planes es un solo proyecto docente o uno por plan | Uno por plan: el proyecto apunta a una asignatura y la asignatura a un plan, como en los dos formatos reales de Comportamiento organizacional (apartado 4) | Sí, si es uno solo: queda para después de la entrega |

Sobre la 3, la regla tiene respaldo propio: separar quien elabora de quien aprueba es un
principio de control interno (Ley 87 de 1993), y en el programa el caso es real: en el informe
2023-II, el director del programa y varios líderes de RAP figuran también como docentes de
asignaturas. Ya está implementada: quien es docente de un
proyecto, sea o no el responsable, no puede aprobarlo ni devolverlo. Si el programa responde otra
cosa, el parámetro se apaga sin tocar código. No hay reasignación de revisores: si no hay otra
persona con el rol, el Administrador se lo asigna a alguien más o apaga el parámetro.

Ya no hace falta preguntar dos cosas. **Nivel o nota** quedó resuelto por el instructivo del
formato y por la medición real de 2024-1: se registra el nivel (apartado 3). **La lista del MEN de
estrategias** está en el apartado 7. Y la 10, **«cohorte»**, no bloquea nada: en esa medición,
muestra y cohorte fueron iguales (34, el grupo completo), así que `medicion_rap.tamano_cohorte`
toma por defecto el tamaño de la muestra y ningún cálculo lo usa.

---

## Registro de cambios

**v3.2 — 10 de noviembre de 2026.** Parte de la versión del repositorio (la v3.0 con sus ajustes
del 10 de noviembre) y responde el parte de Claude Code de ese día.

- *Fuentes y apartado 1:* la matriz y el catálogo de roles se citan como Tablas 11 y 10 del
  Producto 1, que es la numeración del documento oficial. Solo cambian las referencias; afecta a
  HU-01-03 y HU-02-06. Era el cambio de la v3.1 del 8 de noviembre, que no llegó al repositorio.
- *Fuentes y apartado 1:* la sesión de diseño y la entrega de la medición del RAP 2 fueron con
  «una docente del programa», no con «la dirección del programa». La v3.0 lo decía mal. La matriz
  de consistencia tiene dos responsables: el director del programa y una docente.
- *Apartado 1:* `ADM` no incluye aprobar en ningún módulo. Antes la excepción solo nombraba
  «Proyectos docentes». Decisión del desarrollo, ya implementada; afecta a HU-01-03.
- *Apartado 4:* nota sobre el código 4917204, que rompe la serie de las electivas.
- *Apartado 8:* la pregunta 5 dice el conteo exacto del plan 1702 (33 códigos y 34 créditos). Se
  agregan la pregunta 11 (código 4917204) y la 12 (grupo con estudiantes de los dos planes). La
  nota de la pregunta 3 dice quiénes dictan asignaturas, según el informe 2023-II.
- *Requisitos v1.4:* el libro del MEN se cita con el año 2022, que es el de su publicación, en
  las fuentes de OBJ-04, RF-05, RF-06, RF-07 y RF-12 y en el comentario de RF-13. Antes decía
  2021, que es la fecha del prólogo. Incluye RF-03 v1.1 (de la v1.3): cita la Tabla 11 y agrega
  el permiso de aprobación a la lista. Ningún requisito cambia de comportamiento.

**Ajustes del repositorio sobre la v3.0 — 10 de noviembre de 2026**

- *Apartado 7:* el catálogo se carga en dos parámetros de tipo lista y no en uno de tipo JSON,
  porque `parametro_sistema.valor` admite 255 caracteres.
- *Apartado 8:* la regla de la pregunta 3 ya está implementada, con su parámetro.
- *Apartados 7 y 8:* las dos fechas de congelamiento, la del modelo (15 de noviembre) y la de las
  funcionalidades (18 de noviembre).

**v3.0 — 8 de noviembre de 2026**

- *Encabezado y fuentes:* versión y regla de privacidad del archivo. Se quitan los nombres de los
  responsables y de quien entregó la medición; se agrega el libro del MEN como fuente del
  apartado 7.
- *Apartado 1:* excepción del Administrador en «Proyectos docentes» (no crea ni aprueba). Se
  corrige la nota anterior, que le atribuía la creación «por ADM». Se registran los cuatro casos
  controlados por rol. Sin nombres.
- *Apartado 5:* se reemplaza la tabla de líderes y docentes de 2023-II, que tenía nombres, por los
  patrones que sirven para el seed y las pruebas.
- *Apartado 7 (nuevo):* catálogo de estrategias metodológicas del MEN para RF-13.
- *Apartado 8 (antes 7):* lista consolidada de preguntas con el parte de Claude Code del 8 de
  noviembre, cada una con qué hace la aplicación mientras tanto y si cambiaría el modelo. Se
  agregan la autoaprobación y el significado de «publicado». La pregunta de los planes precisa
  qué falta del 1702: 33 asignaturas de los semestres I a VI, no solo las de I a III. La de RF-13
  sale de la lista porque la responde el apartado 7.
- *Apartados 2, 3, 4 y 6:* sin cambios de contenido.

**v2.0 — 7 de noviembre de 2026 (tarde).** Dos planes de estudio vigentes (1702 y 2502), código y
créditos de los semestres IV a X del 1702, las 36 asignaturas del 2502 y la ponderación por corte.

**v1.x — 6 y 7 de noviembre de 2026.** Primera versión, corrección de la Tabla 17, calendario
2026-2, rúbrica real del RAP 2, cómo se mide el cumplimiento, regla del logro del RAP y caso de
verificación de RF-31.
