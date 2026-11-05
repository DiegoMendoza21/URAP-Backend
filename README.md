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
cp .env.example .env     # y complete JWT_SECRETO (el archivo explica cómo generarlo)
npm install
npm run db:levantar      # MySQL en Docker, puerto 3307
npm run db:desplegar     # crea las tablas aplicando las migraciones de prisma/migrations
npm run start:dev
```

- API: <http://localhost:3001/api>
- Documentación interactiva: <http://localhost:3001/api/docs>
- Especificación OpenAPI: <http://localhost:3001/api/openapi.json>
- Verificación de salud: <http://localhost:3001/api/salud>

## Pruebas y calidad

```bash
npm run test        # unitarias
npm run test:e2e    # extremo a extremo, con la base local levantada
npm run lint
```

## Documentación del proyecto

- `CLAUDE.md`: reglas del proyecto, estructura, comandos y convenciones.
- `docs/`: glosario del dominio, modelo de datos (DBML y DDL), requisitos y backlog.
