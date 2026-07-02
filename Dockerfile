# --- Stage 1: build the React frontend (Vite) served under /app ---
FROM node:24-bookworm-slim AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# --- Stage 2: application image ---
FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY db ./db
COPY Guide-d-application-du-SYSCOHADA.pdf ./Guide-d-application-du-SYSCOHADA.pdf
COPY --from=web-build /web/dist ./web/dist

RUN mkdir -p /app/data /app/storage/uploads

# NOTE: runs as root so the process can write to the Railway-mounted volume at
# /app/storage/uploads (volumes are root-owned). Revisit with a non-root user +
# volume chown (e.g. gosu entrypoint) as a future hardening step.
EXPOSE 3050

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "const p=process.env.PORT||3050;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "--no-warnings", "src/server.js"]
