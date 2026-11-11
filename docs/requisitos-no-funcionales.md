# URAP — Requisitos no funcionales (NFR-001 a NFR-020)

Generado desde `Requisitos_URAP_v1.4.xlsx`. El Excel es la fuente oficial.

## NFR-001 — Capacidad de usuarios concurrentes

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3 y 4)

**Objetivos asociados:** OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-01: Autenticación de usuarios y control de sesión

**Descripción:** El sistema deberá soportar al menos 50 usuarios concurrentes sin degradación apreciable del tiempo de respuesta, considerando que el programa de Administración Industrial cuenta aproximadamente con 40 docentes y un grupo reducido de usuarios administrativos.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** La cifra corresponde a una estimación del equipo investigador y debe validarse con el programa. La concurrencia máxima se presenta en las semanas de cierre de período.

---

## NFR-002 — Tiempos de respuesta de las operaciones frecuentes

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3 y 4)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-20: Registro de la clase desarrollada  
RF-28: Generación de reportes académicos

**Descripción:** El sistema deberá responder en un tiempo menor o igual a 3 segundos en el inicio de sesión y en el registro o actualización de información básica; entre 2 y 4 segundos en la consulta de proyectos docentes; en un tiempo menor o igual a 5 segundos en la generación de reportes simples, y entre 5 y 10 segundos en la generación de reportes consolidados.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Valores tomados del numeral 4.3 del Producto 2. La carga de documentos depende del tamaño del archivo y de la conexión del usuario.

---

## NFR-003 — Autenticación mediante token JWT

**Versión:** 1.1 (04/11/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 3, modelo y requisitos de seguridad)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-01: Autenticación de usuarios y control de sesión  
NFR-006: Comunicación cifrada y control de orígenes

**Descripción:** El sistema deberá autenticar a los usuarios mediante credenciales registradas y emitir un token JWT con tiempo de expiración, exigido en toda solicitud a recursos protegidos de la API. La vigencia del token será de ocho horas, de modo que cubra una jornada académica completa sin que la sesión caduque mientras el docente diligencia un formulario extenso. El cierre de sesión revoca el token antes de su vencimiento.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El secreto de firma y la vigencia del token se administran mediante variables de entorno, no desde la aplicación: un administrador no debería poder ampliar la vigencia de un token desde una pantalla. El riesgo de una vigencia larga queda acotado por la revocación del lado del servidor, que registra cada token emitido y lo invalida al cerrar sesión. Valor definido el 04/11/2026 por el equipo investigador; debe validarse con el área de tecnología de la Universidad antes de la puesta en producción.

---

## NFR-004 — Autorización basada en roles

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 3, modelo y requisitos de seguridad)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-03: Gestión de roles y permisos

**Descripción:** El sistema deberá validar en el backend, para cada operación solicitada, que el usuario autenticado cuente con el rol y el permiso correspondientes, de modo que ningún usuario acceda a funciones ajenas a sus responsabilidades.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** La validación en el frontend es únicamente de presentación; el control efectivo se realiza en la capa de servicios mediante guards y decoradores.

---

## NFR-005 — Protección de contraseñas mediante hash

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 3, modelo y requisitos de seguridad)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-01: Autenticación de usuarios y control de sesión  
RF-02: Gestión de usuarios

**Descripción:** Las contraseñas no deberán almacenarse en texto plano. El sistema aplicará un algoritmo de hash con salt antes de guardarlas y exigirá una longitud mínima y una combinación de caracteres definida en la política de contraseñas.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Debe definirse el procedimiento de recuperación y de cambio obligatorio de contraseña.

---

## NFR-006 — Comunicación cifrada y control de orígenes

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 3, modelo y requisitos de seguridad)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-01: Autenticación de usuarios y control de sesión

**Descripción:** Toda comunicación entre el cliente web o la PWA y los servicios del backend deberá realizarse mediante HTTPS con certificados SSL/TLS, y la API deberá aplicar una configuración CORS que restrinja los orígenes autorizados.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El intercambio de información se realiza en formato JSON sobre una API REST.

---

## NFR-007 — Restricción de acceso al almacenamiento documental

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 3.6)

**Objetivos asociados:** OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-24: Carga de evidencias fotográficas por RAP

**Descripción:** Los documentos y evidencias almacenados no deberán ser públicos por defecto. El acceso se realizará a través del backend, que validará la autenticación y los permisos del usuario, y podrá emplear direcciones firmadas con tiempo de expiración cuando se requiera una descarga directa.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** La base de datos conserva únicamente la referencia del archivo, no su contenido.

