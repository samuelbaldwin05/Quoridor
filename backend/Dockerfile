FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Install dependencies (copy pyproject.toml first for layer caching)
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
