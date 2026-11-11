# URAP — Requisitos funcionales (RF-01 a RF-32)

Generado desde la hoja de cálculo «Requisitos URAP», versión 1.5, que es la fuente oficial.

Cada requisito define la secuencia normal, las excepciones y los tiempos de respuesta esperados. **Antes de implementar un endpoint o una pantalla, lee el RF correspondiente completo**, incluidas sus excepciones: buena parte de las reglas de negocio están ahí y no en el modelo de datos.

## RF-01 — Autenticación de usuarios y control de sesión

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3 y 4)  
Producto 3: Esquema de implementación URAP (épicas EP-01 a EP-12)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-03: Gestión de roles y permisos  
NFR-003: Autenticación mediante token JWT  
NFR-005: Protección de contraseñas mediante hash  
NFR-006: Comunicación cifrada mediante HTTPS

**Descripción:** El sistema debe permitir el ingreso de los usuarios registrados mediante correo institucional y contraseña, emitir un token de sesión y habilitar únicamente el menú y las operaciones correspondientes al rol asignado.

**Precondición:** El usuario debe estar registrado, activo y tener al menos un rol asignado.

**Secuencia normal**

p1. El usuario ingresa su correo institucional y su contraseña en la pantalla de acceso.
p2. El sistema valida las credenciales contra la información almacenada, comparando el hash de la contraseña.
p3. El sistema genera un token de sesión (JWT) con el identificador del usuario, su rol y el tiempo de expiración.
p4. El sistema presenta el panel inicial y el menú habilitado para el rol del usuario.

**Poscondición:** El usuario queda autenticado y accede únicamente a las funciones autorizadas para su rol.

**Excepciones**

p2. Si las credenciales no son válidas, el sistema muestra un mensaje genérico de error sin indicar cuál de los dos datos es incorrecto.
p2. Si el usuario se encuentra inactivo, el sistema niega el acceso e informa que debe comunicarse con el administrador.
p3. Si se registran cinco intentos fallidos consecutivos, el sistema bloquea temporalmente el acceso y deja constancia en auditoría.

**Rendimiento**

q1. El inicio de sesión debe completarse en un tiempo menor o igual a 3 segundos.

**Frecuencia:** Aproximadamente 60 inicios de sesión diarios durante el período académico (estimación por validar).

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Se implementa en el backend con guards y decoradores de NestJS, según el numeral 3.2 del Producto 2. Corresponde a la épica EP-01 del Producto 3.

---

## RF-02 — Gestión de usuarios

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con actores del programa de Administración Industrial  
Sesión de diseño con una docente del programa

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-03: Gestión de roles y permisos  
RF-29: Registro de auditoría  
NFR-017: Integridad y eliminación lógica de registros

**Descripción:** El sistema debe permitir al administrador crear, consultar, editar, activar e inactivar usuarios, registrando como mínimo nombre completo, documento de identidad, correo institucional, programa al que pertenece, estado y roles asignados.

**Precondición:** El usuario debe estar autenticado con el rol Administrador.

**Secuencia normal**

p1. El administrador ingresa al módulo de usuarios.
p2. El sistema muestra el listado paginado con filtros por programa, rol y estado.
p3. El administrador crea un usuario nuevo o selecciona uno existente para editarlo.
p4. El administrador diligencia los datos obligatorios y asigna uno o varios roles.
p5. El sistema valida que el correo institucional no esté registrado previamente.
p6. El sistema guarda el registro y genera el evento correspondiente en auditoría.

**Poscondición:** El usuario queda disponible para ser vinculado a proyectos docentes, RAP o consultas.

**Excepciones**

p5. Si el correo institucional ya existe, el sistema informa la duplicidad y no permite guardar.
p6. Si el usuario tiene proyectos docentes o registros asociados, el sistema no permite eliminarlo y solo habilita su inactivación.

**Rendimiento**

q1. El guardado debe completarse en un tiempo menor o igual a 3 segundos.
q2. Los listados deben presentarse paginados para no superar los 4 segundos de carga.

**Frecuencia:** Alrededor de 40 altas por período académico y consultas diarias (estimación por validar).

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Corresponde a la épica EP-02 del Producto 3.

---

## RF-03 — Gestión de roles y permisos

**Versión:** 1.1 (08/11/2026)

**Fuentes:** Elicitación con actores del programa de Administración Industrial  
Sesión de diseño con una docente del programa

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-02: Gestión de usuarios  
NFR-004: Autorización basada en roles

**Descripción:** El sistema debe permitir administrar los roles (Administrador, Departamento académico, Docente responsable, Líder RAP, Dirección del programa y Estudiante) y los permisos de lectura, creación, actualización, aprobación, eliminación, generación y administración sobre cada módulo, así como asignar uno o varios roles a un usuario.

**Precondición:** El usuario debe estar autenticado con el rol Administrador.

**Secuencia normal**

p1. El administrador ingresa al módulo de roles.
p2. El sistema presenta los roles existentes y la matriz de permisos por módulo.
p3. El administrador crea o modifica un rol y marca los permisos que le corresponden.
p4. El sistema valida que el rol conserve al menos un permiso de lectura.
p5. El sistema guarda la configuración y la aplica en la siguiente sesión de los usuarios afectados.

**Poscondición:** Los permisos quedan configurados y son aplicados por el backend en cada solicitud.

**Excepciones**

p3. El sistema no permite eliminar un rol que tenga usuarios activos asociados.
p3. El sistema no permite retirar el permiso de administración al último usuario con rol Administrador.

**Rendimiento**

q1. La aplicación de los permisos debe ser verificada por el backend en cada solicitud protegida.

**Frecuencia:** Baja: configuración inicial y ajustes ocasionales.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** La matriz general de permisos por rol se encuentra en la Tabla 11 del Producto 1 y debe implementarse en la capa de servicios.

---

## RF-04 — Parametrización de la estructura académica

**Versión:** 1.1 (07/11/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)  
Programación académica por programa 2026-1 (SMA, reporte RAK152)

**Objetivos asociados:** OBJ-01: Centralizar la creación y la planeación del proyecto docente  
OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-05: Gestión del catálogo de RAP por programa  
RF-08: Creación del proyecto docente  
NFR-012: Escalabilidad funcional a otros programas

**Descripción:** El sistema debe permitir registrar y mantener la estructura académica: facultades, programas, planes de estudio, asignaturas y períodos académicos. Un programa puede tener más de un plan de estudios vigente a la vez, y cada asignatura pertenece a un plan. De cada asignatura se registran código, nombre, semestre, componente, tipo de curso, número de créditos, horas de trabajo independiente (TI), horas de acompañamiento directo teóricas (TDE) y prácticas (TDP), prerrequisitos y correquisitos.

**Precondición:** El usuario debe estar autenticado con rol Administrador o Departamento académico.

**Secuencia normal**

p1. El usuario ingresa al módulo de estructura académica.
p2. El usuario selecciona el nivel que desea administrar: facultad, programa, plan de estudios, asignatura o período.
p3. El usuario registra o edita la información del elemento seleccionado.
p4. El sistema valida la unicidad del código y la coherencia de las horas con los créditos.
p5. El sistema guarda la información y la deja disponible para la creación de proyectos docentes.

**Poscondición:** La estructura académica queda disponible como información base para los demás módulos.

**Excepciones**

p4. Si el código de la asignatura ya existe en el mismo plan de estudios, el sistema informa la duplicidad; el mismo código sí puede repetirse en planes distintos.
p4. Si la suma de horas TDE, TDP y TI no corresponde al total declarado, el sistema advierte al usuario.
p5. El sistema no permite eliminar una asignatura o un período con proyectos docentes asociados; solo permite inactivarlos.

**Rendimiento**

q1. El guardado de un registro no debe superar los 3 segundos.

