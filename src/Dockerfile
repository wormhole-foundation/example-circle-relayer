FROM node:19.5.0 as builder

WORKDIR /usr/src/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm pkg delete scripts.prepare && npm ci
COPY --chown=node:node . .
RUN npm run build

FROM node:lts-alpine3.17 as final
WORKDIR /usr/src/app
COPY --chown=node:node --from=builder /usr/src/app/build /usr/src/app/package*.json ./
RUN npm pkg delete scripts.prepare && npm ci --omit=dev
USER node
EXPOSE 3000
CMD ["node", "relayer/index.js"]
