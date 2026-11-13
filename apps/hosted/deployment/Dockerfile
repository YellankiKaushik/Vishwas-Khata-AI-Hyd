FROM node:24-bookworm-slim AS web
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app/apps/hosted
COPY apps/hosted/package*.json ./
RUN npm ci --omit=dev
COPY apps/hosted/src/ ./src/
COPY apps/hosted/scripts/ ./scripts/
COPY apps/hosted/migrations/ ./migrations/
COPY apps/hosted/deployment/ ./deployment/
COPY apps/hosted/release-gate.json ./
COPY --from=web /app/apps/web/dist /app/apps/web/dist
ENV NODE_ENV=production HOSTED_BIND_ADDRESS=0.0.0.0
USER node
EXPOSE 8080
CMD ["sh", "-c", "npm run preflight && exec node src/server.mjs"]