**Frecuencia:** Carga inicial del plan de estudios y actualizaciones al inicio de cada período académico.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** La estructura por facultad y programa permite escalar la solución a otros programas de la Universidad sin rediseñar el modelo de datos. v1.1: la programación académica 2026-1 del programa muestra dos planes vigentes al mismo tiempo, el 1702 y el 2502, con códigos distintos para la misma asignatura (Comportamiento organizacional es FP15503 en uno e IX24193 en el otro). Por eso el código se valida dentro del plan y no del programa.

---

## RF-05 — Gestión del catálogo de RAP por programa

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (Valoración y Rúbrica)  
Matriz de consistencia de resultados de aprendizaje del programa de Administración Industrial (RAP 1 a RAP 7)  
Sesión de diseño con una docente del programa  
Ministerio de Educación Nacional (2022). Una mirada a los resultados de aprendizaje

**Objetivos asociados:** OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-06: Gestión de la rúbrica del RAP  
RF-07: Parametrización de la escala de valoración de RAP por programa  
RF-08: Creación del proyecto docente

**Descripción:** El sistema debe permitir registrar los resultados de aprendizaje del programa (RAP) definidos en el proyecto educativo de cada programa académico. Un RAP pertenece a un único programa y conserva un número o código único dentro de él. Una asignatura puede asociarse a uno o varios RAP y un RAP puede ser abordado por varias asignaturas, conforme al mapeo curricular del programa.

**Precondición:** El programa académico debe estar registrado en el sistema.

**Secuencia normal**

p1. El usuario selecciona el programa académico.
p2. El sistema muestra los RAP registrados para ese programa.
p3. El usuario registra o edita un RAP indicando número, enunciado, competencia asociada y vigencia.
p4. El sistema valida que el número del RAP sea único dentro del programa.
p5. El usuario asocia las asignaturas del programa que contribuyen al RAP.
p6. El sistema guarda el RAP y sus asociaciones, y registra el evento en auditoría.

**Poscondición:** El catálogo de RAP queda disponible para la creación de proyectos docentes y para los reportes.

**Excepciones**

p4. Si el número del RAP ya existe en el programa, el sistema informa la duplicidad.
p6. El sistema no permite eliminar un RAP referenciado por proyectos docentes; solo permite inactivarlo y conservar el histórico.

**Rendimiento**

q1. La consulta del catálogo de RAP de un programa no debe superar los 3 segundos.

**Frecuencia:** Baja: se actualiza cuando el programa modifica su proyecto educativo.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El programa de Administración Industrial cuenta actualmente con siete RAP (RAP 1 a RAP 7) según su matriz de consistencia.

---

## RF-06 — Gestión de la rúbrica de evaluación del RAP

