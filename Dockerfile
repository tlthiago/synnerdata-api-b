# Install dependencies
FROM oven/bun:1-alpine AS install

WORKDIR /app

COPY package.json bun.lock ./

RUN mkdir -p /temp/prod && \
    cp package.json bun.lock /temp/prod/ && \
    cd /temp/prod && \
    bun install --frozen-lockfile --production

# Release stage
FROM oven/bun:1-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY --from=install /temp/prod/node_modules ./node_modules
COPY ./src ./src
COPY ./tsconfig.json ./
COPY ./package.json ./

ENV NODE_ENV=production

USER bun

EXPOSE 3333

CMD ["bun", "run", "src/index.ts"]
