---
name: tomar-historia
description: Toma una historia de usuario de URAP en Jira para trabajarla. Elige la siguiente disponible del sprint activo, o la indicada, se la asigna a quien trabaja, la pasa a En curso y prepara su rama. Si es un relevo, trae la rama existente y lee el último comentario de relevo.
argument-hint: "[HU-xx-yy o URAP-nn, opcional]"
disable-model-invocation: true
---

Toma una historia para trabajarla siguiendo `CONTRIBUTING.md`.

Usa el conector de Atlassian sobre el sitio `mauriciosalvadorcastro.atlassian.net`, espacio
`URAP`. Si el conector no está disponible o no tiene acceso a ese sitio, detente y pide al usuario
que lo conecte.

1. **Elegir la historia.**
   - Si el usuario indicó una (`$ARGUMENTS`), usa esa. Búscala por el código HU al inicio del
     título o por su clave `URAP-nn`.
   - Si no indicó ninguna, busca en el sprint activo:
     `project = URAP AND sprint in openSprints() AND issuetype = Historia AND status = "Por hacer" AND assignee is EMPTY ORDER BY Rank ASC`.
     Descarta las que estén bloqueadas por incidencias que todavía no estén en Finalizado
     (`issue in linkedIssues(<clave>, "is blocked by")`). Quédate con la primera que quede.
   - Si la historia está asignada a otra persona o ya En curso, puede ser un relevo. Lee sus
     comentarios y confirma con el usuario antes de tomarla.
2. **Mostrarla y confirmar.** Muestra el código, el título, los criterios de aceptación y las
   dependencias, y pide confirmación antes de cambiar nada.
3. **Asignar y mover.** Asígnala al usuario actual de Jira y pásala a En curso. Si era un relevo
   de la otra persona, reasígnala.
4. **Rama.**
   - Si ya existe una rama para esta historia (`git ls-remote --heads origin "feat/<código-hu>*"`,
     con el código en minúsculas), tráela con `git fetch` y `git switch`. Lee el último
     comentario de relevo de la historia y resume al usuario qué falta.
   - Si no existe, `git switch main`, `git pull` y
     `git switch -c feat/<código-hu-en-minúsculas>-<resumen-corto>`.
5. **Preparar el trabajo.** Lee el RF de la historia en `docs/requisitos-funcionales.md`, con su
   secuencia normal y sus excepciones, y las reglas de `CLAUDE.md`. Propón un plan y espera
   aprobación antes de escribir código.
