# URAP — Objetivos del sistema y actores

Generado desde `Requisitos_URAP_v1.1.xlsx`. El Excel es la fuente oficial; este markdown existe para consulta rápida durante el desarrollo.

## OBJ-01 — Centralizar la creación y la planeación del proyecto docente

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Descripción:** Disponer de un módulo que permita al departamento académico crear el proyecto docente a partir de la estructura académica del programa (programa → asignatura → RAP), con autocompletado de la información institucional, duplicación de proyectos existentes e importación del formato FO-DO/PC-001 en Excel, de manera que se elimine la transcripción manual y la dispersión de archivos que existe actualmente.

**Subobjetivos:** - Crear el proyecto docente mediante un asistente guiado por pasos.  
- Duplicar un proyecto docente existente y editar únicamente lo que cambia (docente, período o grupo).  
- Crear el proyecto docente a partir del archivo Excel del formato institucional.  
- Autocompletar facultad, código, componente, tipo de curso, créditos, horas TDE/TDP/TI y prerrequisitos desde la asignatura registrada.  
- Asignar el o los docentes responsables del proyecto.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado y priorizado para la versión beta

**Estabilidad:** Alta

**Comentarios:** Objetivo asociado a las épicas EP-03 y EP-04 del Producto 3. Responde a la necesidad manifestada por el departamento académico de evitar rehacer proyectos docentes que solo cambian de docente.

---

## OBJ-02 — Diligenciar el proyecto docente conforme al formato institucional

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Descripción:** Permitir que el docente responsable registre en la plataforma las secciones del formato FO-DO/PC-001: descripción del curso, resultados de aprendizaje del curso (RAC) y su contribución a los RAP, estrategias metodológicas, evaluación de los resultados de aprendizaje, contenidos por semana y bibliografía, conservando la estructura y el lenguaje del formato vigente.

**Subobjetivos:** - Registrar la descripción del curso (punto 2 del formato).  
- Registrar los RAC agrupados por cada RAP seleccionado (punto 3).  
- Registrar las estrategias metodológicas (punto 4).  
- Registrar la evaluación de los resultados de aprendizaje por RAC (punto 5).  
- Registrar los contenidos del curso por semana con horas TDE, TDP y TI (punto 6).  
- Registrar la bibliografía del curso (punto 7).  
- Validar la completitud de la información antes del envío a revisión.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado y priorizado para la versión beta

**Estabilidad:** Alta

**Comentarios:** Conservar la numeración del formato institucional facilita la adopción por parte de los docentes y la revisión por parte del departamento académico.

---

## OBJ-03 — Registrar y controlar la ejecución real de las clases

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001-2 v00 «Registro de asistencia»  
Elicitación con docentes del programa de Administración Industrial  
Producto 1: Arquitectura de negocio URAP (regla RN-07)

**Descripción:** Sustituir el registro manual de sesiones por un calendario del curso en el que el docente selecciona los temas efectivamente desarrollados, clasifica las sesiones especiales, registra observaciones e inasistencias, y en el que el sistema advierte de manera visible las sesiones vencidas sin diligenciar.

**Subobjetivos:** - Generar automáticamente el calendario de sesiones del curso a partir del período académico y precargar los días festivos del calendario oficial colombiano.  
- Seleccionar el o los temas desarrollados a partir del contenido programático del proyecto docente, evitando la digitación libre.  
- Clasificar sesiones especiales: parcial, festivo y actividad complementaria.  
- Registrar observaciones de la sesión e indicar los estudiantes que no asistieron.  
- Señalar en color rojo las sesiones vencidas sin diligenciar e indicar los días de atraso.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado y priorizado para la versión beta

**Estabilidad:** Media

**Comentarios:** La alerta visual de vencimiento y los tipos especiales de sesión fueron solicitados de forma explícita durante la elicitación con los docentes.

---

