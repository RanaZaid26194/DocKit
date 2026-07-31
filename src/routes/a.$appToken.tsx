import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  getApplication, updateApplicant, saveDocument, startOver, uploadDoc, submitApplication,
  recordSnapshot,
  type ApplicationRow, type ProgramRow, type DocumentRow, type Applicant,
} from "@/lib/renter-api";
import { runRules, type Requirement } from "@/lib/rules/engine";
import { runOcr, runOcrOnPdf, checkExifTamper, toThumbDataUrl } from "@/lib/ocr";
import {
  listLibrary, saveToLibrary, rankForRequirement, clearLibrary, type LibraryEntry,
} from "@/lib/doc-library";
import { renterListMessages, renterPostMessage, type AppMessage } from "@/lib/messages";
import { buildPacket } from "@/lib/packet";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang, useT, LANG_LABELS, type Lang } from "@/lib/i18n";
import logo from "/logo.png?url";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Camera, Upload, Printer, Loader2, CheckCircle2, AlertTriangle, XCircle, Lock, FolderOpen, MessageSquare, Send } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";


const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMG = ["image/jpeg", "image/png", "image/webp"];
const PDF_MIME = "application/pdf";
const CLOSED = new Set(["approved", "rejected", "withdrawn"]);

interface AppExtra extends ApplicationRow { manager_note?: string | null; decided_at?: string | null; pre_marked_requirements?: string[] }

