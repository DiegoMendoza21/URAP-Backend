# URAP — Modelo de datos

Fuente de verdad del diseño: **`docs/URAP_modelo_datos_v2.5.dbml`** (52 tablas, 92 claves
foráneas). Se puede visualizar pegándolo en dbdiagram.io. El DDL MySQL generado está en
`docs/URAP_esquema_mysql_v2.5.sql`.

## Qué manda sobre qué

Hay dos artefactos y cada uno tiene una dirección, para que no se pisen:

- **El DBML es el documento de diseño.** Es lo que va en la tesis y lo que se lee para
  entender el modelo. Todo cambio de modelo empieza aquí.
- **Las migraciones de Prisma son el historial operativo de la base.** El DDL completo sirve
  una sola vez, para crear la base vacía y sacar la línea base; después de eso no se vuelve a
  aplicar, porque no es incremental y la base ya tiene datos.

La regla: **ningún cambio de modelo se da por terminado hasta que el DBML y la migración
digan lo mismo.** Si una migración necesita apartarse del DBML, primero se cambia el DBML y
se explica por qué en el PR.

Arranque, una sola vez: crear la base con el DDL, correr `prisma db pull` para generar el
esquema y marcar esa migración inicial como aplicada. De ahí en adelante, cada cambio se
escribe en el DBML y se lleva a la base con una migración de Prisma.

## Grupos de tablas

| Grupo | Tablas | Requisitos |
|---|---|---|
| Seguridad | `rol`, `usuario`, `usuario_rol`, `sesion`, `modulo`, `permiso`, `rol_permiso` | RF-01 a RF-03 |
| Estructura académica | `facultad`, `programa`, `plan_estudio`, `asignatura`, `asignatura_requisito`, `periodo_academico`, `dia_festivo` | RF-04, RF-19 |
| Resultados de aprendizaje | `rap`, `asignatura_rap`, `indicador_rap`, `escala_valoracion`, `nivel_escala`, `rubrica`, `rubrica_descriptor`, `lider_rap` | RF-05 a RF-07 |
| Proyecto docente | `estado_proyecto`, `proyecto_docente`, `proyecto_docente_docente`, `proyecto_docente_rap`, `plan_curso`, `rac`, `rac_rap`, `evaluacion_rac`, `estrategia_metodologica`, `contenido_programatico`, `bibliografia` | RF-08 a RF-16 |
| Revisión | `revision_proyecto`, `observacion_revision` | RF-17, RF-18 |
| Ejecución | `horario_curso`, `tipo_sesion`, `sesion_clase`, `sesion_tema` | RF-19 a RF-23 |
| Estudiantes | `estudiante`, `matricula`, `inasistencia` | RF-22, RF-27 |
| Medición de RAP | `medicion_rap`, `medicion_indicador`, `valoracion_estudiante` | RF-30 a RF-32 |
| Documentos | `evidencia_rap`, `documento_soporte` | RF-10, RF-24 |
| Transversales | `tipo_notificacion`, `notificacion`, `reporte_academico`, `auditoria`, `parametro_sistema` | RF-26, RF-28, RF-29 |

## Decisiones que no son obvias leyendo el esquema

**`usuario_rol` con clave sustituta, no compuesta.**
`id_programa` admite nulo para los roles globales del administrador, y MySQL no permite nulos
en clave primaria. El índice único `(id_usuario, id_rol, id_programa)` sí los admite, pero
MySQL trata cada nulo como distinto, así que la unicidad del caso global se valida además en
el backend.

**`sesion` existe porque un JWT no se puede olvidar.**
Un token es autocontenido: sin registro, el servidor no tiene cómo rechazarlo después del
logout. Cada token emitido se registra por su `jti` y el guard verifica que la sesión siga
vigente. Sirve además para que el administrador revise los accesos al sistema.

**La asignatura cuelga del plan de estudios, no del programa** (v2.5).
Un programa puede tener varios planes vigentes a la vez: en 2026-1, Administración Industrial
programó grupos del plan 1702 (niveles 6 a 10 y rezagados) y del plan 2502 (niveles 1 a 5).
La misma asignatura puede tener un código distinto en cada plan (Comportamiento
organizacional: FP15503 en el 1702, IX24193 en el 2502), y un mismo código (inglés, núcleo
común) puede estar en los dos. Por eso el código es único **por plan**, y cada plan tiene su
propia fila de la asignatura, con su semestre, sus requisitos y su mapeo a RAP. El proyecto
docente no cambia: al apuntar a una asignatura, ya sabe a qué plan pertenece. Los RAP siguen
siendo del programa mientras el programa no confirme lo contrario (SUP-16).

