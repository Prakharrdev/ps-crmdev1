# Use NVIDIA CUDA 12.1 Runtime as base
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Set non-interactive for apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.12 and system dependencies
RUN apt-get update && apt-get install -y \
    python3.12 \
    python3-pip \
    python3.12-dev \
    libgl1 \
    libglib2.0-0 \
    wget \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Ensure python3.12 is the default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 \
    && update-alternatives --set python3 /usr/bin/python3.12

# Copy the requirements file (using monorepo path if built from root)
COPY ai-service/requirements.txt .

# Install dependencies (using --no-cache-dir to save space)
# We use the CPU index for PyTorch to save ~4GB, but onnxruntime-gpu for inference speed.
RUN python3 -m pip install --no-cache-dir --upgrade pip && \
    python3 -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Copy the rest of the application code
COPY ai-service/ .

# Set environment variables
ENV PYTHONPATH=/app
ENV DEVICE=0

# Expose the port Railway will assign
EXPOSE 8000

# Start the application
CMD uvicorn service.main:app --host 0.0.0.0 --port ${PORT:-8000}