export const Route = createFileRoute("/a/$appToken")({
  head: () => ({ meta: [{ title: "Your application — DocKit" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: RenterApp,
});

function RenterApp() {
  const { appToken } = Route.useParams();
  const { lang, setLang } = useLang();
  const [app, setApp] = useState<AppExtra | null>(null);
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [step, setStep] = useState<"applicant" | "docs" | "done">("applicant");
  const [printable, setPrintable] = useState(false);

  const load = useCallback(async () => {
    const res = await getApplication(appToken);
    if (!res) { toast.error("This link is not valid."); return; }
    setApp(res.application as AppExtra); setProgram(res.program); setDocs(res.documents ?? []);
    if (res.application.language) setLang(res.application.language as Lang);
    if (CLOSED.has(res.application.status)) setStep("done");
    else if (res.application.status === "submitted") setStep("done");
    else if (res.application.applicant?.name) setStep("docs");
  }, [appToken, setLang]);
  useEffect(() => { load(); }, [load]);

  // Realtime: notify renter when a manager decides.
  useEffect(() => {
    if (!app) return;
    const channel = supabase
      .channel(`renter-${app.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applications", filter: `id=eq.${app.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [app, load]);

  if (!app || !program) return <Spinner label="Loading your application" />;

  const isClosed = CLOSED.has(app.status);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={logo} alt="DocKit logo" width={32} height={32} className="h-8 w-8" />
            <span className="font-semibold">DocKit</span>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="lang-sel" className="sr-only">Language</label>
            <select
              id="lang-sel"
              value={lang}
              onChange={async (e) => {
                const l = e.target.value as Lang;
                setLang(l);
                if (!isClosed) await updateApplicant(appToken, app.applicant, app.co_applicants ?? [], l);
              }}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              aria-label="Language"
            >
              {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                <option key={l} value={l}>{LANG_LABELS[l]}</option>
              ))}
            </select>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );

  if (isClosed) {
    return shell(<ClosedPage status={app.status} decidedAt={app.decided_at ?? app.submitted_at} programToken={program.link_token ?? null} />);
  }

  if (step === "applicant") return shell(<ApplicantForm app={app} onSaved={async (a, co) => {
    await updateApplicant(appToken, a, co, lang);
    await load(); setStep("docs");
  }} />);

  if (step === "done") return shell(<DonePage app={app} />);

  return shell(
    <Checklist
      program={program}
      app={app}
      docs={docs}
      token={appToken}
      printable={printable}
      togglePrintable={() => setPrintable((v) => !v)}
      onFinish={async () => {
        const bytes = await buildPacket(app, program, docs);
        const path = `${appToken}/${app.id}/packet-${Date.now()}.pdf`;
        const { error } = await supabase.storage
          .from("documents")
          .upload(path, new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
        if (error) { toast.error(error.message); return; }
        await submitApplication(appToken, path);
        try { await recordSnapshot(appToken, "submitted", bytes); } catch { /* audit optional */ }
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
        const a = document.createElement("a"); a.href = url; a.download = "housing-packet.pdf"; a.click();
        URL.revokeObjectURL(url);
        await load();
      }}
      onStartOver={async () => {
        await startOver(appToken);
        await load();
      }}
      onDocProcessed={load}
    />,
  );
}

function ApplicantForm({ app, onSaved }: { app: ApplicationRow; onSaved: (a: Applicant, co: Applicant[]) => void }) {
  const t = useT();
  const [a, setA] = useState<Applicant>(app.applicant?.name ? app.applicant : { name: "" });
  const [co, setCo] = useState<Applicant[]>(app.co_applicants ?? []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("applicant.title")}</h1>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="space-y-3">
          <div><Label>{t("applicant.name")}</Label><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} maxLength={200} /></div>
          <div><Label>{t("applicant.phone")}</Label><Input value={a.phone ?? ""} onChange={(e) => setA({ ...a, phone: e.target.value })} maxLength={50} /></div>
          <div><Label>{t("applicant.email")}</Label><Input type="email" value={a.email ?? ""} onChange={(e) => setA({ ...a, email: e.target.value })} maxLength={255} /></div>
        </div>
      </div>
      {co.map((c, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex justify-between">
            <p className="font-medium">Co-applicant {i + 1}</p>
            <button onClick={() => setCo(co.filter((_, j) => j !== i))} className="text-sm text-destructive">{t("applicant.remove")}</button>
          </div>
          <div className="space-y-3">
            <div><Label>{t("applicant.name")}</Label><Input value={c.name} onChange={(e) => setCo(co.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} maxLength={200} /></div>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={() => setCo([...co, { name: "" }])}>+ {t("applicant.coApplicant")}</Button>
      <div className="pt-2"><Button onClick={() => onSaved(a, co)} disabled={!a.name.trim()}>{t("applicant.continue")}</Button></div>
    </div>
  );
}

interface ChecklistProps {
  program: ProgramRow; app: AppExtra; docs: DocumentRow[]; token: string;
  onDocProcessed: () => Promise<void>; onStartOver: () => Promise<void>; onFinish: () => Promise<void>;
  printable: boolean; togglePrintable: () => void;
}

function Checklist({ program, app, docs, token, onDocProcessed, onStartOver, onFinish, printable, togglePrintable }: ChecklistProps) {
  const t = useT();
  const people = [app.applicant, ...(app.co_applicants ?? [])];
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyNote, setBusyNote] = useState<string>("");
  const [finishBusy, setFinishBusy] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const refreshLibrary = useCallback(() => { listLibrary().then(setLibrary); }, []);
  useEffect(() => { refreshLibrary(); }, [refreshLibrary]);

  async function handleFile(req: Requirement, applicantIndex: number, incoming: File, opts?: { skipLibrary?: boolean }) {
    let file = incoming;
    let pdfText: string | null = null;
    const key = `${req.id}-${applicantIndex}`;
    if (file.size > MAX_BYTES) return toast.error("File is too large (max 10 MB).");

    if (file.type === PDF_MIME) {
      setBusyKey(key);
      setBusyNote("Opening PDF");
      try {
        // Multi-page OCR: every page (up to 8) is read, so a date or a name on
        // page 3 still satisfies the rules. Page 1 is what we store as the image.
        const { text, pages } = await runOcrOnPdf(file, (p, total) => setBusyNote(`Reading page ${p} of ${total}`));
        if (!pages.length) throw new Error("empty pdf");
        pdfText = text;
        file = pages[0];
      } catch {
        setBusyKey(null);
        return toast.error("We couldn't open that PDF. Try a photo instead.");
      }
    } else if (!ALLOWED_IMG.includes(file.type)) {
      return toast.error("Please upload a JPG, PNG, WEBP, or PDF.");
    }

    setBusyKey(key);
    try {
      const ext = file.type.split("/")[1] || "jpg";
      const [path, ocrText, exif] = await Promise.all([
        uploadDoc(token, app.id, file, ext),
        pdfText !== null ? Promise.resolve(pdfText) : runOcr(file, { onProgress: (_f, note) => note && setBusyNote(note) }),
        checkExifTamper(file),
      ]);
      const names = [people[applicantIndex]?.name].filter(Boolean) as string[];
      const result = runRules(req.rules, ocrText, { names });
      const status: "pass" | "needs_fixing" | "flagged" = exif.flagged ? "flagged" : result.status;
      await saveDocument({
        token, requirementId: req.id, docType: req.name, applicantIndex,
        storagePath: path, ocrText, status,
        issues: result.issues, exifFlag: exif.flagged, exifReason: exif.reason ?? null,
      });
      // Local-only reuse library. Never leaves this browser.
      if (!opts?.skipLibrary) {
        try {
          const thumb = await toThumbDataUrl(file, 320, 0.6);
          await saveToLibrary({ label: req.name, requirementName: req.name, mime: file.type, thumb, blob: file });
          refreshLibrary();
        } catch { /* library is a convenience */ }
      }
      await onDocProcessed();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
      setBusyNote("");
    }
  }

  async function reuseEntry(req: Requirement, applicantIndex: number, entry: LibraryEntry) {
    setPickerFor(null);
    const f = new File([entry.blob], `${entry.label}.jpg`, { type: entry.mime || "image/jpeg" });
    // Re-checked from scratch against this program's rules — nothing is trusted
    // just because it passed somewhere else.
    await handleFile(req, applicantIndex, f, { skipLibrary: true });
  }


  async function acknowledge(doc: DocumentRow) {
    await saveDocument({
      token, requirementId: doc.requirement_id, docType: doc.doc_type, applicantIndex: doc.applicant_index,
      storagePath: doc.storage_path, ocrText: "", status: "pass",
      issues: doc.issues, exifFlag: doc.exif_flag, exifReason: doc.exif_reason,
    });
    await onDocProcessed();
  }

  const preMarked = new Set(app.pre_marked_requirements ?? []);
  const slots: { req: Requirement; applicantIndex: number }[] = [];
  for (const req of program.requirements) {
    if (preMarked.has(req.id)) continue;
    if (req.perPerson) people.forEach((_p, i) => slots.push({ req, applicantIndex: i }));
    else slots.push({ req, applicantIndex: 0 });
  }
  const done = slots.filter(({ req, applicantIndex }) => {
    const d = docs.find((x) => x.requirement_id === req.id && x.applicant_index === applicantIndex);
    return d && d.status === "pass";
  }).length;

  return (
    <div className="space-y-4">
      {app.manager_note && (
        <div className="rounded-lg border border-primary/30 bg-accent p-3 text-sm">
          <p className="font-medium">A note from the housing office</p>
          <p className="mt-1 whitespace-pre-wrap">{app.manager_note}</p>
        </div>
      )}
      {preMarked.size > 0 && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Your caseworker already has {preMarked.size} document(s) on file, so you don't need to upload them here.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("checklist.title")}</h1>
          <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">{done} / {slots.length}</p>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="outline" size="sm" onClick={togglePrintable}><Printer className="mr-1 h-4 w-4" />{t("checklist.printable")}</Button>
        </div>
      </div>

      {printable && <PrintableView program={program} people={people} docs={docs} />}

      {slots.map(({ req, applicantIndex }) => {
        const d = docs.find((x) => x.requirement_id === req.id && x.applicant_index === applicantIndex);
        const key = `${req.id}-${applicantIndex}`;
        const person = people[applicantIndex]?.name || `Person ${applicantIndex + 1}`;
        return (
          <div key={key} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="pr-3">
                <p className="font-medium">{req.name}</p>
                {req.perPerson && <p className="text-xs text-muted-foreground">{t("checklist.for")} {person}</p>}
                {req.description && <p className="mt-1 text-sm text-muted-foreground">{req.description}</p>}
              </div>
              {d && <StatusBadge status={d.status} t={t} />}
            </div>

            {d?.status === "flagged" && (
              <div className="mt-3 rounded-md bg-warning/15 p-3 text-sm">
                <p>{t("checklist.tamperCopy")}</p>
                <button onClick={() => acknowledge(d)} className="mt-2 text-sm font-medium underline">{t("checklist.acknowledge")}</button>
              </div>
            )}
            {d?.status === "needs_fixing" && d.issues?.length ? (
              <ul className="mt-2 space-y-1 text-sm text-destructive">
                {d.issues.map((i, k) => <li key={k}>• {i.message}</li>)}
              </ul>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 no-print">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted">
                <Camera className="h-4 w-4" />
                {d ? "Retake photo" : "Take photo"}
                <input type="file" accept="image/*" capture="environment" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(req, applicantIndex, f); e.currentTarget.value = ""; }} />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted">
                <Upload className="h-4 w-4" />
                Upload file
                <input type="file" accept="image/*,application/pdf" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(req, applicantIndex, f); e.currentTarget.value = ""; }} />
              </label>
              {busyKey === key && <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("checklist.checking")}</span>}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 pt-4 no-print">
        <Button onClick={async () => { setFinishBusy(true); try { await onFinish(); } finally { setFinishBusy(false); } }}
          disabled={done < slots.length || finishBusy}>
          {finishBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />…</> : t("checklist.finish")}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="outline">{t("checklist.startOver")}</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("startOver.title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("startOver.body")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("startOver.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={onStartOver}>{t("startOver.confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="pt-6 text-xs text-muted-foreground">{t("footer.notLegal")}</p>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: (k: never) => string }) {
  if (status === "pass") return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium status-pass"><CheckCircle2 className="h-3 w-3" />{t("checklist.pass" as never)}</span>;
  if (status === "flagged") return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium status-flag"><AlertTriangle className="h-3 w-3" />{t("checklist.flagged" as never)}</span>;
  if (status === "needs_fixing") return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium status-fail"><XCircle className="h-3 w-3" />{t("checklist.fixing" as never)}</span>;
  return null;
}

function PrintableView({ program, people, docs }: { program: ProgramRow; people: Applicant[]; docs: DocumentRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      <h2 className="text-lg font-semibold">{program.name} — checklist</h2>
      <ul className="mt-2 space-y-1">
        {program.requirements.map((r) =>
          (r.perPerson ? people : [people[0]]).map((p, i) => {
            const d = docs.find((x) => x.requirement_id === r.id && x.applicant_index === i);
            const mark = d?.status === "pass" ? "☑" : "☐";
            return <li key={`${r.id}-${i}`}>{mark} {r.name}{r.perPerson ? ` — ${p?.name || `Person ${i + 1}`}` : ""}</li>;
          }),
        )}
      </ul>
    </div>
  );
}

function DonePage({ app }: { app: ApplicationRow }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("done.title")}</h1>
      <p className="text-base">{t("done.body")}</p>
      <p className="text-xs text-muted-foreground">Reference: {app.id}</p>
      <p className="pt-6 text-xs text-muted-foreground">{t("footer.notLegal")}</p>
    </div>
  );
}

function ClosedPage({ status, decidedAt, programToken }: { status: string; decidedAt: string | null; programToken: string | null }) {
  const messages: Record<string, { title: string; body: string; tone: string }> = {
    approved: { title: "Application approved", body: "Your housing office marked this application approved. They will contact you with next steps.", tone: "status-pass" },
    rejected: { title: "Application closed", body: "This application has been closed by the housing office. Please contact them directly to discuss next steps or reapply.", tone: "status-fail" },
    withdrawn: { title: "Application withdrawn", body: "This application has been withdrawn. Contact the housing office if this was in error.", tone: "status-flag" },
  };
  const m = messages[status] ?? { title: "Application closed", body: "This application is no longer editable.", tone: "status-flag" };
  function startNew() {
    // Clear the localStorage marker keyed by program token so `begin()` on the
    // renter landing spins up a fresh application row.
    if (programToken) localStorage.removeItem(`rd:app:${programToken}`);
    if (programToken) window.location.href = `/r/${programToken}`;
  }
  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${m.tone}`}>
        <Lock className="h-3 w-3" />Closed
      </div>
      <h1 className="text-2xl font-semibold">{m.title}</h1>
      <p className="text-base">{m.body}</p>
      {decidedAt && <p className="text-xs text-muted-foreground">Decided on {new Date(decidedAt).toLocaleDateString()}.</p>}
      {programToken && (
        <div className="pt-2">
          <Button onClick={startNew} variant="outline">Start a new application</Button>
        </div>
      )}
    </div>
  );
}
