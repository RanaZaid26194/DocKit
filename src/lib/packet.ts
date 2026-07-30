// Build a single PDF packet from the renter's uploaded documents.
// Runs entirely in the browser via pdf-lib.
//
// Round-5: the packet is now a real review document rather than a photo
// dump — branded cover, a status summary table, a contents list with page
// numbers, per-document metadata blocks with the exact checks that ran, and
// numbered footers on every page.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocumentRow, ProgramRow, ApplicationRow } from "./renter-api";
import { signedUrl } from "./renter-api";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const TEAL = rgb(0.06, 0.32, 0.34);
const INK = rgb(0.13, 0.15, 0.17);
const MUTED = rgb(0.45, 0.47, 0.5);
const LINE = rgb(0.86, 0.87, 0.88);
const GREEN = rgb(0.16, 0.5, 0.33);
const AMBER = rgb(0.72, 0.48, 0.05);
const RED = rgb(0.65, 0.18, 0.16);

const STATUS_LABEL: Record<string, string> = {
  pass: "Looks good",
  needs_fixing: "Needs fixing",
  flagged: "Needs a look",
  pending: "Not checked",
};
const statusColor = (s: string) => (s === "pass" ? GREEN : s === "flagged" ? AMBER : RED);

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  const url = await signedUrl(path);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Greedy word wrap that respects the embedded font's real metrics. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

function headerBand(page: PDFPage, title: string, subtitle: string, bold: PDFFont, font: PDFFont) {
  page.drawRectangle({ x: 0, y: PAGE_H - 74, width: PAGE_W, height: 74, color: TEAL });
  page.drawText(title, { x: MARGIN, y: PAGE_H - 42, size: 16, font: bold, color: rgb(1, 1, 1) });
  if (subtitle) {
    page.drawText(subtitle, { x: MARGIN, y: PAGE_H - 60, size: 9, font, color: rgb(0.85, 0.92, 0.92) });
  }
}

