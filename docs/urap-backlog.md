# URAP — Backlog de épicas e historias de usuario

Versión 2.2 — Alineada a los requisitos v1.2 (RF-01 a RF-32). Generado el 2026-11-07 desde `Backlog_Epicas_Historias_URAP_v2.2.xlsx`, que es la fuente oficial.

**Este archivo dice QUÉ construir y en qué orden.** El detalle de cada requisito (secuencia normal, excepciones, tiempos de respuesta) está en `docs/requisitos-funcionales.md`: cada historia indica su RF.

No implementes una historia sin leer antes su RF completo.


## Plan de sprints

| Sprint | Objetivo | Historias | Resultado esperado |
|---|---|---|---|
| **Sprint 0** | Preparación técnica del proyecto | — | Base técnica lista y los dos repositorios ejecutándose en local. |
| **Sprint 1** | Acceso, usuarios, roles y permisos | 13 | Se puede entrar al sistema y cada rol ve solo lo suyo. Es la base de todo lo demás. Orden interno: HU-02-05 y HU-02-06 antes que HU-01-03, que depende de la matriz de permisos. |
| **Sprint 2** | Parametrización académica y resultados de aprendizaje | 13 | El programa queda configurado y los RAP listos con sus rúbricas. Sprint pesado: es el que más pantallas CRUD tiene. |
| **Sprint 3** | Proyecto docente: creación y diligenciamiento | 14 | El módulo central funcionando de punta a punta. Es el sprint más demostrable ante el programa. |
| **Sprint 4** | Revisión, aprobación e importación | 7 | El ciclo de vida del proyecto docente queda cerrado. |
| **Sprint 5** | Calendario, ejecución de clases y matrícula | 11 | Es el bloque que más pidieron los docentes. Conviene validarlo con ellos apenas esté. |
| **Sprint 6** | Evidencias y registro de la medición de RAP | 8 | Queda capturada la información que alimenta el análisis. |
| **Sprint 7** | Consolidado de RAP, seguimiento y reportes | 12 | El componente de análisis del título queda demostrable. |
| **Sprint 8** | Notificaciones, auditoría y estabilización | 6 | MVP estabilizado y listo para la entrega académica. |
| **Release 2** | Posterior al MVP | 5 | Funcionalidades no esenciales para la primera entrega. |

## Épicas

| Código | Épica | Requisitos | Sprint |
|---|---|---|---|
| **EP-01** | Acceso y seguridad del sistema | RF-01 | Sprint 1 |
| **EP-02** | Usuarios, roles y permisos | RF-02, RF-03 | Sprint 1 |
| **EP-03** | Parametrización de la estructura académica | RF-04 | Sprint 1 y 2 |
| **EP-04** | Resultados de aprendizaje del programa | RF-05, RF-06, RF-07 | Sprint 2 |
| **EP-05** | Creación del proyecto docente | RF-08, RF-09, RF-10 | Sprint 3 |
| **EP-06** | Diligenciamiento del proyecto docente | RF-11 a RF-16 | Sprint 3 |
| **EP-07** | Revisión y aprobación | RF-17, RF-18 | Sprint 4 |
| **EP-08** | Calendario y registro de clases | RF-19 a RF-21, RF-23 | Sprint 5 |
| **EP-09** | Estudiantes, matrícula e inasistencias | RF-22 | Sprint 5 |
| **EP-10** | Evidencias y documentos soporte | RF-24 | Sprint 6 |
| **EP-11** | Medición y análisis de RAP | RF-30 a RF-32 | Sprint 6 |
| **EP-12** | Seguimiento y reportes académicos | RF-25, RF-28 | Sprint 7 |
| **EP-13** | Notificaciones y recordatorios | RF-26 | Sprint 8 |
| **EP-14** | Auditoría y trazabilidad | RF-29 | Sprint 1 y 8 |
| **EP-15** | Consulta estudiantil | RF-27 | Release 2 |

## Historias de usuario


### EP-01 — Acceso y seguridad del sistema

#### HU-01-01 · RF-01 · Alta · Sprint 1

**Usuario.** Como usuario del sistema, quiero iniciar sesión con mi correo institucional y contraseña para acceder a las funcionalidades que corresponden a mis roles.

*Criterios de aceptación:* El sistema valida las credenciales comparando el hash de la contraseña; si son válidas emite un token JWT con expiración y presenta el panel inicial; si no lo son muestra un mensaje genérico que no revela cuál de los dos datos falló; un usuario inactivo no puede ingresar y se le indica que contacte al administrador; el inicio de sesión responde en 3 segundos o menos.

#### HU-01-02 · RF-01 · Alta · Sprint 1

**Usuario.** Como usuario del sistema, quiero cerrar sesión para proteger mi cuenta cuando termine de usar la plataforma.

*Criterios de aceptación:* El sistema marca la sesión como revocada en la tabla «sesion» con motivo «logout»; el guard rechaza cualquier petición posterior que use ese token aunque todavía no haya expirado; el cliente borra el token y redirige a la pantalla de inicio de sesión.

*Depende de:* HU-01-01

#### HU-01-03 · RF-01, RF-03 · Alta · Sprint 1

**Usuario.** Como usuario con uno o varios roles, quiero ver únicamente las opciones autorizadas para mis roles para no acceder a información que no me corresponde.

*Criterios de aceptación:* El menú se arma a partir de la lista de roles del usuario, no de un rol único; cada endpoint protegido valida rol y permiso en el backend; una petición sin autorización devuelve 403 aunque la opción esté oculta en la interfaz; un usuario con dos roles ve la unión de ambos permisos.

*Depende de:* HU-01-01, HU-02-06

#### HU-01-04 · RF-01 · Media · Sprint 1

**Usuario.** Como responsable de la seguridad del sistema, quiero que se bloquee temporalmente el acceso tras varios intentos fallidos para dificultar ataques por fuerza bruta.

