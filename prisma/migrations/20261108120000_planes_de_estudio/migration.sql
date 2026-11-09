-- Modelo v2.5 (RF-04 v1.1): planes de estudio. Un programa puede tener varios planes vigentes
-- a la vez (Administración Industrial tiene el 1702 y el 2502), la asignatura cuelga del plan y
-- su código es único dentro del plan. Va en tres pasos, como lo describe docs/modelo-datos.md,
-- para conservar las asignaturas que ya existen, su mapeo a RAP y los proyectos que apuntan a
-- ellas.

-- Paso 1: la tabla plan_estudio y asignatura.id_plan_estudio, todavía nulable.

-- CreateTable
CREATE TABLE `plan_estudio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_programa` INTEGER NULL,
    `codigo` VARCHAR(255) NULL,
    `nombre` VARCHAR(255) NULL,
    `estado` VARCHAR(255) NULL DEFAULT 'vigente',
    `created_at` DATETIME(0) NULL DEFAULT (now()),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `plan_estudio_index_3`(`id_programa`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plan_estudio` ADD CONSTRAINT `plan_estudio_ibfk_1` FOREIGN KEY (`id_programa`) REFERENCES `programa`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable
ALTER TABLE `asignatura` ADD COLUMN `id_plan_estudio` INTEGER NULL;

-- Paso 2: el plan 1702 de cada programa, con todas sus asignaturas. Son las del mapeo
-- curricular del informe 2023-II, que es el del plan 1702. En una base vacía no hace nada.

INSERT INTO `plan_estudio` (`id_programa`, `codigo`, `nombre`, `estado`, `created_at`, `updated_at`)
SELECT `id`, '1702', 'Plan de estudios 1702', 'vigente', NOW(), NOW()
FROM `programa`;

UPDATE `asignatura` AS `a`
JOIN `plan_estudio` AS `p` ON `p`.`id_programa` = `a`.`id_programa` AND `p`.`codigo` = '1702'
SET `a`.`id_plan_estudio` = `p`.`id`;

-- Paso 3: la columna se vuelve obligatoria, el código pasa a ser único por plan y
-- asignatura.id_programa desaparece: el programa de una asignatura sale de su plan. Si quedara
-- alguna asignatura sin programa, la migración se detiene aquí en vez de dejarla sin plan.

-- DropForeignKey
ALTER TABLE `asignatura` DROP FOREIGN KEY `asignatura_ibfk_1`;

-- DropIndex
DROP INDEX `asignatura_index_3` ON `asignatura`;

-- AlterTable
ALTER TABLE `asignatura` DROP COLUMN `id_programa`,
    MODIFY `id_plan_estudio` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `asignatura_index_4` ON `asignatura`(`id_plan_estudio`, `codigo_interno`);

-- AddForeignKey
ALTER TABLE `asignatura` ADD CONSTRAINT `asignatura_ibfk_1` FOREIGN KEY (`id_plan_estudio`) REFERENCES `plan_estudio`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
