#!/bin/bash
# La imagen de MySQL ejecuta este script una sola vez, al inicializar un volumen vacío.
# Crea la base sombra que usa `prisma migrate dev` para comparar migraciones y le da
# permisos sobre ella al usuario de la aplicación, que solo tiene acceso a su propia base.
MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}_sombra\`;
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}_sombra\`.* TO '${MYSQL_USER}'@'%';
SQL
