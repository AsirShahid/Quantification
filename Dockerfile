FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY .openai/ ./.openai/
COPY app/ ./app/
COPY public/ ./public/
COPY types/ ./types/
COPY env.d.ts next.config.ts tsconfig.json vite.config.ts ./
RUN npm run build
# Keep only production packages, then add the exact Vinext production server
# (Vinext is a build-time devDependency but is also the HTTP runtime here).
RUN npm pkg set dependencies.vinext=1.0.0-beta.8 \
    && npm pkg delete devDependencies.vinext \
    && npm install --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runtime
ENV NODE_ENV=production \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    VINEXT_TRUST_PROXY=1
WORKDIR /app
RUN groupadd --system --gid 10001 kidneyquant \
    && useradd --system --uid 10001 --gid kidneyquant --home-dir /nonexistent --shell /usr/sbin/nologin kidneyquant

# Runtime contains only the built application and production dependencies;
# source, tests, package-manager caches, and build tooling stay in the build stage.
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules

USER 10001:10001
EXPOSE 3000
CMD ["node", "--input-type=module", "-e", "import { startProdServer } from 'vinext/server/prod-server'; const port = Number.parseInt(process.env.PORT ?? '3000', 10); await startProdServer({ port, host: '0.0.0.0', outDir: '/app/dist' });"]
