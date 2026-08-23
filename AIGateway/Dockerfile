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

WORKDIR /app
COPY requirements.txt .
# presidio-anonymizer 2.2.364 caps cryptography<49.0.0, but VerifyWise requires >=50.0.0.
# Install presidio-anonymizer without deps; its only required dependency is cryptography,
# which is already listed in requirements.txt.
RUN grep -v '^presidio-anonymizer' requirements.txt > requirements-install.txt && \
    pip install --no-cache-dir -r requirements-install.txt && \
    pip install --no-cache-dir --no-deps presidio-anonymizer>=2.2.364 && \
    rm requirements-install.txt
COPY src/ .
COPY start.sh .
RUN chmod +x start.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/health').read()"

CMD ["./start.sh"]
