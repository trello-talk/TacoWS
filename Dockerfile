# syntax=docker/dockerfile:1

# ---- Builder ----
FROM node:18-alpine AS builder

RUN mkdir /build
WORKDIR /build

COPY package.json .
COPY yarn.lock .
RUN yarn install --immutable

COPY . .
RUN yarn generate
RUN yarn build

# ---- Dependencies ----
FROM node:18-alpine AS deps

WORKDIR /deps

COPY package.json .
COPY yarn.lock .
COPY ./prisma .
RUN yarn install --frozen-lockfile --prod --ignore-optional
RUN yarn generate

# ---- Runner ----
FROM node:18-alpine

RUN apk add dumb-init

WORKDIR /app

COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/yarn.lock ./yarn.lock
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=builder /build/prisma ./prisma
COPY --from=builder /build/dist ./dist

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "yarn start"]
