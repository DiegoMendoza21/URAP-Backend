# Imagen de la API de URAP para el despliegue (docs/despliegue.md). La usa
# despliegue/docker-compose.yml; en desarrollo no hace falta: se trabaja con `npm run start:dev`.
#
# Lleva todas las dependencias, también las de desarrollo, porque en el servidor se corren con
# la misma imagen las migraciones (`prisma migrate deploy`) y el sembrado de datos.

FROM node:26-bookworm-slim AS construccion
WORKDIR /app
# Primero lo que necesita `npm ci`: su postinstall genera el cliente de Prisma desde el esquema.
COPY package.json package-lock.json prisma7.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:26-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=construccion /app/package.json /app/package-lock.json /app/prisma7.config.ts ./
COPY --from=construccion /app/node_modules ./node_modules
COPY --from=construccion /app/prisma ./prisma
COPY --from=construccion /app/dist ./dist
# Sin privilegios de root. La carpeta del almacenamiento documental llega como volumen.
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PUERTO ?? 3001) + '/api/salud').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]
