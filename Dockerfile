# CacheForge: Flask cache API + web page, in one container.
# frontend/serve.js (Node) is the entry point. It serves the page on port 3000
# and starts Flask on 127.0.0.1:8000 inside the container.

FROM python:3.12-slim

# Node runs the frontend server. Copy just the binary from the official image.
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=3000 \
    PY=python3

WORKDIR /app

# The app only imports Flask (requirements.txt is a full environment freeze).
# Install it first so this layer is cached until the version changes.
RUN pip install "Flask==3.1.3"

COPY main.py ./
COPY api ./api
COPY src ./src
COPY frontend ./frontend

# Run as an unprivileged user.
RUN useradd --system --no-create-home cacheforge
USER cacheforge

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/cache/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

# Exec form, so node is PID 1 and receives SIGTERM from `docker stop`.
CMD ["node", "frontend/serve.js"]
