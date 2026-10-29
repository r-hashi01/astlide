# Astlide render service — build from the repository root:
#
#   docker build -f packages/server/Dockerfile -t astlide-server .
#   docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY=… \
#     --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
#
# The seccomp profile is Docker's default plus the namespace calls Chromium's
# sandbox needs (clone / clone3 / unshare / setns); PDF / PNG renders keep the
# sandbox on and fail without it (ASTLIDE_CHROMIUM_SANDBOX=0 opts out).
# Give the container limits of its own as well, e.g. --memory 4g --pids-limit 512:
# renders are the first to go when memory runs out (oom_score_adj), but a
# limit keeps them from taking the host down.
#
# Node (Astro builds run in Node), Bun (runs the server and the astlide CLI),
# Playwright's Chromium (PDF / PNG) and Noto CJK fonts (Japanese, Chinese,
# Korean text in PDF / PNG).

ARG BUN_VERSION=1.4.0

FROM oven/bun:${BUN_VERSION}-debian AS bun

# Pinned to a patched Node release (Dependabot keeps it current).
FROM node:26.12.1-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
	ASTRO_TELEMETRY_DISABLED=1 \
	PORT=8787 \
	HOST=0.0.0.0

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates fonts-noto-cjk fonts-noto-color-emoji \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first (cached while only sources change). Every workspace's
# package.json is needed for the frozen lockfile; only the server's
# dependencies are installed.
COPY package.json bun.lock bunfig.toml ./
COPY packages/astlide/package.json packages/astlide/
COPY packages/server/package.json packages/server/
COPY packages/create-astlide/package.json packages/create-astlide/
COPY playground/package.json playground/
COPY docs/package.json docs/
COPY tools/ts6/package.json tools/ts6/
RUN bun install --frozen-lockfile --production --filter @astlide/server

RUN node node_modules/playwright/cli.js install --with-deps chromium \
	&& rm -rf /var/lib/apt/lists/*

COPY packages/astlide/src packages/astlide/src
COPY packages/server/src packages/server/src
COPY packages/server/openapi.json packages/server/

# Per-request projects live next to node_modules (Astro needs them to share a
# parent directory with the packages) and are deleted after each request.
# /data/templates is ready for ASTLIDE_TEMPLATE_STORE (mount a volume there).
RUN mkdir -p /app/.astlide-work /data/templates \
	&& chown node:node /app/.astlide-work /data/templates
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
	CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["bun", "packages/server/src/cli.ts"]
