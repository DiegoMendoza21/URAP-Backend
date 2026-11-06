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
npm run db:sembrar       # catálogos, programa y usuarios de demostración
npm run start:dev
```

- API: <http://localhost:3001/api>
- Documentación interactiva: <http://localhost:3001/api/docs>
- Especificación OpenAPI: <http://localhost:3001/api/openapi.json>
- Verificación de salud: <http://localhost:3001/api/salud>

## Datos iniciales y de demostración

`npm run db:sembrar` carga lo que la aplicación necesita para funcionar y para la
demostración (`src/datos-iniciales/`). Se puede repetir: solo crea lo que falta y nunca
modifica lo que ya existe.

- **Catálogos:** roles, módulos y permisos, estados del proyecto docente, tipos de sesión, tipos
  de notificación, parámetros del sistema y festivos de 2026.
- **Programa:** Facultad de Ciencias Económicas, Administración Industrial, escala de cuatro
  niveles, período 2026-2 y RAP 1 a 7.
- **Demostración:** cuatro asignaturas `DEMO-0x` y un usuario ficticio por rol, todos con la
  contraseña de `CONTRASENA_USUARIOS_DEMO`:

| Correo | Roles |
|---|---|
| `admin.demo@urap.local` | Administrador |
| `departamento.demo@urap.local` | Departamento académico |
| `docente.demo@urap.local` | Docente responsable |
| `lider.demo@urap.local` | Docente responsable y Líder RAP (del RAP 2) |
| `direccion.demo@urap.local` | Dirección del programa |
| `estudiante.demo@urap.local` | Estudiante |

Faltan datos reales del programa: los textos de los RAP, el porcentaje esperado de la escala,
el plan de estudios, el calendario académico y la matriz de permisos por rol.

## Pruebas y calidad

```bash
npm run test        # unitarias
npm run test:e2e    # extremo a extremo, con la base local levantada
npm run lint
```

## Documentación del proyecto

- `CLAUDE.md`: reglas del proyecto, estructura, comandos y convenciones.
- `docs/`: glosario del dominio, modelo de datos (DBML y DDL), requisitos y backlog.
