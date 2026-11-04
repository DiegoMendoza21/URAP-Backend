# Índice de requisitos URAP

Lista corta para ubicar un requisito. El detalle está en `docs/requisitos-funcionales.md` y `docs/requisitos-no-funcionales.md`.

## Objetivos

- **OBJ-01** — Centralizar la creación y la planeación del proyecto docente
- **OBJ-02** — Diligenciar el proyecto docente conforme al formato institucional
- **OBJ-03** — Registrar y controlar la ejecución real de las clases
- **OBJ-04** — Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias
- **OBJ-05** — Supervisar el cumplimiento del diligenciamiento y generar reportes
- **OBJ-06** — Administrar usuarios, roles y acceso seguro a la información
- **OBJ-07** — Facilitar la consulta del proyecto docente por parte del estudiante
- **OBJ-08** — Medir el logro de los RAP y soportar el análisis y la mejora continua

## Actores

- **ACT-01** — DOCENTE RESPONSABLE
- **ACT-02** — DEPARTAMENTO ACADÉMICO
- **ACT-03** — ADMINISTRADOR DEL SISTEMA
- **ACT-04** — ESTUDIANTE
- **ACT-05** — LÍDER RAP
- **ACT-06** — DIRECCIÓN DEL PROGRAMA
- **ACT-07** — SISTEMAS Y SERVICIOS EXTERNOS

## Requisitos funcionales

- **RF-01** — Autenticación de usuarios y control de sesión
- **RF-02** — Gestión de usuarios
- **RF-03** — Gestión de roles y permisos
- **RF-04** — Parametrización de la estructura académica
- **RF-05** — Gestión del catálogo de RAP por programa
- **RF-06** — Gestión de la rúbrica de evaluación del RAP
- **RF-07** — Parametrización de la escala de valoración de RAP por programa
- **RF-08** — Creación del proyecto docente mediante asistente por pasos
- **RF-09** — Duplicación de un proyecto docente existente
- **RF-10** — Creación del proyecto docente a partir de un archivo Excel
- **RF-11** — Registro de la descripción del proyecto docente
- **RF-12** — Registro de los RAC y su asociación con los RAP
- **RF-13** — Registro de las estrategias metodológicas
- **RF-14** — Registro de la evaluación de los resultados de aprendizaje
- **RF-15** — Registro del contenido programático por semana
- **RF-16** — Registro de la bibliografía del curso
- **RF-17** — Envío del proyecto docente a revisión y control de estados
- **RF-18** — Revisión y aprobación del proyecto docente
- **RF-19** — Generación del calendario de sesiones y precarga de días festivos
- **RF-20** — Registro de la clase desarrollada
- **RF-21** — Clasificación de sesiones especiales: parcial, festivo y actividad complementaria
- **RF-22** — Registro de observaciones y de estudiantes ausentes
- **RF-23** — Alerta de sesiones vencidas sin diligenciar
- **RF-24** — Carga de evidencias fotográficas por RAP
- **RF-25** — Tablero de seguimiento del diligenciamiento
- **RF-26** — Notificaciones y recordatorios
- **RF-27** — Consulta del proyecto docente por parte del estudiante
- **RF-28** — Generación de reportes académicos
- **RF-29** — Registro de auditoría de las acciones de los usuarios
- **RF-30** — Registro de la valoración de los estudiantes por indicador de desempeño
- **RF-31** — Consolidación y análisis de la medición de RAP
- **RF-32** — Reporte de logro de los RAP del programa

## Requisitos no funcionales

- **NFR-001** — Capacidad de usuarios concurrentes
- **NFR-002** — Tiempos de respuesta de las operaciones frecuentes
- **NFR-003** — Autenticación mediante token JWT
- **NFR-004** — Autorización basada en roles
- **NFR-005** — Protección de contraseñas mediante hash
- **NFR-006** — Comunicación cifrada y control de orígenes
- **NFR-007** — Restricción de acceso al almacenamiento documental
- **NFR-008** — Trazabilidad de las operaciones
- **NFR-009** — Disponibilidad del servicio
- **NFR-010** — Respaldo y recuperación de la información
- **NFR-011** — Validación de datos y manejo controlado de errores
- **NFR-012** — Escalabilidad funcional a otros programas académicos
- **NFR-013** — Usabilidad y diligenciamiento guiado
- **NFR-014** — Diseño responsive y acceso desde dispositivos móviles
- **NFR-015** — Mantenibilidad y documentación técnica
- **NFR-016** — Registro técnico y monitoreo
- **NFR-017** — Integridad y eliminación lógica de registros
- **NFR-018** — Idioma, accesibilidad básica y consistencia visual
- **NFR-019** — Control de los archivos cargados
- **NFR-020** — Tratamiento de datos personales
