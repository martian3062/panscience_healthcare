FROM python:3.11-slim

ARG INSTALL_AI_EXTRAS=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-ai.txt ./

RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_AI_EXTRAS" = "true" ]; then pip install --no-cache-dir -r requirements-ai.txt; fi

COPY app ./app
COPY .env.example ./.env

RUN mkdir -p /app/data /app/uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