export async function buildPacket(
  app: ApplicationRow,
  program: ProgramRow,
  docs: DocumentRow[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle(`${program.name} — application packet`);
  pdf.setAuthor(app.applicant?.name ?? "Applicant");
  pdf.setProducer("DocKit");
  pdf.setCreator("DocKit");
  pdf.setCreationDate(new Date());

  const people = [app.applicant, ...(app.co_applicants ?? [])];
  const nameFor = (i: number) => people[i]?.name || `Person ${i + 1}`;

  /* ---------------- Cover ---------------- */
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  cover.drawRectangle({ x: 0, y: PAGE_H - 150, width: PAGE_W, height: 150, color: TEAL });
  cover.drawText("Application packet", { x: MARGIN, y: PAGE_H - 70, size: 26, font: bold, color: rgb(1, 1, 1) });
  cover.drawText(program.name, { x: MARGIN, y: PAGE_H - 96, size: 13, font, color: rgb(0.85, 0.93, 0.93) });
  cover.drawText(`Assembled ${new Date().toLocaleString()}`, {
    x: MARGIN, y: PAGE_H - 118, size: 9, font, color: rgb(0.78, 0.88, 0.88),
  });

  let y = PAGE_H - 190;
  cover.drawText("Household", { x: MARGIN, y, size: 11, font: bold, color: TEAL });
  y -= 18;
  cover.drawText(`Applicant: ${app.applicant?.name ?? "(not entered)"}`, { x: MARGIN, y, size: 11, font, color: INK });
  y -= 15;
  if (app.applicant?.email) { cover.drawText(`Email: ${app.applicant.email}`, { x: MARGIN, y, size: 10, font, color: MUTED }); y -= 14; }
  if (app.applicant?.phone) { cover.drawText(`Phone: ${app.applicant.phone}`, { x: MARGIN, y, size: 10, font, color: MUTED }); y -= 14; }
  for (const c of app.co_applicants ?? []) {
    cover.drawText(`Co-applicant: ${c.name}`, { x: MARGIN, y, size: 11, font, color: INK });
    y -= 15;
  }

  /* ---------------- Summary table ---------------- */
  y -= 16;
  cover.drawText("Document summary", { x: MARGIN, y, size: 11, font: bold, color: TEAL });
  y -= 6;
  cover.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LINE });
  y -= 16;

  const colStatus = PAGE_W - MARGIN - 110;
  const colPage = PAGE_W - MARGIN - 28;
  cover.drawText("Requirement", { x: MARGIN, y, size: 8.5, font: bold, color: MUTED });
  cover.drawText("Result", { x: colStatus, y, size: 8.5, font: bold, color: MUTED });
  cover.drawText("Page", { x: colPage, y, size: 8.5, font: bold, color: MUTED });
  y -= 14;

  // Work out the page each document will land on: cover = 1, docs start at 2.
  const printable = docs.filter((d) => d.storage_path);
  const pageOf = new Map<string, number>();
  printable.forEach((d, i) => pageOf.set(d.id, i + 2));

  let counts = { pass: 0, needs_fixing: 0, flagged: 0 };
  for (const req of program.requirements) {
    const relevant = docs.filter((d) => d.requirement_id === req.id);
    if (relevant.length === 0) {
      cover.drawText(`• ${req.name}`, { x: MARGIN, y, size: 10, font, color: INK, maxWidth: colStatus - MARGIN - 10 });
      cover.drawText("not provided", { x: colStatus, y, size: 9, font, color: MUTED });
      y -= 15;
    } else {
      for (const d of relevant) {
        const label = req.perPerson ? `• ${req.name} — ${nameFor(d.applicant_index)}` : `• ${req.name}`;
        cover.drawText(label.slice(0, 62), { x: MARGIN, y, size: 10, font, color: INK });
        cover.drawText(STATUS_LABEL[d.status] ?? d.status, { x: colStatus, y, size: 9, font: bold, color: statusColor(d.status) });
        const p = pageOf.get(d.id);
        cover.drawText(p ? String(p) : "—", { x: colPage + 6, y, size: 9, font, color: MUTED });
        if (d.status in counts) counts = { ...counts, [d.status]: counts[d.status as keyof typeof counts] + 1 };
        y -= 15;
      }
    }
    if (y < 170) break;
  }

  /* ---------------- Cover footnote ---------------- */
  const disclaimer =
    "This packet was assembled by the applicant on their own device. Text recognition and metadata checks ran locally and are advisory only. No automated decision was made: eligibility decisions remain entirely with the housing office.";
  let dy = 132;
  for (const line of wrap(disclaimer, font, 8.5, PAGE_W - MARGIN * 2)) {
    cover.drawText(line, { x: MARGIN, y: dy, size: 8.5, font, color: MUTED });
    dy -= 11;
  }
  cover.drawText(
    `${counts.pass} looked good · ${counts.needs_fixing} needed fixing · ${counts.flagged} flagged for a look`,
    { x: MARGIN, y: 152, size: 9, font: bold, color: INK },
  );

  /* ---------------- Document pages ---------------- */
  for (const d of printable) {
    const bytes = await fetchBytes(d.storage_path!);
    if (!bytes) continue;
    let img;
    try {
      img = await pdf.embedJpg(bytes);
    } catch {
      try { img = await pdf.embedPng(bytes); } catch { continue; }
    }
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const req = program.requirements.find((r) => r.id === d.requirement_id);
    const who = req?.perPerson ? nameFor(d.applicant_index) : "Household document";
    headerBand(page, req?.name ?? d.doc_type, who, bold, font);

    let hy = PAGE_H - 96;
    page.drawText(STATUS_LABEL[d.status] ?? d.status, { x: MARGIN, y: hy, size: 11, font: bold, color: statusColor(d.status) });
    hy -= 15;

    if (d.exif_flag) {
      page.drawText(
        `Metadata flag${d.exif_reason ? `: ${d.exif_reason}` : ""} — shown to a reviewer, never used to reject.`,
        { x: MARGIN, y: hy, size: 8.5, font, color: AMBER },
      );
      hy -= 13;
    }
    for (const issue of (d.issues ?? []).slice(0, 4)) {
      for (const line of wrap(`• ${issue.message}`, font, 8.5, PAGE_W - MARGIN * 2)) {
        page.drawText(line, { x: MARGIN, y: hy, size: 8.5, font, color: MUTED });
        hy -= 11;
      }
    }

    const topY = hy - 10;
    const maxW = PAGE_W - MARGIN * 2;
    const maxH = topY - 56;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawRectangle({
      x: (PAGE_W - w) / 2 - 2, y: topY - h - 2, width: w + 4, height: h + 4,
      borderColor: LINE, borderWidth: 1,
    });
    page.drawImage(img, { x: (PAGE_W - w) / 2, y: topY - h, width: w, height: h });
  }

  /* ---------------- Footers ---------------- */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_W - MARGIN, y: 40 }, thickness: 0.5, color: LINE });
    p.drawText("Prepared with DocKit — the applicant controls their own documents.", {
      x: MARGIN, y: 28, size: 7.5, font, color: MUTED,
    });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 7.5), y: 28, size: 7.5, font, color: MUTED,
    });
  });

  return await pdf.save();
}
