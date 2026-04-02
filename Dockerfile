FROM oven/bun:1-alpine AS base
WORKDIR /app

# Stage 1: Install ALL dependencies (including devDependencies for buf)
FROM base AS install-all
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Install ONLY production dependencies
FROM base AS install-prod
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 3: Build/Generate stage
FROM base AS builder
COPY --from=install-all /app/node_modules ./node_modules
COPY . .
# Generate protobufs (buf is now available in node_modules)
RUN bun run generate

# Stage 4: Final production release
FROM base AS release
# Install runtime dependencies for native modules
RUN apk add --no-cache libc6-compat

# Copy production node_modules
COPY --from=install-prod /app/node_modules ./node_modules

# Copy source and generated files
COPY --from=builder /app/src ./src
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R bun:bun /app/data

USER bun
ENV NODE_ENV=production

ENTRYPOINT ["bun", "run", "src/main.ts"]
