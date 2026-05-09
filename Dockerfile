# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py config.py init_db.py models.py storage.py swagger.py worker.py ./
COPY mangasuperb ./mangasuperb

RUN rm -rf /app/mangasuperb/static/*
COPY --from=frontend-builder /frontend/dist/ ./mangasuperb/static/

COPY docker/entrypoint.sh /usr/local/bin/mangasuperb-entrypoint
RUN chmod +x /usr/local/bin/mangasuperb-entrypoint \
    && mkdir -p /app/logs /app/instance \
    && useradd --create-home --shell /usr/sbin/nologin mangasuperb \
    && chown -R mangasuperb:mangasuperb /app

USER mangasuperb

EXPOSE 5000

ENTRYPOINT ["mangasuperb-entrypoint"]
CMD ["api"]
