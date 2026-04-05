# Use NVIDIA CUDA 12.1 Runtime with Ubuntu 24.04 (has native Python 3.12)
FROM nvidia/cuda:12.1.1-cudnn-runtime-ubuntu24.04

# Set non-interactive for apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.12 and system dependencies
# Note: Ubuntu 24.04 doesn't have python3-pip in the same way, we use python3-full or pip install
RUN apt-get update && apt-get install -y \
    python3.12 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    wget \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Ensure python3.12 is the default
RUN ln -sf /usr/bin/python3.12 /usr/bin/python3

# Copy the requirements file (Path is relative to build context)
COPY requirements.txt .

# Install dependencies (using --no-cache-dir to save space)
# We use the CPU index for PyTorch to save ~4GB, but onnxruntime-gpu for inference speed.
RUN python3 -m pip install --no-cache-dir --upgrade pip --break-system-packages && \
    python3 -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt --break-system-packages

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV PYTHONPATH=/app
ENV DEVICE=0

# Expose the standard port
EXPOSE 8000

# Start the application using dynamic Cloud Run PORT
CMD uvicorn service.main:app --host 0.0.0.0 --port ${PORT:-8000}
