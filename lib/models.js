// CineForge AI — Seedance model catalog (fal.ai endpoints)
// All live Seedance versions served through fal queue API + LOCAL Free Demo mode.

export const SAMPLE_VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
];

export const DURATIONS = {
  "1.0": ["5", "6", "7", "8", "9", "10"],
  "1.5": ["4", "5", "6", "7", "8", "9", "10", "11", "12"],
  "2.0": ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  "2.5": ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
};

export const RESOLUTIONS = {
  "1.0": ["480p", "720p", "1080p"],
  "1.5": ["480p", "720p"],
  "2.0": ["480p", "720p", "1080p"],
  "2.5": ["480p", "720p"],
};

export const ASPECTS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

export const MODELS = [
  // ——— Seedance 2.5 (latest) ———
  {
    id: "bytedance/seedance-2.5/text-to-video",
    name: "Seedance 2.5",
    version: "2.5",
    mode: "t2v",
    tag: "Newest",
    desc: "Latest generation, next-level cinematic realism & physics.",
    audio: true,
  },
  // ——— Seedance 2.0 ———
  {
    id: "bytedance/seedance-2.0/text-to-video",
    name: "Seedance 2.0",
    version: "2.0",
    mode: "t2v",
    tag: "Flagship",
    desc: "Native audio, multi-shot editing, director-level camera control.",
    audio: true,
  },
  {
    id: "bytedance/seedance-2.0/fast/text-to-video",
    name: "Seedance 2.0 Fast",
    version: "2.0",
    mode: "t2v",
    tag: "Fast",
    desc: "Same quality family, lower latency & cost.",
    audio: true,
  },
  {
    id: "bytedance/seedance-2.0/mini/text-to-video",
    name: "Seedance 2.0 Mini",
    version: "2.0",
    mode: "t2v",
    tag: "Budget",
    desc: "Great performance and high generation speed at lower cost.",
    audio: true,
  },
  {
    id: "bytedance/seedance-2.0/image-to-video",
    name: "Seedance 2.0 Image → Video",
    version: "2.0",
    mode: "i2v",
    tag: "Flagship",
    desc: "Animate a still image with synchronized audio & motion.",
    audio: true,
    needsImage: true,
  },
  {
    id: "bytedance/seedance-2.0/fast/image-to-video",
    name: "Seedance 2.0 Fast Image → Video",
    version: "2.0",
    mode: "i2v",
    tag: "Fast",
    desc: "Fast tier image animation with native audio.",
    audio: true,
    needsImage: true,
  },
  {
    id: "bytedance/seedance-2.0/mini/image-to-video",
    name: "Seedance 2.0 Mini Image → Video",
    version: "2.0",
    mode: "i2v",
    tag: "Budget",
    desc: "Mini tier image-to-video, cheap & quick.",
    audio: true,
    needsImage: true,
  },
  {
    id: "bytedance/seedance-2.0/reference-to-video",
    name: "Seedance 2.0 Reference → Video",
    version: "2.0",
    mode: "ref2v",
    tag: "Multimodal",
    desc: "Up to 9 images / 3 clips / 3 audio inputs, referenced in prompt.",
    audio: true,
    needsImage: true,
  },
  {
    id: "bytedance/seedance-2.0/fast/reference-to-video",
    name: "Seedance 2.0 Fast Ref → Video",
    version: "2.0",
    mode: "ref2v",
    tag: "Fast",
    desc: "Fast tier multimodal reference generation.",
    audio: true,
    needsImage: true,
  },
  // ——— Seedance 1.5 Pro (audio) ———
  {
    id: "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
    name: "Seedance 1.5 Pro",
    version: "1.5",
    mode: "t2v",
    tag: "Audio",
    desc: "Broadcast-ready clips: dialogue, SFX & music from one prompt.",
    audio: true,
  },
  {
    id: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
    name: "Seedance 1.5 Pro Image → Video",
    version: "1.5",
    mode: "i2v",
    tag: "Audio",
    desc: "Start/end frame animation with native audio.",
    audio: true,
    needsImage: true,
  },
  // ——— Seedance 1.0 Pro ———
  {
    id: "fal-ai/bytedance/seedance/v1/pro/text-to-video",
    name: "Seedance 1.0 Pro",
    version: "1.0",
    mode: "t2v",
    tag: "",
    desc: "Multi-shot storytelling, strong prompt following, 1080p.",
    audio: false,
  },
  {
    id: "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video",
    name: "Seedance 1.0 Pro Fast",
    version: "1.0",
    mode: "t2v",
    tag: "Fast",
    desc: "Maximum performance at minimal cost.",
    audio: false,
  },
  {
    id: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    name: "Seedance 1.0 Pro Image → Video",
    version: "1.0",
    mode: "i2v",
    tag: "",
    desc: "Still image to fluid motion, cinematic output.",
    audio: false,
    needsImage: true,
  },
  {
    id: "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video",
    name: "Seedance 1.0 Pro Fast Image → Video",
    version: "1.0",
    mode: "i2v",
    tag: "Fast",
    desc: "Fast image animation.",
    audio: false,
    needsImage: true,
  },
  // ——— Seedance 1.0 Lite (legacy, routed to Pro Fast) ———
  {
    id: "fal-ai/bytedance/seedance/v1/lite/text-to-video",
    name: "Seedance 1.0 Lite",
    version: "1.0",
    mode: "t2v",
    tag: "Legacy",
    desc: "Legacy endpoint — automatically routed to 1.0 Pro Fast.",
    audio: false,
    deprecated: true,
  },
  {
    id: "fal-ai/bytedance/seedance/v1/lite/image-to-video",
    name: "Seedance 1.0 Lite Image → Video",
    version: "1.0",
    mode: "i2v",
    tag: "Legacy",
    desc: "Legacy endpoint — automatically routed to 1.0 Pro Fast.",
    audio: false,
    needsImage: true,
    deprecated: true,
  },
];

