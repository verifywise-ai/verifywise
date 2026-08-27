FROM python:3.14-slim

# Pull the latest Debian security patches so Trivy release scans don't fail on
# fixable base-image CVEs (e.g. util-linux CVE-2026-53612..53615, fixed in
# 2.41.5-0+deb13u1). The slim base lags behind the Debian security repo.
# Use dist-upgrade (not upgrade): a plain `apt-get upgrade` holds back any
# security update that pulls in a new dependency, which can silently leave the
# CVE unpatched — dist-upgrade applies it.
# DS-0017 expects `apt-get update` to be paired with `apt-get install` in the
# same layer. Here the pairing is an intentional `dist-upgrade` (apply security
# patches, install no new packages), so the rule is a false positive here.
# trivy:ignore:AVD-DS-0017
RUN apt-get update && apt-get -y dist-upgrade && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy requirements first for better caching
COPY ./EvalServer/requirements.txt requirements.txt

# Install dependencies using CPU-only PyTorch index for smaller image size
RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# Copy the application source
COPY ./EvalServer/src .

# Copy the deepeval_engine module from EvaluationModule
COPY ./EvaluationModule/src/deepeval_engine /app/deepeval_engine

# Copy the datasets from EvaluationModule
COPY ./EvaluationModule/data/datasets /app/datasets

# Create uploads directory for user datasets (will be mounted as volume)
RUN mkdir -p /app/data/uploads

COPY ./EvalServer/start.sh /app/start.sh
RUN chmod +x /app/start.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()"

CMD ["/app/start.sh"]