*Criterios de aceptación:* El número de intentos y la duración del bloqueo se leen de «parametro_sistema», con valores iniciales sembrados; no están fijos en el código aunque la pantalla para editarlos llegue en HU-03-07; al superar el límite la cuenta se bloquea temporalmente; el bloqueo queda registrado en auditoría; al expirar, el usuario puede reintentar.

*Depende de:* HU-01-01, HU-14-01

#### HU-01-05 · RF-01 · Media · Release 2

**Usuario.** Como usuario del sistema, quiero restablecer mi contraseña para volver a ingresar cuando no la recuerde.

*Criterios de aceptación:* El sistema valida que el correo esté registrado; genera un flujo seguro de restablecimiento con enlace de un solo uso y expiración; la nueva contraseña cumple la política definida.

*Depende de:* HU-01-01


### EP-02 — Usuarios, roles y permisos

#### HU-02-01 · RF-02 · Alta · Sprint 1

**Administrador.** Como administrador, quiero crear usuarios asignándoles uno o varios roles para habilitar el acceso de docentes, líderes RAP y personal académico.

*Criterios de aceptación:* El formulario exige nombre, documento, correo institucional y programa; valida que el correo no exista; permite asignar uno o varios roles con su alcance por programa; el usuario queda activo; la creación se registra en auditoría; el guardado responde en 3 segundos o menos.

#### HU-02-02 · RF-02 · Alta · Sprint 1

**Administrador.** Como administrador, quiero editar la información de un usuario para mantener sus datos y roles actualizados.

*Criterios de aceptación:* El sistema carga la información existente; permite modificar datos y roles; valida de nuevo la unicidad del correo; registra el cambio en auditoría con valor anterior y nuevo.

*Depende de:* HU-02-01

#### HU-02-03 · RF-02 · Alta · Sprint 1

**Administrador.** Como administrador, quiero inactivar usuarios en lugar de eliminarlos para conservar la trazabilidad de lo que registraron.

*Criterios de aceptación:* El sistema no permite eliminar un usuario con proyectos o registros asociados, solo inactivarlo; un usuario inactivo no puede iniciar sesión; sus registros históricos siguen visibles en consultas y reportes.

*Depende de:* HU-02-01

#### HU-02-04 · RF-02 · Media · Sprint 1

**Administrador.** Como administrador, quiero consultar los usuarios con filtros para administrar los accesos del sistema.

*Criterios de aceptación:* El listado permite filtrar por programa, rol y estado; muestra nombre, correo, roles y estado; está paginado y carga en 4 segundos o menos.

*Depende de:* HU-02-01

#### HU-02-05 · RF-03 · Alta · Sprint 1

**Administrador.** Como administrador, quiero administrar los roles del sistema para reflejar la estructura real de responsabilidades del programa.

*Criterios de aceptación:* El sistema presenta los roles existentes; permite crear y editar roles; no permite eliminar un rol con usuarios activos asociados; cada rol conserva al menos un permiso de lectura.

#### HU-02-06 · RF-03 · Alta · Sprint 1

**Administrador.** Como administrador, quiero configurar la matriz de permisos por módulo para que cada rol acceda solo a lo que le corresponde.

*Criterios de aceptación:* El sistema presenta la matriz de módulos por permisos (leer, crear, actualizar, eliminar, generar, administrar, aprobar); guarda la configuración; la aplica en la siguiente sesión de los usuarios afectados; no permite retirar el permiso de administración al último administrador activo.

*Depende de:* HU-02-05

#### HU-02-07 · RF-02, RF-03 · Media · Sprint 1

**Administrador.** Como administrador, quiero asignar y revocar roles a un usuario conservando el historial para saber quién tuvo qué permisos y cuándo.

*Criterios de aceptación:* La asignación registra fecha y usuario que la realizó; la revocación es lógica y conserva la fecha; el historial es consultable; el mismo usuario puede tener varios roles vigentes.

*Depende de:* HU-02-01, HU-02-05


### EP-03 — Parametrización de la estructura académica

#### HU-03-01 · RF-04 · Alta · Sprint 1

**Administrador.** Como administrador, quiero registrar facultades, programas y sus planes de estudio para configurar la estructura académica de la institución.

*Criterios de aceptación:* Permite crear y editar facultades, programas y planes de estudio; valida unicidad del nombre del programa dentro de la facultad y del código del plan dentro del programa; admite varios planes vigentes en un mismo programa (en 2026-1, el 1702 y el 2502), cada uno con su estado: vigente, en extinción o cerrado; permite registrar el director del programa y el decano de la facultad.

#### HU-03-02 · RF-04 · Alta · Sprint 2

**Administrador.** Como administrador, quiero registrar las asignaturas de cada plan de estudios con toda su información académica para que el sistema pueda autocompletar el proyecto docente.

*Criterios de aceptación:* Registra el plan de estudios, código, nombre, semestre, componente, tipo de curso, créditos y horas TDE, TDP y TI; valida unicidad del código dentro del plan y admite el mismo código en planes distintos; no permite eliminar una asignatura con proyectos asociados, solo inactivarla.

*Depende de:* HU-03-01

#### HU-03-03 · RF-04 · Media · Sprint 2

**Administrador.** Como administrador, quiero que el sistema valide la coherencia entre créditos y horas para detectar errores de parametrización.

*Criterios de aceptación:* Al guardar, el sistema compara la suma de TDE, TDP y TI contra las horas totales declaradas; si no coinciden advierte la diferencia y permite continuar dejando constancia; el caso de referencia es 2 créditos = 96 horas (16 semanas x 2 TDE + 16 x 4 TI).

*Depende de:* HU-03-02

#### HU-03-04 · RF-04 · Baja · Sprint 2

**Administrador.** Como administrador, quiero registrar prerrequisitos y correquisitos de las asignaturas para que aparezcan en el proyecto docente.

