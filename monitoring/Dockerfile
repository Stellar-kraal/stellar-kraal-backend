# monitoring/Dockerfile
#
# Builds and runs the on-chain anomaly detection service (src/monitoring/).
# It shares the backend's package.json/lockfile but is compiled with its
# own tsconfig (monitoring/tsconfig.json) scoped to src/monitoring only, so
# the build doesn't need Prisma or any of the main API's other dependencies
# to type-check.
#
# Build from the repository root:
#   docker build -f monitoring/Dockerfile -t stellarkraal-monitoring .

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY monitoring/tsconfig.json ./monitoring/tsconfig.json
COPY src/monitoring ./src/monitoring
RUN npx tsc --project monitoring/tsconfig.json

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist/monitoring ./dist/monitoring

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${MONITOR_PORT:-3002}/health" || exit 1

CMD ["node", "dist/monitoring/index.js"]