---

## NFR-008 — Trazabilidad de las operaciones

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 3.7)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** RF-29: Registro de auditoría de las acciones de los usuarios

**Descripción:** El sistema deberá conservar el registro de las operaciones de creación, modificación, eliminación, aprobación y consulta sensible durante al menos un año académico, de forma que sea posible identificar quién realizó cada cambio y cuándo.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El período de conservación debe confirmarse con la política institucional de archivo.

---

## NFR-009 — Disponibilidad del servicio

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 4.5)

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases

**Requisitos asociados:** RF-20: Registro de la clase desarrollada

**Descripción:** El sistema deberá estar disponible más allá del horario administrativo, con una disponibilidad mínima estimada del 99,5 %, ya que los docentes registran la información inmediatamente después de sus clases y en distintos momentos de la jornada.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** La disponibilidad depende de la configuración final de los servicios cloud contratados. Deben preverse ventanas de mantenimiento programado y comunicarse con anticipación.

---

## NFR-010 — Respaldo y recuperación de la información

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3.5 y 4.4)

**Objetivos asociados:** OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** RF-29: Registro de auditoría de las acciones de los usuarios

**Descripción:** La base de datos deberá contar con copias de seguridad automáticas diarias y con un procedimiento documentado de restauración que permita recuperar la información ante fallos o incidentes.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Debe definirse y probarse el tiempo objetivo de recuperación durante la fase de pruebas.

---

## NFR-011 — Validación de datos y manejo controlado de errores

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 4.4)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-10: Creación del proyecto docente a partir de un archivo Excel

**Descripción:** El sistema deberá validar los campos obligatorios, los formatos y las reglas de negocio antes de almacenar la información, y presentar mensajes comprensibles ante los errores, sin exponer detalles técnicos internos ni información sensible.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Las validaciones deben aplicarse tanto en el frontend como en el backend.

---

## NFR-012 — Escalabilidad funcional a otros programas académicos

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 4.8)

**Objetivos asociados:** OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-04: Parametrización de la estructura académica  
RF-07: Parametrización de la escala de valoración de RAP por programa

**Descripción:** El modelo de datos y la configuración del sistema deberán permitir incorporar nuevas facultades, programas, asignaturas, RAP, rúbricas y escalas de valoración sin modificar el código fuente ni rediseñar el núcleo de la solución.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** La versión beta se implementa para el programa de Administración Industrial, pero la parametrización por programa es condición para su adopción institucional posterior.

---

## NFR-013 — Usabilidad y diligenciamiento guiado

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 4.9)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** RF-08: Creación del proyecto docente mediante asistente por pasos

**Descripción:** La interfaz deberá organizar la información por secciones equivalentes a las del formato institucional, permitir el diligenciamiento por pasos, presentar menús según el rol, mostrar mensajes claros de error y confirmación, y conservar la información parcial para que el usuario pueda continuar más tarde.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** La adopción por parte de los docentes depende de que el sistema exija menos esfuerzo que el diligenciamiento actual en hojas de cálculo. Se recomienda medir la usabilidad durante las pruebas con usuarios.

---

## NFR-014 — Diseño responsive y acceso desde dispositivos móviles

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 4.1 y 4.7)

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases

**Requisitos asociados:** RF-20: Registro de la clase desarrollada  
RF-24: Carga de evidencias fotográficas por RAP

**Descripción:** La aplicación deberá adaptarse a computadores, tabletas y teléfonos inteligentes, y funcionar con capacidades PWA en navegadores actuales, sin requerir instalaciones ni complementos adicionales.

**Importancia:** Alta

**Urgencia:** Alta

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** El acceso desde el teléfono es determinante para el registro de clases y la carga de evidencias fotográficas inmediatamente después de la sesión.

---

## NFR-015 — Mantenibilidad y documentación técnica

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 4.6)

**Objetivos asociados:** OBJ-06: Administrar usuarios, roles y acceso seguro a la información

**Requisitos asociados:** No aplica.

**Descripción:** La solución deberá construirse con una estructura modular por dominios, mantener el código bajo control de versiones, conservar las configuraciones sensibles en variables de entorno y disponer de documentación de arquitectura, modelo de datos, API, despliegue y manual de usuario.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Es un requisito determinante para que la solución pueda ser continuada por otros equipos después de finalizada la tesis.

---

## NFR-016 — Registro técnico y monitoreo

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numerales 3 y 4)

