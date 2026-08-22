FROM python:3.12-slim

# TEMP DIAGNOSTIC: print apt-cache candidates for bsdutils/util-linux, run
# dist-upgrade, and dump installed versions. Used to check whether the trixie
# security repo actually has 2.41.5-0+deb13u1 (Trivy's declared fix for
# CVE-2026-53612..53615). Remove after diagnosis.
RUN apt-get update && \
    echo "=== apt-cache policy ===" && \
    apt-cache policy bsdutils util-linux && \
    apt-get -y dist-upgrade && \
    echo "=== dpkg -l after upgrade ===" && \
    dpkg -l bsdutils util-linux && \
    rm -rf /var/lib/apt/lists/*

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
