FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY streams.py .
COPY cdn.py .
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

ENV NUM_WORKERS=1

CMD ["./entrypoint.sh"]