**Objetivos asociados:** OBJ-05: Supervisar el cumplimiento del diligenciamiento y generar reportes

**Requisitos asociados:** NFR-011: Validación de datos y manejo controlado de errores

**Descripción:** El sistema deberá generar registros técnicos de los errores y eventos relevantes, y permitir su monitoreo para facilitar el diagnóstico y la corrección de fallos.

**Importancia:** Media

**Urgencia:** Baja

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Los registros técnicos son distintos de la auditoría funcional descrita en RF-29.

---

## NFR-017 — Integridad y eliminación lógica de registros

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 1: Arquitectura de negocio URAP (regla RN-13)

**Objetivos asociados:** OBJ-01: Centralizar la creación y la planeación del proyecto docente

**Requisitos asociados:** RF-02: Gestión de usuarios  
RF-05: Gestión del catálogo de RAP por programa

**Descripción:** Los registros con trazabilidad asociada, como usuarios, asignaturas, RAP, proyectos docentes y sesiones, no deberán eliminarse físicamente. El sistema aplicará inactivación o eliminación lógica para conservar el histórico y la consistencia de los reportes.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** Las operaciones que afecten varias entidades deberán ejecutarse de forma transaccional.

---

## NFR-018 — Idioma, accesibilidad básica y consistencia visual

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 4.1)

**Objetivos asociados:** OBJ-02: Diligenciar el proyecto docente conforme al formato institucional

**Requisitos asociados:** NFR-013: Usabilidad y diligenciamiento guiado

**Descripción:** La totalidad de la interfaz y de los mensajes deberá presentarse en español, con tamaños de letra legibles, contraste adecuado, etiquetas descriptivas y una estructura gráfica uniforme, coherente con la identidad institucional de la Universidad de Cartagena.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Alta

**Comentarios:** La terminología debe corresponder a la utilizada en los formatos institucionales.

---

## NFR-019 — Control de los archivos cargados

**Versión:** 1.0 (10/09/2026)

**Fuentes:** Producto 2: Arquitectura de tecnología URAP (numeral 4.4)

**Objetivos asociados:** OBJ-04: Gestionar los resultados de aprendizaje, las rúbricas y sus evidencias

**Requisitos asociados:** RF-24: Carga de evidencias fotográficas por RAP  
RF-10: Creación del proyecto docente a partir de un archivo Excel

**Descripción:** El sistema deberá validar el tipo, el tamaño y la asociación correcta de cada archivo cargado. Se propone permitir archivos JPG, PNG, PDF, XLSX y DOCX, con un tamaño máximo de 10 MB por archivo.

**Importancia:** Media

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Los tipos permitidos y el tamaño máximo son una propuesta del equipo investigador y deben validarse con el programa y con el área de tecnología.

---

## NFR-020 — Tratamiento de datos personales

**Versión:** 1.1 (27/10/2026)

**Fuentes:** Ley 1581 de 2012 y Decreto 1377 de 2013 sobre protección de datos personales  
Elicitación con docentes del programa

**Objetivos asociados:** OBJ-03: Registrar y controlar la ejecución real de las clases  
OBJ-08: Medir el logro de los RAP y soportar el análisis y la mejora continua

**Requisitos asociados:** RF-22: Registro de observaciones y de estudiantes ausentes  
RF-24: Carga de evidencias fotográficas por RAP  
RF-30: Registro de la valoración de los estudiantes por indicador de desempeño  
RF-32: Reporte de logro de los RAP del programa

**Descripción:** El sistema administrará datos personales de docentes y estudiantes, incluidos registros de inasistencia, imágenes y valoraciones individuales de desempeño por indicador. Su recolección, almacenamiento y consulta deberán limitarse a los roles autorizados, contar con la autorización correspondiente y sujetarse a la política institucional de tratamiento de datos personales. Los reportes consolidados de logro de los RAP deberán presentarse de forma agregada, sin identificar al estudiante.

**Importancia:** Alta

**Urgencia:** Media

**Estado:** Especificado

**Estabilidad:** Media

**Comentarios:** Requisito identificado por el equipo investigador a partir del alcance de RF-22, RF-24 y RF-30. La rúbrica RAP 2 recibida como insumo contiene nombres reales de estudiantes con sus valoraciones, por lo que, de incluirse como anexo de la tesis, deberá anonimizarse conforme a la Ley 1581 de 2012. Debe validarse con la Universidad antes de la puesta en producción de la versión beta.

---
