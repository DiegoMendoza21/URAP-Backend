# URAP Backend — Instrucciones del proyecto

API del sistema URAP: seguimiento, control y análisis de los **proyectos docentes** del
programa de Administración Industrial de la Universidad de Cartagena. Es el prototipo
funcional de una tesis de pregrado, pensado para escalar después a toda la universidad.

Trabajamos en español: código, commits, comentarios y mensajes al usuario.

**Repo del frontend:** https://github.com/DiegoMendoza21/URAP-Frontend (separado).
Este repo no contiene interfaz. El contrato entre ambos es la especificación OpenAPI que
publica esta API.

## Antes de escribir código

El dominio es institucional y no se deduce leyendo el repositorio. Lee primero:

- `docs/glosario-dominio.md` — **siempre**. RAP, RAC, proyecto docente, roles, escalas.
  Confundir RAP con RAC es el error más fácil y más caro de este proyecto.
- `docs/modelo-datos.md` y `docs/URAP_modelo_datos_v2.4.dbml` — antes de tocar migraciones,
  entidades o consultas. 51 tablas, 91 claves foráneas.
- `docs/urap-backlog.md` — qué se construye y en qué orden: 15 épicas, 89 historias, 8 sprints.
- `docs/indice-requisitos.md` — para ubicar el requisito que aplica.
- `docs/requisitos-funcionales.md` — el RF completo del caso que vas a implementar,
  **incluidas sus excepciones**: ahí están la mitad de las reglas de negocio.
- `docs/requisitos-no-funcionales.md` — al tocar seguridad, archivos o rendimiento.

No los cargues enteros por costumbre: busca el RF que necesitas y lee esa sección.

`docs/fuentes/` guarda los Excel oficiales de los que se generan esos markdown. **No los
abras para trabajar**: están ahí para trazabilidad de la tesis y para la carga del backlog a
Jira. Si un requisito cambia, se cambia en el Excel y se vuelve a exportar el markdown.

## Stack

Definido en el Producto 2 de la tesis. No cambiarlo sin actualizar también la tesis,
que documenta esta arquitectura en el diagrama de despliegue, el de componentes y los sprints.

- **NestJS** sobre Node.js, en **TypeScript**. No Express a pelo, no JavaScript plano.
  NestJS 12 genera el proyecto en ESM: los imports relativos llevan extensión `.js`.
- **MySQL**. En desarrollo local por Docker; en producción Amazon RDS.
- **Prisma 7** como ORM, con el adaptador `@prisma/adapter-mariadb`, y **Prisma Migrate**
  para los cambios de esquema (ver Comandos y Convenciones).
- **API REST**, JSON sobre HTTPS, con especificación OpenAPI publicada.
- **JWT** con expiración para autenticación; autorización por rol con guards de NestJS.
- **Almacenamiento de objetos** para documentos y evidencias (en producción Amazon S3).
  La base de datos guarda la referencia del archivo, nunca el contenido.

## Estructura

Un módulo por dominio, alineado con los grupos del modelo de datos:

```
src/
  auth/                    autenticación, JWT, guards (RF-01)
  usuarios/                usuarios, roles, permisos (RF-02, RF-03)
  estructura-academica/    facultades, programas, asignaturas, períodos, festivos (RF-04, RF-19)
  rap/                     RAP, indicadores, escalas, rúbricas (RF-05 a RF-07)
  proyectos-docentes/      proyecto, RAC, contenidos, bibliografía, estados (RF-08 a RF-18)
  sesiones/                calendario, registro de clases, alertas (RF-19 a RF-23)
  estudiantes/             matrícula e inasistencias (RF-22, RF-27)
  mediciones/              valoración y consolidado de RAP (RF-30 a RF-32)
  documentos/              evidencias y soportes (RF-10, RF-24)
  reportes/                reportes académicos (RF-28, RF-32)
  notificaciones/          notificaciones y recordatorios (RF-26)
  auditoria/               registro de acciones (RF-29)
  salud/                   verificación de disponibilidad de la API y la base (NFR-009, NFR-016)
  common/                  guards, decoradores, filtros, interceptores, utilidades, Prisma
  generated/prisma/        cliente de Prisma generado: no se edita ni va al repositorio
```

