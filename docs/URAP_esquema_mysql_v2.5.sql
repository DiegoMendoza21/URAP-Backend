-- SQL dump generated using DBML (dbml.dbdiagram.io)
-- Database: MySQL
-- Generated at: 2026-11-07T21:28:52.991Z

CREATE TABLE `rol` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `nombre` varchar(255) UNIQUE,
  `descripcion` varchar(255),
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `usuario` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `nombres` varchar(255),
  `apellidos` varchar(255),
  `email` varchar(255) UNIQUE,
  `password_hash` varchar(255),
  `identificacion` varchar(255) UNIQUE,
  `id_programa` integer,
  `activo` boolean DEFAULT true,
  `ultimo_acceso` datetime,
  `intentos_fallidos` integer DEFAULT 0,
  `bloqueado_hasta` datetime,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `usuario_rol` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_usuario` integer,
  `id_rol` integer,
  `id_programa` integer,
  `activo` boolean DEFAULT true,
  `id_asignado_por` integer,
  `fecha_asignacion` datetime,
  `fecha_revocacion` datetime
);

CREATE TABLE `sesion` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_usuario` integer,
  `jti` varchar(255) UNIQUE,
  `emitida_en` datetime,
  `expira_en` datetime,
  `revocada_en` datetime,
  `motivo_revocacion` varchar(255),
  `ip` varchar(255),
  `user_agent` varchar(255)
);

CREATE TABLE `modulo` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `codigo` varchar(255) UNIQUE,
  `nombre` varchar(255),
  `orden` integer
);

CREATE TABLE `permiso` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `codigo` varchar(255) UNIQUE,
  `nombre` varchar(255)
);

CREATE TABLE `rol_permiso` (
  `id_rol` integer,
  `id_modulo` integer,
  `id_permiso` integer,
  PRIMARY KEY (`id_rol`, `id_modulo`, `id_permiso`)
);

CREATE TABLE `facultad` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `nombre` varchar(255) UNIQUE,
  `id_decano` integer,
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `programa` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_facultad` integer,
  `nombre` varchar(255),
  `codigo` varchar(255),
  `id_director` integer,
  `id_escala_activa` integer,
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `plan_estudio` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_programa` integer,
  `codigo` varchar(255),
  `nombre` varchar(255),
  `estado` varchar(255) DEFAULT 'vigente',
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `asignatura` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_plan_estudio` integer,
  `codigo_interno` varchar(255),
  `nombre` varchar(255),
  `semestre` integer,
  `componente` varchar(255),
  `tipo_curso` varchar(255),
  `creditos` integer,
  `horas_ti` integer,
  `horas_tde` integer,
  `horas_tdp` integer,
  `horas_totales` integer,
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `asignatura_requisito` (
  `id_asignatura` integer,
  `id_asignatura_requerida` integer,
  `tipo` varchar(255),
  PRIMARY KEY (`id_asignatura`, `id_asignatura_requerida`, `tipo`)
);

CREATE TABLE `periodo_academico` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `codigo` varchar(255) UNIQUE,
  `fecha_inicio` date,
  `fecha_fin` date,
  `numero_semanas` integer,
  `activo` boolean DEFAULT true,
  `cerrado` boolean DEFAULT false
);

CREATE TABLE `dia_festivo` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `fecha` date,
  `nombre` varchar(255),
  `anio` integer,
  `origen` varchar(255),
  `created_at` datetime DEFAULT (now())
);

CREATE TABLE `rap` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_programa` integer,
  `codigo` varchar(255),
  `numero` integer,
  `descripcion` text,
  `competencia_asociada` varchar(255),
  `perfil_egreso` text,
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `asignatura_rap` (
  `id_asignatura` integer,
  `id_rap` integer,
  `activo` boolean DEFAULT true,
  PRIMARY KEY (`id_asignatura`, `id_rap`)
);

