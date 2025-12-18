# Build stage
FROM oven/bun:1 AS build

WORKDIR /app

# Cache de dependências
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copia código fonte
COPY ./src ./src
COPY ./tsconfig.json ./

ENV NODE_ENV=production

# Compila para binário standalone
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile server \
    ./src/index.ts

# Release stage - Debian slim para compatibilidade com libpq (PostgreSQL)
FROM debian:bookworm-slim

# Instala dependências necessárias para o driver pg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia binário compilado
COPY --from=build /app/server server

ENV NODE_ENV=production

EXPOSE 3000

CMD ["./server"]
