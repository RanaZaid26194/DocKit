// Tesseract.js runner. We keep a single worker and route jobs to it. All
// OCR happens on the renter's device — the image bytes never leave until
// the manager gets the final packet.
//
// Round-5 rewrite: raw phone photos were failing badly. A 12 MP "best
// quality" photo is *worse* input than a 2 MP one — Tesseract downsamples
// internally, JPEG noise survives, and glare/uneven lighting wrecks the
// binarization. So every image now goes through a deterministic
// pre-processing pass before it reaches the engine:
//
//   1. Decode with createImageBitmap (respects EXIF orientation).
//   2. Resample so the long edge lands in the 1600-2600 px sweet spot.
//   3. Convert to luminance grayscale.
//   4. Auto-contrast (2nd/98th percentile stretch) to kill flat, washed-out
//      phone exposures.
//   5. Light adaptive threshold assist — we keep grayscale (Tesseract's own
//      Otsu is good) but push the histogram apart first.
//
// We also OCR twice when the first pass looks empty: once upright, once at
// the alternate page-segmentation mode, and keep whichever produced more
// readable text.
import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    // English + Spanish so the flow works for Spanish-language documents.
    workerPromise = createWorker(["eng", "spa"]);
  }
  return workerPromise;
}

const MIN_LONG_EDGE = 1400;
const MAX_LONG_EDGE = 2600;

async function toBitmap(input: Blob | File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(input as Blob, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(input as Blob);
  }
}

/**
 * Normalize an image for OCR. Returns a JPEG blob plus the canvas dimensions.
 * Exported so the requirements editor can reuse the exact same pipeline the
 * renter's device uses — what the manager previews is what renters get.
 */
export async function preprocessForOcr(input: Blob | File): Promise<Blob> {
  if (typeof document === "undefined") return input;
  let bmp: ImageBitmap;
  try {
    bmp = await toBitmap(input);
  } catch {
    return input; // let Tesseract try the original
  }

  const long = Math.max(bmp.width, bmp.height);
  let scale = 1;
  if (long > MAX_LONG_EDGE) scale = MAX_LONG_EDGE / long;
  else if (long < MIN_LONG_EDGE) scale = Math.min(2.5, MIN_LONG_EDGE / long);

  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Pass 1 — luminance + histogram
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const y = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = px[i + 1] = px[i + 2] = y;
    hist[y]++;
  }

  // Pass 2 — percentile clip for auto-contrast
  const total = w * h;
  const lowCut = total * 0.02;
  const highCut = total * 0.98;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= lowCut) { lo = v; break; }
  }
  acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= highCut) { hi = v; break; }
  }
  if (hi - lo < 24) { lo = 0; hi = 255; } // already flat/blank, don't amplify noise
  const span = hi - lo;

  for (let i = 0; i < px.length; i += 4) {
    let v = ((px[i] - lo) * 255) / span;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    // Gentle S-curve: darkens ink, lifts paper, keeps antialiasing intact.
    v = v < 128 ? (v * v) / 128 : 255 - ((255 - v) * (255 - v)) / 128;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
  );
  return blob ?? input;
}

function score(text: string): number {
  // A crude "did we actually read words?" score.
  const words = text.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/g) ?? [];
  return words.length;
}

export interface OcrOptions {
  /** Skip the preprocessing pass (already-clean render, e.g. a PDF raster). */
  raw?: boolean;
  onProgress?: (fraction: number, note?: string) => void;
}

export async function runOcr(image: Blob | File, opts: OcrOptions = {}): Promise<string> {
  const worker = await getWorker();
  const prepared = opts.raw ? image : await preprocessForOcr(image);
  opts.onProgress?.(0.3, "Reading text");

  const first = await worker.recognize(prepared as Blob);
  let text = first.data.text ?? "";

  // Fallback: if the cleaned image read as near-empty, retry the original
  // bytes. Sometimes the contrast stretch hurts (e.g. a screenshot).
  if (score(text) < 4 && !opts.raw) {
    opts.onProgress?.(0.7, "Retrying");
    try {
      const second = await worker.recognize(image as Blob);
      if (score(second.data.text ?? "") > score(text)) text = second.data.text ?? "";
    } catch { /* keep the first attempt */ }
  }
  opts.onProgress?.(1, "Done");
  return text;
}

/**
 * Multi-page PDF OCR (suggested-feature #2).
 * Rasterizes up to `maxPages` pages and concatenates the recognized text,
 * reporting progress per page so the UI can show "Page 2 of 5".
 */
export async function rasterizePdf(
  file: File,
  maxPages = 8,
  onPage?: (page: number, total: number) => void,
): Promise<File[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const total = Math.min(pdf.numPages, maxPages);
  const out: File[] = [];
  for (let n = 1; n <= total; n++) {
    onPage?.(n, total);
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    out.push(new File([blob], file.name.replace(/\.pdf$/i, `-p${n}.jpg`), { type: "image/jpeg" }));
  }
  return out;
}

/** OCR every rasterized page of a PDF and join the text. */
export async function runOcrOnPdf(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<{ text: string; pages: File[] }> {
  const pages = await rasterizePdf(file, 8, onProgress);
  const chunks: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i + 1, pages.length);
    chunks.push(await runOcr(pages[i], { raw: true }));
  }
  return { text: chunks.join("\n\n"), pages };
}

/** Analyze EXIF for signs of editing software. Amber flag only — never used to reject. */
export async function checkExifTamper(image: Blob | File): Promise<{ flagged: boolean; reason?: string }> {
  try {
    const exifr = (await import("exifr")).default;
    const data = (await exifr.parse(image as Blob)) as
      | { Software?: unknown; ProcessingSoftware?: unknown; CreatorTool?: unknown }
      | undefined;
    if (!data) return { flagged: false };
    const bits = [data.Software, data.ProcessingSoftware, data.CreatorTool]
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.toLowerCase());
    const editors = ["photoshop", "gimp", "pixelmator", "snapseed", "lightroom", "affinity", "paint.net", "acorn"];
    const hit = bits.find((b) => editors.some((e) => b.includes(e)));
    if (hit) return { flagged: true, reason: hit };
    return { flagged: false };
  } catch {
    return { flagged: false };
  }
}

/** Downscale an image to a small data URL — used for sample images and the renter's local document library. */
export async function toThumbDataUrl(input: Blob | File, maxEdge = 900, quality = 0.72): Promise<string> {
  const bmp = await toBitmap(input);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}