CREATE TABLE `indicador_rap` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_rap` integer,
  `numero` integer,
  `descripcion` text,
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `escala_valoracion` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_programa` integer,
  `nombre` varchar(255),
  `numero_niveles` integer,
  `umbral_cumplimiento` integer,
  `porcentaje_esperado` decimal(5,2),
  `vigente` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now())
);

CREATE TABLE `nivel_escala` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_escala` integer,
  `valor` integer,
  `etiqueta` varchar(255),
  `descripcion` text
);

CREATE TABLE `rubrica` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_rap` integer,
  `id_escala` integer,
  `version` integer,
  `estado` varchar(255),
  `id_creado_por` integer,
  `fecha_vigencia_inicio` date,
  `fecha_vigencia_fin` date,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `rubrica_descriptor` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_rubrica` integer,
  `id_indicador` integer,
  `id_nivel` integer,
  `descripcion` text
);

CREATE TABLE `lider_rap` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_rap` integer,
  `id_usuario` integer,
  `id_periodo` integer,
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `estado_proyecto` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `codigo` varchar(255) UNIQUE,
  `nombre` varchar(255),
  `descripcion` varchar(255),
  `orden` integer,
  `permite_edicion` boolean
);

CREATE TABLE `proyecto_docente` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_asignatura` integer,
  `id_periodo` integer,
  `id_estado` integer,
  `grupo` varchar(255),
  `descripcion` text,
  `id_proyecto_origen` integer,
  `origen` varchar(255),
  `id_creado_por` integer,
  `fecha_envio` datetime,
  `fecha_aprobacion` datetime,
  `fecha_creacion` datetime,
  `fecha_actualizacion` datetime
);

CREATE TABLE `proyecto_docente_docente` (
  `id_proyecto_docente` integer,
  `id_usuario` integer,
  `responsable` boolean DEFAULT false,
  `orden` integer,
  PRIMARY KEY (`id_proyecto_docente`, `id_usuario`)
);

CREATE TABLE `proyecto_docente_rap` (
  `id_proyecto_docente` integer,
  `id_rap` integer,
  `id_rubrica` integer,
  PRIMARY KEY (`id_proyecto_docente`, `id_rap`)
);

CREATE TABLE `plan_curso` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer UNIQUE,
  `recursos_educativos` text,
  `observaciones_iniciales` text,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `rac` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `codigo` varchar(255),
  `descripcion` text,
  `orden` integer,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `rac_rap` (
  `id_rac` integer,
  `id_rap` integer,
  `descripcion_contribucion` text,
  PRIMARY KEY (`id_rac`, `id_rap`)
);

CREATE TABLE `evaluacion_rac` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_rac` integer,
  `instrumento` varchar(255),
  `descripcion` text,
  `porcentaje` decimal(5,2),
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `estrategia_metodologica` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `descripcion` text,
  `orden` integer,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `contenido_programatico` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `semana` integer,
  `tema` varchar(255),
  `horas_tde` integer,
  `horas_tdp` integer,
  `horas_ti` integer,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `bibliografia` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `referencia` text,
  `orden` integer,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `revision_proyecto` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `id_usuario` integer,
  `tipo` varchar(255),
  `resultado` varchar(255),
  `id_estado_anterior` integer,
  `id_estado_nuevo` integer,
  `observacion_general` text,
  `fecha` datetime
);

CREATE TABLE `observacion_revision` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_revision` integer,
  `seccion` varchar(255),
  `observacion` text,
  `resuelta` boolean DEFAULT false
);

CREATE TABLE `horario_curso` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `dia_semana` integer,
  `hora_inicio` time,
  `hora_fin` time
);

CREATE TABLE `tipo_sesion` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `codigo` varchar(255) UNIQUE,
  `nombre` varchar(255),
  `exige_tema` boolean,
  `cuenta_como_dictada` boolean,
  `activo` boolean DEFAULT true
);

CREATE TABLE `sesion_clase` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `id_tipo_sesion` integer,
  `semana` integer,
  `fecha` date,
  `dia_semana` integer,
  `estado` varchar(255),
  `descripcion` varchar(255),
  `observaciones` text,
  `id_dia_festivo` integer,
  `id_registrado_por` integer,
  `fecha_registro` datetime,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `sesion_tema` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_sesion` integer,
  `id_contenido` integer,
  `tema_adicional` varchar(255)
);

