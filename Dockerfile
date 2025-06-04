# Multi-stage build for MeteoSwiss MCP Server

# Stage 1: Build stage
FROM node:24-alpine AS builder

# Install pnpm using npm and corepack
RUN npm i -g corepack && pnpm -v

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code and configuration
COPY tsconfig.json ./
COPY src ./src
COPY test/__fixtures__ ./test/__fixtures__
COPY docs ./docs

# Build the application
RUN pnpm run build

# Remove devDependencies after build
RUN pnpm prune --prod

# Stage 2: Runtime stage
FROM node:24-alpine AS runtime

# Install pnpm using npm and corepack (needed for pnpm run start)
RUN npm i -g corepack && pnpm -v

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files from builder
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./

# Copy node_modules from builder (production only)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy test fixtures for runtime (if USE_TEST_FIXTURES is enabled)
COPY --from=builder /app/test/__fixtures__ ./test/__fixtures__

# Copy documentation for homepage
COPY --from=builder /app/docs ./docs

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port (default 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server using the built JavaScript
CMD ["pnpm", "run", "start"]