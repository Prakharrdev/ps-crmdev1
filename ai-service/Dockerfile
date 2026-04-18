# Use NVIDIA CUDA 11.8 as base for Full GPU Support (Cloud Run compatible)
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Set non-interactive for apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.10 and system dependencies for OpenCV/Model Download
RUN apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-dev \
    libgl1 \
    libglib2.0-0 \
    wget \
    curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Ensure python3.10 is the default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1 \
    && update-alternatives --set python3 /usr/bin/python3.10

# Copy the requirements file
COPY requirements.txt .

# Install dependencies (GPU-enabled)
RUN python3 -m pip install --no-cache-dir --upgrade pip && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV PYTHONPATH=/app
ENV DEVICE=0
ENV PORT=8080

# Cloud Run uses the PORT variable; expose 8080 by default
EXPOSE 8080

# Start the application
CMD uvicorn service.main:app --host 0.0.0.0 --port ${PORT:-8080}