CREATE TABLE `estudiante` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_usuario` integer,
  `identificacion` varchar(255) UNIQUE,
  `nombres` varchar(255),
  `apellidos` varchar(255),
  `email` varchar(255),
  `id_programa` integer,
  `activo` boolean DEFAULT true,
  `created_at` datetime DEFAULT (now())
);

CREATE TABLE `matricula` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `id_estudiante` integer,
  `estado` varchar(255),
  `fecha_carga` datetime,
  `id_cargado_por` integer
);

CREATE TABLE `inasistencia` (
  `id_sesion` integer,
  `id_matricula` integer,
  `justificada` boolean DEFAULT false,
  `observacion` varchar(255),
  PRIMARY KEY (`id_sesion`, `id_matricula`)
);

CREATE TABLE `medicion_rap` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `id_rap` integer,
  `id_rubrica` integer,
  `tipo_valoracion` varchar(255),
  `periodo_toma` varchar(255),
  `anio_toma` integer,
  `tamano_cohorte` integer,
  `porcentaje_esperado` decimal(5,2),
  `estado` varchar(255),
  `acciones_implementadas` text,
  `resultados_obtenidos` text,
  `acciones_propuestas` text,
  `id_registrado_por` integer,
  `id_cerrado_por` integer,
  `fecha_cierre` datetime,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime
);

CREATE TABLE `medicion_indicador` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_medicion` integer,
  `id_indicador` integer,
  `instrumento` varchar(255),
  `descripcion_instrumento` text
);

CREATE TABLE `valoracion_estudiante` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_medicion_indicador` integer,
  `id_matricula` integer,
  `id_nivel` integer
);

CREATE TABLE `evidencia_rap` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `id_rap` integer,
  `id_sesion` integer,
  `nombre_original` varchar(255),
  `url` varchar(255),
  `tipo` varchar(255),
  `tamano_bytes` integer,
  `descripcion` text,
  `fecha` date,
  `id_subido_por` integer,
  `fecha_subida` datetime
);

CREATE TABLE `documento_soporte` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_proyecto_docente` integer,
  `id_subido_por` integer,
  `nombre_original` varchar(255),
  `url` varchar(255),
  `tipo` varchar(255),
  `categoria` varchar(255),
  `tamano_bytes` integer,
  `descripcion` text,
  `fecha_subida` datetime
);

CREATE TABLE `tipo_notificacion` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `codigo` varchar(255) UNIQUE,
  `nombre` varchar(255),
  `plantilla` text,
  `envia_email` boolean DEFAULT true,
  `activo` boolean DEFAULT true
);

CREATE TABLE `notificacion` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_tipo_notificacion` integer,
  `id_usuario` integer,
  `titulo` varchar(255),
  `mensaje` text,
  `entidad` varchar(255),
  `id_entidad` integer,
  `url_destino` varchar(255),
  `leida` boolean DEFAULT false,
  `fecha_lectura` datetime,
  `estado_envio` varchar(255),
  `intentos` integer DEFAULT 0,
  `fecha_envio` datetime,
  `created_at` datetime DEFAULT (now())
);

CREATE TABLE `reporte_academico` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_programa` integer,
  `id_periodo` integer,
  `id_generado_por` integer,
  `nombre` varchar(255),
  `tipo` varchar(255),
  `parametros` json,
  `url` varchar(255),
  `fecha_generacion` datetime
);

CREATE TABLE `auditoria` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `id_usuario` integer,
  `accion` varchar(255),
  `tabla_afectada` varchar(255),
  `id_registro` integer,
  `valor_anterior` json,
  `valor_nuevo` json,
  `fecha` datetime,
  `ip` varchar(255)
);