*Criterios de aceptación:* Permite asociar una asignatura con otras del mismo plan de estudios indicando si es prerrequisito o correquisito; evita referencias circulares directas.

*Depende de:* HU-03-02

#### HU-03-05 · RF-04 · Alta · Sprint 2

**Administrador.** Como administrador, quiero configurar los períodos académicos para organizar los proyectos docentes por vigencia.

*Criterios de aceptación:* Permite crear períodos con código, fecha de inicio, fecha de fin y número de semanas; marca el período activo; un período cerrado bloquea envíos y registros de clase.

#### HU-03-06 · RF-04, RF-17 · Media · Sprint 2

**Administrador.** Como administrador, quiero configurar el catálogo de estados del proyecto docente para controlar el flujo de revisión.

*Criterios de aceptación:* Permite definir los estados (en diligenciamiento, enviado, devuelto, aprobado, en ejecución, cerrado), su orden y si permiten edición; el catálogo alimenta las transiciones de EP-07.

#### HU-03-07 · RF-04, RF-23, NFR-019 · Media · Sprint 5

**Administrador.** Como administrador, quiero configurar los parámetros del sistema para ajustar su comportamiento sin depender de un cambio de código.

*Criterios de aceptación:* Permite editar al menos: días de anticipación de la alerta preventiva, intentos máximos de inicio de sesión, duración del bloqueo por intentos fallidos, tamaño máximo de archivo y tipos de archivo permitidos; los cambios aplican sin redesplegar. El secreto JWT y la vigencia del token NO son parámetros editables desde la aplicación: van en variables de entorno, conforme a NFR-003, porque un administrador no debería poder ampliar la vigencia de un token desde una pantalla.

*Depende de:* HU-01-04


### EP-04 — Resultados de aprendizaje del programa

#### HU-04-01 · RF-05 · Alta · Sprint 2

**Administrador.** Como administrador, quiero registrar los RAP del programa para mantener vigente la estructura de resultados de aprendizaje.

*Criterios de aceptación:* Permite crear y editar RAP con número, enunciado, competencia asociada y vigencia; valida que el número sea único dentro del programa; no permite eliminar un RAP referenciado por proyectos docentes, solo inactivarlo.

*Depende de:* HU-03-01

#### HU-04-02 · RF-05 · Alta · Sprint 2

**Administrador.** Como administrador, quiero asociar las asignaturas que contribuyen a cada RAP para registrar el mapeo curricular del programa.

*Criterios de aceptación:* Permite asociar una o varias asignaturas a un RAP y viceversa; la relación existe aunque todavía no haya proyectos docentes creados; alimenta la selección de RAP al crear el proyecto docente.

*Depende de:* HU-04-01, HU-03-02

#### HU-04-03 · RF-06 · Alta · Sprint 2

**Administrador.** Como administrador, quiero registrar los indicadores de desempeño de cada RAP para poder construir su rúbrica.

*Criterios de aceptación:* Permite agregar indicadores numerados con su descripción; valida que el número sea único dentro del RAP; permite inactivar un indicador sin borrarlo.

*Depende de:* HU-04-01

#### HU-04-04 · RF-07 · Alta · Sprint 2

**Administrador.** Como administrador, quiero definir la escala de valoración propia de mi programa para que el sistema sirva a programas con escalas distintas.

*Criterios de aceptación:* Permite definir el número de niveles, la etiqueta y el valor de cada uno, el umbral de cumplimiento y el porcentaje esperado; valida que los valores sean consecutivos y las etiquetas únicas; si ya existen mediciones, conserva la escala anterior asociada a los registros históricos; la escala inicial de Administración Industrial tiene cuatro niveles.

*Depende de:* HU-03-01

#### HU-04-05 · RF-06 · Alta · Sprint 2

**Administrador.** Como administrador, quiero construir la rúbrica de cada RAP describiendo el desempeño esperado por indicador y nivel.

*Criterios de aceptación:* Presenta la matriz indicador por nivel según la escala del programa; exige describir todos los niveles de cada indicador para marcarla como vigente; permite guardarla como borrador incompleta; si el programa no tiene escala, solicita definirla antes de continuar.

*Depende de:* HU-04-03, HU-04-04

#### HU-04-06 · RF-06 · Media · Sprint 2

**Administrador.** Como administrador, quiero que las rúbricas se versionen para que editar una no altere las mediciones ya registradas.

*Criterios de aceptación:* Al guardar cambios sobre una rúbrica vigente el sistema crea una versión nueva y conserva la anterior como histórica; las mediciones existentes siguen apuntando a la versión con la que se hicieron.

*Depende de:* HU-04-05

#### HU-04-07 · RF-05 · Media · Sprint 2

**Administrador.** Como administrador, quiero asignar los líderes RAP de cada período para habilitar el seguimiento por resultado de aprendizaje.

*Criterios de aceptación:* Permite asignar uno o varios usuarios como líderes de un RAP en un período; el líder solo ve los RAP que le fueron asignados; la asignación es por período y se puede inactivar.

*Depende de:* HU-04-01, HU-02-01


### EP-05 — Creación del proyecto docente

#### HU-05-01 · RF-08 · Alta · Sprint 3

**Departamento académico.** Como departamento académico, quiero crear el proyecto docente mediante un asistente guiado para no tener que transcribir información que el sistema ya conoce.

*Criterios de aceptación:* El asistente sigue cuatro pasos: programa, asignatura, selección de uno o varios RAP, y revisión de la información autocompletada; no permite avanzar del paso 3 sin seleccionar al menos un RAP; crea el proyecto en estado «en diligenciamiento»; cada paso responde en 3 segundos o menos y la creación completa en menos de 5.

*Depende de:* HU-03-02, HU-04-02, HU-03-05

#### HU-05-02 · RF-08 · Alta · Sprint 3

