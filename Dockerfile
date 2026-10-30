# AP Verify — Mistral Workflow deployment image.
# Runs the worker (Python 3.12) plus Node.js for the Twin_Gardens selftest.

FROM python:3.12-slim

# Node.js executes Twin_Gardens.js (stdlib-only, Node 18+; Debian's nodejs is sufficient).
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The code under test and the worker are vendored into the image:
# a hermetic build with no network access at runtime.
COPY worker.py ./
COPY workflows/ ./workflows/
COPY Twin_Gardens.js ./
COPY apd_cpe/ ./apd_cpe/

# mistralai-workflows >= 3.10 is required to read the platform-injected
# service-account token (MISTRAL_SA_TOKEN_PATH).
RUN pip install --no-cache-dir "mistralai-workflows>=3.10"

ENV PYTHONUNBUFFERED=1

# The image must start the worker itself; there is no entrypoint setting.
CMD ["python", "worker.py"]