CREATE TABLE `parametro_sistema` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `clave` varchar(255) UNIQUE,
  `valor` varchar(255),
  `tipo_dato` varchar(255),
  `descripcion` varchar(255),
  `id_actualizado_por` integer,
  `updated_at` datetime
);

CREATE UNIQUE INDEX `usuario_rol_index_0` ON `usuario_rol` (`id_usuario`, `id_rol`, `id_programa`);

CREATE INDEX `sesion_index_1` ON `sesion` (`id_usuario`, `revocada_en`);

CREATE UNIQUE INDEX `programa_index_2` ON `programa` (`id_facultad`, `nombre`);

CREATE UNIQUE INDEX `plan_estudio_index_3` ON `plan_estudio` (`id_programa`, `codigo`);

CREATE UNIQUE INDEX `asignatura_index_4` ON `asignatura` (`id_plan_estudio`, `codigo_interno`);

CREATE UNIQUE INDEX `dia_festivo_index_5` ON `dia_festivo` (`fecha`);

CREATE UNIQUE INDEX `rap_index_6` ON `rap` (`id_programa`, `codigo`);

CREATE UNIQUE INDEX `indicador_rap_index_7` ON `indicador_rap` (`id_rap`, `numero`);

CREATE UNIQUE INDEX `nivel_escala_index_8` ON `nivel_escala` (`id_escala`, `valor`);

CREATE UNIQUE INDEX `rubrica_index_9` ON `rubrica` (`id_rap`, `version`);

CREATE UNIQUE INDEX `rubrica_descriptor_index_10` ON `rubrica_descriptor` (`id_rubrica`, `id_indicador`, `id_nivel`);

CREATE UNIQUE INDEX `lider_rap_index_11` ON `lider_rap` (`id_rap`, `id_usuario`, `id_periodo`);

CREATE UNIQUE INDEX `proyecto_docente_index_12` ON `proyecto_docente` (`id_asignatura`, `id_periodo`, `grupo`);

CREATE UNIQUE INDEX `contenido_programatico_index_13` ON `contenido_programatico` (`id_proyecto_docente`, `semana`);

CREATE UNIQUE INDEX `sesion_clase_index_14` ON `sesion_clase` (`id_proyecto_docente`, `fecha`);

CREATE UNIQUE INDEX `matricula_index_15` ON `matricula` (`id_proyecto_docente`, `id_estudiante`);

CREATE UNIQUE INDEX `medicion_rap_index_16` ON `medicion_rap` (`id_proyecto_docente`, `id_rap`, `tipo_valoracion`, `anio_toma`);

CREATE UNIQUE INDEX `medicion_indicador_index_17` ON `medicion_indicador` (`id_medicion`, `id_indicador`);

CREATE UNIQUE INDEX `valoracion_estudiante_index_18` ON `valoracion_estudiante` (`id_medicion_indicador`, `id_matricula`);

ALTER TABLE `usuario_rol` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `usuario_rol` ADD FOREIGN KEY (`id_rol`) REFERENCES `rol` (`id`);

ALTER TABLE `usuario_rol` ADD FOREIGN KEY (`id_programa`) REFERENCES `programa` (`id`);

