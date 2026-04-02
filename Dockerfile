FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies in a separate stage for caching
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
COPY . .
# Generate protobufs
RUN bun run generate

# Final production stage
FROM base AS release
# Install libc6-compat for sharp/native modules and other runtime dependencies
RUN apk add --no-cache libc6-compat

COPY --from=install /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R bun:bun /app/data

# Optional: User bun for security
USER bun

# Set environment variables
ENV NODE_ENV=production

# Start the bot directly with Bun
ENTRYPOINT ["bun", "run", "src/main.ts"]
