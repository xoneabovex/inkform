# Inkform RunPod Serverless Worker
# Base image with CUDA and Python for GPU inference
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker code
COPY handler.py .

# Create model cache directories
RUN mkdir -p /runpod-volume/models/loras

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV TRANSFORMERS_CACHE=/runpod-volume/cache/transformers
ENV HF_HOME=/runpod-volume/cache/huggingface

CMD ["python", "-u", "handler.py"]
