# Build from the gold-terminal/ directory: docker build -f apps/server/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @gold/server --workspace @gold/core --include-workspace-root
COPY packages/core packages/core
COPY apps/server apps/server
RUN npm run build -w @gold/server && npm prune --omit=dev --workspace @gold/server --workspace @gold/core

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/migrations ./apps/server/migrations
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY fixtures ./fixtures
WORKDIR /app/apps/server
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
