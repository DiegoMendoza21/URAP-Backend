---
name: relevo
description: Deja la historia de URAP en curso lista para que otra persona la continúe. Hace commit y sube la rama, abre un PR en borrador si hace falta y escribe el comentario de relevo en la historia de Jira.
argument-hint: "[notas para quien continúe, opcional]"
disable-model-invocation: true
---

Prepara el relevo de la historia en curso siguiendo `CONTRIBUTING.md`. Quien la retome no ha visto
esta conversación: el comentario de relevo tiene que bastarle para seguir.

1. **Identificar la historia.** Sale del nombre de la rama (`feat/hu-xx-yy-…`). Búscala en Jira
   (sitio `mauriciosalvadorcastro.atlassian.net`, espacio `URAP`) por su código HU. Si la rama no
   corresponde a una historia, pregunta al usuario cuál es.
2. **Revisar el estado real.** Mira `git status` y `git log main..HEAD`, y corre las pruebas y el
   lint del repositorio para saber qué funciona y qué falla. No arregles nada ahora: describe.
3. **Guardar el trabajo.** Haz commit de lo pendiente, en español e imperativo y con el requisito.
   Si queda a medias, dilo en el mensaje: `feat(rf-01): avanzar el inicio de sesión (incompleto)`.
   Sube la rama con `git push -u origin <rama>`. Nunca hagas push a `main`.
4. **PR en borrador.** Si la rama no tiene PR, ábrelo en borrador hacia `main` con
   `gh pr create --draft`, con el título `HU-xx-yy · <título de la historia> (URAP-nn)`. Si ya
   tiene, déjalo como está.
5. **Comentario de relevo en Jira**, en la historia, con estas secciones:
   - **Hecho:** qué quedó funcionando, con los archivos o endpoints.
   - **Falta:** qué queda por hacer y en qué orden, contrastado con los criterios de aceptación y
     las excepciones del RF.
   - **Cómo retomar:** la rama, el PR, los comandos para levantar y probar, y qué pruebas fallan a
     propósito.
   - **Decisiones:** qué se decidió y por qué, y las dudas abiertas.
   Agrega las notas del usuario, si las dio: $ARGUMENTS
6. **Estado en Jira.** La historia sigue En curso: pasa a En revisión solo cuando esté completa y
   tenga un PR listo. Si el usuario dice que no la va a continuar él, quítale la asignación para
   que la otra persona la tome.
7. Muestra al usuario el enlace del PR y el comentario que dejaste.
