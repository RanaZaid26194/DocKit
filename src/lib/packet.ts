// Build a single PDF packet from the renter's uploaded documents.
// Runs entirely in the browser via pdf-lib.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DocumentRow, ProgramRow, ApplicationRow } from "./renter-api";
import { signedUrl } from "./renter-api";

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  const url = await signedUrl(path);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function buildPacket(
  app: ApplicationRow,
  program: ProgramRow,
  docs: DocumentRow[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Cover page
  const cover = pdf.addPage([612, 792]);
  cover.drawText("Application packet", { x: 48, y: 730, size: 24, font: bold, color: rgb(0.1, 0.32, 0.34) });
  cover.drawText(program.name, { x: 48, y: 700, size: 14, font });
  cover.drawText(`Applicant: ${app.applicant?.name ?? "(not entered)"}`, { x: 48, y: 670, size: 12, font });
  if (app.co_applicants?.length) {
    cover.drawText(
      "Co-applicants: " + app.co_applicants.map((c) => c.name).join(", "),
      { x: 48, y: 652, size: 12, font },
    );
  }
  cover.drawText(`Generated: ${new Date().toLocaleString()}`, { x: 48, y: 630, size: 10, font });
  cover.drawText(
    "This packet was assembled by the renter. Eligibility decisions remain with the housing office.",
    { x: 48, y: 100, size: 10, font, color: rgb(0.4, 0.4, 0.4), maxWidth: 500 },
  );

  // Summary table
  let y = 590;
  cover.drawText("Included documents:", { x: 48, y, size: 12, font: bold });
  y -= 20;
  for (const req of program.requirements) {
    const relevant = docs.filter((d) => d.requirement_id === req.id);
    cover.drawText(`• ${req.name}  —  ${relevant.length} file(s)`, { x: 48, y, size: 11, font });
    y -= 16;
    if (y < 120) break;
  }

  // Each document page
  for (const d of docs) {
    if (!d.storage_path) continue;
    const bytes = await fetchBytes(d.storage_path);
    if (!bytes) continue;
    let img;
    try {
      img = await pdf.embedJpg(bytes);
    } catch {
      try { img = await pdf.embedPng(bytes); } catch { continue; }
    }
    const page = pdf.addPage([612, 792]);
    const req = program.requirements.find((r) => r.id === d.requirement_id);
    page.drawText(req?.name ?? d.doc_type, { x: 48, y: 750, size: 14, font: bold });
    const meta = d.applicant_index === 0
      ? (app.applicant?.name ?? "")
      : (app.co_applicants?.[d.applicant_index - 1]?.name ?? `Person ${d.applicant_index + 1}`);
    page.drawText(`For: ${meta}`, { x: 48, y: 732, size: 10, font });
    page.drawText(`Status: ${d.status.replace("_", " ")}`, { x: 48, y: 716, size: 10, font });
    if (d.exif_flag) {
      page.drawText("Flagged for human review (metadata suggests editing)", {
        x: 48, y: 700, size: 10, font, color: rgb(0.7, 0.45, 0),
      });
    }
    // Fit image directly below the header block (top of image at y=680), so
    // landscape photos don't leave a huge gap between the label and the image.
    const topY = 680;
    const maxW = 516;
    const maxH = topY - 48; // leave 48pt bottom margin
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: (612 - w) / 2, y: topY - h, width: w, height: h });
  }

  return await pdf.save();
}
