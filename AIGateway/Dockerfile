FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ .
COPY start.sh .
RUN chmod +x start.sh
CMD ["./start.sh"]
