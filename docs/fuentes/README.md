# Fuentes de los documentos

Los requisitos y el backlog de `docs/` se exportan de dos hojas de cálculo de Google que
conserva el equipo de la tesis:

| Hoja de cálculo | Versión | Lo que se exporta de ella |
|---|---|---|
| «Requisitos URAP» | 1.5 | `objetivos-y-actores.md`, `requisitos-funcionales.md`, `requisitos-no-funcionales.md` e `indice-requisitos.md` |
| «Backlog URAP — Épicas e historias de usuario» | 2.3 | `urap-backlog.md` y la carga del backlog en Jira (espacio `URAP`) |

Las hojas no están en el repositorio ni se enlazan aquí porque el repositorio es público y sus
campos de autores y de fuentes nombran a las personas que participaron en el levantamiento de
requisitos. En los markdown, a cada persona se la nombra por su función.

- No edites a mano un markdown exportado. Si un requisito cambia, se cambia en la hoja y se
  vuelve a exportar.
- El estado de las historias vive en Jira. La columna «Estado» de la hoja del backlog lo copia
  en cada actualización y no se exporta a `urap-backlog.md`.
- `datos-institucionales.md` lo mantiene el mismo equipo a partir de documentos del programa
  que tampoco entran al repositorio. Por ejemplo, la medición con nombres de estudiantes y la
  programación académica con cédulas.
- Si necesitas consultar una hoja, pídesela al equipo de la tesis.