## OBJ-04 — Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Versión:** 1.1 (27/10/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (Valoración y Rúbrica)  
Matriz de consistencia de resultados de aprendizaje del programa de Administración Industrial (RAP 1 a RAP 7)  
Sesión de diseño con la Dra. Ingrid Blanco Hernández  
Ministerio de Educación Nacional (2021). Una mirada a los resultados de aprendizaje

**Descripción:** Administrar el catálogo de RAP de cada programa académico, sus rúbricas de evaluación y la escala de valoración propia de cada programa, y conservar la trazabilidad entre los RAC declarados en cada proyecto docente, los RAP a los que contribuyen y las evidencias que respaldan su desarrollo.

**Subobjetivos:** - Registrar los RAP de cada programa con código único dentro del programa.  
- Asociar una asignatura a uno o varios RAP del programa (mapeo curricular).  
- Administrar la rúbrica de cada RAP con sus indicadores de desempeño y niveles, identificada por programa y RAP.  
- Parametrizar la escala o rango de valoración de los RAP de forma independiente para cada programa académico.  
- Cargar y consultar evidencias fotográficas asociadas a cada RAP del proyecto docente.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado y priorizado para la versión beta

**Estabilidad:** Media

**Comentarios:** La escala del programa de Administración Industrial corresponde a la escala ordinal de cuatro niveles del formato FO-DO/PC-023 (1: Principiante, 2: En desarrollo, 3: Competente, 4: Ejemplar). La parametrización por programa permite que otros programas usen escalas distintas sin modificar el sistema. Las rúbricas y la escala administradas en este objetivo son la base sobre la que opera la medición definida en OBJ-08.

---

## OBJ-05 — Supervisar el cumplimiento del diligenciamiento y generar reportes

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con el administrador del sistema y el departamento académico  
Informe de resultados RAP 2023-II del programa de Administración Industrial  
Producto 1: Arquitectura de negocio URAP (procesos misionales y de apoyo)

**Descripción:** Ofrecer a quienes velan por el proceso un tablero de seguimiento y reportes que permitan conocer, en cualquier momento del período, qué proyectos docentes están completos, cuáles presentan sesiones vencidas y cuál es la contribución de las asignaturas a los RAP del programa, sin necesidad de consolidar archivos manualmente.

**Subobjetivos:** - Consultar el estado de diligenciamiento por programa, período, asignatura y docente.  
- Identificar proyectos con secciones incompletas o sesiones vencidas.  
- Notificar y recordar automáticamente los pendientes a los responsables.  
- Generar reportes de cumplimiento, de ejecución de contenidos y de contribución RAC-RAP, con exportación a Excel y PDF.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado y priorizado para la versión beta

**Estabilidad:** Alta

**Comentarios:** El administrador fue definido durante la elicitación como el actor que vela por el seguimiento y el cumplimiento del diligenciamiento de los proyectos docentes.

---

## OBJ-06 — Administrar usuarios, roles y acceso seguro a la información

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3 y 4)  
Producto 3: Esquema de implementación URAP (épicas EP-01 a EP-12)

**Descripción:** Garantizar que cada usuario acceda únicamente a la información y a las operaciones que corresponden a su rol, mediante autenticación con credenciales institucionales, autorización basada en roles y registro de auditoría de las acciones relevantes.

**Subobjetivos:** - Autenticar a los usuarios y controlar la sesión mediante token JWT.  
- Administrar usuarios, su estado y los roles asignados.  
- Administrar roles y permisos por módulo.  
- Registrar en auditoría las creaciones, modificaciones, eliminaciones, aprobaciones y consultas sensibles.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado y priorizado para la versión beta

**Estabilidad:** Alta

**Comentarios:** Corresponde a las épicas EP-01, EP-02 y EP-10 del Producto 3 y al modelo de seguridad del numeral 3 del Producto 2.

---

## OBJ-07 — Facilitar la consulta del proyecto docente por parte del estudiante

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con estudiantes del programa de Administración Industrial  
Producto 1: Arquitectura de negocio URAP (regla RN-15)

**Descripción:** Permitir que el estudiante consulte, en modo de solo lectura, el proyecto docente aprobado y publicado de las asignaturas que cursa, de manera que conozca los resultados de aprendizaje esperados, los contenidos, los criterios de evaluación y la bibliografía.

