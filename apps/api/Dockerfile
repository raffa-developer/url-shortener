# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Full toolchain: used to build and to run migrations (prisma CLI available).
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run db:generate -w @url-shortener/api \
  && npm run build -w @url-shortener/api

FROM builder AS migrate
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

# Production image: only runtime dependencies and built output.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/prisma apps/api/prisma
COPY --from=builder /app/apps/api/prisma.config.ts apps/api/prisma.config.ts
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