**Departamento académico.** Como departamento académico, quiero que el sistema autocomplete la información institucional del proyecto para reducir el trabajo manual y los errores.

*Criterios de aceptación:* El sistema completa facultad, código, componente, tipo de curso, créditos, horas TDE, TDP y TI, prerrequisitos, correquisitos y período; si la asignatura no tiene horas o créditos registrados permite continuar pero marca el proyecto con información incompleta.

*Depende de:* HU-05-01

#### HU-05-03 · RF-08 · Alta · Sprint 3

**Departamento académico.** Como departamento académico, quiero asignar hasta tres docentes a un proyecto docente para reflejar lo que permite el formato institucional.

*Criterios de aceptación:* Permite asignar uno o varios docentes, marcando cuál es el responsable; el responsable es quien firma «elaboró»; el proyecto aparece en la bandeja de todos los docentes asignados.

*Depende de:* HU-05-01, HU-02-01

#### HU-05-04 · RF-09 · Alta · Sprint 3

**Departamento académico.** Como departamento académico, quiero duplicar un proyecto docente existente para no rehacer desde cero los proyectos en los que solo cambia el docente o el período.

*Criterios de aceptación:* Copia descripción, RAC y su relación con los RAP, estrategias, evaluación, contenidos y bibliografía; permite editar período, docente y grupo antes de guardar; conserva la referencia al proyecto de origen; advierte si la asignatura cambió de RAP respecto del período anterior; la duplicación tarda 5 segundos o menos.

*Depende de:* HU-05-01

#### HU-05-05 · RF-10 · Media · Sprint 4

**Departamento académico.** Como departamento académico, quiero crear un proyecto docente cargando el archivo Excel del formato institucional para migrar los proyectos que ya existen.

*Criterios de aceptación:* Valida extensión, tamaño y estructura del formato FO-DO/PC-001 v05; extrae información general, descripción, RAC, estrategias, evaluación, contenidos y bibliografía; muestra una previsualización por secciones; deja vacías y señaladas las secciones que no pudo interpretar; conserva el archivo original como documento soporte; procesa en 10 segundos o menos.

*Depende de:* HU-05-01

#### HU-05-06 · RF-08 · Media · Sprint 3

**Departamento académico.** Como departamento académico, quiero que el sistema impida duplicar un curso para no terminar con dos proyectos del mismo grupo.

*Criterios de aceptación:* La combinación asignatura, período y grupo es única; si ya existe, el sistema advierte y ofrece editar el existente o duplicarlo; la validación no depende del docente asignado.

*Depende de:* HU-05-01


### EP-06 — Diligenciamiento del proyecto docente

#### HU-06-01 · RF-11 · Alta · Sprint 3

**Docente.** Como docente, quiero registrar la descripción de mi curso para completar el punto 2 del formato institucional.

*Criterios de aceptación:* Editor de texto con formato básico y control de longitud; guarda y registra la fecha de última modificación; si el proyecto está aprobado o cerrado no permite editar y sugiere solicitar reapertura.

*Depende de:* HU-05-03

#### HU-06-02 · RF-12 · Alta · Sprint 3

**Docente.** Como docente, quiero registrar los RAC de mi curso agrupados por cada RAP seleccionado para completar el punto 3 del formato.

*Criterios de aceptación:* Presenta los RAP del proyecto con su enunciado completo; permite registrar uno o varios RAC por RAP con código y enunciado; señala los RAP que aún no tienen RAC; no permite guardar un RAC sin asociarlo a algún RAP.

*Depende de:* HU-05-01

#### HU-06-03 · RF-12 · Alta · Sprint 3

**Docente.** Como docente, quiero asociar un RAC a más de un RAP cuando corresponda para reflejar su contribución real.

*Criterios de aceptación:* Permite seleccionar varios RAP para un mismo RAC; evita duplicados; permite describir la contribución; la relación queda disponible para los reportes de trazabilidad.

*Depende de:* HU-06-02

#### HU-06-04 · RF-13 · Alta · Sprint 3

**Docente.** Como docente, quiero registrar las estrategias metodológicas del curso para completar el punto 4 del formato.

*Criterios de aceptación:* Permite agregar varias estrategias redactándolas o eligiéndolas de un catálogo sugerido; permite reordenarlas y eliminarlas; la sección vacía bloquea el envío a revisión.

*Depende de:* HU-05-03

#### HU-06-05 · RF-14 · Alta · Sprint 3

**Docente.** Como docente, quiero registrar cómo evaluaré cada RAC para completar el punto 5 del formato.

*Criterios de aceptación:* Presenta los RAC registrados; permite asociar a cada uno sus actividades e instrumentos de evaluación; señala los RAC sin evaluación; un RAC sin evaluación bloquea el envío a revisión.

*Depende de:* HU-06-02

#### HU-06-06 · RF-15 · Alta · Sprint 3

**Docente.** Como docente, quiero registrar los contenidos por semana con sus horas para completar el punto 6 del formato.

*Criterios de aceptación:* Presenta una fila por cada semana del período; permite registrar tema y horas TDE, TDP y TI; calcula el total y lo compara con las horas de la asignatura, advirtiendo la diferencia; señala las semanas sin tema; el contenido queda disponible como lista de temas para el registro de clases.

*Depende de:* HU-05-02

#### HU-06-07 · RF-16 · Media · Sprint 3

**Docente.** Como docente, quiero registrar la bibliografía del curso para completar el punto 7 del formato.

*Criterios de aceptación:* Permite agregar, editar, reordenar y eliminar referencias numeradas; permite importar la bibliografía de un proyecto docente anterior; la sección vacía bloquea el envío a revisión.

*Depende de:* HU-05-03

#### HU-06-08 · RF-11 a RF-16 · Alta · Sprint 3

**Docente.** Como docente, quiero que el sistema guarde mi progreso parcial para poder diligenciar el proyecto en varias sesiones de trabajo.

