"""
Inkform RunPod Serverless Worker
---------------------------------
Dynamically fetches and runs Civitai base models (SDXL, Pony, Illustrious,
SD 1.5, etc.) with LoRAs using the diffusers library.

Network Volume Caching:
  - Models cached at /runpod-volume/models/
  - LoRAs cached at /runpod-volume/loras/

Input Schema:
  {
    "prompt": str,
    "negative_prompt": str (optional),
    "width": int (default 1024),
    "height": int (default 1024),
    "num_images": int (1-4, default 1),
    "guidance_scale": float (default 7.0),
    "num_inference_steps": int (default 30),
    "seed": int (optional, -1 for random),
    "sampling_method": str (optional) — one of:
        "euler", "euler_a", "dpm++_2m_karras", "dpm++_sde_karras",
        "dpm++_2m", "dpm++_sde", "ddim", "lcm", "heun", "lms"
    "clip_skip": int (1-4, default 1),
    "quality_boost": bool (default false),
    "civitai_model_version_id": str (optional),
    "civitai_loras": list[{"id": str, "weight": float}] (optional),
    "civitai_token": str (optional, overrides env var)
  }

Output Schema:
  { "images": list[str] }  # data:image/png;base64,... strings
"""

import os
import io
import base64
import random
import requests
import torch
import runpod
from pathlib import Path
from diffusers import (
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
    EulerDiscreteScheduler,
    EulerAncestralDiscreteScheduler,
    DPMSolverMultistepScheduler,
    DPMSolverSDEScheduler,
    DDIMScheduler,
    LCMScheduler,
    HeunDiscreteScheduler,
    LMSDiscreteScheduler,
)

# ===== Configuration =====
VOLUME_PATH = Path("/runpod-volume/models")
LORA_PATH = Path("/runpod-volume/loras")
VOLUME_PATH.mkdir(parents=True, exist_ok=True)
LORA_PATH.mkdir(parents=True, exist_ok=True)

DEFAULT_MODEL_XL = "stabilityai/stable-diffusion-xl-base-1.0"
DEFAULT_MODEL_15 = "runwayml/stable-diffusion-v1-5"

# Global pipeline cache
_pipeline = None
_current_model_id = None
_is_xl_model = True


# ===== Scheduler Factory =====
SCHEDULER_MAP = {
    "euler": EulerDiscreteScheduler,
    "euler_a": EulerAncestralDiscreteScheduler,
    "dpm++_2m_karras": lambda cfg: DPMSolverMultistepScheduler.from_config(cfg, use_karras_sigmas=True),
    "dpm++_sde_karras": lambda cfg: DPMSolverSDEScheduler.from_config(cfg, use_karras_sigmas=True),
    "dpm++_2m": DPMSolverMultistepScheduler,
    "dpm++_sde": DPMSolverSDEScheduler,
    "ddim": DDIMScheduler,
    "lcm": LCMScheduler,
    "heun": HeunDiscreteScheduler,
    "lms": LMSDiscreteScheduler,
}

def apply_scheduler(pipe, method: str):
    """Apply a sampling scheduler to the pipeline."""
    if not method or method not in SCHEDULER_MAP:
        method = "euler_a"
    scheduler_cls = SCHEDULER_MAP[method]
    if callable(scheduler_cls) and not isinstance(scheduler_cls, type):
        # Lambda factory
        pipe.scheduler = scheduler_cls(pipe.scheduler.config)
    else:
        pipe.scheduler = scheduler_cls.from_config(pipe.scheduler.config)


# ===== Civitai Helpers =====
def get_civitai_token(job_input: dict) -> str:
    return job_input.get("civitai_token") or os.environ.get("CIVITAI_API_TOKEN", "")


