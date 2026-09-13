# Inkform model and credential audit — September 2026

## Catalog changes

| Area | Result |
| --- | --- |
| Seedream | Upgrade Seedream 3 to `bytedance/seedream-5-lite`; use `image_input`, omit unsupported guidance/seed fields. |
| OpenAI | Upgrade GPT Image 1 to GPT Image 2.5 Flare; add Sunburst. Both Replicate schemas mark OpenAI's own key optional. No OpenAI account is needed when using Replicate billing. |
| Google | Replace preview IDs with stable Gemini 3.1 Flash Image and Gemini 3 Pro Image; add Gemini 3.1 Flash Lite Image. Preserve Gemini 2.5 Flash Image as a supported alternative. |
| Imagen | Retired August 17, 2026. Saved standard/fast/ultra IDs migrate to Nano Banana 2 / Lite / Pro. Remove the obsolete REST path. |
| Qwen | Upgrade to `qwen/qwen-image-2512`; update guidance and step defaults; clamp older step settings to its 20-step minimum. |
| FLUX and Grok | Existing hosted IDs all resolve. Retain distinct FLUX variants; omit unsupported seed for Grok. |
| Upscaling | Both models resolve. Use community model version predictions and GFPGAN's required `img` field, including requested scale. |
| Pony | Verified V6 checkpoint 290640. Previous V7 ID 1268539 returns 404; entry unavailable rather than silently substituting V6. |
| Illustrious | Verified original checkpoint 889818; retain it. |
| NoobAI | Replace missing 833294 with verified Epsilon-pred 1.1 checkpoint 1116447. V-Pred 1.0 is a different prediction configuration and is not substituted into the existing worker. |
| SD 1.5 | Existing ID 128713 is DreamShaper 8; correct its display name. |
| SDXL | Remove missing 101055 and use the worker's existing `stabilityai/stable-diffusion-xl-base-1.0` default. Clear previous Civitai selection when switching models. |
| RunPod FLUX, Z-Image, Chroma, HiDream | Current worker has only SD 1.x/SDXL pipelines. Mark these unavailable and reject incompatible architectures before download. The old Chroma ID was an unrelated character LoRA. |

The app currently accepts one reference image per request. New model entries expose that implemented limit rather than promising a multiple-image picker.

## Credential checks

Read-only calls with user-supplied credentials confirmed Replicate account access, Google model listing, and Civitai authenticated identity (HTTP 200). RunPod's documented endpoint-list API rejected the supplied key (HTTP 401). OpenAI and RunPod endpoint ID were not configured. No credentials are included in this repository, report, tests, or APK.

These checks establish authentication and metadata access only. They do not establish generation quota, billing, successful inference, or on-device launch. No image-generation jobs, credit purchases, or RunPod deployments were performed in this audit. Settings now provides repeatable read-only connection checks.

## Verification and sources

The Replicate field fixture is a reduced snapshot of authenticated model schemas fetched in September 2026. Regression tests exercise every active Replicate catalog model against those accepted field names, along with Google routing/reference inputs, saved Imagen migration, and secret-free connection results. The unused Manus server LLM template is not called by any app route and has not been changed to an unverified proxy model.

- [Replicate HTTP reference](https://replicate.com/docs/reference/http)
- [Seedream 5 Lite schema](https://replicate.com/bytedance/seedream-5-lite/api/schema)
- [GPT Image 2.5 Flare](https://replicate.com/openai/gpt-image-2.5-flare)
- [GPT Image 2.5 Sunburst](https://replicate.com/openai/gpt-image-2.5-sunburst)
- [Qwen Image 2512 schema](https://replicate.com/qwen/qwen-image-2512/api/schema)
- [Google Imagen retirement](https://ai.google.dev/gemini-api/docs/imagen)
- [Google image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [RunPod endpoint-list API](https://docs.runpod.io/api-reference/endpoints/GET/endpoints)
- [Civitai CLI authenticated identity implementation](https://github.com/civitai/cli)