**`proyecto_docente` es único por `(id_asignatura, id_periodo, grupo)`,** no por docente.
Un proyecto puede tener hasta tres docentes (`proyecto_docente_docente`), como en el formato
institucional. Uno de ellos lleva `responsable = true` y es quien firma «elaboró».

**`proyecto_docente_rap` existe aparte de `rac_rap`.**
Los RAP se eligen en el paso 3 de la creación del proyecto, antes de que existan los RAC.
Esa tabla además congela la versión de rúbrica vigente para el período.

**`sesion_clase` nace con el calendario.**
No es un registro que el docente crea: se genera al inicio del período desde `horario_curso`
y `periodo_academico`, y los festivos se marcan solos contra `dia_festivo`. El estado
`vencida` se calcula comparando la fecha con hoy; las sesiones de tipo festivo no cuentan
como vencidas.

**Las tablas resumen de la medición no se almacenan.**
Los conteos por nivel, los porcentajes, la muestra y la cohorte se calculan desde
`valoracion_estudiante`. Corregir una valoración debe actualizar el consolidado sin que nadie
recalcule nada a mano.

**Nada se borra físicamente si tiene trazabilidad.**
Usuarios, asignaturas, RAP, proyectos y sesiones se inactivan (`activo = false`), no se
eliminan. Regla RN-13 del Producto 1 y NFR-017.

**`parametro_sistema` es para parámetros de negocio, no de seguridad.**
Ahí viven el umbral de días de la alerta preventiva, los intentos máximos de inicio de
sesión, la duración del bloqueo, el tamaño máximo de archivo y los tipos permitidos. El
secreto JWT y la expiración del token son variables de entorno: un administrador no debería
poder ampliar la vigencia de un token desde una pantalla de la aplicación.

## Convenciones

- Nombres de tablas y columnas en **snake_case y español**, sin tildes ni eñes.
- Claves foráneas: `id_<tabla referenciada>` (`id_proyecto_docente`, `id_usuario`).
- Toda tabla con ciclo de vida lleva `created_at` y `updated_at`. `created_at` trae
  `DEFAULT now()` desde el DDL. **`updated_at` no**: `ON UPDATE CURRENT_TIMESTAMP` no se puede
  expresar en DBML, así que lo maneja el ORM, con `@updatedAt` en Prisma.
- Todas las marcas de tiempo son `datetime`, no `timestamp`. En MySQL `timestamp` se detiene
  el 19 de enero de 2038, y el resto de las columnas de fecha del modelo ya usaba `datetime`.
- Los porcentajes son `decimal(5,2)`. Sin precisión explícita, MySQL los crea como
  `DECIMAL(10,0)` y un 70,5 % se guardaría como 71.
- Las tablas puente llevan clave primaria compuesta, salvo `usuario_rol` por lo explicado
  arriba.
- Catálogos parametrizables por el usuario son tablas (`tipo_sesion`, `estado_proyecto`,
  `tipo_notificacion`); los enumerados fijos van como `varchar` con los valores en un
  comentario (`tipo_valoracion`, `componente`, `tipo_curso`).

## Migración de la v2.4 a la v2.5

Si `asignatura.id_programa` ya existe en la base, la migración va en tres pasos dentro de la
misma migración de Prisma: crear `plan_estudio` y agregar `asignatura.id_plan_estudio` como
nulable; crear el plan 1702 de cada programa existente y asignarle todas sus asignaturas, que
son las del mapeo del informe 2023-II; y solo entonces volver la columna obligatoria, cambiar
el índice único a `(id_plan_estudio, codigo_interno)` y eliminar `asignatura.id_programa`. Las
consultas que filtraban asignaturas por programa pasan a hacerlo a través del plan.

## Pendientes del modelo

- `medicion_rap.tamano_cohorte`: el formato FO-DO/PC-023 trae la columna pero su fórmula la
  iguala a la muestra y ningún porcentaje la usa. Está pendiente confirmar con el programa si
  «cohorte» significa el grupo del curso —en cuyo caso se calcula desde `matricula` y el campo
  sobra— o algo más amplio.
- La lista de estudiantes matriculados se carga por archivo mientras no exista integración con
  el sistema de información académica (supuesto SUP-03). Sin ella no funcionan RF-22, RF-27
  ni RF-30.
- Si el programa confirma que el plan 2502 tiene RAP propios, distintos de los del 1702
  (SUP-16), `rap` tendría que colgar también del plan. Hoy cuelga del programa.