*Criterios de aceptación:* Cada sección guarda de forma independiente; al volver a entrar se conserva lo registrado; no se exige completar una sección para pasar a otra.

*Depende de:* HU-06-01

#### HU-06-09 · RF-17 · Media · Sprint 3

**Docente.** Como docente, quiero ver qué secciones me faltan para saber cuánto me falta antes de enviar a revisión.

*Criterios de aceptación:* Muestra el estado de cada sección del formato (completa, incompleta, vacía) y un porcentaje de avance; se actualiza al guardar cada sección.

*Depende de:* HU-06-08


### EP-07 — Revisión y aprobación

#### HU-07-01 · RF-17 · Alta · Sprint 4

**Docente.** Como docente, quiero enviar mi proyecto docente a revisión cuando lo tenga completo para que el departamento académico lo apruebe.

*Criterios de aceptación:* El sistema verifica las secciones obligatorias y lista los pendientes si los hay, impidiendo el envío; si está completo cambia el estado a «enviado a revisión», registra fecha y usuario, bloquea la edición y notifica al departamento; un período cerrado impide el envío; la verificación tarda 4 segundos o menos.

*Depende de:* HU-06-09

#### HU-07-02 · RF-18 · Alta · Sprint 4

**Departamento académico.** Como departamento académico, quiero una bandeja de proyectos pendientes de revisión para organizar mi trabajo de revisión del período.

*Criterios de aceptación:* Lista los proyectos en estado «enviado a revisión»; permite filtrar por programa, asignatura y docente; muestra desde cuándo está pendiente cada uno; está paginada.

*Depende de:* HU-07-01

#### HU-07-03 · RF-18 · Alta · Sprint 4

**Departamento académico.** Como departamento académico, quiero aprobar un proyecto docente para habilitar su ejecución durante el período.

*Criterios de aceptación:* Cambia el estado a «aprobado»; registra el usuario que aprueba y la fecha; notifica al docente; habilita el registro de clases; el cambio de estado tarda 3 segundos o menos.

*Depende de:* HU-07-02

#### HU-07-04 · RF-18 · Alta · Sprint 4

**Departamento académico.** Como departamento académico, quiero devolver un proyecto con observaciones por sección para que el docente sepa exactamente qué corregir.

*Criterios de aceptación:* Permite registrar observaciones asociadas a cada sección del formato; no permite devolver sin al menos una observación; cambia el estado a «devuelto con observaciones»; reabre la edición y notifica al docente; si el docente responsable está inactivo notifica al departamento.

*Depende de:* HU-07-02

#### HU-07-05 · RF-18 · Alta · Sprint 4

**Docente.** Como docente, quiero ver las observaciones de la devolución junto a cada sección para corregir sin adivinar.

*Criterios de aceptación:* Las observaciones se muestran en la sección a la que corresponden; el docente puede marcarlas como resueltas; al reenviar, el sistema advierte si quedan observaciones sin resolver.

*Depende de:* HU-07-04

#### HU-07-06 · RF-18 · Media · Sprint 4

**Departamento académico.** Como departamento académico, quiero consultar el historial de revisiones de un proyecto para conservar la trazabilidad que el formato resuelve con firmas.

*Criterios de aceptación:* Registra cada evento con tipo (elaboración, revisión, aprobación), resultado, usuario, fecha y estados anterior y nuevo; el historial es consultable y no editable; sustituye las firmas de «elaboró», «revisó» y «aprobó» del formato.

*Depende de:* HU-07-03, HU-07-04


### EP-08 — Calendario y registro de clases

#### HU-08-01 · RF-19 · Alta · Sprint 2

**Administrador.** Como administrador, quiero administrar la tabla de días festivos por año para que el sistema pueda marcarlos automáticamente en los calendarios.

*Criterios de aceptación:* Permite cargar y editar los festivos de Colombia conforme a la Ley 51 de 1983, por año; permite agregar días no hábiles institucionales; los cambios recalculan las sesiones aún no diligenciadas sin tocar las ya registradas.

#### HU-08-02 · RF-19 · Alta · Sprint 5

**Docente.** Como docente, quiero definir los días y horas de clase de mi curso para que el sistema genere el calendario de sesiones.

*Criterios de aceptación:* Permite registrar uno o varios días de la semana con hora de inicio y fin; la información alimenta la generación del calendario.

*Depende de:* HU-07-03

#### HU-08-03 · RF-19 · Alta · Sprint 5

**Docente.** Como docente, quiero que el sistema genere automáticamente el calendario de sesiones del curso para no tener que crear cada clase a mano.

*Criterios de aceptación:* Genera una sesión por encuentro previsto, numerada por semana, a partir del período y el horario; marca como «festivo» las que coinciden con la tabla de festivos; si el año no tiene festivos parametrizados genera el calendario sin marcas y advierte al administrador; permite reprogramar o ajustar sesiones; la generación tarda 5 segundos o menos.

*Depende de:* HU-08-01, HU-08-02

#### HU-08-04 · RF-20 · Alta · Sprint 5

**Docente.** Como docente, quiero registrar la clase seleccionando los temas del contenido programático para no tener que escribirlos cada vez.

*Criterios de aceptación:* Presenta la lista de temas del contenido programático del proyecto; permite seleccionar uno o varios por sesión; guarda y marca la sesión como diligenciada; no permite registrar una sesión de fecha futura; el guardado tarda 3 segundos o menos y el calendario carga en 4 o menos.

*Depende de:* HU-08-03, HU-06-06

#### HU-08-05 · RF-20 · Media · Sprint 5

**Docente.** Como docente, quiero registrar un tema que no estaba planeado para reflejar lo que realmente pasó en clase.

*Criterios de aceptación:* Permite escribir un tema adicional fuera del contenido programático; el sistema lo marca como no planeado; aparece diferenciado en el reporte de ejecución de contenidos.

*Depende de:* HU-08-04

