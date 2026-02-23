FROM node:20-alpine AS frontend-builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS api-deps
WORKDIR /app/server

RUN apk add --no-cache python3 make g++

COPY server/package.json ./package.json
RUN npm install --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8081
ENV WORKSPACE_ROOT=/app/workspace
ENV CONTAINER_HOME=/root
ENV NODE_OPTIONS=--max-old-space-size=256

RUN apk add --no-cache nginx bash git sudo tini \
  && mkdir -p /run/nginx /usr/share/nginx/html /app/workspace

COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=api-deps /app/server/node_modules /app/server/node_modules
COPY server /app/server
COPY deploy/nginx/default.conf /etc/nginx/http.d/default.conf
COPY deploy/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
