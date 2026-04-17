FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system deps (Pillow needs these)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libjpeg62-turbo-dev zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Start the server using the dynamic PORT provided by the platform (standard for Railway/Cloud Run)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
