# Two stages: the first compiles the C++ MCTS engine into a wheel, the second is the runtime
# image and carries no compiler.
#
# The engine lives in a separate repo, vendored here at vendor/quoridor-mcts (a git submodule
# pinned to a commit). It is OPTIONAL: if the directory is absent, the build skips it and the
# API still boots, answering 503 for the MCTS tier so clients fall back to their own engine.
# Add it with:
#
#   git submodule add https://github.com/samuelbaldwin05/QuoridorMCTS.git \
#       backend/vendor/quoridor-mcts
#
# and make sure the build checks out submodules (deploy-backend.yml passes submodules: true).

FROM python:3.12-slim AS engine-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "pybind11>=2.12" "setuptools>=68" wheel

WORKDIR /build
# vendor/ always exists in the repo (it holds a .gitkeep), so this COPY cannot fail before the
# submodule is added; the guard below handles an empty directory.
COPY vendor/ /build/vendor/

# QMCTS_COMMIT is stamped into the module so a running backend can report which engine build
# it is serving. The submodule checkout has no .git dir of its own in a Docker context, so the
# value is passed in rather than read from git.
ARG QMCTS_COMMIT=unknown

RUN mkdir -p /wheels \
    && if [ -f vendor/quoridor-mcts/setup.py ]; then \
         cd vendor/quoridor-mcts \
         && QMCTS_COMMIT="$QMCTS_COMMIT" pip wheel . -w /wheels --no-build-isolation \
         && ls -lh /wheels; \
       else \
         echo "no engine source at vendor/quoridor-mcts, skipping the MCTS build"; \
       fi


FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Install dependencies (copy pyproject.toml first for layer caching)
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

# The engine wheel, when there is one. Installed into the same environment uv created, so the
# `quoridor_mcts` import in app/ai/mcts_agent.py resolves.
COPY --from=engine-builder /wheels /tmp/wheels
RUN if ls /tmp/wheels/*.whl >/dev/null 2>&1; then \
        uv pip install --python /app/.venv/bin/python /tmp/wheels/*.whl; \
    else \
        echo "no engine wheel, the MCTS tier will report itself unavailable"; \
    fi \
    && rm -rf /tmp/wheels

COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
