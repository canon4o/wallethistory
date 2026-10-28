# syntax=docker/dockerfile:1

# Self-hosting image. On start it applies any new database migrations, then starts the app.
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No environment variables are needed to build. next/font downloads Comfortaa here, so the
# build needs internet access.
RUN npm run build

# The two packages docker/migrate.mjs needs, at the versions in package-lock.json. The standalone
# server bundles its own copies, so they are not in its node_modules.
FROM base AS migrator
COPY package-lock.json ./
RUN version() { node -p "require('./package-lock.json').packages['node_modules/$1'].version"; } \
 && mkdir docker \
 && cd docker \
 && echo '{"private": true}' > package.json \
 && npm install --no-save --no-package-lock --omit=dev \
      "drizzle-orm@$(cd .. && version drizzle-orm)" "postgres@$(cd .. && version postgres)"

FROM base AS app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=migrator /app/docker/node_modules ./docker/node_modules
COPY db/migrations ./db/migrations
COPY docker/migrate.mjs docker/start.sh ./docker/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# A failed migration stops the container before the app starts (see `docker compose logs app`).
CMD ["sh", "docker/start.sh"]
