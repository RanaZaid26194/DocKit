// Tesseract.js runner. We keep a single worker and route jobs to it. All
// OCR happens on the renter's device — the image bytes never leave until
// the manager gets the final packet.
import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    // English + Spanish so the flow works for Spanish-language documents.
    // The trailing string signature avoids a couple of Tesseract type edge cases.
    workerPromise = createWorker(["eng", "spa"]);
  }
  return workerPromise;
}

export async function runOcr(image: Blob | File): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image as Blob);
  return data.text ?? "";
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
