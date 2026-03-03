"""
Inkform RunPod Serverless Worker
---------------------------------
A serverless handler for RunPod that dynamically fetches, caches, and runs
Civitai base models and LoRAs using the diffusers library.

Network Volume Caching:
  - Models are cached on the attached RunPod Network Volume at /runpod-volume/models/
  - On first use, the worker downloads the .safetensors file from Civitai
  - On subsequent runs, the cached model is loaded directly into VRAM

Environment Variables:
  - CIVITAI_API_TOKEN: Default Civitai API token (can be overridden per request)

Input Schema:
  {
    "prompt": str,
    "negative_prompt": str (optional),
    "width": int (default 1024),
    "height": int (default 1024),
    "num_images": int (1-4, default 1),
    "guidance_scale": float (default 7.0),
    "num_inference_steps": int (default 30),
    "civitai_model_version_id": str (optional),
    "civitai_lora_ids": list[str] (optional),
    "civitai_token": str (optional, overrides env var)
  }

Output Schema:
  {
    "images": list[str]  # Base64-encoded PNG images
  }
"""

import os
import io
import base64
import hashlib
import requests
import torch
import runpod
from pathlib import Path
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
from safetensors.torch import load_file

# ===== Configuration =====
VOLUME_PATH = Path("/runpod-volume/models")
VOLUME_PATH.mkdir(parents=True, exist_ok=True)

LORA_PATH = VOLUME_PATH / "loras"
LORA_PATH.mkdir(parents=True, exist_ok=True)

DEFAULT_MODEL = "stabilityai/stable-diffusion-xl-base-1.0"

# Global pipeline cache
_pipeline = None
_current_model_id = None


def get_civitai_token(job_input: dict) -> str:
    """Get Civitai API token from input or environment."""
    return job_input.get("civitai_token") or os.environ.get("CIVITAI_API_TOKEN", "")


def get_civitai_download_url(version_id: str, token: str) -> str:
    """Get the download URL for a Civitai model version."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    resp = requests.get(
        f"https://civitai.com/api/v1/model-versions/{version_id}",
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    # Find the primary file (usually the first .safetensors)
    for file_info in data.get("files", []):
        if file_info.get("name", "").endswith(".safetensors"):
            download_url = file_info.get("downloadUrl", "")
            if download_url and token:
                separator = "&" if "?" in download_url else "?"
                download_url += f"{separator}token={token}"
            return download_url

    raise ValueError(f"No .safetensors file found for version {version_id}")


def download_model(version_id: str, token: str, is_lora: bool = False) -> Path:
    """Download a model from Civitai and cache it on the Network Volume."""
    cache_dir = LORA_PATH if is_lora else VOLUME_PATH
    cache_file = cache_dir / f"civitai_{version_id}.safetensors"

    if cache_file.exists():
        print(f"[Cache Hit] Model {version_id} found at {cache_file}")
        return cache_file

    print(f"[Cache Miss] Downloading model {version_id} from Civitai...")
    download_url = get_civitai_download_url(version_id, token)

    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    resp = requests.get(download_url, headers=headers, stream=True, timeout=600)
    resp.raise_for_status()

    # Stream download to avoid memory issues with large files
    temp_file = cache_file.with_suffix(".tmp")
    total_size = int(resp.headers.get("content-length", 0))
    downloaded = 0

    with open(temp_file, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192 * 16):
            f.write(chunk)
            downloaded += len(chunk)
            if total_size > 0:
                pct = (downloaded / total_size) * 100
                if downloaded % (50 * 1024 * 1024) < len(chunk):
                    print(f"  Download progress: {pct:.1f}% ({downloaded / 1e9:.2f} GB)")

    temp_file.rename(cache_file)
    print(f"[Downloaded] Model {version_id} saved to {cache_file} ({downloaded / 1e9:.2f} GB)")
    return cache_file


def load_pipeline(model_version_id: str = None, token: str = "") -> StableDiffusionXLPipeline:
    """Load or reuse the SDXL pipeline, optionally from a Civitai model."""
    global _pipeline, _current_model_id

    model_id = model_version_id or "default"

    if _pipeline is not None and _current_model_id == model_id:
        print(f"[Pipeline] Reusing cached pipeline for model {model_id}")
        return _pipeline

    # Clear existing pipeline
    if _pipeline is not None:
        del _pipeline
        torch.cuda.empty_cache()

    if model_version_id:
        model_path = download_model(model_version_id, token, is_lora=False)
        print(f"[Pipeline] Loading custom model from {model_path}")
        pipe = StableDiffusionXLPipeline.from_single_file(
            str(model_path),
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16",
        )
    else:
        print(f"[Pipeline] Loading default model: {DEFAULT_MODEL}")
        pipe = StableDiffusionXLPipeline.from_pretrained(
            DEFAULT_MODEL,
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16",
        )

    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to("cuda")

    # Enable memory optimizations
    pipe.enable_vae_slicing()
    pipe.enable_vae_tiling()

    _pipeline = pipe
    _current_model_id = model_id
    return pipe


def apply_loras(pipe: StableDiffusionXLPipeline, lora_ids: list, token: str):
    """Download and apply LoRA weights to the pipeline."""
    for lora_id in lora_ids:
        lora_path = download_model(lora_id, token, is_lora=True)
        print(f"[LoRA] Loading LoRA from {lora_path}")
        pipe.load_lora_weights(str(lora_path))
    if lora_ids:
        pipe.fuse_lora()


def handler(job: dict) -> dict:
    """RunPod serverless handler function."""
    try:
        job_input = job.get("input", {})

        # Extract parameters
        prompt = job_input.get("prompt", "")
        negative_prompt = job_input.get("negative_prompt", "")
        width = int(job_input.get("width", 1024))
        height = int(job_input.get("height", 1024))
        num_images = min(int(job_input.get("num_images", 1)), 4)
        guidance_scale = float(job_input.get("guidance_scale", 7.0))
        num_inference_steps = int(job_input.get("num_inference_steps", 30))
        civitai_model_id = job_input.get("civitai_model_version_id")
        civitai_lora_ids = job_input.get("civitai_lora_ids", [])
        token = get_civitai_token(job_input)

        if not prompt:
            return {"error": "Prompt is required"}

        # Ensure dimensions are multiples of 8
        width = (width // 8) * 8
        height = (height // 8) * 8

        # Load pipeline
        pipe = load_pipeline(civitai_model_id, token)

        # Apply LoRAs if specified
        if civitai_lora_ids:
            apply_loras(pipe, civitai_lora_ids, token)

        # Generate images
        print(f"[Generate] Prompt: {prompt[:80]}... | {width}x{height} | Steps: {num_inference_steps}")
        result = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt if negative_prompt else None,
            width=width,
            height=height,
            num_images_per_prompt=num_images,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
        )

        # Encode images as base64
        images_b64 = []
        for img in result.images:
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            images_b64.append(f"data:image/png;base64,{b64}")

        # Unfuse LoRAs for next run
        if civitai_lora_ids:
            try:
                pipe.unfuse_lora()
                pipe.unload_lora_weights()
            except Exception:
                pass

        return {"images": images_b64}

    except Exception as e:
        print(f"[Error] {str(e)}")
        return {"error": str(e)}


# Start the RunPod serverless worker
runpod.serverless.start({"handler": handler})
