FROM node:20 AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM ubuntu:22.04

# Install Node.js and basic tools
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy monolith backend
COPY monolith/package*.json ./
RUN npm install --only=production

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./public

# Copy backend source
COPY monolith/src ./src

# Create workspace
RUN mkdir -p /workspace
ENV WORKSPACE_PATH=/workspace
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
