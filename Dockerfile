# Multi-stage build for MeteoSwiss MCP Server

# Stage 1: Build stage
FROM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm using npm and corepack
RUN npm i -g corepack && pnpm -v

# fetch dependencies with pnpm store cache
COPY .npmrc pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm config set store-dir /root/.local/share/pnpm/store && \
    pnpm fetch --frozen-lockfile --no-optional

# Copy source code and configuration
COPY package.json tsconfig.json ./
COPY src ./src
# Copy test fixtures for runtime (if USE_TEST_FIXTURES is enabled)
COPY test/__fixtures__ ./test/__fixtures__

# Install dependencies
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile --no-optional --ignore-scripts

# Build the application
RUN pnpm run build

# ------------------------------------------------------------------------------------------------

# Stage 2: Runtime stage
FROM node:24-alpine AS runtime

# Install pnpm using npm and corepack (needed for pnpm run start)
RUN npm i -g corepack && pnpm -v

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files and built application from builder
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist

# Install production dependencies
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm config set store-dir /root/.local/share/pnpm/store && \
    pnpm install --offline --frozen-lockfile --production --no-optional --ignore-scripts

# Copy test fixtures for runtime (if USE_TEST_FIXTURES is enabled)
COPY --from=builder /app/test/__fixtures__ ./test/__fixtures__

# Copy views for homepage
COPY --from=builder /app/src/views ./src/views

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Ensure pnpm version required by the application is installed in the image, for the runtime user
RUN pnpm -v 

# Expose the port (default 3000)
EXPOSE 3000

# Environment variable hints
ENV PORT=3000
ENV PUBLIC_URL=""

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server using the built JavaScript
CMD ["pnpm", "run", "start"]