#### HU-08-06 · RF-21 · Alta · Sprint 5

**Docente.** Como docente, quiero clasificar una sesión como parcial, festivo o actividad complementaria para registrar las clases que no desarrollan contenido.

*Criterios de aceptación:* Permite elegir el tipo de sesión; para los tipos distintos de «clase» no exige seleccionar tema pero sí una descripción; no permite guardar un parcial sin descripción; estas sesiones se excluyen del conteo de temas pendientes; si una sesión marcada como festivo sí se dictó, el docente puede cambiar el tipo y registrar los temas.

*Depende de:* HU-08-03

#### HU-08-07 · RF-23 · Alta · Sprint 5

**Docente.** Como docente, quiero ver en rojo las sesiones vencidas sin diligenciar para no perder el hilo de lo que me falta registrar.

*Criterios de aceptación:* Una sesión cuya fecha ya pasó y no tiene registro se marca como vencida en rojo, indicando los días de atraso; las sesiones de tipo festivo no cuentan como vencidas; el panel del docente muestra el número de sesiones vencidas; el cálculo no supera los 3 segundos.

*Depende de:* HU-08-03

#### HU-08-08 · RF-23 · Media · Sprint 5

**Docente.** Como docente, quiero ver cuáles sesiones están por vencer para registrarlas antes de que se me pasen.

*Criterios de aceptación:* Las sesiones dentro del umbral configurado se marcan en color de advertencia; el umbral viene del parámetro del sistema, no está fijo en el código.

*Depende de:* HU-08-07, HU-03-07

#### HU-08-09 · RF-19 · Baja · Sprint 5

**Docente.** Como docente, quiero reprogramar una sesión para reflejar cambios de calendario del curso.

*Criterios de aceptación:* Permite cambiar la fecha de una sesión no diligenciada; recalcula su estado de vencimiento; deja constancia del cambio.

*Depende de:* HU-08-03


### EP-09 — Estudiantes, matrícula e inasistencias

#### HU-09-01 · RF-22 · Alta · Sprint 5

**Administrador.** Como administrador, quiero cargar la lista de estudiantes matriculados en cada curso para habilitar el registro de inasistencias y la medición de RAP.

*Criterios de aceptación:* Permite cargar la lista por archivo asociándola al proyecto docente; valida duplicados por documento; registra quién hizo el cargue y cuándo; mientras no exista integración con el sistema académico este es el único origen (SUP-03).

*Depende de:* HU-05-01

#### HU-09-02 · RF-22 · Media · Sprint 5

**Docente.** Como docente, quiero marcar los estudiantes que no asistieron seleccionándolos de la lista para no escribir nombres a mano.

*Criterios de aceptación:* Presenta la lista de matriculados del curso; permite marcar los ausentes; calcula y muestra el número de ausentes en el resumen de la sesión; solicita confirmación si se marca a todo el grupo; si el curso no tiene lista cargada permite registrar la observación en texto libre e indica cómo solicitar el cargue; la lista carga en 3 segundos o menos.

*Depende de:* HU-09-01, HU-08-04

#### HU-09-03 · RF-22 · Baja · Sprint 6

**Docente.** Como docente, quiero consultar las inasistencias acumuladas del curso para identificar estudiantes en riesgo.

*Criterios de aceptación:* Muestra por estudiante el número de inasistencias y las sesiones correspondientes; el acceso se restringe al docente responsable y a los roles autorizados por tratarse de datos personales.

*Depende de:* HU-09-02


### EP-10 — Evidencias y documentos soporte

#### HU-10-01 · RF-24 · Alta · Sprint 6

**Docente.** Como docente, quiero cargar evidencias fotográficas asociadas a un RAP para respaldar su desarrollo en el curso.

*Criterios de aceptación:* Permite seleccionar el RAP y cargar uno o varios archivos con descripción, fecha y sesión opcional; valida tipo y tamaño según los parámetros del sistema; rechaza y explica si se excede el límite; almacena el archivo fuera de la base de datos y guarda solo su referencia; si falla la carga permite reintentar sin perder la descripción; confirma en 10 segundos o menos para archivos de hasta 5 MB.

*Depende de:* HU-05-01, HU-03-07

#### HU-10-02 · RF-24 · Media · Sprint 6

**Docente.** Como docente, quiero ver la galería de evidencias de cada RAP para revisar lo que llevo cargado en el período.

*Criterios de aceptación:* Muestra las evidencias agrupadas por RAP con su descripción y fecha; permite ampliarlas; indica cuáles RAP no tienen evidencias.

*Depende de:* HU-10-01

#### HU-10-03 · RF-24 · Media · Sprint 6

**Docente.** Como docente, quiero cargar documentos soporte del proyecto docente para respaldar la información registrada.

*Criterios de aceptación:* Permite cargar archivos con nombre, tipo y descripción; registra usuario y fecha; valida tipo y tamaño; los diferencia de las evidencias por RAP.

*Depende de:* HU-05-01

#### HU-10-04 · RF-24 · Media · Sprint 6

**Líder RAP.** Como líder RAP, quiero consultar las evidencias de los RAP a mi cargo para analizar su desarrollo en las asignaturas.

*Criterios de aceptación:* Permite consultar evidencias de los RAP asignados; los archivos no son públicos y el acceso pasa por el backend validando permisos; la consulta queda registrada en auditoría.

*Depende de:* HU-10-01, HU-04-07

#### HU-10-05 · RF-24 · Baja · Release 2

**Docente.** Como docente, quiero reemplazar o eliminar una evidencia cargada por error para corregir el soporte del proyecto.

*Criterios de aceptación:* Permite eliminar o reemplazar si el estado del proyecto lo permite; solicita confirmación; registra la acción en auditoría; la eliminación es lógica.

*Depende de:* HU-10-01


### EP-11 — Medición y análisis de RAP