**Subobjetivos:** - Consultar el proyecto docente publicado de las asignaturas matriculadas.  
- Consultar los RAC del curso y los RAP a los que contribuyen.  
- Consultar los contenidos por semana y la bibliografía.

**Importancia:** Media

**Urgencia:** Baja

**Estado:** Especificado; su habilitación depende de la autorización del programa

**Estabilidad:** Media

**Comentarios:** El Producto 1 define el acceso del estudiante como opcional y exclusivamente de consulta. No se expondrán observaciones de clase ni registros de inasistencia.

---

## OBJ-08 — Medir el logro de los RAP y soportar el análisis y la mejora continua

**Versión:** 1.0 (27/10/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (hojas Valoración, Rúbrica y Evaluación)  
Rúbrica diligenciada RAP 2 - Finanzas a corto plazo 2024-1  
Informe de resultados RAP 2023-II del programa de Administración Industrial

**Descripción:** Permitir que el docente registre la valoración de cada estudiante frente a los indicadores de desempeño de la rúbrica del RAP evaluado, y que el sistema consolide automáticamente los resultados por nivel, compare el porcentaje alcanzado con el esperado por el programa y conserve las acciones de mejora derivadas, conforme al formato FO-DO/PC-023.

**Subobjetivos:** - Registrar la valoración de cada estudiante por indicador de desempeño, según la escala del programa.  
- Consolidar automáticamente los conteos y porcentajes por nivel e indicador, con el tamaño de la muestra y de la cohorte.  
- Comparar el porcentaje alcanzado en los niveles de cumplimiento frente al porcentaje esperado definido por el programa.  
- Registrar las acciones implementadas, los resultados obtenidos y las acciones propuestas de cada medición.  
- Generar el reporte de logro de los RAP por asignatura, período y programa.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Incorporado al alcance el 27/10/2026

**Estabilidad:** Media

**Comentarios:** Objetivo incorporado tras la revisión del formato FO-DO/PC-023. Da sustento al componente de análisis enunciado en el título del proyecto: sin la valoración por estudiante, el sistema solo evidencia qué asignaturas contribuyen a cada RAP, pero no en qué medida se logra. Se relaciona con OBJ-04, que administra las rúbricas y la escala sobre las que opera la medición.

---

## ACT-01 — DOCENTE RESPONSABLE

**Versión:** 1.1 (27/10/2026)

**Fuentes:** Elicitación con docentes del programa de Administración Industrial  
Formatos FO-DO/PC-001 y FO-DO/PC-001-2

**Descripción:** Profesor responsable de una o varias asignaturas del programa. Diligencia el proyecto docente que le asigna el departamento académico: descripción, RAC asociados a los RAP seleccionados, estrategias metodológicas, evaluación de los resultados de aprendizaje, contenidos por semana y bibliografía. Durante el período registra el desarrollo real de cada sesión seleccionando los temas dictados, clasifica las sesiones especiales (parcial, festivo o actividad complementaria), deja observaciones, indica los estudiantes ausentes y carga las evidencias fotográficas de cada RAP. Al final del período registra la valoración de cada estudiante frente a los indicadores de la rúbrica del RAP evaluado.

**Comentarios:** Es el usuario de mayor frecuencia de uso del sistema y de él depende la calidad de la información. Los formularios deben ser cortos, guiados por pasos y evitar la digitación de datos que el sistema ya conoce. Requiere alertas visibles de las sesiones vencidas.

---

## ACT-02 — DEPARTAMENTO ACADÉMICO

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con el departamento académico del programa  
Producto 1: Arquitectura de negocio URAP (catálogo de roles)

**Descripción:** Unidad responsable de la creación y la coordinación de los proyectos docentes del programa. Crea el proyecto docente eligiendo programa, asignatura y los RAP a los que esta contribuye; duplica proyectos existentes cuando solo cambia el docente o el período; crea proyectos a partir del archivo Excel del formato institucional; asigna docentes responsables; revisa, aprueba o devuelve con observaciones, y consulta la información consolidada del programa.

**Comentarios:** Durante la elicitación se identificó como necesidad prioritaria la duplicación de proyectos docentes, dado que existen proyectos idénticos que solo cambian de profesor.

---

## ACT-03 — ADMINISTRADOR DEL SISTEMA

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con el administrador del sistema  
Producto 2: Arquitectura de tecnología URAP (numeral 3.2)

**Descripción:** Usuario responsable de velar por el seguimiento y el cumplimiento del diligenciamiento de los proyectos docentes, y de administrar la configuración del sistema. Gestiona usuarios y roles, parametriza la estructura académica (facultades, programas, asignaturas y períodos), administra la tabla de días festivos y las escalas de valoración de RAP, consulta el tablero de seguimiento y la auditoría.

**Comentarios:** Su alcance combina dos responsabilidades diferenciadas: el seguimiento al proceso académico y la administración técnica de la plataforma. Se recomienda separarlas en dos roles si el programa así lo define durante la validación.

---

## ACT-04 — ESTUDIANTE

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con estudiantes del programa de Administración Industrial  
Producto 1: Arquitectura de negocio URAP (regla RN-15)

**Descripción:** Usuario con permisos limitados de consulta. Accede en modo de solo lectura a los proyectos docentes aprobados y publicados de las asignaturas que cursa, con el fin de conocer los resultados de aprendizaje esperados, los contenidos programáticos, los criterios de evaluación y la bibliografía del curso.

**Comentarios:** No registra información en el sistema. Su participación se limita a la consulta mientras el programa no apruebe funciones adicionales. Aparece además como sujeto de información en el registro de inasistencias, lo que obliga a aplicar el tratamiento de datos personales previsto en la Ley 1581 de 2012.

---

## ACT-05 — LÍDER RAP

**Versión:** 1.1 (27/10/2026)

**Fuentes:** Producto 1: Arquitectura de negocio URAP (catálogo de roles)  
Matriz de consistencia de resultados de aprendizaje del programa

**Descripción:** Docente designado por el programa para hacer seguimiento a uno o varios RAP durante un período académico. Consulta las asignaturas que contribuyen a los RAP asignados, revisa los RAC declarados y las evidencias cargadas, analiza el consolidado de las mediciones de desempeño frente al porcentaje esperado del programa, registra las acciones de mejora y consulta los reportes de logro.

**Comentarios:** Rol heredado del Producto 1 y de la matriz de consistencia del programa. Con la incorporación de la medición de RAP al alcance (OBJ-08), este rol pasa a tener funciones propias dentro del sistema y deja de ser únicamente consultivo, por lo que su inclusión en la versión beta queda confirmada.

---

## ACT-06 — DIRECCIÓN DEL PROGRAMA

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 1: Arquitectura de negocio URAP (matriz de partes interesadas)

**Descripción:** Instancia directiva que consulta información consolidada e indicadores del programa para orientar decisiones curriculares y procesos de aseguramiento de la calidad. Su acceso es de consulta sobre reportes, estados de los proyectos docentes y resultados por RAP.

**Comentarios:** Rol de consulta. Puede implementarse inicialmente reutilizando los permisos de lectura del departamento académico para no ampliar el alcance de la versión beta.

---

## ACT-07 — SISTEMAS Y SERVICIOS EXTERNOS

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3 y 4)  
Producto 3: Esquema de implementación URAP (épicas EP-01 a EP-12)

**Descripción:** Servicios que interactúan con URAP sin ser usuarios humanos: el servicio de almacenamiento documental (Amazon S3) para evidencias y soportes, el servicio de correo institucional para el envío de notificaciones, y la fuente del calendario oficial de días festivos de Colombia utilizada para precargar las sesiones no hábiles.

**Comentarios:** La integración con el sistema de información académica de la Universidad (matrícula de estudiantes por grupo) se considera deseable pero no obligatoria para la versión beta; mientras no exista, la lista de estudiantes se cargará mediante archivo.

---
