"""
Inkform RunPod Serverless Worker
---------------------------------
Dynamically fetches and runs Civitai base models (SDXL, Pony, Illustrious,
SD 1.5, Flux, etc.) with LoRAs using the diffusers library.
Supports txt2img and img2img modes, hi-res fix, VAE selection, and mature content.

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
    "civitai_model_version_id": str (optional),
    "civitai_loras": list[{"id": str, "weight": float}] (optional),
    "civitai_token": str (optional, overrides env var),
    "hires_fix": bool (optional),
    "hires_upscale": float (optional, default 1.5),
    "hires_steps": int (optional, default 10),
    "hires_denoising": float (optional, default 0.5),
    "vae": str (optional — "default", "sdxl-vae-fp16-fix", "kl-f8-anime2"),
    "mature_content": bool (optional, default false),
    "denoising_strength": float (optional, for img2img),
    "init_image_url": str (optional, URL for img2img reference image)
  }

Output Schema:
  { "images": list[str], "seed": int }  # data:image/png;base64,... strings
"""

import os
import io
import base64
import random
import requests
import torch
import runpod
from pathlib import Path
from PIL import Image
from diffusers import (
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
    StableDiffusionImg2ImgPipeline,
    StableDiffusionXLImg2ImgPipeline,
    AutoencoderKL,
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
_img2img_pipeline = None


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
    xl_keywords = ["xl", "sdxl", "pony", "illustrious", "noobai", "animagine xl", "flux"]
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


# ===== Image Helpers =====
def download_image(url: str) -> Image.Image:
    """Download an image from URL for img2img."""
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


# ===== Pipeline Management =====
def load_pipeline(model_version_id: str = None, token: str = "", sampling_method: str = "euler_a",
                  vae_name: str = None, img2img: bool = False):
    """Load or reuse the pipeline."""
    global _pipeline, _current_model_id, _is_xl_model, _img2img_pipeline

    model_id = model_version_id or "default_xl"
    cache_key = f"{model_id}_{vae_name or 'default'}"

    if _pipeline is not None and _current_model_id == cache_key and not img2img:
        print(f"[Pipeline] Reusing cached pipeline for {cache_key}")
        apply_scheduler(_pipeline, sampling_method)
        return _pipeline

    # Clear existing pipelines
    if _pipeline is not None:
        del _pipeline
        _pipeline = None
    if _img2img_pipeline is not None:
        del _img2img_pipeline
        _img2img_pipeline = None
    torch.cuda.empty_cache()

    is_xl = True

    if model_version_id:
        model_path, base_model = download_civitai_file(model_version_id, token, is_lora=False)
        is_xl = detect_is_xl(base_model)
        print(f"[Pipeline] Loading custom model from {model_path} (XL={is_xl}, base={base_model})")

        if img2img:
            PipelineClass = StableDiffusionXLImg2ImgPipeline if is_xl else StableDiffusionImg2ImgPipeline
        else:
            PipelineClass = StableDiffusionXLPipeline if is_xl else StableDiffusionPipeline

        pipe = PipelineClass.from_single_file(
            str(model_path),
            torch_dtype=torch.float16,
            use_safetensors=True,
        )
    else:
        print(f"[Pipeline] Loading default SDXL model")
        if img2img:
            pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
                DEFAULT_MODEL_XL,
                torch_dtype=torch.float16,
                use_safetensors=True,
                variant="fp16",
            )
        else:
            pipe = StableDiffusionXLPipeline.from_pretrained(
                DEFAULT_MODEL_XL,
                torch_dtype=torch.float16,
                use_safetensors=True,
                variant="fp16",
            )

    # Apply custom VAE
    if vae_name and vae_name != "default":
        try:
            vae_map = {
                "sdxl-vae-fp16-fix": "madebyollin/sdxl-vae-fp16-fix",
                "kl-f8-anime2": "hakurei/waifu-diffusion-v1-4",
            }
            vae_repo = vae_map.get(vae_name, vae_name)
            print(f"[VAE] Loading {vae_repo}")
            vae = AutoencoderKL.from_pretrained(vae_repo, torch_dtype=torch.float16)
            pipe.vae = vae
        except Exception as e:
            print(f"[VAE] Warning: Could not load {vae_name}: {e}")

    apply_scheduler(pipe, sampling_method)
    pipe = pipe.to("cuda")
    pipe.enable_vae_slicing()
    pipe.enable_vae_tiling()

    if img2img:
        _img2img_pipeline = pipe
    else:
        _pipeline = pipe
    _current_model_id = cache_key
    _is_xl_model = is_xl
    return pipe


def apply_loras(pipe, lora_list: list, token: str):
    """Apply LoRA weights. lora_list = [{"id": str, "weight": float}]"""
    adapter_names = []
    adapter_weights = []
    for lora_entry in lora_list:
        lora_id = lora_entry.get("id", "")
        weight = float(lora_entry.get("weight", 0.8))
        if not lora_id:
            continue
        lora_path, _ = download_civitai_file(lora_id, token, is_lora=True)
        print(f"[LoRA] Loading {lora_id} (weight={weight}) from {lora_path}")
        adapter_name = f"lora_{lora_id}"
        pipe.load_lora_weights(str(lora_path), adapter_name=adapter_name)
        adapter_names.append(adapter_name)
        adapter_weights.append(weight)

    if adapter_names:
        pipe.set_adapters(adapter_names, adapter_weights=adapter_weights)