#### HU-11-01 · RF-30 · Alta · Sprint 6

**Docente.** Como docente, quiero iniciar la medición de un RAP en mi curso para registrar el desempeño de los estudiantes.

*Criterios de aceptación:* Permite seleccionar el RAP y el tipo de valoración (formativa o sumativa) y registrar período y año de toma de datos; impide iniciar si el curso no tiene lista de estudiantes o si el RAP no tiene rúbrica vigente; asocia la medición a la versión de rúbrica vigente.

*Depende de:* HU-04-05, HU-09-01, HU-07-03

#### HU-11-02 · RF-30 · Alta · Sprint 6

**Docente.** Como docente, quiero registrar con qué instrumento evalué cada indicador para documentar la medición.

*Criterios de aceptación:* Permite registrar instrumento y su descripción por cada indicador de la rúbrica; la información aparece en el consolidado y en el reporte.

*Depende de:* HU-11-01

#### HU-11-03 · RF-30 · Alta · Sprint 6

**Docente.** Como docente, quiero valorar a cada estudiante en cada indicador para completar la hoja de valoración del formato institucional.

*Criterios de aceptación:* Presenta la matriz de estudiantes por indicadores con la escala del programa; permite asignar el nivel alcanzado a cada estudiante; los estudiantes sin valorar en un indicador se excluyen de la muestra de ese indicador y se señalan; una medición cerrada no se puede modificar y solo el departamento académico puede reabrirla; carga en 5 segundos o menos para cursos de hasta 40 estudiantes y guarda en 10 o menos.

*Depende de:* HU-11-02

#### HU-11-04 · RF-31 · Alta · Sprint 7

**Docente.** Como docente, quiero que el sistema calcule solo el consolidado de la medición para no repetir el trabajo de fórmulas del Excel.

*Criterios de aceptación:* Calcula los conteos por nivel para cada indicador, la tabla porcentual y el tamaño de la muestra; los consolidados no se almacenan sino que se calculan desde las valoraciones, de modo que corregir una valoración actualiza el resultado; el cálculo tarda 5 segundos o menos.

*Depende de:* HU-11-03

#### HU-11-05 · RF-31 · Alta · Sprint 7

**Líder RAP.** Como líder RAP, quiero ver el porcentaje alcanzado frente al esperado por el programa para saber si el resultado de aprendizaje se logró.

*Criterios de aceptación:* Compara el porcentaje acumulado en los niveles de cumplimiento contra el porcentaje esperado del programa y señala si fue alcanzado; si el programa no tiene porcentaje esperado definido presenta el consolidado sin juicio de cumplimiento; si no se registró el tamaño de la cohorte calcula sobre la muestra y lo advierte.

*Depende de:* HU-11-04, HU-04-04

#### HU-11-06 · RF-31 · Alta · Sprint 7

**Líder RAP.** Como líder RAP, quiero registrar las acciones implementadas, los resultados obtenidos y las acciones propuestas para cerrar el ciclo de mejora.

*Criterios de aceptación:* Permite registrar los tres campos de la hoja «Evaluación» del formato FO-DO/PC-023; quedan asociados a la medición y aparecen en el reporte de logro.

*Depende de:* HU-11-05

#### HU-11-07 · RF-31 · Media · Sprint 7

**Líder RAP.** Como líder RAP, quiero cerrar la medición para consolidar el resultado del período.

*Criterios de aceptación:* Al cerrar, registra usuario y fecha y bloquea las valoraciones; no permite cerrar una medición por debajo del porcentaje esperado sin acciones propuestas registradas; la medición cerrada alimenta los reportes del programa.

*Depende de:* HU-11-06

#### HU-11-08 · RF-32 · Alta · Sprint 7

**Líder RAP.** Como líder RAP, quiero el reporte de logro de los RAP del programa para sustentar los procesos de autoevaluación.

*Criterios de aceptación:* Permite filtrar por programa, período y RAP; presenta por cada RAP las asignaturas que lo evaluaron y el porcentaje alcanzado frente al esperado; presenta como «no evaluado» el RAP sin mediciones cerradas; compara con períodos anteriores cuando existan y omite la comparación explicando el motivo cuando no; exporta a Excel y PDF; genera en 10 segundos o menos.

*Depende de:* HU-11-07


### EP-12 — Seguimiento y reportes académicos

#### HU-12-01 · RF-25 · Alta · Sprint 7

**Administrador.** Como administrador, quiero un tablero del estado de diligenciamiento del período para saber a quién debo hacerle seguimiento.

*Criterios de aceptación:* Permite filtrar por programa, período, asignatura y docente; muestra por proyecto el porcentaje de secciones completas, las sesiones registradas frente a las programadas, las vencidas, las evidencias por RAP y el estado; usa un indicador de color por proyecto; carga en 5 segundos o menos.

*Depende de:* HU-07-01, HU-08-07

#### HU-12-02 · RF-25 · Alta · Sprint 7

**Administrador.** Como administrador, quiero identificar rápidamente los proyectos con pendientes para priorizar a quién le recuerdo primero.

*Criterios de aceptación:* Lista los proyectos con secciones incompletas o sesiones vencidas ordenados por gravedad; permite abrir el detalle del proyecto; permite exportar la lista.

*Depende de:* HU-12-01

#### HU-12-03 · RF-28 · Alta · Sprint 7

**Departamento académico.** Como departamento académico, quiero el reporte de cumplimiento por período para presentar el estado general del programa.

*Criterios de aceptación:* Permite filtrar por período, programa, asignatura, docente y estado; muestra proyectos, estados y avance; informa cuando no hay resultados para los filtros; genera en 5 segundos o menos.

*Depende de:* HU-12-01

#### HU-12-04 · RF-28 · Media · Sprint 7

**Departamento académico.** Como departamento académico, quiero el reporte de ejecución de contenidos para comparar lo planeado con lo realmente dictado.