Cada módulo: `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`.
La lógica de negocio vive en el service, nunca en el controller.

## Comandos

Requisitos: Node 26 LTS (también sirven 24.15 y 22.22.3 o superiores), npm 11 o superior y
Docker Desktop. El `.env` se crea a partir de `.env.example`.

```bash
npm install            # también genera el cliente de Prisma (postinstall)
npm run start:dev      # desarrollo con recarga: http://localhost:3001/api, OpenAPI en /api/docs
npm run build
npm run test           # unitarias (Vitest)
npm run test:e2e       # requiere la base local levantada
npm run lint           # oxlint

npm run db:levantar    # MySQL 8.4 en Docker, puerto 3307 del equipo
npm run db:migrar      # prisma migrate dev: crear y aplicar una migración en desarrollo
npm run db:desplegar   # prisma migrate deploy: aplicar migraciones pendientes en un ambiente desplegado
npm run db:generar     # prisma generate: regenerar el cliente tras cambiar el esquema
npm run db:estado      # prisma migrate status: migraciones que faltan por aplicar
npm run db:sembrar     # datos base: catálogos, programa y RAP (src/datos-iniciales/)
npm run db:sembrar:demo # además, período, asignaturas y usuarios de demostración (nunca en producción)
```

- **Línea base:** ya existe (`prisma/migrations/0_init`). Salió una sola vez del DDL
  `docs/URAP_esquema_mysql_v2.4.sql` con `prisma db pull`, más `@updatedAt` en cada
  `updated_at`. El DDL no se vuelve a aplicar: una base nueva se crea con
  `npm run db:desplegar`.
- **Cada cambio de modelo:** DBML → `prisma/schema.prisma` →
  `npm run db:migrar -- --name <cambio>` → `npm run db:generar`. En Prisma 7, `migrate dev`
  ya no regenera el cliente por su cuenta.
- `prisma migrate reset` borra la base. Prisma lo bloquea cuando lo ejecuta un agente: pide
  la confirmación explícita del usuario antes de correrlo.

## Reglas que no se negocian

**Autorización en el backend, siempre.** Cada endpoint protegido declara su rol y permiso
con el guard correspondiente. Un endpoint sin guard explícito es un bug, no un endpoint
público. Que el frontend oculte un botón no es control de acceso.

**Un usuario tiene varios roles.** Tabla `usuario_rol`. No existe `usuario.id_rol`. Hay
docentes que además son líderes RAP: nunca asumas un rol único.

**Nada de datos de negocio hardcodeados.** Los niveles de la escala, el umbral de
cumplimiento, los días de alerta, el tamaño máximo de archivo y los tipos permitidos son
parametrizables (`escala_valoracion`, `nivel_escala`, `parametro_sistema`). El sistema debe
servir a otros programas con escalas distintas sin tocar código.

**Borrado lógico.** Usuarios, asignaturas, RAP, proyectos y sesiones se inactivan, no se
eliminan. Hay trazabilidad y reportes históricos que dependen de ellos (NFR-017).

**Datos personales.** Inasistencias, fotos de clase y valoraciones individuales están
cubiertas por la Ley 1581 de 2012. Restringir por rol, agregar en los reportes consolidados
y **nunca** usar datos reales de estudiantes en seeds, fixtures ni pruebas.

**Auditoría.** Creaciones, modificaciones, eliminaciones, aprobaciones y consultas sensibles
se registran en `auditoria`. Si un fallo al auditar rompe la operación del usuario, está mal
implementado: se registra el error y la operación sigue. Cómo: el service llama a
`AuditoriaService.registrar()` después de confirmar la operación (fuera de su transacción),
con la tabla, el id y los valores anterior y nuevo; las consultas sensibles llevan
`@AuditarConsulta('tabla')` en el controlador. El usuario y la IP salen solos del contexto de
la petición, y las contraseñas y tokens se omiten de los valores. En `valor_anterior` y
`valor_nuevo` van solo los campos que cambian, no el registro entero: la auditoría se
conserva un año (NFR-008) y no debe guardar copias de datos personales (Ley 1581). La
consulta de la auditoría (HU-14-02) es solo para el administrador.

