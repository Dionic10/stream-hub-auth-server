FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js ./
COPY public ./public
COPY views ./views

# Create data directory
RUN mkdir -p /app/data

# Create non-root user for security (suppress errors for Alpine's existing node user)
RUN addgroup -g 1000 node 2>/dev/null || true && \
    adduser -D -u 1000 -G node node 2>/dev/null || true

# Set proper permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server.js"]
