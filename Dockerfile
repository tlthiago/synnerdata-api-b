# Install dependencies
FROM oven/bun:1-alpine@sha256:4de475389889577f346c636f956b42a5c31501b654664e9ae5726f94d7bb5349 AS install

WORKDIR /app

COPY package.json bun.lock ./

RUN mkdir -p /temp/prod && \
    cp package.json bun.lock /temp/prod/ && \
    cd /temp/prod && \
    bun install --frozen-lockfile --production --ignore-scripts

# Release stage
FROM oven/bun:1-alpine@sha256:4de475389889577f346c636f956b42a5c31501b654664e9ae5726f94d7bb5349

RUN apk add --no-cache curl

WORKDIR /app

COPY --from=install /temp/prod/node_modules ./node_modules
COPY ./src ./src
COPY ./tsconfig.json ./
COPY ./package.json ./
COPY ./scripts/entrypoint.sh ./scripts/
RUN chmod +x scripts/entrypoint.sh

ENV NODE_ENV=production

USER bun

EXPOSE 3333

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=30s \
  CMD curl -fsS http://localhost:${PORT:-3333}/health | grep -q '"status":"healthy"' || exit 1

CMD ["./scripts/entrypoint.sh"]
