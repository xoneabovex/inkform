# Inkform RunPod Serverless Worker

A serverless GPU worker for RunPod that dynamically fetches, caches, and runs Civitai base models and LoRAs using the `diffusers` library with SDXL support.

## Features

- **Dynamic Model Loading**: Paste any Civitai model version ID and the worker fetches and loads it automatically.
- **Network Volume Caching**: Models are cached on a RunPod Network Volume so subsequent runs skip the download.
- **LoRA Support**: Apply multiple LoRAs from Civitai on top of any base model.
- **Memory Optimized**: Uses FP16, VAE slicing/tiling, and pipeline caching for efficient VRAM usage.

## Deployment

### Prerequisites

1. A RunPod account with GPU serverless access
2. A RunPod Network Volume (recommended: 50GB+ for model caching)
3. Docker installed locally (for building the image)

### Steps

1. **Build the Docker image:**

```bash
cd runpod-worker
docker build -t inkform-worker .
```

2. **Push to a container registry** (Docker Hub, GitHub Container Registry, etc.):

```bash
docker tag inkform-worker your-registry/inkform-worker:latest
docker push your-registry/inkform-worker:latest
```

3. **Create a RunPod Serverless Endpoint:**
   - Go to [RunPod Console](https://www.runpod.io/console/serverless)
   - Click "New Endpoint"
   - Set the container image to your pushed image
   - Attach your Network Volume at `/runpod-volume`
   - Set GPU type (recommended: RTX 4090 or A100 for SDXL)
   - Set idle timeout and max workers as needed
   - Optionally set `CIVITAI_API_TOKEN` as an environment variable

4. **Note the Endpoint ID** — enter this in the Inkform app settings along with your RunPod API key.

## API Input Schema

```json
{
  "input": {
    "prompt": "a beautiful landscape, masterpiece",
    "negative_prompt": "blurry, low quality",
    "width": 1024,
    "height": 1024,
    "num_images": 1,
    "guidance_scale": 7.0,
    "num_inference_steps": 30,
    "civitai_model_version_id": "128713",
    "civitai_lora_ids": ["12345", "67890"],
    "civitai_token": "optional-override-token"
  }
}
```

## API Output Schema

```json
{
  "images": [
    "data:image/png;base64,..."
  ]
}
```

## Cold Boot Times

- **First run with new model**: 2-5 minutes (downloading 6GB+ model)
- **Subsequent runs (cached)**: 15-30 seconds (loading from Network Volume)
- **Warm worker**: 2-10 seconds (pipeline already in VRAM)

The Inkform app handles these timeouts gracefully with progress indicators.
