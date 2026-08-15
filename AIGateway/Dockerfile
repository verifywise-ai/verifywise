FROM python:3.12-slim
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