ALTER TABLE `usuario_rol` ADD FOREIGN KEY (`id_asignado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `usuario` ADD FOREIGN KEY (`id_programa`) REFERENCES `programa` (`id`);

ALTER TABLE `sesion` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `rol_permiso` ADD FOREIGN KEY (`id_rol`) REFERENCES `rol` (`id`);

ALTER TABLE `rol_permiso` ADD FOREIGN KEY (`id_modulo`) REFERENCES `modulo` (`id`);

ALTER TABLE `rol_permiso` ADD FOREIGN KEY (`id_permiso`) REFERENCES `permiso` (`id`);

ALTER TABLE `facultad` ADD FOREIGN KEY (`id_decano`) REFERENCES `usuario` (`id`);

ALTER TABLE `programa` ADD FOREIGN KEY (`id_facultad`) REFERENCES `facultad` (`id`);

ALTER TABLE `programa` ADD FOREIGN KEY (`id_director`) REFERENCES `usuario` (`id`);

ALTER TABLE `programa` ADD FOREIGN KEY (`id_escala_activa`) REFERENCES `escala_valoracion` (`id`);

ALTER TABLE `plan_estudio` ADD FOREIGN KEY (`id_programa`) REFERENCES `programa` (`id`);

ALTER TABLE `asignatura` ADD FOREIGN KEY (`id_plan_estudio`) REFERENCES `plan_estudio` (`id`);

ALTER TABLE `asignatura_requisito` ADD FOREIGN KEY (`id_asignatura`) REFERENCES `asignatura` (`id`);

ALTER TABLE `asignatura_requisito` ADD FOREIGN KEY (`id_asignatura_requerida`) REFERENCES `asignatura` (`id`);

ALTER TABLE `rap` ADD FOREIGN KEY (`id_programa`) REFERENCES `programa` (`id`);

ALTER TABLE `asignatura_rap` ADD FOREIGN KEY (`id_asignatura`) REFERENCES `asignatura` (`id`);

ALTER TABLE `asignatura_rap` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `indicador_rap` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `escala_valoracion` ADD FOREIGN KEY (`id_programa`) REFERENCES `programa` (`id`);

ALTER TABLE `nivel_escala` ADD FOREIGN KEY (`id_escala`) REFERENCES `escala_valoracion` (`id`);

ALTER TABLE `rubrica` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `rubrica` ADD FOREIGN KEY (`id_escala`) REFERENCES `escala_valoracion` (`id`);

ALTER TABLE `rubrica` ADD FOREIGN KEY (`id_creado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `rubrica_descriptor` ADD FOREIGN KEY (`id_rubrica`) REFERENCES `rubrica` (`id`);

ALTER TABLE `rubrica_descriptor` ADD FOREIGN KEY (`id_indicador`) REFERENCES `indicador_rap` (`id`);

ALTER TABLE `rubrica_descriptor` ADD FOREIGN KEY (`id_nivel`) REFERENCES `nivel_escala` (`id`);

ALTER TABLE `lider_rap` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `lider_rap` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `lider_rap` ADD FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico` (`id`);

ALTER TABLE `proyecto_docente` ADD FOREIGN KEY (`id_asignatura`) REFERENCES `asignatura` (`id`);

ALTER TABLE `proyecto_docente` ADD FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico` (`id`);

ALTER TABLE `proyecto_docente` ADD FOREIGN KEY (`id_estado`) REFERENCES `estado_proyecto` (`id`);

ALTER TABLE `proyecto_docente` ADD FOREIGN KEY (`id_proyecto_origen`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `proyecto_docente` ADD FOREIGN KEY (`id_creado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `proyecto_docente_docente` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `proyecto_docente_docente` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `proyecto_docente_rap` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `proyecto_docente_rap` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `proyecto_docente_rap` ADD FOREIGN KEY (`id_rubrica`) REFERENCES `rubrica` (`id`);

ALTER TABLE `plan_curso` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `rac` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `rac_rap` ADD FOREIGN KEY (`id_rac`) REFERENCES `rac` (`id`);

ALTER TABLE `rac_rap` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `evaluacion_rac` ADD FOREIGN KEY (`id_rac`) REFERENCES `rac` (`id`);

ALTER TABLE `estrategia_metodologica` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `contenido_programatico` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `bibliografia` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `revision_proyecto` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `revision_proyecto` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `revision_proyecto` ADD FOREIGN KEY (`id_estado_anterior`) REFERENCES `estado_proyecto` (`id`);

ALTER TABLE `revision_proyecto` ADD FOREIGN KEY (`id_estado_nuevo`) REFERENCES `estado_proyecto` (`id`);

ALTER TABLE `observacion_revision` ADD FOREIGN KEY (`id_revision`) REFERENCES `revision_proyecto` (`id`);

ALTER TABLE `horario_curso` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `sesion_clase` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `sesion_clase` ADD FOREIGN KEY (`id_tipo_sesion`) REFERENCES `tipo_sesion` (`id`);

ALTER TABLE `sesion_clase` ADD FOREIGN KEY (`id_dia_festivo`) REFERENCES `dia_festivo` (`id`);

ALTER TABLE `sesion_clase` ADD FOREIGN KEY (`id_registrado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `sesion_tema` ADD FOREIGN KEY (`id_sesion`) REFERENCES `sesion_clase` (`id`);

ALTER TABLE `sesion_tema` ADD FOREIGN KEY (`id_contenido`) REFERENCES `contenido_programatico` (`id`);

ALTER TABLE `estudiante` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `estudiante` ADD FOREIGN KEY (`id_programa`) REFERENCES `programa` (`id`);

ALTER TABLE `matricula` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `matricula` ADD FOREIGN KEY (`id_estudiante`) REFERENCES `estudiante` (`id`);

ALTER TABLE `matricula` ADD FOREIGN KEY (`id_cargado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `inasistencia` ADD FOREIGN KEY (`id_sesion`) REFERENCES `sesion_clase` (`id`);

ALTER TABLE `inasistencia` ADD FOREIGN KEY (`id_matricula`) REFERENCES `matricula` (`id`);

ALTER TABLE `medicion_rap` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `medicion_rap` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `medicion_rap` ADD FOREIGN KEY (`id_rubrica`) REFERENCES `rubrica` (`id`);

ALTER TABLE `medicion_rap` ADD FOREIGN KEY (`id_registrado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `medicion_rap` ADD FOREIGN KEY (`id_cerrado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `medicion_indicador` ADD FOREIGN KEY (`id_medicion`) REFERENCES `medicion_rap` (`id`);

ALTER TABLE `medicion_indicador` ADD FOREIGN KEY (`id_indicador`) REFERENCES `indicador_rap` (`id`);

ALTER TABLE `valoracion_estudiante` ADD FOREIGN KEY (`id_medicion_indicador`) REFERENCES `medicion_indicador` (`id`);

ALTER TABLE `valoracion_estudiante` ADD FOREIGN KEY (`id_matricula`) REFERENCES `matricula` (`id`);

ALTER TABLE `valoracion_estudiante` ADD FOREIGN KEY (`id_nivel`) REFERENCES `nivel_escala` (`id`);

ALTER TABLE `evidencia_rap` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `evidencia_rap` ADD FOREIGN KEY (`id_rap`) REFERENCES `rap` (`id`);

ALTER TABLE `evidencia_rap` ADD FOREIGN KEY (`id_sesion`) REFERENCES `sesion_clase` (`id`);

ALTER TABLE `evidencia_rap` ADD FOREIGN KEY (`id_subido_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `documento_soporte` ADD FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente` (`id`);

ALTER TABLE `documento_soporte` ADD FOREIGN KEY (`id_subido_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `notificacion` ADD FOREIGN KEY (`id_tipo_notificacion`) REFERENCES `tipo_notificacion` (`id`);

ALTER TABLE `notificacion` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `reporte_academico` ADD FOREIGN KEY (`id_programa`) REFERENCES `programa` (`id`);

ALTER TABLE `reporte_academico` ADD FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico` (`id`);

ALTER TABLE `reporte_academico` ADD FOREIGN KEY (`id_generado_por`) REFERENCES `usuario` (`id`);

ALTER TABLE `auditoria` ADD FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id`);

ALTER TABLE `parametro_sistema` ADD FOREIGN KEY (`id_actualizado_por`) REFERENCES `usuario` (`id`);
