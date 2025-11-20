FROM oven/bun:1-alpine AS build

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN apk add --no-cache g++ python3 make && \
    bun install --frozen-lockfile --production

FROM oven/bun:1-alpine

WORKDIR /app

COPY --from=build /app/node_modules/ ./node_modules

# Set NODE_ENV to production
ENV NODE_ENV=production DATA_PATH=/data

# Copy source code
COPY . .

# Use the built-in non-root 'node' user for security
USER bun

CMD ["bun", "run", "./src/index.ts"]
