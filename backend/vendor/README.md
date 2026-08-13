# vendor/

Third-party or sibling-repo source that the backend image compiles.

## quoridor-mcts

The C++ MCTS engine, consumed as a Python extension module (`quoridor_mcts`) by
`app/ai/mcts_agent.py`. It is not on PyPI, so it is vendored as a git submodule pinned to a
commit and built in the Dockerfile's first stage:

```
git submodule add https://github.com/samuelbaldwin05/QuoridorMCTS.git backend/vendor/quoridor-mcts
```

Builds that check out the repo need `submodules: true` (already set in
`.github/workflows/deploy-backend.yml`).

The dependency is optional by design. With no engine here, the image builds without it and the
MCTS tier reports itself unavailable (503), which the client treats as a signal to search in
the browser instead. Nothing else in the API is affected.

For local development, install it into the backend virtualenv directly:

```
uv pip install ./vendor/quoridor-mcts
```
