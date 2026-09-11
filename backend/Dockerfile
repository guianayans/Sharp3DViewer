FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for Python packages + potential ML deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        build-essential \
        ca-certificates \
        ffmpeg \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend code, including ml-sharp repo if present
COPY . /app

# Ensure ml-sharp is present (clone if empty/missing), then install to provide `sharp` CLI
RUN if [ ! -f "/app/ml-sharp/pyproject.toml" ] && [ ! -f "/app/ml-sharp/setup.py" ]; then \
        rm -rf /app/ml-sharp; \
        git clone https://github.com/apple/ml-sharp.git /app/ml-sharp; \
    fi && \
    if [ -f "/app/ml-sharp/pyproject.toml" ] || [ -f "/app/ml-sharp/setup.py" ]; then \
        pip install --no-cache-dir -e /app/ml-sharp; \
    fi

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