def get_civitai_download_url(version_id: str, token: str) -> tuple[str, str]:
    """Returns (download_url, base_model_type)."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = requests.get(
        f"https://civitai.com/api/v1/model-versions/{version_id}",
        headers=headers, timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    base_model = data.get("baseModel", "SDXL 1.0")

    for file_info in data.get("files", []):
        if file_info.get("name", "").endswith(".safetensors"):
            url = file_info.get("downloadUrl", "")
            if url and token:
                sep = "&" if "?" in url else "?"
                url += f"{sep}token={token}"
            return url, base_model

    raise ValueError(f"No .safetensors file found for version {version_id}")


def detect_is_xl(base_model: str) -> bool:
    """Detect if a model is XL-based from its base model string."""
    xl_keywords = ["xl", "sdxl", "pony", "illustrious", "noobai", "animagine xl"]
    return any(kw in base_model.lower() for kw in xl_keywords)


def download_civitai_file(version_id: str, token: str, is_lora: bool = False) -> tuple[Path, str]:
    """Download a Civitai model/LoRA and return (path, base_model_type)."""
    cache_dir = LORA_PATH if is_lora else VOLUME_PATH
    cache_file = cache_dir / f"civitai_{version_id}.safetensors"
    meta_file = cache_dir / f"civitai_{version_id}.meta"

    base_model = "SDXL 1.0"
    if meta_file.exists():
        base_model = meta_file.read_text().strip()

    if cache_file.exists():
        print(f"[Cache Hit] {version_id} at {cache_file}")
        return cache_file, base_model

    print(f"[Cache Miss] Downloading {version_id} from Civitai...")
    download_url, base_model = get_civitai_download_url(version_id, token)
    meta_file.write_text(base_model)

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = requests.get(download_url, headers=headers, stream=True, timeout=600)
    resp.raise_for_status()

    temp_file = cache_file.with_suffix(".tmp")
    total = int(resp.headers.get("content-length", 0))
    downloaded = 0
    with open(temp_file, "wb") as f:
        for chunk in resp.iter_content(chunk_size=131072):
            f.write(chunk)
            downloaded += len(chunk)
            if total > 0 and downloaded % (50 * 1024 * 1024) < len(chunk):
                print(f"  {downloaded / 1e9:.2f} GB / {total / 1e9:.2f} GB ({100*downloaded/total:.1f}%)")

    temp_file.rename(cache_file)
    print(f"[Downloaded] {version_id}: {downloaded / 1e9:.2f} GB, base: {base_model}")
    return cache_file, base_model


# ===== Pipeline Management =====
def load_pipeline(model_version_id: str = None, token: str = "", sampling_method: str = "euler_a"):
    """Load or reuse the pipeline."""
    global _pipeline, _current_model_id, _is_xl_model

    model_id = model_version_id or "default_xl"

    if _pipeline is not None and _current_model_id == model_id:
        print(f"[Pipeline] Reusing cached pipeline for {model_id}")
        apply_scheduler(_pipeline, sampling_method)
        return _pipeline

    # Clear existing pipeline
    if _pipeline is not None:
        del _pipeline
        torch.cuda.empty_cache()

    is_xl = True

    if model_version_id:
        model_path, base_model = download_civitai_file(model_version_id, token, is_lora=False)
        is_xl = detect_is_xl(base_model)
        print(f"[Pipeline] Loading custom model from {model_path} (XL={is_xl}, base={base_model})")

        PipelineClass = StableDiffusionXLPipeline if is_xl else StableDiffusionPipeline
        pipe = PipelineClass.from_single_file(
            str(model_path),
            torch_dtype=torch.float16,
            use_safetensors=True,
        )
    else:
        print(f"[Pipeline] Loading default SDXL model")
        pipe = StableDiffusionXLPipeline.from_pretrained(
            DEFAULT_MODEL_XL,
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16",
        )

    apply_scheduler(pipe, sampling_method)
    pipe = pipe.to("cuda")
    pipe.enable_vae_slicing()
    pipe.enable_vae_tiling()

    _pipeline = pipe
    _current_model_id = model_id
    _is_xl_model = is_xl
    return pipe


def apply_loras(pipe, lora_list: list, token: str):
    """Apply LoRA weights. lora_list = [{"id": str, "weight": float}]"""
    for lora_entry in lora_list:
        lora_id = lora_entry.get("id", "")
        weight = float(lora_entry.get("weight", 0.8))
        if not lora_id:
            continue
        lora_path, _ = download_civitai_file(lora_id, token, is_lora=True)
        print(f"[LoRA] Loading {lora_id} (weight={weight}) from {lora_path}")
        adapter_name = f"lora_{lora_id}"
        pipe.load_lora_weights(str(lora_path), adapter_name=adapter_name)
        pipe.set_adapters([adapter_name], adapter_weights=[weight])


def apply_clip_skip(pipe, clip_skip: int):
    """Apply CLIP skip by truncating the text encoder layers."""
    if clip_skip <= 1:
        return
    try:
        # For SD 1.5
        if hasattr(pipe, "text_encoder") and hasattr(pipe.text_encoder, "text_model"):
            layers = pipe.text_encoder.text_model.encoder.layers
            pipe.text_encoder.text_model.encoder.layers = layers[:-clip_skip + 1] if clip_skip > 1 else layers
    except Exception as e:
        print(f"[CLIP Skip] Warning: {e}")


# ===== Main Handler =====
def handler(job: dict) -> dict:
    """RunPod serverless handler."""
    try:
        inp = job.get("input", {})

        prompt = inp.get("prompt", "")
        if not prompt:
            return {"error": "Prompt is required"}

        negative_prompt = inp.get("negative_prompt", "")
        width = (int(inp.get("width", 1024)) // 8) * 8
        height = (int(inp.get("height", 1024)) // 8) * 8
        num_images = min(int(inp.get("num_images", 1)), 4)
        guidance_scale = float(inp.get("guidance_scale", 7.0))
        num_steps = int(inp.get("num_inference_steps", 30))
        seed_val = inp.get("seed", -1)
        sampling_method = inp.get("sampling_method", "euler_a")
        clip_skip = max(1, min(4, int(inp.get("clip_skip", 1))))
        quality_boost = bool(inp.get("quality_boost", False))
        civitai_model_id = inp.get("civitai_model_version_id")
        civitai_loras = inp.get("civitai_loras", [])  # [{"id": str, "weight": float}]
        token = get_civitai_token(inp)

        # Seed
        if seed_val is None or seed_val == -1:
            seed_val = random.randint(0, 2**32 - 1)
        generator = torch.Generator("cuda").manual_seed(int(seed_val))

        print(f"[Job] prompt={prompt[:60]}... size={width}x{height} steps={num_steps} cfg={guidance_scale} sampler={sampling_method} seed={seed_val}")

        # Load pipeline
        pipe = load_pipeline(civitai_model_id, token, sampling_method)

        # Apply CLIP skip
        apply_clip_skip(pipe, clip_skip)

        # Apply LoRAs
        lora_applied = False
        if civitai_loras:
            apply_loras(pipe, civitai_loras, token)
            lora_applied = True

        # Quality boost: add detail-enhancing suffix
        effective_prompt = prompt
        if quality_boost:
            effective_prompt = prompt + ", masterpiece, best quality, highly detailed, sharp focus, 8k"
            if not negative_prompt:
                negative_prompt = "lowres, blurry, worst quality, bad anatomy, watermark"

        # Generate
        gen_kwargs = dict(
            prompt=effective_prompt,
            negative_prompt=negative_prompt or None,
            width=width,
            height=height,
            num_images_per_prompt=num_images,
            guidance_scale=guidance_scale,
            num_inference_steps=num_steps,
            generator=generator,
        )

        result = pipe(**gen_kwargs)

        # Encode as base64
        images_b64 = []
        for img in result.images:
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            images_b64.append(f"data:image/png;base64,{b64}")

        # Cleanup LoRAs for next run
        if lora_applied:
            try:
                pipe.unload_lora_weights()
            except Exception:
                pass

        return {"images": images_b64, "seed": seed_val}

    except Exception as e:
        import traceback
        print(f"[Error] {e}\n{traceback.format_exc()}")
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
