# Datos institucionales — Administración Industrial

Datos oficiales del programa, extraídos de documentos institucionales. **No son provisionales:
son los valores reales**, y el seed los carga como datos base (`src/datos-iniciales/programa.ts`,
`npm run db:sembrar`).

Este repositorio es público. Por eso esta copia no nombra a ninguna persona: los responsables de
las fuentes y la asignación de líderes y docentes se describen por su función (Ley 1581 de 2012).

Fuentes:

- `Matriz Consistencia RAP` — Vicerrectoría de Docencia, Desarrollo Profesoral. Responsables:
  dos docentes del programa, los líderes del RAP 3.
- `INFORME EVALUACIÓN RAP 2023-II — Administración Industrial`.
- `Producto 1 — Arquitectura del Negocio URAP` (revisado), Tablas 16 y 17.
- `FO-DO/PC-023 v00` — Medición de resultado de aprendizaje del programa por asignatura.

Al final está **lo que todavía no existe** y hay que pedirle al programa. No se inventa.

---

## 1. Matriz de permisos por rol

Fuente: Producto 1, Tabla 17 «Matriz general de permisos por rol», y Tabla 16 «Catálogo de
roles». Es la matriz de HU-01-03.

**Convenciones:** `ADM` = administrar · `R` = registrar · `E` = editar · `A` = aprobar ·
`G` = generar · `C` = consultar · `—` = sin acceso.

| Módulo | Administrador | Docente | Líder RAP | Departamento | Dirección | Estudiante |
|---|---|---|---|---|---|---|
| Usuarios y roles | ADM | — | — | C | C | — |
| Estructura académica | ADM | C | C | C | C | C |
| Proyectos docentes | ADM/C | R/E propios | C | R/A/C ¹ | C | C publicados |
| Plan de curso | ADM/C | R/E propios | C | A/C | C | C publicado |
| RAP y RAC | ADM | R/E RAC propios | C RAP asignados | A/C | C | C autorizado |
| Registro de clases | ADM/C | R/E propios | C | C | C | — |
| Documentos | ADM/C | R/E propios | C autorizados | C | C | C autorizados |
| Reportes | ADM | C propios | C RAP asignados | G/C | C | — |
| Auditoría | ADM/C | — | — | C restringida | C restringida | — |

¹ **Decisión del 2026-11-06.** La Tabla 17 le da al Departamento solo A/C en proyectos docentes,
pero RF-08 dice que el Departamento académico crea el proyecto docente y le asigna los docentes.
Se sigue RF-08: el Departamento también registra (R) el proyecto docente. El docente lo diligencia
después (R/E propios).

Los seis roles corresponden uno a uno con los actores de la especificación: Administrador =
ACT-03, Docente = ACT-01, Líder RAP = ACT-05, Departamento = ACT-02, Dirección = ACT-06,
Estudiante = ACT-04. ACT-07 son sistemas externos y no es un rol con credenciales.

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
| Docente responsable | Planea y ejecuta el proyecto docente de sus asignaturas. | Crear y editar proyectos propios, registrar RAC, contenidos, clases, evidencias y consultar reportes propios. |
| Líder RAP | Realiza seguimiento a los resultados de aprendizaje asignados. | Consultar proyectos relacionados, revisar RAC/RAP, evidencias, indicadores y reportes de los RAP asignados. |
| Departamento académico | Supervisa la gestión académica del programa. | Revisar proyectos, aprobar o solicitar ajustes, consultar información consolidada y generar reportes. |
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

---

## 3. Escala de valoración del programa

Cuatro niveles. Es la escala de Administración Industrial; otro programa puede definir la suya,
por eso vive en `escala_valoracion` / `nivel_escala` y no en el código. El umbral de
cumplimiento es el nivel 3 (RF-07).

| Valor | Etiqueta | Rango de calificación |
|---|---|---|
| 1 | Principiante | 0 ≤ nota < 3,0 |
| 2 | En Desarrollo | 3,0 ≤ nota < 3,5 |
| 3 | Competente | 3,5 ≤ nota < 4,3 |
| 4 | Ejemplar | nota ≥ 4,3 |

