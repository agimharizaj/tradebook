// Captures the TradingView chart area as a PNG via the Screen Capture API.
// The chart is a cross-origin iframe, so the user-approved share prompt is
// the only way to read its pixels. When the user picks "This Tab", the frame
// is cropped to the #tv-chart-area element; other picks return the full frame.

export type CaptureResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "unsupported" | "cancelled" | "failed" };

export async function captureChartArea(): Promise<CaptureResult> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { ok: false, reason: "unsupported" };
  }
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      // Chrome hints: offer "This Tab" first and allow capturing ourselves.
      ...({ preferCurrentTab: true, selfBrowserSurface: "include" } as object),
    } as MediaStreamConstraints);
  } catch {
    return { ok: false, reason: "cancelled" };
  }
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await new Promise<void>((res) => {
      video.onloadedmetadata = () => res();
    });
    await video.play();
    // Let the first real frame paint before sampling.
    await new Promise((res) => setTimeout(res, 250));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const chart = document.getElementById("tv-chart-area");
    const scaleX = video.videoWidth / window.innerWidth;
    const scaleY = video.videoHeight / window.innerHeight;
    // Crop to the chart only when the capture is clearly this tab
    // (uniform scale close to the devicePixelRatio); otherwise keep it all.
    const selfTab = chart && Math.abs(scaleX - scaleY) < 0.02 && scaleX >= 0.9;
    if (selfTab) {
      const r = chart.getBoundingClientRect();
      canvas.width = Math.round(r.width * scaleX);
      canvas.height = Math.round(r.height * scaleY);
      ctx.drawImage(
        video,
        Math.round(r.left * scaleX), Math.round(r.top * scaleY),
        canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height
      );
    } else {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    return blob ? { ok: true, blob } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