def apply_clip_skip(pipe, clip_skip: int):
    """Apply CLIP skip by truncating the text encoder layers."""
    if clip_skip <= 1:
        return
    try:
        if hasattr(pipe, "text_encoder") and hasattr(pipe.text_encoder, "text_model"):
            layers = pipe.text_encoder.text_model.encoder.layers
            pipe.text_encoder.text_model.encoder.layers = layers[:-clip_skip + 1] if clip_skip > 1 else layers
    except Exception as e:
        print(f"[CLIP Skip] Warning: {e}")


# ===== Hi-Res Fix =====
def apply_hires_fix(pipe, images, prompt, negative_prompt, hires_upscale, hires_steps, hires_denoising, generator):
    """Apply hi-res fix by upscaling then running img2img."""
    global _is_xl_model
    try:
        upscaled = []
        for img in images:
            new_w = int(img.width * hires_upscale)
            new_h = int(img.height * hires_upscale)
            # Round to 8
            new_w = (new_w // 8) * 8
            new_h = (new_h // 8) * 8
            upscaled.append(img.resize((new_w, new_h), Image.LANCZOS))

        # Create img2img pipeline from the same model
        if _is_xl_model:
            i2i_pipe = StableDiffusionXLImg2ImgPipeline(**pipe.components)
        else:
            i2i_pipe = StableDiffusionImg2ImgPipeline(**pipe.components)

        result_images = []
        for up_img in upscaled:
            result = i2i_pipe(
                prompt=prompt,
                negative_prompt=negative_prompt or None,
                image=up_img,
                strength=hires_denoising,
                num_inference_steps=hires_steps,
                generator=generator,
            )
            result_images.extend(result.images)

        return result_images
    except Exception as e:
        print(f"[Hi-Res Fix] Warning: {e}, returning original images")
        return images


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
        civitai_model_id = inp.get("civitai_model_version_id")
        civitai_loras = inp.get("civitai_loras", [])
        token = get_civitai_token(inp)
        vae_name = inp.get("vae")
        hires_fix = bool(inp.get("hires_fix", False))
        hires_upscale = float(inp.get("hires_upscale", 1.5))
        hires_steps = int(inp.get("hires_steps", 10))
        hires_denoising = float(inp.get("hires_denoising", 0.5))
        denoising_strength = float(inp.get("denoising_strength", 0.75))
        init_image_url = inp.get("init_image_url")
        mature_content = bool(inp.get("mature_content", False))

        # Seed
        if seed_val is None or seed_val == -1:
            seed_val = random.randint(0, 2**32 - 1)
        generator = torch.Generator("cuda").manual_seed(int(seed_val))

        is_img2img = bool(init_image_url)

        print(f"[Job] prompt={prompt[:60]}... size={width}x{height} steps={num_steps} cfg={guidance_scale} "
              f"sampler={sampling_method} seed={seed_val} img2img={is_img2img} hires={hires_fix}")

        # Load pipeline
        pipe = load_pipeline(civitai_model_id, token, sampling_method, vae_name, img2img=is_img2img)

        # Apply CLIP skip
        apply_clip_skip(pipe, clip_skip)

        # Apply LoRAs
        lora_applied = False
        if civitai_loras:
            apply_loras(pipe, civitai_loras, token)
            lora_applied = True

        # Mature content: if disabled, add safety negative prompt
        if not mature_content:
            safety_neg = "nsfw, nude, naked, explicit, pornographic"
            if negative_prompt:
                negative_prompt = f"{negative_prompt}, {safety_neg}"
            else:
                negative_prompt = safety_neg

        if is_img2img:
            # Img2img mode
            init_image = download_image(init_image_url)
            init_image = init_image.resize((width, height), Image.LANCZOS)

            gen_kwargs = dict(
                prompt=prompt,
                negative_prompt=negative_prompt or None,
                image=init_image,
                strength=denoising_strength,
                num_images_per_prompt=num_images,
                guidance_scale=guidance_scale,
                num_inference_steps=num_steps,
                generator=generator,
            )
            result = pipe(**gen_kwargs)
        else:
            # Txt2img mode
            gen_kwargs = dict(
                prompt=prompt,
                negative_prompt=negative_prompt or None,
                width=width,
                height=height,
                num_images_per_prompt=num_images,
                guidance_scale=guidance_scale,
                num_inference_steps=num_steps,
                generator=generator,
            )
            result = pipe(**gen_kwargs)

        images = result.images

        # Hi-res fix (only for txt2img)
        if hires_fix and not is_img2img:
            images = apply_hires_fix(
                pipe, images, prompt, negative_prompt,
                hires_upscale, hires_steps, hires_denoising, generator
            )

        # Encode as base64
        images_b64 = []
        for img in images:
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