export const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]));

// Adapts a generation form into the exact input payload each endpoint expects.
export function buildPayload(model, form) {
  const p = {};
  if (form.prompt) p.prompt = form.prompt;

  // Image / reference inputs
  if (model.mode === "i2v") {
    if (form.imageUrl) p.image_url = form.imageUrl;
    if (model.id.includes("v1.5") && form.endImageUrl) p.end_image_url = form.endImageUrl;
  } else if (model.mode === "ref2v") {
    const refs = form.refImageUrls && form.refImageUrls.length ? form.refImageUrls : form.imageUrl ? [form.imageUrl] : [];
    if (refs.length) p.reference_image_urls = refs;
    if (model.id.includes("seedance-2.0")) {
      if (form.refVideoUrls && form.refVideoUrls.length) p.reference_video_urls = form.refVideoUrls;
      if (form.refAudioUrls && form.refAudioUrls.length) p.reference_audio_urls = form.refAudioUrls;
    }
  }

  if (model.version === "1.0") {
    if (form.aspect && form.aspect !== "auto") p.aspect_ratio = form.aspect;
    if (form.resolution) p.resolution = form.resolution;
    if (form.duration && !form.duration.startsWith("auto")) p.duration = Number(form.duration);
    p.camera_fixed = !!form.cameraFixed;
    if (form.seed != null && form.seed !== "") p.seed = Number(form.seed);
  } else if (model.version === "1.5") {
    if (form.aspect && form.aspect !== "auto") p.aspect_ratio = form.aspect;
    if (form.resolution) p.resolution = form.resolution;
    if (form.duration && !form.duration.startsWith("auto")) p.duration = Number(form.duration);
    p.generate_audio = !!form.audio;
    p.camera_fixed = !!form.cameraFixed;
    if (form.seed != null && form.seed !== "") p.seed = Number(form.seed);
  } else if (model.version === "2.0") {
    if (form.resolution) p.resolution = form.resolution;
    if (form.duration && !form.duration.startsWith("auto")) p.duration = form.duration;
    if (form.aspect && form.aspect !== "auto") p.aspect_ratio = form.aspect;
    p.generate_audio = !!form.audio;
    if (form.seed != null && form.seed !== "") p.seed = Number(form.seed);
  } else if (model.version === "2.5") {
    if (form.resolution) p.resolution = form.resolution;
    if (form.duration && !form.duration.startsWith("auto")) p.duration = form.duration;
    if (form.aspect && form.aspect !== "auto") p.aspect_ratio = form.aspect;
    p.generate_audio = !!form.audio;
    if (form.seed != null && form.seed !== "") p.seed = Number(form.seed);
  }

  return p;
}

export function isImageMode(model) {
  return model.mode === "i2v" || model.mode === "ref2v";
}

export function isRefMode(model) {
  return model.mode === "ref2v";
}