**Versión:** 1.1 (27/10/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (Valoración y Rúbrica)  
Matriz de consistencia de resultados de aprendizaje del programa de Administración Industrial (RAP 1 a RAP 7)  
Sesión de diseño con una docente del programa  
Ministerio de Educación Nacional (2022). Una mirada a los resultados de aprendizaje

**Objetivos asociados:** OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-05: Gestión del catálogo de RAP por programa  
RF-07: Parametrización de la escala de valoración de RAP por programa  
RF-30: Registro de la valoración de los estudiantes por indicador de desempeño

**Descripción:** El sistema debe permitir administrar la rúbrica de cada RAP. La rúbrica se identifica por el programa y el RAP al que pertenece, y está compuesta por uno o varios indicadores de desempeño; para cada indicador se describe el desempeño esperado en cada nivel de la escala definida por el programa.

**Precondición:** El RAP debe existir en el catálogo del programa y el programa debe tener parametrizada su escala de valoración.

**Secuencia normal**

p1. El usuario selecciona el programa y el RAP.
p2. El sistema presenta la rúbrica vigente del RAP, si existe, y la escala del programa.
p3. El usuario registra los indicadores de desempeño que serán evaluados.
p4. El usuario describe el desempeño esperado para cada indicador en cada nivel de la escala.
p5. El sistema valida que todos los niveles de cada indicador estén descritos.
p6. El sistema guarda la rúbrica como una nueva versión y conserva la anterior.

**Poscondición:** La rúbrica queda disponible para la valoración del RAP y para consulta de los docentes.

**Excepciones**

p2. Si el programa no tiene escala parametrizada, el sistema solicita definirla antes de continuar.
p5. Si un indicador tiene niveles sin describir, el sistema impide guardar la rúbrica como vigente y permite conservarla como borrador.

**Rendimiento**

q1. El guardado de la rúbrica no debe superar los 4 segundos.

**Frecuencia:** Una rúbrica por RAP, revisada al menos una vez por año académico.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Corresponde al formato FO-DO/PC-023-2. El versionamiento evita que la modificación de una rúbrica altere valoraciones ya registradas.

---

## RF-07 — Parametrización de la escala de valoración de RAP por programa

**Versión:** 1.1 (27/10/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (Valoración y Rúbrica)  
Matriz de consistencia de resultados de aprendizaje del programa de Administración Industrial (RAP 1 a RAP 7)  
Sesión de diseño con una docente del programa  
Ministerio de Educación Nacional (2022). Una mirada a los resultados de aprendizaje

**Objetivos asociados:** OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-06: Gestión de la rúbrica de evaluación del RAP  
RF-30: Registro de la valoración de los estudiantes por indicador de desempeño  
RF-31: Consolidación y análisis de la medición de RAP  
RF-28: Generación de reportes académicos  
NFR-012: Escalabilidad funcional a otros programas

**Descripción:** El sistema debe permitir que cada programa académico defina su propia escala o rango de valoración de los RAP, indicando el número de niveles, la etiqueta de cada nivel, su valor numérico y el umbral a partir del cual se considera alcanzado el resultado de aprendizaje.

**Precondición:** El programa académico debe estar registrado y el usuario debe tener rol Administrador o Departamento académico.

**Secuencia normal**

p1. El usuario selecciona el programa académico.
p2. El sistema muestra la escala vigente del programa, si existe.
p3. El usuario define el número de niveles y registra la etiqueta y el valor de cada uno.
p4. El usuario define el umbral de cumplimiento del resultado de aprendizaje.
p5. El sistema valida que los valores sean consecutivos y que no existan etiquetas repetidas.
p6. El sistema guarda la escala y la aplica a las rúbricas y reportes del programa.

**Poscondición:** La escala queda asociada al programa y es utilizada por sus rúbricas y reportes.

**Excepciones**

p6. Si el programa ya tiene valoraciones registradas, el sistema advierte del impacto y conserva la escala anterior asociada a los registros históricos.

**Rendimiento**

q1. El guardado de la escala no debe superar los 3 segundos.

**Frecuencia:** Una configuración por programa, con revisiones excepcionales.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Requisito derivado de la sesión de diseño: cada programa tiene su propio rango de evaluación de RAP. El programa de Administración Industrial utiliza cuatro niveles (1: Principiante, 2: En desarrollo, 3: Competente, 4: Ejemplar).

---

## RF-08 — Creación del proyecto docente mediante asistente por pasos

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-01: Centralizar la creación y la planeación del proyecto docente

**Requisitos asociados:** RF-04: Parametrización de la estructura académica  
RF-05: Gestión del catálogo de RAP por programa  
RF-12: Registro de los RAC y su asociación con los RAP  
RF-19: Generación del calendario de sesiones y precarga de festivos

**Descripción:** El sistema debe permitir al departamento académico crear un proyecto docente mediante un asistente de cuatro pasos: seleccionar el programa, seleccionar la asignatura, seleccionar el o los RAP del programa a los que la asignatura contribuye, y revisar la información que el sistema completa automáticamente a partir de la asignatura y del período vigente.

**Precondición:** Deben existir el programa, la asignatura, el período académico activo y el catálogo de RAP del programa.

**Secuencia normal**

p1. El usuario selecciona la opción «Nuevo proyecto docente».
p2. El usuario selecciona el programa académico.
p3. El usuario selecciona la asignatura del programa.
p4. El usuario selecciona uno o varios RAP del programa a los que contribuye la asignatura.
p5. El sistema completa automáticamente facultad, código, componente, tipo de curso, créditos, horas TDE, TDP y TI, prerrequisitos, correquisitos y período académico.
p6. El usuario asigna el o los docentes responsables y, si aplica, el grupo.
p7. El sistema crea el proyecto docente en estado «En diligenciamiento» y lo hace visible para el docente.

**Poscondición:** El proyecto docente queda creado con su información base y con los RAP seleccionados, listo para ser diligenciado por el docente responsable.

**Excepciones**

p4. Si el usuario no selecciona al menos un RAP, el sistema impide continuar al siguiente paso.
p6. Si ya existe un proyecto docente para la misma asignatura, período y grupo, el sistema advierte y ofrece editar el existente o duplicarlo.
p7. Si la asignatura no tiene registradas las horas o los créditos, el sistema permite continuar pero marca el proyecto con información incompleta.

**Rendimiento**

q1. Cada paso del asistente debe responder en un tiempo menor o igual a 3 segundos.
q2. La creación del proyecto docente debe completarse en menos de 5 segundos.

**Frecuencia:** Aproximadamente 60 proyectos docentes por período académico en el programa (estimación por validar).

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El orden de los pasos fue definido en la sesión de diseño. La selección previa de los RAP condiciona la forma en que el docente registra los RAC (RF-12).

---

## RF-09 — Duplicación de un proyecto docente existente

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con actores del programa de Administración Industrial  
Sesión de diseño con una docente del programa

**Objetivos asociados:** OBJ-01: Centralizar la creación y la planeación del proyecto docente

**Requisitos asociados:** RF-08: Creación del proyecto docente mediante asistente por pasos  
RF-29: Registro de auditoría

**Descripción:** El sistema debe permitir generar un nuevo proyecto docente a partir de uno existente, copiando descripción, RAC y su relación con los RAP, estrategias metodológicas, evaluación de los resultados de aprendizaje, contenidos por semana y bibliografía, para que el usuario edite únicamente los datos que cambian, como el docente responsable, el período o el grupo.

**Precondición:** Debe existir al menos un proyecto docente previo de la asignatura.

**Secuencia normal**

p1. El usuario consulta el listado de proyectos docentes y selecciona el que desea replicar.
p2. El usuario selecciona la opción «Duplicar».
p3. El sistema presenta un formulario con toda la información copiada del proyecto origen.
p4. El usuario ajusta el período académico, el docente responsable, el grupo y las secciones que requieran cambio.
p5. El sistema valida la información obligatoria y la ausencia de duplicidad.
p6. El sistema guarda el nuevo proyecto en estado «En diligenciamiento» y conserva la referencia al proyecto origen.

**Poscondición:** Se crea un nuevo proyecto docente independiente del original, con trazabilidad hacia el proyecto del cual fue copiado.

**Excepciones**

p4. Si la asignatura cambió de RAP asociados respecto del período anterior, el sistema advierte y solicita revisar la selección.
p5. Si ya existe un proyecto para la misma asignatura, período y grupo, el sistema no permite guardar.

**Rendimiento**

q1. La duplicación debe completarse en un tiempo menor o igual a 5 segundos.

**Frecuencia:** Alta al inicio de cada período académico; estimada en 30 a 40 duplicaciones por período.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Requisito solicitado de forma explícita por el departamento académico: existen proyectos docentes idénticos en los que únicamente cambia el profesor.

---

## RF-10 — Creación del proyecto docente a partir de un archivo Excel

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-01: Centralizar la creación y la planeación del proyecto docente

**Requisitos asociados:** RF-08: Creación del proyecto docente mediante asistente por pasos  
NFR-019: Control de archivos cargados  
NFR-015: Validación de datos y manejo de errores

**Descripción:** El sistema debe permitir cargar el archivo Excel del formato institucional FO-DO/PC-001 y crear a partir de él un proyecto docente, mapeando automáticamente la información de los puntos 1 a 7 del formato y conservando el archivo original como documento soporte.

**Precondición:** El usuario debe tener rol Departamento académico o Administrador.

**Secuencia normal**

p1. El usuario selecciona la opción «Crear desde archivo» y carga el archivo del formato.
p2. El sistema valida la extensión, el tamaño y la estructura esperada del formato.
p3. El sistema extrae la información de información general, descripción, RAC, estrategias, evaluación, contenidos y bibliografía.
p4. El sistema muestra una previsualización por secciones con los datos reconocidos.
p5. El usuario resuelve las correspondencias que el sistema no logró identificar, como la asignatura, el docente o los RAP.
p6. El usuario confirma la creación.
p7. El sistema crea el proyecto docente, almacena el archivo original como documento soporte y registra el evento en auditoría.

**Poscondición:** El proyecto docente queda creado con la información del archivo y disponible para su revisión y ajuste.

**Excepciones**

p2. Si el archivo no corresponde al formato o a la versión esperada, el sistema rechaza la carga e informa el motivo.
p3. Si una sección no puede interpretarse, el sistema la deja vacía y la señala para diligenciamiento manual.
p5. Si un RAC no puede asociarse a un RAP existente, el sistema lo marca para asociación manual.

**Rendimiento**

q1. El procesamiento del archivo y la previsualización no deben superar los 10 segundos.

**Frecuencia:** Uso principalmente en la carga inicial y en la migración de proyectos de períodos anteriores.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** La variabilidad de los archivos existentes puede exigir una etapa de revisión manual. Se recomienda limitar el alcance a la versión 05 del formato.

---

## RF-11 — Registro de la descripción del proyecto docente

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-17: Envío del proyecto docente a revisión y control de estados

**Descripción:** El sistema debe permitir al docente responsable registrar el punto 2 «Descripción» del proyecto docente, correspondiente al texto extenso que presenta el propósito y el enfoque del curso, mediante un editor con formato básico y control de longitud.

**Precondición:** El proyecto docente debe existir y el docente debe ser su responsable.

**Secuencia normal**

p1. El docente abre su proyecto docente.
p2. El docente ingresa a la sección «Descripción».
p3. El docente redacta o ajusta el texto de la descripción del curso.
p4. El sistema guarda el contenido y registra la fecha de la última modificación.

**Poscondición:** La descripción queda registrada y la sección se marca como completa.

**Excepciones**

p3. Si el texto supera la longitud máxima definida, el sistema advierte e impide guardar.
p4. Si el proyecto se encuentra aprobado o cerrado, el sistema no permite la edición y sugiere solicitar su reapertura.

**Rendimiento**

q1. El guardado no debe superar los 3 segundos.

**Frecuencia:** Una vez por proyecto docente, con ajustes ocasionales.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Durante la elicitación esta sección se identificó como la descripción del proyecto docente en formato de texto extenso; debe confirmarse si requiere estructurarse en subcampos.

---

## RF-12 — Registro de los RAC y su asociación con los RAP

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (Valoración y Rúbrica)  
Matriz de consistencia de resultados de aprendizaje del programa de Administración Industrial (RAP 1 a RAP 7)  
Sesión de diseño con una docente del programa  
Ministerio de Educación Nacional (2022). Una mirada a los resultados de aprendizaje

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional  
OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-08: Creación del proyecto docente mediante asistente por pasos  
RF-14: Registro de la evaluación de los resultados de aprendizaje  
RF-24: Carga de evidencias fotográficas por RAP

**Descripción:** El sistema debe permitir al docente registrar los resultados de aprendizaje del curso (RAC) organizados por cada RAP seleccionado durante la creación del proyecto, conservando la relación entre el RAC declarado y el RAP del programa al que contribuye, tal como lo exige el punto 3 del formato institucional.

**Precondición:** El proyecto docente debe tener al menos un RAP seleccionado.

**Secuencia normal**

p1. El docente ingresa a la sección «Resultados de aprendizaje del curso».
p2. El sistema presenta los RAP seleccionados para la asignatura con su enunciado completo.
p3. El docente registra uno o varios RAC para cada RAP, indicando su código y enunciado.
p4. El sistema guarda cada RAC y su relación con el o los RAP correspondientes.
p5. El sistema indica cuáles RAP aún no tienen RAC asociados.

**Poscondición:** Los RAC quedan registrados y relacionados con los RAP, con trazabilidad para los reportes.

**Excepciones**

p3. Si el docente intenta registrar un RAC sin asociarlo a ningún RAP, el sistema impide guardarlo.
p5. Si al enviar a revisión existe un RAP sin RAC asociado, el sistema bloquea el envío e informa cuál falta.

**Rendimiento**

q1. El guardado de un RAC no debe superar los 3 segundos.

**Frecuencia:** Entre dos y cinco RAC por proyecto docente.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Un RAC puede contribuir a más de un RAP, por lo que la relación se implementa como asociación de muchos a muchos, conforme a la regla RN-05 del Producto 1.

---

## RF-13 — Registro de las estrategias metodológicas

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-17: Envío del proyecto docente a revisión y control de estados

**Descripción:** El sistema debe permitir al docente registrar el punto 4 «Estrategias metodológicas» del proyecto docente, mediante un listado de estrategias que puede redactar libremente o seleccionar de un catálogo sugerido de estrategias de enseñanza y de aprendizaje.

**Precondición:** El proyecto docente debe existir y encontrarse en estado de diligenciamiento.

**Secuencia normal**

p1. El docente ingresa a la sección «Estrategias metodológicas».
p2. El docente agrega una o varias estrategias, redactándolas o seleccionándolas del catálogo sugerido.
p3. El docente puede reordenar o eliminar las estrategias registradas.
p4. El sistema guarda el listado y marca la sección como completa.

**Poscondición:** Las estrategias metodológicas quedan registradas en el proyecto docente.

**Excepciones**

p4. Si la sección queda vacía al momento de enviar a revisión, el sistema bloquea el envío.

**Rendimiento**

q1. El guardado no debe superar los 3 segundos.

**Frecuencia:** Una vez por proyecto docente, con ajustes ocasionales.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El catálogo sugerido puede construirse a partir de las estrategias de enseñanza y aprendizaje descritas por el Ministerio de Educación Nacional (2022).

---

## RF-14 — Registro de la evaluación de los resultados de aprendizaje

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-12: Registro de los RAC y su asociación con los RAP  
RF-06: Gestión de la rúbrica de evaluación del RAP

**Descripción:** El sistema debe permitir al docente registrar el punto 5 «Evaluación de los resultados de aprendizaje», asociando a cada RAC del curso las actividades e instrumentos con los que será evaluado.

**Precondición:** El proyecto docente debe tener registrados sus RAC.

**Secuencia normal**

p1. El docente ingresa a la sección «Evaluación de los resultados de aprendizaje».
p2. El sistema presenta los RAC registrados en el proyecto docente.
p3. El docente registra, para cada RAC, las actividades e instrumentos de evaluación previstos.
p4. El sistema guarda la información y señala los RAC que aún no tienen evaluación asociada.

**Poscondición:** Cada RAC queda relacionado con sus actividades e instrumentos de evaluación.

**Excepciones**

p4. Si al enviar a revisión un RAC no tiene actividades de evaluación, el sistema bloquea el envío e indica cuál falta.

**Rendimiento**

q1. El guardado no debe superar los 3 segundos.

**Frecuencia:** Una vez por proyecto docente, con ajustes durante el período.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** En el formato institucional esta sección se diligencia por RAC. Debe validarse si el programa desea vincularla también con la rúbrica del RAP (RF-06).

---

## RF-15 — Registro del contenido programático por semana

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-04: Parametrización de la estructura académica  
RF-20: Registro de la clase desarrollada

**Descripción:** El sistema debe permitir al docente registrar el punto 6 «Contenidos del curso», indicando para cada semana el tema previsto y las horas TDE, TDP y TI. Este contenido constituye la lista de temas que el docente seleccionará al registrar el desarrollo de cada clase.

**Precondición:** El proyecto docente debe existir y la asignatura debe tener definidas sus horas.

**Secuencia normal**

p1. El docente ingresa a la sección «Contenidos del curso».
p2. El sistema presenta la tabla con una fila por cada semana del período académico.
p3. El docente registra el tema y las horas TDE, TDP y TI de cada semana.
p4. El sistema calcula el total de horas y lo compara con las horas declaradas para la asignatura.
p5. El sistema guarda el contenido programático y lo habilita como fuente de temas para el registro de clases.

**Poscondición:** El contenido programático queda registrado y disponible para el registro de las sesiones.

**Excepciones**

p4. Si el total de horas no coincide con el de la asignatura, el sistema advierte la diferencia y permite continuar dejando constancia.
p5. Si una semana queda sin tema, el sistema la señala como pendiente.

**Rendimiento**

q1. El guardado del contenido completo no debe superar los 4 segundos.

**Frecuencia:** Una vez por proyecto docente, con ajustes durante el período.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** En el formato vigente el contenido se organiza en 16 semanas. El número de semanas debe tomarse del período académico parametrizado.

---

## RF-16 — Registro de la bibliografía del curso

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-17: Envío del proyecto docente a revisión y control de estados

**Descripción:** El sistema debe permitir al docente registrar el punto 7 «Bibliografía» como un listado numerado de referencias, con opción de agregar, editar, reordenar y eliminar, y de reutilizar la bibliografía de un proyecto docente anterior.

**Precondición:** El proyecto docente debe existir y encontrarse en estado de diligenciamiento.

**Secuencia normal**

p1. El docente ingresa a la sección «Bibliografía».
p2. El docente agrega las referencias una a una o las importa de un proyecto anterior.
p3. El docente ordena las referencias según su criterio.
p4. El sistema guarda el listado numerado.

**Poscondición:** La bibliografía queda registrada y disponible para consulta de los estudiantes autorizados.

**Excepciones**

p4. Si la sección queda vacía al enviar a revisión, el sistema bloquea el envío.

**Rendimiento**

q1. El guardado no debe superar los 3 segundos.

**Frecuencia:** Una vez por proyecto docente.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Se recomienda un campo de texto libre por referencia para no forzar una norma de citación.

---

## RF-17 — Envío del proyecto docente a revisión y control de estados

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional  
OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-11 a RF-16: Secciones del proyecto docente  
RF-18: Revisión y aprobación del proyecto docente  
RF-26: Notificaciones y recordatorios

**Descripción:** El sistema debe administrar los estados del proyecto docente (En diligenciamiento, Enviado a revisión, Devuelto con observaciones, Aprobado, En ejecución y Cerrado) y validar la completitud de la información antes de permitir el envío a revisión.

**Precondición:** El docente debe ser responsable del proyecto y este debe estar en estado «En diligenciamiento» o «Devuelto con observaciones».

**Secuencia normal**

p1. El docente selecciona la opción «Enviar a revisión».
p2. El sistema verifica que estén completas las secciones obligatorias del formato.
p3. El sistema presenta el resumen de la verificación.
p4. El docente confirma el envío.
p5. El sistema cambia el estado a «Enviado a revisión», registra fecha y usuario, y notifica al departamento académico.

**Poscondición:** El proyecto queda bloqueado para edición y disponible para revisión.

**Excepciones**

p2. Si existen secciones incompletas, el sistema impide el envío y lista los pendientes.
p4. Si el período académico se encuentra cerrado, el sistema no permite el envío.

**Rendimiento**

q1. La verificación de completitud no debe superar los 4 segundos.

**Frecuencia:** Una o dos veces por proyecto docente por período.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Implementa las reglas RN-03 y RN-14 del Producto 1.

---

## RF-18 — Revisión y aprobación del proyecto docente

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001 v05 «Proyecto docente (pregrado presencial)»  
Elicitación con el departamento académico y docentes del programa  
Producto 1: Arquitectura de negocio URAP (reglas de negocio RN-01 a RN-15)

**Objetivos asociados:** OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-17: Envío del proyecto docente a revisión y control de estados  
RF-26: Notificaciones y recordatorios  
RF-29: Registro de auditoría

**Descripción:** El sistema debe permitir al departamento académico revisar los proyectos docentes enviados, aprobarlos o devolverlos con observaciones, dejando registro del usuario que toma la decisión, la fecha y el detalle de las observaciones.

**Precondición:** El proyecto docente debe encontrarse en estado «Enviado a revisión».

**Secuencia normal**

p1. El revisor consulta la bandeja de proyectos pendientes de revisión.
p2. El revisor abre el proyecto y consulta cada sección.
p3. El revisor registra observaciones por sección, si las hay.
p4. El revisor aprueba el proyecto o lo devuelve con observaciones.
p5. El sistema actualiza el estado, registra usuario y fecha, notifica al docente y deja constancia en auditoría.

**Poscondición:** El proyecto queda aprobado y disponible para su ejecución, o devuelto al docente con las observaciones registradas.

**Excepciones**

p4. Si el revisor devuelve el proyecto sin registrar observaciones, el sistema solicita al menos una.
p5. Si el docente responsable se encuentra inactivo, el sistema notifica al departamento académico.

**Rendimiento**

q1. El cambio de estado debe completarse en un tiempo menor o igual a 3 segundos.

**Frecuencia:** Una revisión por proyecto docente al inicio de cada período académico.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El formato institucional contempla las firmas de quien elabora, revisa y aprueba; el sistema las sustituye por el registro del usuario y la fecha.

---

## RF-19 — Generación del calendario de sesiones y precarga de días festivos

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001-2 v00 «Registro de asistencia»  
Elicitación con docentes del programa de Administración Industrial

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases

**Requisitos asociados:** RF-04: Parametrización de la estructura académica  
RF-20: Registro de la clase desarrollada  
RF-21: Clasificación de sesiones especiales

**Descripción:** A partir del período académico, de los días y horas de clase y del número de semanas, el sistema debe generar automáticamente el calendario de sesiones del curso y marcar como «Festivo» las sesiones que coincidan con los días festivos del calendario oficial colombiano, sin que el docente deba registrarlos manualmente.

**Precondición:** El período académico debe tener fecha de inicio y de finalización, y el proyecto docente debe tener definidos los días y las horas de clase.

**Secuencia normal**

p1. El sistema toma la fecha inicial y final del período académico y los días de clase del curso.
p2. El sistema genera una sesión por cada encuentro previsto, numerada por semana.
p3. El sistema consulta la tabla de días festivos del año correspondiente.
p4. El sistema marca automáticamente como «Festivo» las sesiones cuya fecha coincide con un día festivo.
p5. El sistema presenta el calendario al docente, quien puede reprogramar o ajustar las sesiones.

**Poscondición:** El curso cuenta con su calendario de sesiones, con los días festivos identificados y las sesiones pendientes de diligenciar.

**Excepciones**

p3. Si el año no tiene festivos parametrizados, el sistema genera el calendario sin marcas y advierte al administrador.
p5. Si la Universidad modifica el calendario académico, el administrador puede actualizar la tabla de festivos y el sistema recalcula las sesiones no diligenciadas.

**Rendimiento**

q1. La generación del calendario de un curso no debe superar los 5 segundos.

**Frecuencia:** Una vez por proyecto docente, al inicio del período académico.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** La tabla de festivos se parametriza por año e incluye el traslado de festivos previsto en la Ley 51 de 1983. El sistema no debe sobrescribir sesiones ya diligenciadas por el docente.

---

## RF-20 — Registro de la clase desarrollada

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001-2 v00 «Registro de asistencia»  
Elicitación con docentes del programa de Administración Industrial

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases

**Requisitos asociados:** RF-15: Registro del contenido programático por semana  
RF-19: Generación del calendario de sesiones y precarga de días festivos  
RF-22: Registro de observaciones y de estudiantes ausentes  
RF-23: Alerta de sesiones vencidas sin diligenciar

**Descripción:** El sistema debe permitir al docente registrar el desarrollo real de cada sesión indicando la fecha, la semana y seleccionando uno o varios temas del contenido programático registrado en el proyecto docente, de modo que no deba digitarlos manualmente, y agregando observaciones cuando lo considere necesario.

**Precondición:** El proyecto docente debe estar aprobado o en ejecución y tener registrado su contenido programático.

**Secuencia normal**

p1. El docente abre el calendario de sesiones de su curso.
p2. El docente selecciona la sesión que desea diligenciar.
p3. El sistema presenta la lista de temas del contenido programático del proyecto docente.
p4. El docente selecciona el o los temas efectivamente desarrollados en la sesión.
p5. El docente registra las observaciones de la sesión, si las hay.
p6. El sistema guarda el registro, lo marca como diligenciado y actualiza el avance del curso.

**Poscondición:** La sesión queda registrada con sus temas y observaciones, y deja de contarse entre las sesiones pendientes.

**Excepciones**

p4. Si el docente desarrolló un tema que no está en el contenido programático, el sistema permite registrarlo como tema adicional y lo señala como no planeado.
p6. Si la sesión corresponde a una fecha futura, el sistema no permite el registro.

**Rendimiento**

q1. El guardado del registro de clase no debe superar los 3 segundos.
q2. La carga del calendario del curso no debe superar los 4 segundos.

**Frecuencia:** Una por semana por asignatura; aproximadamente 60 registros semanales en el programa (estimación por validar).

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Sustituye el diligenciamiento manual del formato FO-DO/PC-001-2. La selección de temas desde una lista reduce errores y permite comparar lo planeado con lo ejecutado.

---

## RF-21 — Clasificación de sesiones especiales: parcial, festivo y actividad complementaria

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con actores del programa de Administración Industrial  
Sesión de diseño con una docente del programa

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases

**Requisitos asociados:** RF-19: Generación del calendario de sesiones y precarga de días festivos  
RF-20: Registro de la clase desarrollada

**Descripción:** Además de los temas del contenido programático, el sistema debe permitir clasificar una sesión con un tipo especial: Parcial, Festivo o Actividad complementaria. En estos casos no se exige la selección de un tema del contenido programático, ya que la sesión no corresponde al desarrollo de un contenido planeado.

**Precondición:** La sesión debe existir en el calendario del curso.

**Secuencia normal**

p1. El docente selecciona la sesión que desea diligenciar.
p2. El docente elige el tipo de sesión: Clase, Parcial, Festivo o Actividad complementaria.
p3. Si el tipo es distinto de «Clase», el sistema deshabilita la selección obligatoria de tema y solicita una breve descripción.
p4. El docente registra la descripción de la actividad o del parcial.
p5. El sistema guarda la sesión con su tipo y la excluye del conteo de temas pendientes.

**Poscondición:** La sesión queda registrada con su tipo, y los indicadores de avance del curso reflejan correctamente las sesiones no dedicadas a contenidos.

**Excepciones**

p2. Si la sesión fue marcada automáticamente como «Festivo» y el docente sí dictó clase, puede cambiar el tipo y seleccionar los temas.
p5. El sistema no permite registrar una sesión de tipo «Parcial» sin descripción.

**Rendimiento**

q1. El guardado no debe superar los 3 segundos.

**Frecuencia:** Entre tres y cinco sesiones especiales por curso y por período.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Los tipos de sesión se administran como catálogo parametrizable, de modo que el programa pueda agregar otros casos, como cancelación institucional o cese de actividades, sin modificar el código.

---

## RF-22 — Registro de observaciones y de estudiantes ausentes

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Formato FO-DO/PC-001-2 v00 «Registro de asistencia»  
Elicitación con docentes del programa de Administración Industrial

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases

**Requisitos asociados:** RF-20: Registro de la clase desarrollada  
NFR-020: Tratamiento de datos personales

**Descripción:** En las observaciones de la sesión, el sistema debe permitir al docente seleccionar, a partir de la lista de estudiantes del grupo, aquellos que no asistieron, de modo que la inasistencia quede registrada sin necesidad de escribir los nombres manualmente.

**Precondición:** El grupo debe tener cargada la lista de estudiantes matriculados.

**Secuencia normal**

p1. El docente abre la sesión que está diligenciando.
p2. El docente selecciona la opción «Registrar inasistencias».
p3. El sistema presenta la lista de estudiantes matriculados en el grupo.
p4. El docente marca los estudiantes que no asistieron.
p5. El docente complementa la observación con texto libre, si lo requiere.
p6. El sistema guarda la inasistencia, calcula el número de ausentes y lo muestra en el resumen de la sesión.

**Poscondición:** La sesión conserva la relación de estudiantes ausentes y la observación registrada.

**Excepciones**

p3. Si el grupo no tiene lista de estudiantes cargada, el sistema permite registrar la observación en texto libre e informa cómo solicitar el cargue.
p6. Si el docente marca a la totalidad del grupo, el sistema solicita confirmación.

**Rendimiento**

q1. La carga de la lista de estudiantes del grupo no debe superar los 3 segundos.

**Frecuencia:** Semanal por asignatura, durante el período académico.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Requiere disponer de la lista de estudiantes por grupo, mediante cargue de archivo o integración con el sistema de información académica. Al tratarse de datos personales, su consulta debe restringirse al docente responsable y a los roles autorizados.

---

## RF-23 — Alerta de sesiones vencidas sin diligenciar

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con actores del programa de Administración Industrial  
Sesión de diseño con una docente del programa

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases  
OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-20: Registro de la clase desarrollada  
RF-25: Tablero de seguimiento del diligenciamiento  
RF-26: Notificaciones y recordatorios

**Descripción:** El sistema debe resaltar en color rojo las sesiones cuya fecha ya transcurrió y que no han sido diligenciadas, indicando el número de días de atraso, y en color de advertencia aquellas próximas a vencer. El estado se debe reflejar tanto en la vista del docente como en el tablero de seguimiento.

**Precondición:** El curso debe tener generado su calendario de sesiones.

**Secuencia normal**

p1. El sistema compara la fecha de cada sesión con la fecha actual.
p2. Si la fecha ya transcurrió y la sesión no tiene registro, el sistema la marca como «Vencida» en color rojo.
p3. El sistema calcula y muestra los días transcurridos desde la fecha de la sesión.
p4. Si la sesión está dentro del umbral configurado, el sistema la marca como «Por vencer».
p5. El sistema muestra el número de sesiones vencidas en el panel del docente y en el tablero de seguimiento.

**Poscondición:** El docente y los responsables del seguimiento identifican de inmediato los registros pendientes.

**Excepciones**

p2. Las sesiones de tipo «Festivo» no se contabilizan como vencidas.
p4. Si el período académico está cerrado, las sesiones vencidas se consolidan como incumplimiento y dejan de acumular días.

**Rendimiento**

q1. El cálculo del estado de las sesiones debe realizarse al cargar la vista sin superar los 3 segundos.

**Frecuencia:** Cálculo permanente; consulta diaria por parte de docentes y del administrador.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El umbral de días para la alerta preventiva se parametriza; se propone un valor inicial de dos días. Requisito solicitado de forma explícita durante la elicitación con los docentes.

---

## RF-24 — Carga de evidencias fotográficas por RAP

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con docentes y con el departamento académico  
Producto 2: Arquitectura de tecnología URAP (numeral 3.6)

**Objetivos asociados:** OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-12: Registro de los RAC y su asociación con los RAP  
NFR-007: Restricción de acceso al almacenamiento documental  
NFR-019: Control de archivos cargados

**Descripción:** El sistema debe permitir al docente cargar evidencias fotográficas asociadas a un RAP del proyecto docente, indicando una descripción, la fecha y, si corresponde, la sesión relacionada. Los archivos se almacenan en el servicio de almacenamiento documental y la base de datos conserva únicamente su referencia.

**Precondición:** El proyecto docente debe tener RAP asociados y el docente debe ser su responsable.

**Secuencia normal**

p1. El docente ingresa a la sección de evidencias del proyecto docente.
p2. El docente selecciona el RAP al que corresponde la evidencia.
p3. El docente carga uno o varios archivos y registra la descripción.
p4. El sistema valida el tipo y el tamaño de cada archivo.
p5. El sistema almacena el archivo y registra nombre, tipo, tamaño, usuario, fecha y ubicación.
p6. El sistema presenta la galería de evidencias del RAP.

**Poscondición:** Las evidencias quedan asociadas al RAP y disponibles para la consulta de los roles autorizados.

**Excepciones**

p4. Si el archivo excede el tamaño máximo permitido, el sistema rechaza la carga e informa el límite.
p4. Si el tipo de archivo no está permitido, el sistema rechaza la carga.
p5. Si falla la carga al servicio de almacenamiento, el sistema informa el error y permite reintentar sin perder la descripción registrada.

**Rendimiento**

q1. El tiempo de carga depende del tamaño del archivo y de la conexión del usuario; la confirmación no debe superar los 10 segundos para archivos de hasta 5 MB.

**Frecuencia:** Entre dos y diez evidencias por RAP y por período académico.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Se propone permitir archivos JPG, PNG y PDF con un tamaño máximo de 10 MB por archivo (valor por validar). Cuando las imágenes incluyan estudiantes identificables, debe contarse con su autorización de tratamiento de imagen.

---

## RF-25 — Tablero de seguimiento del diligenciamiento

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con actores del programa de Administración Industrial  
Sesión de diseño con una docente del programa

**Objetivos asociados:** OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-17: Envío del proyecto docente a revisión y control de estados  
RF-23: Alerta de sesiones vencidas sin diligenciar  
RF-28: Generación de reportes académicos

**Descripción:** El sistema debe ofrecer al administrador y al departamento académico un tablero que muestre el estado de diligenciamiento de los proyectos docentes del período: porcentaje de secciones completas, sesiones registradas frente a las programadas, sesiones vencidas, evidencias cargadas por RAP y estado del proyecto, con filtros por programa, asignatura, docente y período.

**Precondición:** El usuario debe tener rol Administrador, Departamento académico o Dirección del programa.

**Secuencia normal**

p1. El usuario ingresa al tablero de seguimiento.
p2. El usuario selecciona los filtros de período, programa, asignatura o docente.
p3. El sistema calcula los indicadores de avance y cumplimiento.
p4. El sistema presenta el resultado con un indicador de color por proyecto docente.
p5. El usuario abre el detalle de un proyecto o exporta la información consultada.

**Poscondición:** El responsable del seguimiento identifica los proyectos con pendientes y los docentes a quienes debe recordar el diligenciamiento.

**Excepciones**

p3. Si no existen proyectos para los filtros seleccionados, el sistema informa que no hay resultados.
p5. Si el volumen de datos supera el límite de exportación, el sistema sugiere restringir los filtros.

**Rendimiento**

q1. La consulta del tablero no debe superar los 5 segundos.
q2. La exportación consolidada no debe superar los 10 segundos.

**Frecuencia:** Consulta semanal y diaria en fechas de corte del período académico.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Es la función principal del actor administrador, definido durante la elicitación como responsable de velar por el cumplimiento del diligenciamiento.

---

## RF-26 — Notificaciones y recordatorios

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con actores del programa de Administración Industrial  
Sesión de diseño con una docente del programa

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases  
OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-18: Revisión y aprobación del proyecto docente  
RF-23: Alerta de sesiones vencidas sin diligenciar  
ACT-07: Servicio de correo institucional

**Descripción:** El sistema debe notificar a los usuarios, dentro de la aplicación y por correo institucional, los eventos relevantes del proceso: asignación de un proyecto docente, proximidad y vencimiento del registro de sesiones, devolución con observaciones, aprobación del proyecto y cierre del período.

**Precondición:** El usuario destinatario debe tener registrado un correo institucional válido.

**Secuencia normal**

p1. Se produce un evento notificable dentro del sistema.
p2. El sistema identifica a los destinatarios según el rol y la relación con el proyecto docente.
p3. El sistema genera la notificación dentro de la aplicación.
p4. El sistema envía el correo electrónico correspondiente.
p5. El sistema registra el envío, la fecha y el estado de la notificación.

**Poscondición:** El usuario recibe la notificación y puede acceder directamente al elemento que la originó.

**Excepciones**

p4. Si falla el envío del correo, el sistema reintenta y deja constancia del error, conservando la notificación en la aplicación.
p2. Si un docente tiene varias sesiones vencidas, el sistema agrupa los pendientes en una sola notificación para evitar la saturación.

**Rendimiento**

q1. La notificación dentro de la aplicación debe estar disponible de forma inmediata tras el evento.
q2. El envío del correo debe realizarse dentro de los 5 minutos siguientes al evento.

**Frecuencia:** Recordatorios semanales de sesiones pendientes y notificaciones por cada cambio de estado.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Los eventos notificables y su periodicidad deben ser configurables por el administrador. Corresponde a la épica EP-12 del Producto 3.

---

## RF-27 — Consulta del proyecto docente por parte del estudiante

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Elicitación con estudiantes del programa  
Producto 1: Arquitectura de negocio URAP (regla RN-15)

**Objetivos asociados:** OBJ-07: Facilitar la consulta del proyecto docente por parte del estudiante

**Requisitos asociados:** RF-18: Revisión y aprobación del proyecto docente  
RF-03: Gestión de roles y permisos

**Descripción:** El sistema debe permitir al estudiante consultar, en modo de solo lectura, los proyectos docentes aprobados y publicados de las asignaturas que cursa, incluyendo descripción, RAC y RAP asociados, estrategias metodológicas, criterios de evaluación, contenidos por semana y bibliografía.

**Precondición:** El estudiante debe estar autenticado y el proyecto docente debe estar aprobado y publicado.

**Secuencia normal**

p1. El estudiante inicia sesión en la plataforma.
p2. El sistema presenta las asignaturas asociadas al estudiante.
p3. El estudiante selecciona la asignatura que desea consultar.
p4. El sistema muestra el proyecto docente publicado en modo de solo lectura.
p5. El estudiante puede descargar el proyecto docente en formato PDF, si el programa lo autoriza.

**Poscondición:** El estudiante conoce los resultados de aprendizaje, los contenidos y los criterios de evaluación del curso.

**Excepciones**

p4. Si el proyecto no está aprobado o publicado, el sistema informa que aún no está disponible.
p4. El sistema no muestra observaciones de clase, registros de inasistencia ni evidencias internas.

**Rendimiento**

q1. La consulta del proyecto docente no debe superar los 4 segundos.

**Frecuencia:** Consultas concentradas al inicio del período y en fechas de evaluación.

**Importancia:** Media

**Urgencia:** Baja

**Estado:** Especificado; su habilitación depende de la autorización del programa

**Estabilidad:** Media

**Comentarios:** Corresponde a la épica EP-11 del Producto 3, clasificada con prioridad baja. La asociación estudiante-asignatura depende de la disponibilidad de la lista de matriculados.

---

## RF-28 — Generación de reportes académicos

**Versión:** 1.1 (27/10/2026)

**Fuentes:** Producto 1: Arquitectura de negocio URAP (regla RN-11)  
Informe de resultados RAP 2023-II del programa de Administración Industrial

**Objetivos asociados:** OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-25: Tablero de seguimiento del diligenciamiento  
RF-12: Registro de los RAC y su asociación con los RAP  
RF-07: Parametrización de la escala de valoración de RAP por programa

**Descripción:** El sistema debe generar reportes filtrables por período, programa, asignatura, docente, RAP y estado, que incluyan el cumplimiento del diligenciamiento, la ejecución de los contenidos frente a lo planeado, la contribución de los RAC a los RAP y las evidencias registradas por RAP, con exportación a Excel y PDF.

**Precondición:** Debe existir información registrada para el período y los filtros seleccionados.

**Secuencia normal**

p1. El usuario ingresa al módulo de reportes y selecciona el tipo de reporte.
p2. El usuario define los filtros de período, programa, asignatura, docente, RAP o estado.
p3. El sistema consulta y consolida la información.
p4. El sistema presenta el reporte en pantalla con sus indicadores y tablas.
p5. El usuario exporta el reporte a Excel o PDF.
p6. El sistema registra la generación del reporte, con el usuario y la fecha.

**Poscondición:** El reporte queda disponible para consulta, descarga y soporte de los procesos de autoevaluación del programa.

**Excepciones**

p3. Si no existe información para los filtros seleccionados, el sistema informa que no hay resultados.
p5. Si la generación del archivo falla, el sistema informa el error y permite reintentar.

**Rendimiento**

q1. Los reportes simples deben generarse en un tiempo menor o igual a 5 segundos.
q2. Los reportes consolidados deben generarse entre 5 y 10 segundos según el volumen de datos.

**Frecuencia:** Consultas periódicas y generación intensiva al cierre de cada período académico.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Los reportes deben poder alimentar el informe de resultados RAP que el programa elabora por período, y los formatos institucionales de medición de RAP. El reporte específico de logro de los RAP se detalla en RF-32.

---

## RF-29 — Registro de auditoría de las acciones de los usuarios

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3 y 4)  
Producto 3: Esquema de implementación URAP (épicas EP-01 a EP-12)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** NFR-008: Trazabilidad de las operaciones  
NFR-020: Tratamiento de datos personales

**Descripción:** El sistema debe registrar las acciones relevantes realizadas por los usuarios sobre la información crítica, conservando usuario responsable, acción ejecutada, tabla o entidad afectada, identificador del registro, fecha y hora, dirección IP y, cuando corresponda, el valor anterior y el nuevo.

**Precondición:** El usuario debe estar autenticado para que sus acciones sean atribuibles.

**Secuencia normal**

p1. El usuario ejecuta una operación de creación, modificación, eliminación, aprobación o consulta sensible.
p2. El sistema procesa la operación en la capa de servicios.
p3. El sistema registra el evento de auditoría con todos sus atributos.
p4. El administrador consulta la auditoría con filtros por usuario, fecha, acción y entidad.

**Poscondición:** Las acciones quedan registradas y son consultables para efectos de control y revisión.

**Excepciones**

p3. Si el registro de auditoría falla, el sistema deja constancia del error en los registros técnicos sin interrumpir la operación del usuario.
p4. El sistema no permite modificar ni eliminar registros de auditoría.

**Rendimiento**

q1. El registro de auditoría no debe incrementar en más de un segundo el tiempo de respuesta de la operación.

**Frecuencia:** Permanente, asociada a cada operación relevante.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Implementa la regla RN-10 del Producto 1 y el numeral 3.7 del Producto 2. Corresponde a la épica EP-10 del Producto 3.

---

## RF-30 — Registro de la valoración de los estudiantes por indicador de desempeño

**Versión:** 1.0 (27/10/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (hojas Valoración, Rúbrica y Evaluación)  
Rúbrica diligenciada RAP 2 - Finanzas a corto plazo 2024-1  
Informe de resultados RAP 2023-II del programa de Administración Industrial

**Objetivos asociados:** OBJ-08: Medir el logro de los RAP y soportar el análisis y la mejora continua  
OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-06: Gestión de la rúbrica de evaluación del RAP  
RF-07: Parametrización de la escala de valoración de RAP por programa  
RF-22: Registro de observaciones y de estudiantes ausentes (lista de matriculados)  
RF-31: Consolidación y análisis de la medición de RAP  
NFR-020: Tratamiento de datos personales

**Descripción:** El sistema debe permitir al docente responsable registrar, para cada estudiante matriculado en el curso, el nivel de desempeño alcanzado en cada indicador de la rúbrica del RAP evaluado, utilizando la escala del programa. La medición se identifica por proyecto docente, RAP, tipo de valoración (formativa o sumativa), período y año de toma de datos.

**Precondición:** El proyecto docente debe estar aprobado, tener el RAP asociado con una rúbrica vigente y contar con la lista de estudiantes matriculados.

**Secuencia normal**

p1. El docente ingresa al módulo de medición de RAP y selecciona el proyecto docente.
p2. El docente selecciona el RAP a evaluar y el tipo de valoración: formativa o sumativa.
p3. El sistema presenta la rúbrica vigente del RAP con sus indicadores de desempeño y la escala del programa.
p4. El docente registra, para cada indicador, el instrumento de evaluación utilizado y su descripción.
p5. El sistema presenta la lista de estudiantes matriculados en el curso.
p6. El docente asigna a cada estudiante el nivel alcanzado en cada indicador.
p7. El sistema guarda la medición en estado borrador y calcula el tamaño de la muestra.

**Poscondición:** La valoración queda registrada por estudiante e indicador, asociada a la versión de rúbrica vigente, y disponible para su consolidación.

**Excepciones**

p1. Si el curso no tiene cargada la lista de estudiantes, el sistema impide iniciar la medición e indica cómo solicitar el cargue.
p3. Si el RAP no tiene una rúbrica vigente, el sistema impide iniciar la medición y remite a RF-06.
p6. Si un estudiante queda sin valorar en un indicador, el sistema lo excluye del tamaño de la muestra de ese indicador y lo señala.
p7. Una vez cerrada la medición, el sistema no permite modificar las valoraciones; su reapertura solo puede autorizarla el departamento académico.

**Rendimiento**

q1. La carga de la matriz de valoración de un curso de hasta 40 estudiantes no debe superar los 5 segundos.
q2. El guardado de la medición completa no debe superar los 10 segundos.

**Frecuencia:** Una o dos mediciones por asignatura evaluada y por período académico.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado; incorporado al alcance el 27/10/2026

**Estabilidad:** Media

**Comentarios:** Corresponde a la hoja «Valoración» del formato FO-DO/PC-023. Las valoraciones son datos personales de los estudiantes, por lo que su consulta debe restringirse al docente responsable, al líder RAP y al departamento académico (NFR-020). Las valoraciones se asocian a la versión de rúbrica vigente al momento de la medición, de modo que una edición posterior de la rúbrica no altere los resultados ya registrados.

---

## RF-31 — Consolidación y análisis de la medición de RAP

**Versión:** 1.0 (27/10/2026)

**Fuentes:** Formato FO-DO/PC-023 v00 «Medición de resultado de aprendizaje del programa por asignatura» (hojas Valoración, Rúbrica y Evaluación)  
Rúbrica diligenciada RAP 2 - Finanzas a corto plazo 2024-1  
Informe de resultados RAP 2023-II del programa de Administración Industrial

**Objetivos asociados:** OBJ-08: Medir el logro de los RAP y soportar el análisis y la mejora continua  
OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-30: Registro de la valoración de los estudiantes por indicador de desempeño  
RF-07: Parametrización de la escala de valoración de RAP por programa  
RF-32: Reporte de logro de los RAP del programa

**Descripción:** A partir de las valoraciones registradas, el sistema debe calcular automáticamente la tabla resumen de conteos por nivel e indicador, la tabla porcentual, el tamaño de la muestra y de la cohorte, y el porcentaje alcanzado en los niveles de cumplimiento frente al porcentaje esperado por el programa. Además, debe permitir registrar las acciones implementadas, los resultados obtenidos y las acciones propuestas.

**Precondición:** Debe existir una medición con valoraciones registradas para el RAP y el curso.

**Secuencia normal**

p1. El docente o el líder RAP abre la medición registrada.
p2. El sistema calcula los conteos por nivel de desempeño para cada indicador.
p3. El sistema calcula la tabla porcentual, el tamaño de la muestra y el de la cohorte.
p4. El sistema compara el porcentaje acumulado en los niveles de cumplimiento con el porcentaje esperado del programa y señala si el resultado fue alcanzado.
p5. El usuario registra las acciones implementadas, los resultados obtenidos y las acciones propuestas.
p6. El usuario cierra la medición.
p7. El sistema consolida el resultado y lo deja disponible para los reportes del programa.

**Poscondición:** La medición queda cerrada, con su consolidado calculado y sus acciones de mejora registradas, y alimenta los reportes de logro del programa.

**Excepciones**

p3. Si no se registró el tamaño de la cohorte, el sistema calcula los porcentajes únicamente sobre la muestra y lo advierte en el resultado.
p4. Si el programa no tiene definido el porcentaje esperado, el sistema presenta el consolidado sin el juicio de cumplimiento.
p6. El sistema no permite cerrar una medición cuyo resultado esté por debajo del porcentaje esperado si no se registraron acciones propuestas.

**Rendimiento**

q1. El cálculo del consolidado de una medición no debe superar los 5 segundos.

**Frecuencia:** Una consolidación por cada medición registrada.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado; incorporado al alcance el 27/10/2026

**Estabilidad:** Media

**Comentarios:** Corresponde a la hoja «Evaluación» del formato FO-DO/PC-023. Las tablas resumen y porcentual no se almacenan: se calculan a partir de las valoraciones individuales, de modo que corregir una valoración actualice el consolidado sin recálculos manuales. Este requisito sustituye el trabajo que hoy se hace con fórmulas dentro del archivo Excel del formato.

---

## RF-32 — Reporte de logro de los RAP del programa

**Versión:** 1.0 (27/10/2026)

**Fuentes:** Informe de resultados RAP 2023-II del programa de Administración Industrial  
Matriz de consistencia de resultados de aprendizaje del programa  
Formato FO-DO/PC-023 v00

**Objetivos asociados:** OBJ-08: Medir el logro de los RAP y soportar el análisis y la mejora continua  
OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-31: Consolidación y análisis de la medición de RAP  
RF-05: Gestión del catálogo de RAP por programa  
RF-28: Generación de reportes académicos

**Descripción:** El sistema debe generar un reporte del logro de los RAP del programa por período académico, que presente, para cada RAP, las asignaturas que lo evaluaron, el porcentaje alcanzado en los niveles de cumplimiento frente al esperado, la comparación con períodos anteriores y las acciones propuestas, con exportación a Excel y PDF.

**Precondición:** Debe existir al menos una medición cerrada para el programa y el período consultados.

**Secuencia normal**

p1. El usuario selecciona el programa, el período académico y, opcionalmente, un RAP.
p2. El sistema consolida las mediciones cerradas que corresponden a los filtros.
p3. El sistema presenta, por cada RAP, las asignaturas evaluadas y el porcentaje alcanzado frente al esperado.
p4. El sistema presenta la comparación con los períodos anteriores disponibles.
p5. El usuario exporta el reporte a Excel o PDF.

**Poscondición:** El programa dispone del consolidado de logro de sus RAP para los procesos de autoevaluación, acreditación y mejoramiento curricular.

**Excepciones**

p2. Si un RAP no tiene mediciones cerradas en el período, el sistema lo presenta como no evaluado en lugar de omitirlo.
p4. Si no existen períodos anteriores con mediciones, el sistema omite la comparación e informa el motivo.

**Rendimiento**

q1. La generación del reporte consolidado no debe superar los 10 segundos.

**Frecuencia:** Al cierre de cada período académico y durante los procesos de autoevaluación del programa.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado; incorporado al alcance el 27/10/2026

**Estabilidad:** Media

**Comentarios:** Este reporte sustituye la consolidación manual con la que actualmente se elabora el informe de resultados RAP del programa. Es el requisito que materializa el componente de análisis del título del proyecto.

---
