FROM node:24.19.0-bookworm-slim AS toolchain

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack prepare pnpm@11.16.0 --activate

WORKDIR /app

FROM toolchain AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm build \
  && pnpm build:server \
  && pnpm prune --prod

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV REPOSCOPE_HOST=0.0.0.0
ENV REPOSCOPE_PORT=8787
ENV REPOSCOPE_CACHE_PATH=/data/deep-reports.sqlite

WORKDIR /app

RUN groupadd --system --gid 10001 reposcope \
  && useradd --system --uid 10001 --gid reposcope --home-dir /nonexistent --shell /usr/sbin/nologin reposcope \
  && mkdir -p /data \
  && chown reposcope:reposcope /data

COPY --from=build --chown=root:root /app/package.json ./package.json
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/server-dist ./server-dist
COPY --from=build --chown=root:root /app/dist ./dist

RUN chmod -R a-w /app

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

USER reposcope:reposcope

CMD ["node", "server-dist/server/index.js"]
