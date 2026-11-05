# URAP — Glosario del dominio

Este archivo existe porque el dominio es institucional y no se deduce del código.
Los términos se parecen entre sí y confundirlos produce errores silenciosos.
**Léelo antes de modelar, nombrar o implementar cualquier cosa del dominio.**

## Los dos que más se confunden

**RAP — Resultado de Aprendizaje del Programa.**
Pertenece al **programa académico**, no a una asignatura. Lo define el Proyecto Educativo
del Programa. Administración Industrial tiene siete: RAP 1 a RAP 7. Un RAP vive varios años
y lo abordan muchas asignaturas a lo largo del plan de estudios.

**RAC — Resultado de Aprendizaje del Curso.**
Pertenece a **un proyecto docente concreto**, es decir, a una asignatura en un período.
Lo redacta el docente. Un RAC contribuye a uno o varios RAP; esa contribución es la relación
`rac_rap` y es el corazón de la trazabilidad del sistema.

> Regla mental: el RAP es del programa y dura años. El RAC es del curso y dura un semestre.
> Nunca cuelgues un RAC directamente de una asignatura ni un RAP de un proyecto docente.

## Entidades centrales

**Proyecto docente.**
No es un proyecto de investigación. Es el documento institucional de planeación de **una
asignatura en un período académico** (formato FO-DO/PC-001). Contiene la descripción del
curso, los RAC, las estrategias metodológicas, la evaluación, el contenido por semana y la
bibliografía. Es la entidad central del sistema.

> Si ves una pantalla o un modelo que habla de "línea de investigación", "fecha estimada de
> finalización" o "porcentaje de avance", está mal: eso es vocabulario de gestión de
> proyectos, no de este dominio.

**Programa académico.** Administración Industrial, Ingeniería de Sistemas, etc.
Pertenece a una facultad. Es el nivel que posee los RAP y la escala de valoración.

**Asignatura.** Curso del plan de estudios, con código, semestre, créditos y horas.
Se asocia a uno o varios RAP mediante el **mapeo curricular** (`asignatura_rap`), que existe
aunque todavía no haya ningún proyecto docente creado.

**Período académico.** 2026-1, 2026-2. Define fechas de inicio y fin y el número de semanas,
que es la base del contenido programático y del calendario de sesiones.

**Sesión de clase.** Un encuentro concreto del curso. Se genera automáticamente desde el
calendario, **no** cuando el docente la diligencia. Una sesión sin diligenciar existe y es la
que permite detectar atrasos.

**Indicador de desempeño.** Criterio observable dentro de un RAP. Es lo que se valora en la
rúbrica, no el RAP completo.

**Rúbrica.** Matriz indicador × nivel con la descripción del desempeño esperado en cada celda.
Pertenece a un RAP y está versionada: editar una rúbrica no puede alterar mediciones ya hechas.

**Medición de RAP.** Registro de la valoración de cada estudiante en cada indicador
(formato FO-DO/PC-023), más el consolidado y las acciones de mejora.

## Horas y créditos

- **TDE** — horas de acompañamiento directo del docente, teóricas.
- **TDP** — horas de acompañamiento directo del docente, prácticas.
- **TI** — horas de trabajo independiente del estudiante.

Se validan contra los créditos. Ejemplo real: 2 créditos = 96 horas totales,
distribuidas en 16 semanas × 2 TDE = 32, más 16 × 4 TI = 64.

## Escala de valoración

Cada programa define la suya (`escala_valoracion` + `nivel_escala`). La de Administración
Industrial tiene cuatro niveles ordinales:

| Valor | Etiqueta |
|---|---|
| 1 | Principiante |
| 2 | En Desarrollo |
| 3 | Competente |
| 4 | Ejemplar |

El programa define además el **porcentaje esperado** de estudiantes en los niveles de
cumplimiento (3 + 4). No hardcodear ni los niveles ni el umbral: son parametrizables porque
el sistema debe escalar a otros programas con escalas distintas.

## Roles

| Rol | Qué hace |
|---|---|
| Administrador | Usuarios, roles, parámetros, festivos; vela por el cumplimiento del diligenciamiento |
| Departamento académico | Crea proyectos docentes, asigna docentes, revisa y aprueba |
| Docente responsable | Diligencia el proyecto, registra clases y evidencias, valora estudiantes |
| Líder RAP | Analiza el consolidado de los RAP a su cargo y registra acciones de mejora |
| Dirección del programa | Consulta reportes e indicadores |
| Estudiante | Solo lectura del proyecto docente aprobado y publicado |

**Un usuario puede tener varios roles a la vez** (tabla `usuario_rol`). Es el caso real:
hay docentes que además son líderes RAP. Nunca asumir un rol único por usuario.

## Formatos institucionales de referencia

| Código | Qué es | Dónde aparece en el sistema |
|---|---|---|
| FO-DO/PC-001 v05 | Proyecto docente (pregrado presencial) | RF-08 a RF-16 |
| FO-DO/PC-001-2 v00 | Registro de asistencia | RF-19 a RF-23 |
| FO-DO/PC-023 v00 | Medición de RAP por asignatura (Valoración, Rúbrica, Evaluación) | RF-06, RF-07, RF-30 a RF-32 |

Las secciones numeradas del proyecto docente (punto 2 descripción, punto 3 RAC, punto 4
estrategias, punto 5 evaluación, punto 6 contenidos, punto 7 bibliografía) se conservan en la
interfaz con esa misma numeración: los docentes ya la conocen y eso facilita la adopción.

## Datos personales

El sistema almacena inasistencias, fotografías de clase y valoraciones individuales de
desempeño. Todo eso es dato personal bajo la Ley 1581 de 2012 (Colombia):

- Restringir su consulta a los roles autorizados.
- Los reportes consolidados se presentan **agregados**, sin identificar al estudiante.
- No incluir datos reales de estudiantes en seeds, fixtures ni capturas de pantalla.
