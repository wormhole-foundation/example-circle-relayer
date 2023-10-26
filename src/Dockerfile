FROM node:lts-alpine3.18@sha256:bf6c61feabc1a1bd565065016abe77fa378500ec75efa67f5b04e5e5c4d447cd as preparation
COPY package.json package-lock.json tsconfig.json ./
# Create temporary package.json where version is set to 0.0.0
# – this way the cache of the build step won't be invalidated
# if only the version changed.
RUN ["node", "-e", "\
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));\
const pkgLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf-8'));\
fs.writeFileSync('package.json', JSON.stringify({ ...pkg, version: '0.0.0' }));\
fs.writeFileSync('package-lock.json', JSON.stringify({ ...pkgLock, version: '0.0.0' }));\
"]

FROM node:18.17.1 as builder
WORKDIR /usr/src/app
COPY --from=preparation --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm pkg delete scripts.prepare && npm ci
COPY --chown=node:node . .
RUN npm run build

FROM node:18.18.1-alpine3.18 as final
WORKDIR /usr/src/app
COPY --from=preparation --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm pkg delete scripts.prepare && npm ci --omit=dev
COPY --chown=node:node --from=builder /usr/src/app/build ./
USER node
EXPOSE 3000
CMD ["node", "relayer/index.js"]
