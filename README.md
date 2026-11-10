# URAP — Backend

API REST del sistema URAP: seguimiento, control y análisis de los proyectos docentes del
programa de Administración Industrial de la Universidad de Cartagena. Prototipo funcional
de una tesis de pregrado.

El frontend vive en un repositorio aparte
([URAP-Frontend](https://github.com/DiegoMendoza21/URAP-Frontend)). El contrato entre los dos
es la especificación OpenAPI que publica esta API.

**Stack:** NestJS 12 (TypeScript), MySQL 8.4, Prisma 7, JWT, OpenAPI.

## Requisitos

- Node.js 26 LTS (también sirven 24.15 y 22.22.3 o superiores) con npm 11 o superior
- Docker Desktop

## Puesta en marcha

```bash
cp .env.example .env     # complete JWT_SECRETO y CONTRASENA_USUARIOS_DEMO (el archivo explica cómo)
npm install
npm run db:levantar      # MySQL en Docker, puerto 3307
npm run db:desplegar     # crea las tablas aplicando las migraciones de prisma/migrations
npm run db:sembrar:demo  # datos base y de demostración (solo en local)
npm run start:dev
```

- API: <http://localhost:3001/api>
- Documentación interactiva: <http://localhost:3001/api/docs>
- Especificación OpenAPI: <http://localhost:3001/api/openapi.json>
- Verificación de salud: <http://localhost:3001/api/salud>

## Datos iniciales y de demostración

Los dos comandos están en `src/datos-iniciales/`. Se pueden repetir: solo crean lo que falta y
nunca modifican lo que ya existe, para no pisar lo que se cambie desde la aplicación. La
consecuencia: si se corrige un dato en el código (por ejemplo, la descripción de un rol o el
nombre de un festivo), hay que corregirlo también en las bases ya sembradas.

`npm run db:sembrar` carga los **datos base**, que sirven en cualquier ambiente:

- **Catálogos:** roles, módulos y permisos, estados del proyecto docente, tipos de sesión, tipos
  de notificación, parámetros del sistema y festivos de 2026.
- **Programa:** Facultad de Ciencias Económicas, Administración Industrial, escala de cuatro
  niveles, los RAP 1 a 7 con su texto oficial y la rúbrica real del RAP 2 (versión 1, vigente:
  4 indicadores y 16 descriptores).
- **Plan de estudios:** 69 asignaturas con su semestre y sus 73 vínculos con los RAP. Cuatro
  traen la ficha completa (código, componente, tipo, créditos, horas y prerrequisitos) y
  Finanzas a corto plazo trae su código. Las demás quedan solo con nombre, semestre y RAP hasta
  que el programa entregue sus datos.

Los datos del programa y sus fuentes están en `docs/datos-institucionales.md`.

`npm run db:sembrar:demo` carga además los **datos de demostración**. Se niega a correr con
`NODE_ENV=production`, porque crea un Administrador con una contraseña compartida:

- el período 2026-2 con las fechas reales del Acuerdo 46 (3 de agosto a 27 de noviembre, 16
  semanas) y los seis días del receso de noviembre como días sin clase de origen `institucional`;
- rúbricas provisionales de los RAP 1 y 3 a 7, con el número de indicadores de 2023-II y todos
  sus textos marcados «PROVISIONAL —»;
- un usuario ficticio por rol, todos con la contraseña de `CONTRASENA_USUARIOS_DEMO`:

| Correo | Roles |
|---|---|
| `admin.demo@urap.local` | Administrador |
| `departamento.demo@urap.local` | Departamento académico |
| `docente.demo@urap.local` | Docente responsable |
| `lider.demo@urap.local` | Docente responsable y Líder RAP (del RAP 2) |
| `direccion.demo@urap.local` | Dirección del programa |
| `estudiante.demo@urap.local` | Estudiante |

y el **recorrido de demostración** (`src/datos-iniciales/recorrido-demo.ts`), para que el
tablero, la revisión, la medición y los reportes muestren algo:

- el caso de RF-31: Finanzas a corto plazo 2026-2, aprobado, con 34 estudiantes ficticios
  matriculados y la medición cerrada del RAP 2 que reproduce la real de 2024-1 (85,29 %,
  70,59 %, 50 % y 50 %; logro del RAP 63,97 %, 87 de 136), además de clases registradas,
  vencidas y evidencias;
- Macroeconomía 2026-2, aprobada, con otra medición del RAP 2: el reporte de logro de 2026-2
  suma las dos asignaturas (64,81 %, 140 de 216);
- Organización y dirección 2026-2, aprobada, con evidencias en los RAP 3 y 7;
- proyectos en diligenciamiento, enviado a revisión y devuelto con observaciones;
- un período 2026-1 cerrado, de fechas aproximadas, con un proyecto que tiene sesiones
  incumplidas y la medición del RAP 2 con la que compara el reporte (50 %, 56 de 112).

Solo se mide el RAP 2, el único con rúbrica real: los demás salen «No evaluado».

Todo es ficticio y lleva el prefijo `DEMO-` (documentos de los estudiantes y grupo de los
proyectos). Las evidencias son imágenes generadas por código, nunca fotos. Las sesiones se
registran hasta siete días antes de sembrar: conviene sembrar cerca del día de la demostración.

Faltan datos reales del programa: el porcentaje esperado, el calendario 2027-1, la ficha de las
otras 65 asignaturas y las rúbricas de los RAP 1 y 3 a 7 (lista completa en
`docs/datos-institucionales.md`, apartado 8).

### Bases locales sembradas con una versión anterior de los datos

El seed solo crea lo que falta y nunca modifica lo que ya existe. Una base sembrada antes de la
versión 2 de los datos institucionales se queda con las fechas viejas del período, sin las fichas
de las cuatro asignaturas y sin rúbricas (y si es aún más vieja, con los RAP «Pendiente» y las
asignaturas `DEMO-0x`). Hay que reiniciarla, lo que **borra todos sus datos**, y volver a
sembrarla:

```bash
npx prisma migrate reset --force
npm run db:sembrar:demo
```

`migrate reset` vuelve a aplicar las migraciones; en Prisma 7 ya no siembra por su cuenta.

### Matriz de permisos (HU-01-03)

Cada endpoint protegido exige un permiso de la matriz (`rol_permiso`), leída de la base en cada
petición. **Una base sin la matriz responde 403 a todo**, también al Administrador en `/roles`,
y no se puede arreglar desde la aplicación. Después de traer cambios, corra:

```bash
npm run db:sembrar
```

Carga la matriz en los roles que todavía no tienen permisos (`src/datos-iniciales/matriz-permisos.ts`).
No modifica los roles que ya tienen: si la matriz inicial cambia (por ejemplo, el Administrador
ya no crea proyectos docentes desde el 7 de noviembre), una base sembrada antes lo conserva.
Se corrige con `PUT /roles/:id/permisos` o reiniciando la base como se explica arriba.

## Almacenamiento de archivos

Las evidencias fotográficas (RF-24) no van a la base de datos: la base guarda solo su
referencia, y el archivo queda en el **almacenamiento documental**. En este prototipo es una
carpeta del disco, que se configura con la variable `ALMACENAMIENTO_DIRECTORIO`:

- **En desarrollo** se puede dejar vacía: se usa la carpeta `almacenamiento/` del proyecto, que
  no va al repositorio. La API la crea al arrancar.
- **En producción es obligatoria** y debe apuntar a un **volumen persistente**, por ejemplo
  `/srv/urap/almacenamiento`. Si apunta a una carpeta del contenedor, cada despliegue borra las
  evidencias. La API debe poder leer y escribir en ella; si no puede, no arranca.

Los archivos nunca se publican: no se sirven como archivos estáticos ni con direcciones
públicas. Se descargan solo a través de la API
(`GET /api/proyectos-docentes/{id}/evidencias/{idEvidencia}/archivo`), que valida la sesión y
los permisos y registra cada descarga en la auditoría, porque las fotos de clase son datos
personales (Ley 1581 de 2012). Esa carpeta tampoco debe quedar en una ruta que sirva un
servidor web.

El tamaño máximo (`archivo_tamano_maximo_mb`) y los tipos permitidos de las evidencias
(`evidencia_tipos_permitidos`, JPG, PNG y PDF) son parámetros de `parametro_sistema`. El tipo
se comprueba con el contenido del archivo, no con su nombre. Para pasar a Amazon S3 basta con
otro adaptador de la interfaz `AlmacenamientoDocumental` (`src/documentos/almacenamiento/`).

## Despliegue

`docs/despliegue.md` explica cómo desplegar URAP con HTTPS en AWS: el frontend, la API y Caddy
en un servidor EC2 con Docker (`Dockerfile` y `despliegue/`), y MySQL 8.4 en Amazon RDS con
copias de seguridad diarias. En producción, la conexión con la base va cifrada: `DATABASE_URL`
lleva la CA del servidor en `sslcert`, y sin ella la API no arranca.

## Pruebas y calidad

```bash
npm run test        # unitarias
npm run test:e2e    # extremo a extremo, con la base local levantada
npm run lint
```

## Documentación del proyecto

- `CLAUDE.md`: reglas del proyecto, estructura, comandos y convenciones.
- `docs/`: glosario del dominio, modelo de datos (DBML y DDL), requisitos y backlog.
