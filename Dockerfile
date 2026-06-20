FROM node:22.13-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY db ./db
COPY Guide-d-application-du-SYSCOHADA.pdf ./Guide-d-application-du-SYSCOHADA.pdf

RUN mkdir -p /app/data /app/storage/uploads && chown -R node:node /app

USER node
EXPOSE 3050

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3050/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "--no-warnings", "src/server.js"]
