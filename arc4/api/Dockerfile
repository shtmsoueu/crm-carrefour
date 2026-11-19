# Contexto de build: arc4/ (workspace uv com importador, api e migrations).
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv PATH=/opt/venv/bin:$PATH
RUN pip install --no-cache-dir uv==0.11.32
WORKDIR /app

# Dependências primeiro (camada reaproveitada enquanto o lock não mudar)
COPY pyproject.toml uv.lock ./
COPY api/pyproject.toml api/
COPY importador/pyproject.toml importador/
RUN mkdir -p api/src/arc4_api importador/src/arc4_importador \
 && touch api/src/arc4_api/__init__.py importador/src/arc4_importador/__init__.py \
 && uv sync --frozen --no-default-groups --group db --no-install-workspace

COPY api/src api/src
COPY importador/src importador/src
COPY db db
RUN uv sync --frozen --no-default-groups --group db

RUN useradd --system --uid 10001 arc4
USER arc4
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status==200 else 1)"
CMD ["uvicorn", "arc4_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
