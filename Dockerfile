FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN set -eux; \
    if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable; pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install --no-audit --no-fund; fi

# Copy source
COPY . .

# Expose HTTP port for SSE transport
EXPOSE 3000

# Default to Streamable HTTP via entrypoint; pass "stdio" to use stdio
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Default transport for containerized deploys is HTTP
ENV MCP_TRANSPORT=http

ENTRYPOINT ["/app/docker-entrypoint.sh"]