*Criterios de aceptación:* Muestra por curso los temas planeados, los dictados, los no dictados y los adicionales no planeados; permite filtrar por período y asignatura.

*Depende de:* HU-08-04, HU-08-05

#### HU-12-05 · RF-28 · Alta · Sprint 7

**Líder RAP.** Como líder RAP, quiero el reporte de contribución RAC-RAP para revisar cómo aportan las asignaturas a los resultados a mi cargo.

*Criterios de aceptación:* Permite filtrar por RAP y período; muestra asignaturas, docentes, RAC relacionados y evidencias; solo incluye los RAP asignados al líder.

*Depende de:* HU-06-03, HU-04-07

#### HU-12-06 · RF-28 · Media · Sprint 7

**Departamento académico.** Como departamento académico, quiero exportar cualquier reporte a Excel y PDF para compartirlo en los comités.

*Criterios de aceptación:* Conserva los filtros aplicados en la exportación; registra la generación con usuario y fecha; si el volumen excede el límite sugiere restringir los filtros; los reportes consolidados se presentan agregados sin identificar estudiantes.

*Depende de:* HU-12-03

#### HU-12-07 · RF-25 · Media · Sprint 7

**Docente.** Como docente, quiero un resumen de mi proyecto docente para revisar de un vistazo en qué voy.

*Criterios de aceptación:* Muestra estado, secciones completas, clases registradas y pendientes, RAC y RAP, evidencias y mediciones; es la pantalla de entrada del docente a su proyecto.

*Depende de:* HU-12-01


### EP-13 — Notificaciones y recordatorios

#### HU-13-01 · RF-26 · Media · Sprint 8

**Docente.** Como docente, quiero recibir aviso cuando me asignen un proyecto docente para empezar a diligenciarlo a tiempo.

*Criterios de aceptación:* Genera notificación dentro de la aplicación de forma inmediata y envía correo institucional en los 5 minutos siguientes; la notificación enlaza al proyecto; si el envío de correo falla se reintenta y queda constancia sin perder la notificación en la aplicación.

*Depende de:* HU-05-03

#### HU-13-02 · RF-26 · Media · Sprint 8

**Docente.** Como docente, quiero recibir un recordatorio de mis sesiones pendientes para no acumular atrasos.

*Criterios de aceptación:* Agrupa todos los pendientes del docente en una sola notificación para no saturarlo; se envía con la periodicidad configurada; enlaza al calendario del curso.

*Depende de:* HU-08-07

#### HU-13-03 · RF-26 · Media · Sprint 8

**Docente.** Como docente, quiero que me avisen cuando me devuelvan el proyecto con observaciones para corregirlo pronto.

*Criterios de aceptación:* Notifica al docente responsable el cambio de estado y enlaza a las observaciones; también notifica la aprobación y el cierre del período.

*Depende de:* HU-07-04

#### HU-13-04 · RF-26 · Baja · Sprint 8

**Administrador.** Como administrador, quiero configurar qué eventos generan notificación y con qué frecuencia para ajustar el sistema al ritmo del programa.

*Criterios de aceptación:* Permite activar y desactivar cada tipo de notificación y definir su periodicidad y si envía correo; los cambios aplican sin redesplegar.

*Depende de:* HU-13-01


### EP-14 — Auditoría y trazabilidad

#### HU-14-01 · RF-29 · Alta · Sprint 1

**Administrador.** Como responsable del sistema, quiero que se registren automáticamente las acciones relevantes para garantizar la trazabilidad institucional.

*Criterios de aceptación:* Registra creaciones, modificaciones, eliminaciones, aprobaciones y consultas sensibles con usuario, acción, entidad, identificador, fecha, IP y valores anterior y nuevo cuando aplique; si el registro de auditoría falla se deja constancia técnica del error sin interrumpir la operación del usuario; no añade más de un segundo al tiempo de respuesta.

#### HU-14-02 · RF-29 · Media · Sprint 8

**Administrador.** Como administrador, quiero consultar la auditoría con filtros para investigar qué pasó con un registro.

*Criterios de aceptación:* Permite filtrar por usuario, fecha, acción y entidad; está paginada; los registros de auditoría no se pueden modificar ni eliminar.

*Depende de:* HU-14-01

#### HU-14-03 · RF-29 · Media · Sprint 8

**Administrador.** Como administrador, quiero ver el valor anterior y el nuevo de un cambio para entender qué se modificó exactamente.

*Criterios de aceptación:* Muestra ambos valores cuando la acción es una modificación; permite consultar el historial completo de una entidad.

*Depende de:* HU-14-01


### EP-15 — Consulta estudiantil

#### HU-15-01 · RF-27 · Baja · Release 2

**Estudiante.** Como estudiante, quiero consultar el proyecto docente de las asignaturas que curso para conocer qué se espera de mí.

*Criterios de aceptación:* Solo muestra proyectos aprobados y publicados de las asignaturas en las que está matriculado; es de solo lectura; no muestra observaciones de clase, inasistencias, evidencias internas ni valoraciones; si el proyecto no está publicado informa que aún no está disponible; carga en 4 segundos o menos.

*Depende de:* HU-07-03, HU-09-01

#### HU-15-02 · RF-27 · Baja · Release 2

**Estudiante.** Como estudiante, quiero ver los RAC del curso y los RAP a los que contribuyen para entender qué aprendizajes se esperan.

*Criterios de aceptación:* Muestra los RAC con su enunciado y los RAP asociados, los contenidos por semana, los criterios de evaluación y la bibliografía.

*Depende de:* HU-15-01

#### HU-15-03 · RF-27 · Baja · Release 2

**Estudiante.** Como estudiante, quiero descargar el proyecto docente en PDF para consultarlo sin conexión.

*Criterios de aceptación:* Genera el PDF con las secciones visibles para el estudiante; solo si el programa autoriza la descarga.

*Depende de:* HU-15-01
