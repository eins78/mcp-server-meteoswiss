# Single stage build for MeteoSwiss MCP Server with tsx runtime

FROM node:24-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies (including tsx which is needed for runtime)
RUN pnpm install --prod --frozen-lockfile && \
    pnpm store prune

# Copy source code and configuration
COPY tsconfig.json ./
COPY src ./src

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port (default 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server using tsx
CMD ["npx", "tsx", "src/index.ts"]