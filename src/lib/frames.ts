// Client-only: extract N evenly-spaced frames from a video File as JPEG data URLs.
export async function extractFramesFromFile(file: File, count = 6, maxWidth = 640): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    return await extractFramesFromUrl(url, count, maxWidth);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extractFramesFromUrl(url: string, count = 6, maxWidth = 640): Promise<string[]> {
  const video = document.createElement("video");
  video.src = url;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video for frame extraction"));
  });

  const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("Video has no dimensions");

  const scale = width > maxWidth ? maxWidth / width : 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration > 0 ? (duration * (i + 0.5)) / count : 0;
    await seek(video, t);
    ctx.drawImage(video, 0, 0, w, h);
    frames.push(canvas.toDataURL("image/jpeg", 0.72));
  }
  return frames;
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("seek failed")); };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try { video.currentTime = Math.max(0, time); } catch { onError(); }
  });
}
