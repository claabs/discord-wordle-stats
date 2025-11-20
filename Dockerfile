FROM node:24-alpine AS build

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN apk add --no-cache g++ python3 make && \
    npm ci --omit=dev

FROM node:24-alpine

WORKDIR /app

COPY --from=build /app/node_modules/ ./node_modules

# Set NODE_ENV to production
ENV NODE_ENV=production DATA_PATH=/data

# Copy source code
COPY . .

# Use the built-in non-root 'node' user for security
USER node

CMD ["node", "./src/index.ts", "--experimental-transform-types"]
