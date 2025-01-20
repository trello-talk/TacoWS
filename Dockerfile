# syntax=docker/dockerfile:1

# ---- Builder ----
FROM --platform=$BUILDPLATFORM node:20-alpine3.16 AS builder

RUN mkdir /build
WORKDIR /build

COPY package.json .
COPY pnpm-lock.yaml .

RUN apk add --update --no-cache git
RUN npm install -g pnpm@9

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run generate
RUN pnpm run build

# ---- Dependencies ----
FROM --platform=$BUILDPLATFORM node:20-alpine3.16 AS deps

WORKDIR /deps

COPY package.json .
COPY pnpm-lock.yaml .
COPY ./prisma .

RUN apk add --update --no-cache git
RUN npm install -g pnpm@9

RUN pnpm install --frozen-lockfile --prod --no-optional
RUN pnpm dlx prisma generate

# ---- Runner ----
FROM --platform=$BUILDPLATFORM node:20-alpine3.16

RUN apk add --update --no-cache dumb-init git
RUN npm install -g pnpm@9

WORKDIR /app

COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=builder /build/prisma ./prisma
COPY --from=builder /build/dist ./dist

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "pnpm run start"]
