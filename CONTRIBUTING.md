# Cómo trabajamos en URAP

URAP lo construyen dos personas que se relevan: cada una avanza en su tiempo disponible y la
otra continúa donde quedó. Para que eso funcione, **el estado del trabajo vive en Jira y en
GitHub**, nunca solo en la cabeza de alguien ni en la memoria local de su Claude Code.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Backlog, sprints y estado de cada historia | Jira: <https://mauriciosalvadorcastro.atlassian.net>, espacio **URAP** |
| Código y revisiones | GitHub: `DiegoMendoza21/URAP-Backend` y `DiegoMendoza21/URAP-Frontend` |
| Qué construir y en qué orden | `docs/urap-backlog.md`: cada historia tiene su código HU y su RF |

En Jira, el título de cada historia empieza con su código (`HU-01-01 · …`): búscala por ese
código. Las dependencias del backlog son vínculos «bloquea / está bloqueada por».

Estados: **Por hacer** → **En curso** → **En revisión** (tiene PR abierto) → **Finalizado** (PR
integrado).

Para trabajar se necesita Node 26 LTS, npm 11, Docker Desktop, la CLI `gh` con una cuenta que
tenga permiso de escritura en el repositorio, y Claude Code con el conector de Atlassian
autorizado para el sitio de Jira.

## El ciclo de una historia

1. **Tomarla** con `/tomar-historia`. Del sprint activo se elige la historia de mayor prioridad
   que no esté asignada y cuyos bloqueos ya estén Finalizados. Quien la toma se la asigna y la
   pasa a En curso. Antes de escribir código se lee su RF completo, incluidas las excepciones.
2. **Rama** desde `main` actualizado, con el código HU y un resumen corto:
   `feat/hu-01-01-iniciar-sesion`.
3. **Commits** en español, en imperativo y con el requisito: `feat(rf-01): emitir el JWT al
   iniciar sesión`.
4. **PR hacia `main`** cuando la historia cumple todos sus criterios de aceptación. Título:
   `HU-01-01 · Iniciar sesión con correo institucional y contraseña (URAP-25)`. En la
   descripción van los criterios de aceptación y las excepciones del RF, cada uno verificado.
   La historia pasa a En revisión con el enlace del PR.
5. **Revisión cruzada**: el PR lo revisa la otra persona. Al integrarse, la historia pasa a
   Finalizado.

## Relevo

Quien deja una historia a medias corre `/relevo` antes de irse. El comando:

- hace commit de lo pendiente y sube la rama, aunque todavía no esté completa;
- abre un PR en borrador, si la rama no tenía uno;
- deja en la historia de Jira un comentario con **qué quedó hecho**, **qué falta**, **cómo
  retomarla** (comandos, archivos, pruebas que fallan a propósito) y **qué se decidió**.

Quien continúa corre `/tomar-historia` con el código de esa historia: el comando trae la rama y
lee el último comentario de relevo. Si la retoma la otra persona, se la reasigna en Jira.

## Reglas para no pisarse

- **`main` siempre en verde**: no se integra nada con pruebas, lint o build fallando, y nadie hace
  push directo a `main`.
- **Un módulo a la vez por persona**: los dos no trabajan en el mismo módulo al mismo tiempo.
  Repártanse por épica o siguiendo las dependencias de Jira.
- **Migraciones de Prisma**: una sola rama a la vez crea migraciones. Antes de crear una, se
  actualiza la rama con `main` y se aplica lo que haya (`npm run db:desplegar`). Si `main` recibe
  una migración mientras tanto, se actualiza la rama, se descarta la migración propia (todavía no
  integrada) y se vuelve a generar con `npm run db:migrar`, para que quede después de la de
  `main`. Eso puede pedir reiniciar la base local, lo que borra sus datos.
- **Cada uno con su entorno**: su `.env` y su base local. Nada de eso va al repositorio.
- **Un PR por historia** o por un grupo pequeño de historias relacionadas, como dice `CLAUDE.md`.
