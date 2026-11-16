FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    HH_STT_PROVIDER=http \
    HH_STT_HTTP_FORMAT=multipart \
    HH_STT_ENDPOINT=http://mutinat-tulkki:8000/transcribe \
    HH_DIALECT_LEXICON_PATH=/app/dialects/fi_dialects.json

WORKDIR /app

COPY server.py /app/server.py
COPY dialects /app/dialects

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/healthz', timeout=2).read()"

CMD ["python", "server.py"]
