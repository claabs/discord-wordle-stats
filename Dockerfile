FROM node:24-alpine AS base

# Set working directory
WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production DATA_PATH=/data

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
    && apk add --no-cache tzdata supercronic jq

# Copy source code
COPY . .

# Use the built-in non-root 'node' user for security
USER node

ENTRYPOINT ["/app/docker-entrypoint.sh"]
