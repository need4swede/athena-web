FROM node:20-alpine

# Install Python, pip, Postgres client tools, and build dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-virtualenv \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    postgresql15-client

# Create non-root user first (before any file operations)
RUN addgroup -g 36464 -S nodejs && \
    adduser -S nodejs -u 36464

# Create app directory with correct ownership from the start
RUN mkdir -p /app && chown nodejs:nodejs /app

# Switch to nodejs user for all subsequent operations
USER nodejs

# Set working directory
WORKDIR /app

# Copy backend package files with correct ownership
COPY --chown=nodejs:nodejs server/package*.json ./

# Install dependencies as nodejs user
RUN npm ci

# Copy backend source code with correct ownership
COPY --chown=nodejs:nodejs server/. .

# Include database SQL and migrations in the image for self-initialization
COPY --chown=nodejs:nodejs database /app/database

# Bake Athena (Python modules and scripts) into the image
COPY --chown=nodejs:nodejs athena /app/athena

# Ensure public exists (may still be mounted via compose in dev)
COPY --chown=nodejs:nodejs public /app/public

# Create and activate a virtual environment as nodejs user
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
ENV VIRTUAL_ENV="/app/venv"

# Install Python dependencies as nodejs user
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir google-api-python-client google-auth google-auth-httplib2 google-auth-oauthlib psycopg2-binary requests

# Build the TypeScript code
RUN npm run build

# Copy and make the entrypoint script executable (with correct ownership)
COPY --chown=nodejs:nodejs server/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose port
EXPOSE 36464

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js

# Set the entrypoint (use local path since we can't write to /usr/local/bin as non-root)
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Start the server
CMD ["npm", "start"]
