# syntax=docker/dockerfile:1

# This builds the server
FROM node:18-alpine AS builder

RUN mkdir /build
WORKDIR /build

COPY package.json .
COPY yarn.lock .
RUN yarn install --immutable

COPY . .
RUN yarn generate
RUN yarn build

# This actually runs the server
FROM node:18-alpine

RUN apk add dumb-init

WORKDIR /app

COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/yarn.lock ./yarn.lock
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/prisma ./prisma
COPY --from=builder /build/dist ./dist

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "yarn start"]
