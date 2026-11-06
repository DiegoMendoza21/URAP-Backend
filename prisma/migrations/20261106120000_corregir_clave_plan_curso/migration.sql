-- RF-08: la línea base dejó la clave foránea de la relación uno a uno entre plan_curso y
-- proyecto_docente al revés (proyecto_docente.id -> plan_curso.id_proyecto_docente), lo que
-- impedía insertar cualquier proyecto docente sin un plan de curso previo con su mismo id.
-- El DBML la define en plan_curso: el plan de curso pertenece a su proyecto docente.

-- DropForeignKey
ALTER TABLE `proyecto_docente` DROP FOREIGN KEY `proyecto_docente_ibfk_6`;

-- AddForeignKey
ALTER TABLE `plan_curso` ADD CONSTRAINT `plan_curso_ibfk_1` FOREIGN KEY (`id_proyecto_docente`) REFERENCES `proyecto_docente`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
