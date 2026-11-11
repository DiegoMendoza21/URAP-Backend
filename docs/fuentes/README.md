# Fuentes de los documentos

Los requisitos y el backlog de `docs/` se exportan de dos Excel que conserva el equipo de la
tesis:

| Excel | Lo que se exporta de él |
|---|---|
| `Requisitos_URAP_v1.4.xlsx` | `objetivos-y-actores.md`, `requisitos-funcionales.md` y `requisitos-no-funcionales.md` |
| `Backlog_Epicas_Historias_URAP_v2.2.xlsx` | `urap-backlog.md` y la carga del backlog en Jira (espacio `URAP`) |

Los Excel no están en el repositorio porque el repositorio es público y sus hojas de fuentes
nombran a las personas que participaron en el levantamiento de requisitos. En los markdown,
a cada persona se la nombra por su función.

- No edites a mano un markdown exportado. Si un requisito cambia, se cambia en el Excel y se
  vuelve a exportar.
- `datos-institucionales.md` lo mantiene el mismo equipo a partir de documentos del programa
  que tampoco entran al repositorio. Por ejemplo, la medición con nombres de estudiantes y la
  programación académica con cédulas.
- Si necesitas un Excel, pídeselo al equipo de la tesis.