**Hay una decisión pendiente aquí.** El formato FO-DO/PC-023 pide al docente el *nivel* (1 a 4)
por estudiante y por indicador, y el modelo de datos guarda eso (`valoracion_estudiante.id_nivel`).
Pero el informe 2023-II trae esta tabla de conversión desde una nota de 0 a 5, lo que sugiere que
algunos docentes parten de la calificación. Si el programa confirma que se captura la nota y el
sistema convierte, hay que agregar `rango_min` / `rango_max` a `nivel_escala` y `calificacion` a
`valoracion_estudiante`. Está en la lista de preguntas abiertas del final. Mientras tanto, se
implementa la captura por nivel, que es lo que dice el formato oficial.

---

## 4. Plan de estudios y mapeo curricular

69 asignaturas en 10 semestres, cada una tributando a uno o más RAP, para un total de 73
vínculos asignatura–RAP. Es el contenido de `asignatura` y `asignatura_rap` en el seed. Los dos
números cuadran con el informe 2023-II, que menciona «69 asignaturas que tributan a los RAP del
programa» y contabiliza 73 vínculos.

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
original y se ubicaron en IX por el mapeo curricular; **falta confirmarlo con el programa**
antes de tomarlo como dato definitivo del plan de estudios.

**Faltan el código SMA, los créditos y las horas de cada asignatura.** El formato FO-DO/PC-023
exige el código («Código de la Asignatura establecido en el SMA») y el proyecto docente muestra
los créditos y las horas TDE, TDP y TI (RF-08 p5). El seed los deja en `null`; RF-08 p7 ya cubre
ese caso: el proyecto se crea y queda marcado con información incompleta. Están en la lista del
final.

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

## 6. Lo que todavía NO existe y hay que pedirle al programa

Esto es lo único que falta. No se inventa ni se deduce.

1. **El porcentaje esperado por RAP.** No está en ninguna parte: ni en el formato FO-DO/PC-023,
   ni en el informe 2023-II, ni en la matriz de consistencia. El informe reporta lo que ocurrió
   (en 2023-II, el 56 % de los estudiantes quedó en «competente» y el 23 % en «ejemplar» para el
   indicador 1, sobre 773 evaluaciones) pero nunca dice contra qué meta se compara. El programa
   tiene que definir el umbral: qué porcentaje de estudiantes en qué nivel se considera
   cumplimiento. Mientras no exista, el campo va parametrizado y sin valor por defecto
   (`escala_valoracion.porcentaje_esperado` en `null`); no se pone un 70 % de relleno, porque se
   vuelve dato real en cuanto alguien vea la pantalla.

2. **El calendario académico 2026-2.** Fechas de inicio y fin del período, semanas de clase,
   semana de parciales y festivos institucionales. Sin esto no se generan las sesiones de clase.
   No está publicado en un sitio que se pueda consultar de forma confiable. El seed de
   demostración usa fechas de ejemplo.

3. **El código SMA de las asignaturas.** El formato institucional lo exige y el modelo lo espera
   en `asignatura.codigo_interno`.

4. **Los créditos y las horas de cada asignatura.** Créditos y horas TDE, TDP y TI; tampoco están
   el componente ni el tipo de curso. El proyecto docente los muestra (RF-08 p5) y sin ellos
   queda marcado con información incompleta (RF-08 p7).

5. **La lista de estudiantes matriculados por curso (SUP-03).** Sigue sin origen definido y de
   ella dependen RF-22, RF-27 y RF-30. Nunca se usan nombres reales de estudiantes en seeds,
   fixtures ni capturas: Ley 1581 de 2012.

6. **Si el docente captura el nivel o la nota.** Ver la nota del apartado 3.

7. **Qué es «cohorte» (SUP-15).** El formato FO-DO/PC-023 pide «Tamaño de la Muestra» y «Tamaño
   de la Cohorte» como columnas distintas, pero la fórmula de la hoja las iguala. Hasta que el
   programa aclare la diferencia, `medicion_rap.tamano_cohorte` queda como está y no se usa en
   ningún cálculo.

8. **El semestre de las electivas II a VI.** Ver la nota del apartado 4.
