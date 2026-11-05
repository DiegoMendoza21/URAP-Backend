-- CreateTable
CREATE TABLE `asignatura` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_programa` INTEGER NULL,
    `codigo_interno` VARCHAR(255) NULL,
    `nombre` VARCHAR(255) NULL,
    `semestre` INTEGER NULL,
    `componente` VARCHAR(255) NULL,
    `tipo_curso` VARCHAR(255) NULL,
    `creditos` INTEGER NULL,
    `horas_ti` INTEGER NULL,
    `horas_tde` INTEGER NULL,
    `horas_tdp` INTEGER NULL,
    `horas_totales` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `asignatura_index_3`(`id_programa`, `codigo_interno`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asignatura_rap` (
    `id_asignatura` INTEGER NOT NULL,
    `id_rap` INTEGER NOT NULL,
    `activo` BOOLEAN NULL DEFAULT true,

    INDEX `id_rap`(`id_rap`),
    PRIMARY KEY (`id_asignatura`, `id_rap`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asignatura_requisito` (
    `id_asignatura` INTEGER NOT NULL,
    `id_asignatura_requerida` INTEGER NOT NULL,
    `tipo` VARCHAR(255) NOT NULL,

    INDEX `id_asignatura_requerida`(`id_asignatura_requerida`),
    PRIMARY KEY (`id_asignatura`, `id_asignatura_requerida`, `tipo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NULL,
    `accion` VARCHAR(255) NULL,
    `tabla_afectada` VARCHAR(255) NULL,
    `id_registro` INTEGER NULL,
    `valor_anterior` JSON NULL,
    `valor_nuevo` JSON NULL,
    `fecha` DATETIME(0) NULL,
    `ip` VARCHAR(255) NULL,

    INDEX `id_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bibliografia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `referencia` TEXT NULL,
    `orden` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contenido_programatico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `semana` INTEGER NULL,
    `tema` VARCHAR(255) NULL,
    `horas_tde` INTEGER NULL,
    `horas_tdp` INTEGER NULL,
    `horas_ti` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `contenido_programatico_index_12`(`id_proyecto_docente`, `semana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dia_festivo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NULL,
    `nombre` VARCHAR(255) NULL,
    `anio` INTEGER NULL,
    `origen` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),

    UNIQUE INDEX `dia_festivo_index_4`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documento_soporte` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `id_subido_por` INTEGER NULL,
    `nombre_original` VARCHAR(255) NULL,
    `url` VARCHAR(255) NULL,
    `tipo` VARCHAR(255) NULL,
    `categoria` VARCHAR(255) NULL,
    `tamano_bytes` INTEGER NULL,
    `descripcion` TEXT NULL,
    `fecha_subida` DATETIME(0) NULL,

    INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    INDEX `id_subido_por`(`id_subido_por`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `escala_valoracion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_programa` INTEGER NULL,
    `nombre` VARCHAR(255) NULL,
    `numero_niveles` INTEGER NULL,
    `umbral_cumplimiento` INTEGER NULL,
    `porcentaje_esperado` DECIMAL(5, 2) NULL,
    `vigente` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),

    INDEX `id_programa`(`id_programa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estado_proyecto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(255) NULL,
    `nombre` VARCHAR(255) NULL,
    `descripcion` VARCHAR(255) NULL,
    `orden` INTEGER NULL,
    `permite_edicion` BOOLEAN NULL,

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estrategia_metodologica` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `descripcion` TEXT NULL,
    `orden` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estudiante` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NULL,
    `identificacion` VARCHAR(255) NULL,
    `nombres` VARCHAR(255) NULL,
    `apellidos` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `id_programa` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),

    UNIQUE INDEX `identificacion`(`identificacion`),
    INDEX `id_programa`(`id_programa`),
    INDEX `id_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evaluacion_rac` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_rac` INTEGER NULL,
    `instrumento` VARCHAR(255) NULL,
    `descripcion` TEXT NULL,
    `porcentaje` DECIMAL(5, 2) NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_rac`(`id_rac`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidencia_rap` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `id_rap` INTEGER NULL,
    `id_sesion` INTEGER NULL,
    `nombre_original` VARCHAR(255) NULL,
    `url` VARCHAR(255) NULL,
    `tipo` VARCHAR(255) NULL,
    `tamano_bytes` INTEGER NULL,
    `descripcion` TEXT NULL,
    `fecha` DATE NULL,
    `id_subido_por` INTEGER NULL,
    `fecha_subida` DATETIME(0) NULL,

    INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    INDEX `id_rap`(`id_rap`),
    INDEX `id_sesion`(`id_sesion`),
    INDEX `id_subido_por`(`id_subido_por`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `facultad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(255) NULL,
    `id_decano` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `nombre`(`nombre`),
    INDEX `id_decano`(`id_decano`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horario_curso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `dia_semana` INTEGER NULL,
    `hora_inicio` TIME(0) NULL,
    `hora_fin` TIME(0) NULL,

    INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inasistencia` (
    `id_sesion` INTEGER NOT NULL,
    `id_matricula` INTEGER NOT NULL,
    `justificada` BOOLEAN NULL DEFAULT false,
    `observacion` VARCHAR(255) NULL,

    INDEX `id_matricula`(`id_matricula`),
    PRIMARY KEY (`id_sesion`, `id_matricula`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `indicador_rap` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_rap` INTEGER NULL,
    `numero` INTEGER NULL,
    `descripcion` TEXT NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `indicador_rap_index_6`(`id_rap`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lider_rap` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_rap` INTEGER NULL,
    `id_usuario` INTEGER NULL,
    `id_periodo` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_periodo`(`id_periodo`),
    INDEX `id_usuario`(`id_usuario`),
    UNIQUE INDEX `lider_rap_index_10`(`id_rap`, `id_usuario`, `id_periodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `matricula` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `id_estudiante` INTEGER NULL,
    `estado` VARCHAR(255) NULL,
    `fecha_carga` DATETIME(0) NULL,
    `id_cargado_por` INTEGER NULL,

    INDEX `id_cargado_por`(`id_cargado_por`),
    INDEX `id_estudiante`(`id_estudiante`),
    UNIQUE INDEX `matricula_index_14`(`id_proyecto_docente`, `id_estudiante`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicion_indicador` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_medicion` INTEGER NULL,
    `id_indicador` INTEGER NULL,
    `instrumento` VARCHAR(255) NULL,
    `descripcion_instrumento` TEXT NULL,

    INDEX `id_indicador`(`id_indicador`),
    UNIQUE INDEX `medicion_indicador_index_16`(`id_medicion`, `id_indicador`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medicion_rap` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `id_rap` INTEGER NULL,
    `id_rubrica` INTEGER NULL,
    `tipo_valoracion` VARCHAR(255) NULL,
    `periodo_toma` VARCHAR(255) NULL,
    `anio_toma` INTEGER NULL,
    `tamano_cohorte` INTEGER NULL,
    `porcentaje_esperado` DECIMAL(5, 2) NULL,
    `estado` VARCHAR(255) NULL,
    `acciones_implementadas` TEXT NULL,
    `resultados_obtenidos` TEXT NULL,
    `acciones_propuestas` TEXT NULL,
    `id_registrado_por` INTEGER NULL,
    `id_cerrado_por` INTEGER NULL,
    `fecha_cierre` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_cerrado_por`(`id_cerrado_por`),
    INDEX `id_rap`(`id_rap`),
    INDEX `id_registrado_por`(`id_registrado_por`),
    INDEX `id_rubrica`(`id_rubrica`),
    UNIQUE INDEX `medicion_rap_index_15`(`id_proyecto_docente`, `id_rap`, `tipo_valoracion`, `anio_toma`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `modulo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(255) NULL,
    `nombre` VARCHAR(255) NULL,
    `orden` INTEGER NULL,

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nivel_escala` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_escala` INTEGER NULL,
    `valor` INTEGER NULL,
    `etiqueta` VARCHAR(255) NULL,
    `descripcion` TEXT NULL,

    UNIQUE INDEX `nivel_escala_index_7`(`id_escala`, `valor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tipo_notificacion` INTEGER NULL,
    `id_usuario` INTEGER NULL,
    `titulo` VARCHAR(255) NULL,
    `mensaje` TEXT NULL,
    `entidad` VARCHAR(255) NULL,
    `id_entidad` INTEGER NULL,
    `url_destino` VARCHAR(255) NULL,
    `leida` BOOLEAN NULL DEFAULT false,
    `fecha_lectura` DATETIME(0) NULL,
    `estado_envio` VARCHAR(255) NULL,
    `intentos` INTEGER NULL DEFAULT 0,
    `fecha_envio` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),

    INDEX `id_tipo_notificacion`(`id_tipo_notificacion`),
    INDEX `id_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `observacion_revision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_revision` INTEGER NULL,
    `seccion` VARCHAR(255) NULL,
    `observacion` TEXT NULL,
    `resuelta` BOOLEAN NULL DEFAULT false,

    INDEX `id_revision`(`id_revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parametro_sistema` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clave` VARCHAR(255) NULL,
    `valor` VARCHAR(255) NULL,
    `tipo_dato` VARCHAR(255) NULL,
    `descripcion` VARCHAR(255) NULL,
    `id_actualizado_por` INTEGER NULL,
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `clave`(`clave`),
    INDEX `id_actualizado_por`(`id_actualizado_por`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `periodo_academico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(255) NULL,
    `fecha_inicio` DATE NULL,
    `fecha_fin` DATE NULL,
    `numero_semanas` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `cerrado` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permiso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(255) NULL,
    `nombre` VARCHAR(255) NULL,

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_curso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `recursos_educativos` TEXT NULL,
    `observaciones_iniciales` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `programa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_facultad` INTEGER NULL,
    `nombre` VARCHAR(255) NULL,
    `codigo` VARCHAR(255) NULL,
    `id_director` INTEGER NULL,
    `id_escala_activa` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_director`(`id_director`),
    INDEX `id_escala_activa`(`id_escala_activa`),
    UNIQUE INDEX `programa_index_2`(`id_facultad`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proyecto_docente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_asignatura` INTEGER NULL,
    `id_periodo` INTEGER NULL,
    `id_estado` INTEGER NULL,
    `grupo` VARCHAR(255) NULL,
    `descripcion` TEXT NULL,
    `id_proyecto_origen` INTEGER NULL,
    `origen` VARCHAR(255) NULL,
    `id_creado_por` INTEGER NULL,
    `fecha_envio` DATETIME(0) NULL,
    `fecha_aprobacion` DATETIME(0) NULL,
    `fecha_creacion` DATETIME(0) NULL,
    `fecha_actualizacion` DATETIME(0) NULL,

    INDEX `id_creado_por`(`id_creado_por`),
    INDEX `id_estado`(`id_estado`),
    INDEX `id_periodo`(`id_periodo`),
    INDEX `id_proyecto_origen`(`id_proyecto_origen`),
    UNIQUE INDEX `proyecto_docente_index_11`(`id_asignatura`, `id_periodo`, `grupo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proyecto_docente_docente` (
    `id_proyecto_docente` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `responsable` BOOLEAN NULL DEFAULT false,
    `orden` INTEGER NULL,

    INDEX `id_usuario`(`id_usuario`),
    PRIMARY KEY (`id_proyecto_docente`, `id_usuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proyecto_docente_rap` (
    `id_proyecto_docente` INTEGER NOT NULL,
    `id_rap` INTEGER NOT NULL,
    `id_rubrica` INTEGER NULL,

    INDEX `id_rap`(`id_rap`),
    INDEX `id_rubrica`(`id_rubrica`),
    PRIMARY KEY (`id_proyecto_docente`, `id_rap`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rac` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `codigo` VARCHAR(255) NULL,
    `descripcion` TEXT NULL,
    `orden` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rac_rap` (
    `id_rac` INTEGER NOT NULL,
    `id_rap` INTEGER NOT NULL,
    `descripcion_contribucion` TEXT NULL,

    INDEX `id_rap`(`id_rap`),
    PRIMARY KEY (`id_rac`, `id_rap`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rap` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_programa` INTEGER NULL,
    `codigo` VARCHAR(255) NULL,
    `numero` INTEGER NULL,
    `descripcion` TEXT NULL,
    `competencia_asociada` VARCHAR(255) NULL,
    `perfil_egreso` TEXT NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `rap_index_5`(`id_programa`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reporte_academico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_programa` INTEGER NULL,
    `id_periodo` INTEGER NULL,
    `id_generado_por` INTEGER NULL,
    `nombre` VARCHAR(255) NULL,
    `tipo` VARCHAR(255) NULL,
    `parametros` JSON NULL,
    `url` VARCHAR(255) NULL,
    `fecha_generacion` DATETIME(0) NULL,

    INDEX `id_generado_por`(`id_generado_por`),
    INDEX `id_periodo`(`id_periodo`),
    INDEX `id_programa`(`id_programa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `revision_proyecto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `id_usuario` INTEGER NULL,
    `tipo` VARCHAR(255) NULL,
    `resultado` VARCHAR(255) NULL,
    `id_estado_anterior` INTEGER NULL,
    `id_estado_nuevo` INTEGER NULL,
    `observacion_general` TEXT NULL,
    `fecha` DATETIME(0) NULL,

    INDEX `id_estado_anterior`(`id_estado_anterior`),
    INDEX `id_estado_nuevo`(`id_estado_nuevo`),
    INDEX `id_proyecto_docente`(`id_proyecto_docente`),
    INDEX `id_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rol` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(255) NULL,
    `descripcion` VARCHAR(255) NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `nombre`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rol_permiso` (
    `id_rol` INTEGER NOT NULL,
    `id_modulo` INTEGER NOT NULL,
    `id_permiso` INTEGER NOT NULL,

    INDEX `id_modulo`(`id_modulo`),
    INDEX `id_permiso`(`id_permiso`),
    PRIMARY KEY (`id_rol`, `id_modulo`, `id_permiso`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubrica` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_rap` INTEGER NULL,
    `id_escala` INTEGER NULL,
    `version` INTEGER NULL,
    `estado` VARCHAR(255) NULL,
    `id_creado_por` INTEGER NULL,
    `fecha_vigencia_inicio` DATE NULL,
    `fecha_vigencia_fin` DATE NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_creado_por`(`id_creado_por`),
    INDEX `id_escala`(`id_escala`),
    UNIQUE INDEX `rubrica_index_8`(`id_rap`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubrica_descriptor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_rubrica` INTEGER NULL,
    `id_indicador` INTEGER NULL,
    `id_nivel` INTEGER NULL,
    `descripcion` TEXT NULL,

    INDEX `id_indicador`(`id_indicador`),
    INDEX `id_nivel`(`id_nivel`),
    UNIQUE INDEX `rubrica_descriptor_index_9`(`id_rubrica`, `id_indicador`, `id_nivel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NULL,
    `jti` VARCHAR(255) NULL,
    `emitida_en` DATETIME(0) NULL,
    `expira_en` DATETIME(0) NULL,
    `revocada_en` DATETIME(0) NULL,
    `motivo_revocacion` VARCHAR(255) NULL,
    `ip` VARCHAR(255) NULL,
    `user_agent` VARCHAR(255) NULL,

    UNIQUE INDEX `jti`(`jti`),
    INDEX `sesion_index_1`(`id_usuario`, `revocada_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesion_clase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proyecto_docente` INTEGER NULL,
    `id_tipo_sesion` INTEGER NULL,
    `semana` INTEGER NULL,
    `fecha` DATE NULL,
    `dia_semana` INTEGER NULL,
    `estado` VARCHAR(255) NULL,
    `descripcion` VARCHAR(255) NULL,
    `observaciones` TEXT NULL,
    `id_dia_festivo` INTEGER NULL,
    `id_registrado_por` INTEGER NULL,
    `fecha_registro` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    INDEX `id_dia_festivo`(`id_dia_festivo`),
    INDEX `id_registrado_por`(`id_registrado_por`),
    INDEX `id_tipo_sesion`(`id_tipo_sesion`),
    UNIQUE INDEX `sesion_clase_index_13`(`id_proyecto_docente`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesion_tema` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sesion` INTEGER NULL,
    `id_contenido` INTEGER NULL,
    `tema_adicional` VARCHAR(255) NULL,

    INDEX `id_contenido`(`id_contenido`),
    INDEX `id_sesion`(`id_sesion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipo_notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(255) NULL,
    `nombre` VARCHAR(255) NULL,
    `plantilla` TEXT NULL,
    `envia_email` BOOLEAN NULL DEFAULT true,
    `activo` BOOLEAN NULL DEFAULT true,

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipo_sesion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(255) NULL,
    `nombre` VARCHAR(255) NULL,
    `exige_tema` BOOLEAN NULL,
    `cuenta_como_dictada` BOOLEAN NULL,
    `activo` BOOLEAN NULL DEFAULT true,

    UNIQUE INDEX `codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombres` VARCHAR(255) NULL,
    `apellidos` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `password_hash` VARCHAR(255) NULL,
    `identificacion` VARCHAR(255) NULL,
    `id_programa` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `ultimo_acceso` DATETIME(0) NULL,
    `intentos_fallidos` INTEGER NULL DEFAULT 0,
    `bloqueado_hasta` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `email`(`email`),
    UNIQUE INDEX `identificacion`(`identificacion`),
    INDEX `id_programa`(`id_programa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario_rol` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NULL,
    `id_rol` INTEGER NULL,
    `id_programa` INTEGER NULL,
    `activo` BOOLEAN NULL DEFAULT true,
    `id_asignado_por` INTEGER NULL,
    `fecha_asignacion` DATETIME(0) NULL,
    `fecha_revocacion` DATETIME(0) NULL,

    INDEX `id_asignado_por`(`id_asignado_por`),
    INDEX `id_programa`(`id_programa`),
    INDEX `id_rol`(`id_rol`),
    UNIQUE INDEX `usuario_rol_index_0`(`id_usuario`, `id_rol`, `id_programa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `valoracion_estudiante` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_medicion_indicador` INTEGER NULL,
    `id_matricula` INTEGER NULL,
    `id_nivel` INTEGER NULL,

    INDEX `id_matricula`(`id_matricula`),
    INDEX `id_nivel`(`id_nivel`),
    UNIQUE INDEX `valoracion_estudiante_index_17`(`id_medicion_indicador`, `id_matricula`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asignatura` ADD CONSTRAINT `asignatura_ibfk_1` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `asignatura_rap` ADD CONSTRAINT `asignatura_rap_ibfk_1` FOREIGN KEY (`id_asignatura`) REFERENCES `asignatura`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `asignatura_rap` ADD CONSTRAINT `asignatura_rap_ibfk_2` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `asignatura_requisito` ADD CONSTRAINT `asignatura_requisito_ibfk_1` FOREIGN KEY (`id_asignatura`) REFERENCES `asignatura`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `asignatura_requisito` ADD CONSTRAINT `asignatura_requisito_ibfk_2` FOREIGN KEY (`id_asignatura_requerida`) REFERENCES `asignatura`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `auditoria` ADD CONSTRAINT `auditoria_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `bibliografia` ADD CONSTRAINT `bibliografia_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `contenido_programatico` ADD CONSTRAINT `contenido_programatico_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `documento_soporte` ADD CONSTRAINT `documento_soporte_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `documento_soporte` ADD CONSTRAINT `documento_soporte_ibfk_2` FOREIGN KEY (`id_subido_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `escala_valoracion` ADD CONSTRAINT `escala_valoracion_ibfk_1` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `estrategia_metodologica` ADD CONSTRAINT `estrategia_metodologica_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `estudiante` ADD CONSTRAINT `estudiante_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `estudiante` ADD CONSTRAINT `estudiante_ibfk_2` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `evaluacion_rac` ADD CONSTRAINT `evaluacion_rac_ibfk_1` FOREIGN KEY (`id_rac`) REFERENCES `rac`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `evidencia_rap` ADD CONSTRAINT `evidencia_rap_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `evidencia_rap` ADD CONSTRAINT `evidencia_rap_ibfk_2` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `evidencia_rap` ADD CONSTRAINT `evidencia_rap_ibfk_3` FOREIGN KEY (`id_sesion`) REFERENCES `sesion_clase`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `evidencia_rap` ADD CONSTRAINT `evidencia_rap_ibfk_4` FOREIGN KEY (`id_subido_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `facultad` ADD CONSTRAINT `facultad_ibfk_1` FOREIGN KEY (`id_decano`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `horario_curso` ADD CONSTRAINT `horario_curso_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inasistencia` ADD CONSTRAINT `inasistencia_ibfk_1` FOREIGN KEY (`id_sesion`) REFERENCES `sesion_clase`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `inasistencia` ADD CONSTRAINT `inasistencia_ibfk_2` FOREIGN KEY (`id_matricula`) REFERENCES `matricula`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `indicador_rap` ADD CONSTRAINT `indicador_rap_ibfk_1` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lider_rap` ADD CONSTRAINT `lider_rap_ibfk_1` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lider_rap` ADD CONSTRAINT `lider_rap_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lider_rap` ADD CONSTRAINT `lider_rap_ibfk_3` FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `matricula` ADD CONSTRAINT `matricula_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `matricula` ADD CONSTRAINT `matricula_ibfk_2` FOREIGN KEY (`id_estudiante`) REFERENCES `estudiante`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `matricula` ADD CONSTRAINT `matricula_ibfk_3` FOREIGN KEY (`id_cargado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `medicion_indicador` ADD CONSTRAINT `medicion_indicador_ibfk_1` FOREIGN KEY (`id_medicion`) REFERENCES `medicion_rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `medicion_indicador` ADD CONSTRAINT `medicion_indicador_ibfk_2` FOREIGN KEY (`id_indicador`) REFERENCES `indicador_rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `medicion_rap` ADD CONSTRAINT `medicion_rap_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `medicion_rap` ADD CONSTRAINT `medicion_rap_ibfk_2` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `medicion_rap` ADD CONSTRAINT `medicion_rap_ibfk_3` FOREIGN KEY (`id_rubrica`) REFERENCES `rubrica`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `medicion_rap` ADD CONSTRAINT `medicion_rap_ibfk_4` FOREIGN KEY (`id_registrado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `medicion_rap` ADD CONSTRAINT `medicion_rap_ibfk_5` FOREIGN KEY (`id_cerrado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `nivel_escala` ADD CONSTRAINT `nivel_escala_ibfk_1` FOREIGN KEY (`id_escala`) REFERENCES `escala_valoracion`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_ibfk_1` FOREIGN KEY (`id_tipo_notificacion`) REFERENCES `tipo_notificacion`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `observacion_revision` ADD CONSTRAINT `observacion_revision_ibfk_1` FOREIGN KEY (`id_revision`) REFERENCES `revision_proyecto`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `parametro_sistema` ADD CONSTRAINT `parametro_sistema_ibfk_1` FOREIGN KEY (`id_actualizado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `programa` ADD CONSTRAINT `programa_ibfk_1` FOREIGN KEY (`id_facultad`) REFERENCES `facultad`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `programa` ADD CONSTRAINT `programa_ibfk_2` FOREIGN KEY (`id_director`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `programa` ADD CONSTRAINT `programa_ibfk_3` FOREIGN KEY (`id_escala_activa`) REFERENCES `escala_valoracion`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente` ADD CONSTRAINT `proyecto_docente_ibfk_1` FOREIGN KEY (`id_asignatura`) REFERENCES `asignatura`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente` ADD CONSTRAINT `proyecto_docente_ibfk_2` FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente` ADD CONSTRAINT `proyecto_docente_ibfk_3` FOREIGN KEY (`id_estado`) REFERENCES `estado_proyecto`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente` ADD CONSTRAINT `proyecto_docente_ibfk_4` FOREIGN KEY (`id_proyecto_origen`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente` ADD CONSTRAINT `proyecto_docente_ibfk_5` FOREIGN KEY (`id_creado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente` ADD CONSTRAINT `proyecto_docente_ibfk_6` FOREIGN KEY (`id`) REFERENCES `plan_curso`(`id_proyecto_docente`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente_docente` ADD CONSTRAINT `proyecto_docente_docente_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente_docente` ADD CONSTRAINT `proyecto_docente_docente_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente_rap` ADD CONSTRAINT `proyecto_docente_rap_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente_rap` ADD CONSTRAINT `proyecto_docente_rap_ibfk_2` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `proyecto_docente_rap` ADD CONSTRAINT `proyecto_docente_rap_ibfk_3` FOREIGN KEY (`id_rubrica`) REFERENCES `rubrica`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rac` ADD CONSTRAINT `rac_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rac_rap` ADD CONSTRAINT `rac_rap_ibfk_1` FOREIGN KEY (`id_rac`) REFERENCES `rac`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rac_rap` ADD CONSTRAINT `rac_rap_ibfk_2` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rap` ADD CONSTRAINT `rap_ibfk_1` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `reporte_academico` ADD CONSTRAINT `reporte_academico_ibfk_1` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `reporte_academico` ADD CONSTRAINT `reporte_academico_ibfk_2` FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `reporte_academico` ADD CONSTRAINT `reporte_academico_ibfk_3` FOREIGN KEY (`id_generado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `revision_proyecto` ADD CONSTRAINT `revision_proyecto_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `revision_proyecto` ADD CONSTRAINT `revision_proyecto_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `revision_proyecto` ADD CONSTRAINT `revision_proyecto_ibfk_3` FOREIGN KEY (`id_estado_anterior`) REFERENCES `estado_proyecto`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `revision_proyecto` ADD CONSTRAINT `revision_proyecto_ibfk_4` FOREIGN KEY (`id_estado_nuevo`) REFERENCES `estado_proyecto`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rol_permiso` ADD CONSTRAINT `rol_permiso_ibfk_1` FOREIGN KEY (`id_rol`) REFERENCES `rol`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rol_permiso` ADD CONSTRAINT `rol_permiso_ibfk_2` FOREIGN KEY (`id_modulo`) REFERENCES `modulo`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rol_permiso` ADD CONSTRAINT `rol_permiso_ibfk_3` FOREIGN KEY (`id_permiso`) REFERENCES `permiso`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rubrica` ADD CONSTRAINT `rubrica_ibfk_1` FOREIGN KEY (`id_rap`) REFERENCES `rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rubrica` ADD CONSTRAINT `rubrica_ibfk_2` FOREIGN KEY (`id_escala`) REFERENCES `escala_valoracion`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rubrica` ADD CONSTRAINT `rubrica_ibfk_3` FOREIGN KEY (`id_creado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rubrica_descriptor` ADD CONSTRAINT `rubrica_descriptor_ibfk_1` FOREIGN KEY (`id_rubrica`) REFERENCES `rubrica`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rubrica_descriptor` ADD CONSTRAINT `rubrica_descriptor_ibfk_2` FOREIGN KEY (`id_indicador`) REFERENCES `indicador_rap`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rubrica_descriptor` ADD CONSTRAINT `rubrica_descriptor_ibfk_3` FOREIGN KEY (`id_nivel`) REFERENCES `nivel_escala`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sesion` ADD CONSTRAINT `sesion_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sesion_clase` ADD CONSTRAINT `sesion_clase_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sesion_clase` ADD CONSTRAINT `sesion_clase_ibfk_2` FOREIGN KEY (`id_tipo_sesion`) REFERENCES `tipo_sesion`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sesion_clase` ADD CONSTRAINT `sesion_clase_ibfk_3` FOREIGN KEY (`id_dia_festivo`) REFERENCES `dia_festivo`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sesion_clase` ADD CONSTRAINT `sesion_clase_ibfk_4` FOREIGN KEY (`id_registrado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sesion_tema` ADD CONSTRAINT `sesion_tema_ibfk_1` FOREIGN KEY (`id_sesion`) REFERENCES `sesion_clase`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `sesion_tema` ADD CONSTRAINT `sesion_tema_ibfk_2` FOREIGN KEY (`id_contenido`) REFERENCES `contenido_programatico`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_ibfk_1` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `usuario_rol` ADD CONSTRAINT `usuario_rol_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `usuario_rol` ADD CONSTRAINT `usuario_rol_ibfk_2` FOREIGN KEY (`id_rol`) REFERENCES `rol`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `usuario_rol` ADD CONSTRAINT `usuario_rol_ibfk_3` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `usuario_rol` ADD CONSTRAINT `usuario_rol_ibfk_4` FOREIGN KEY (`id_asignado_por`) REFERENCES `usuario`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `valoracion_estudiante` ADD CONSTRAINT `valoracion_estudiante_ibfk_1` FOREIGN KEY (`id_medicion_indicador`) REFERENCES `medicion_indicador`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `valoracion_estudiante` ADD CONSTRAINT `valoracion_estudiante_ibfk_2` FOREIGN KEY (`id_matricula`) REFERENCES `matricula`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `valoracion_estudiante` ADD CONSTRAINT `valoracion_estudiante_ibfk_3` FOREIGN KEY (`id_nivel`) REFERENCES `nivel_escala`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