**Secretos fuera del código.** Credenciales, secreto JWT y vigencia del token van en
variables de entorno. Ningún `.env` al repositorio. Ojo con la distinción: los parámetros de
negocio (intentos de login, duración del bloqueo, umbral de alerta, tamaño máximo de archivo)
sí van en la tabla `parametro_sistema`; los de seguridad del despliegue no, porque un
administrador no debería poder ampliar la vigencia de un token desde una pantalla. La vigencia
es de ocho horas y está definida en NFR-003.

**Validación y errores.** Todo DTO de entrada se valida; no confiar en el frontend. Las
operaciones que tocan varias entidades van en transacción. Los listados van paginados. Las
respuestas de error no exponen stack traces, SQL ni nombres de tablas, y su mensaje va en
español comprensible.

## Convenciones

- Base de datos: `snake_case` en español, sin tildes ni eñes. Claves foráneas `id_<tabla>`.
- Todas las marcas de tiempo son `datetime`, nunca `timestamp`: MySQL detiene `timestamp` el
  19 de enero de 2038. Los porcentajes son `decimal(5,2)`; sin precisión explícita MySQL los
  crea como `DECIMAL(10,0)` y redondea.
- **El DBML es el documento de diseño; las migraciones de Prisma son el historial de la base.**
  Todo cambio de modelo empieza en `docs/URAP_modelo_datos_v2.4.dbml` y termina en una
  migración, y no está terminado hasta que los dos digan lo mismo. El DDL completo
  (`docs/URAP_esquema_mysql_v2.4.sql`) se aplica **una sola vez**, para crear la base vacía y
  sacar la línea base; después no se vuelve a aplicar, porque no es incremental y la base ya
  tiene datos. Si una migración necesita apartarse del DBML, primero se cambia el DBML y se
  explica en el PR.
- Todo endpoint se documenta con decoradores de OpenAPI: el frontend genera sus tipos desde
  ahí y es el único contrato entre los dos repos. La especificación se publica en
  `/api/openapi.json`.
- Endpoints públicos solo con `@Publico()`. El guard global (`auth/autenticacion.guard.ts`)
  cierra todo lo demás.
- Endpoints por rol con `@Roles(ROL.departamento, …)` (`auth/decoradores/roles.decorator.ts`).
  El decorador solo mira el rol; el alcance (el programa del rol, los proyectos propios del
  docente) lo comprueba el servicio. HU-01-03 lo amplía con la matriz de permisos.
- Errores: se lanzan las excepciones de Nest con el mensaje en español
  (`new ConflictException('Ya existe un usuario con ese correo.')`). El filtro global les da
  la forma `RespuestaErrorDto`. En los DTO, cada regla de class-validator lleva su `message`
  en español.
- Commits en español, en imperativo, referenciando el requisito:
  `feat(rf-20): registrar temas dictados por sesión`.

## Cómo trabajar

- **Trabajo en equipo:** somos dos personas que se relevan. Sigue `CONTRIBUTING.md`: el estado
  vive en Jira (espacio `URAP`) y en GitHub. `/tomar-historia` empieza una historia y `/relevo`
  la deja lista para que la otra persona continúe.
- Antes de una tarea de varios archivos, propón un plan y espera aprobación.
- Una rama y un PR por requisito o por grupo pequeño de requisitos relacionados.
- Al terminar un RF, verifica contra su secuencia normal **y sus excepciones**; las
  excepciones son criterios de aceptación, no casos borde opcionales.
- Si un requisito y el modelo de datos se contradicen, para y pregunta. Casi siempre
  significa que hay una decisión pendiente con el programa, no un error de transcripción.
- Lo marcado como supuesto (SUP-xx) no está confirmado con el cliente. No construyas encima
  sin avisar. En particular: la lista de estudiantes matriculados (SUP-03) todavía no tiene
  origen definido, y de ella dependen RF-22, RF-27 y RF-30.
