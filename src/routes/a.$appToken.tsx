import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  getApplication, updateApplicant, saveDocument, startOver, uploadDoc, submitApplication,
  type ApplicationRow, type ProgramRow, type DocumentRow, type Applicant,
} from "@/lib/renter-api";
import { runRules, type Requirement } from "@/lib/rules/engine";
import { runOcr, checkExifTamper } from "@/lib/ocr";
import { buildPacket } from "@/lib/packet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang, useT, type Lang } from "@/lib/i18n";
import logo from "/logo.png?url";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Camera, Printer, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export const Route = createFileRoute("/a/$appToken")({
  head: () => ({ meta: [{ title: "Your application — RealDoor" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: RenterApp,
});

function RenterApp() {
  const { appToken } = Route.useParams();
  const navigate = useNavigate();
  const t = useT();
  const { lang, setLang } = useLang();
  const [app, setApp] = useState<ApplicationRow | null>(null);
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [step, setStep] = useState<"applicant" | "docs" | "done">("applicant");
  const [printable, setPrintable] = useState(false);

  const load = useCallback(async () => {
    const res = await getApplication(appToken);
    if (!res) { toast.error("This link is not valid."); return; }
    setApp(res.application); setProgram(res.program); setDocs(res.documents ?? []);
    if (res.application.language) setLang(res.application.language as Lang);
    if (res.application.status === "submitted") setStep("done");
    else if (res.application.applicant?.name) setStep("docs");
  }, [appToken, setLang]);
  useEffect(() => { load(); }, [load]);

  if (!app || !program) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" width={24} height={24} />
            <span className="font-semibold">RealDoor</span>
          </div>
          <div className="flex items-center gap-3">
            <select value={lang} onChange={async (e) => { const l = e.target.value as Lang; setLang(l); await updateApplicant(appToken, app.applicant, app.co_applicants ?? [], l); }}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );

  if (step === "applicant") return shell(<ApplicantForm app={app} onSaved={async (a, co) => {
    await updateApplicant(appToken, a, co, lang);
    await load(); setStep("docs");
  }} />);

  if (step === "done") return shell(<DonePage app={app} program={program} docs={docs} />);

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
        const { error } = await import("@/integrations/supabase/client").then(({ supabase }) =>
          supabase.storage.from("documents").upload(path, new Blob([new Uint8Array(bytes)], { type: "application/pdf" })),
        );
        if (error) { toast.error(error.message); return; }
        await submitApplication(appToken, path);
        // Also give the renter a local download
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
  program: ProgramRow; app: ApplicationRow; docs: DocumentRow[]; token: string;
  onDocProcessed: () => Promise<void>; onStartOver: () => Promise<void>; onFinish: () => Promise<void>;
  printable: boolean; togglePrintable: () => void;
}

function Checklist({ program, app, docs, token, onDocProcessed, onStartOver, onFinish, printable, togglePrintable }: ChecklistProps) {
  const t = useT();
  const people = [app.applicant, ...(app.co_applicants ?? [])];
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);

  async function handleFile(req: Requirement, applicantIndex: number, file: File) {
    if (!ALLOWED.includes(file.type)) return toast.error("Please upload a JPG, PNG, or WEBP image.");
    if (file.size > MAX_BYTES) return toast.error("File is too large (max 10 MB).");
    const key = `${req.id}-${applicantIndex}`;
    setBusyKey(key);
    try {
      const ext = file.type.split("/")[1] || "jpg";
      const [path, ocrText, exif] = await Promise.all([
        uploadDoc(token, app.id, file, ext),
        runOcr(file),
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
      await onDocProcessed();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  async function acknowledge(doc: DocumentRow) {
    // "I know — this photo is fine": mark the flagged doc as pass locally by re-saving with pass status.
    await saveDocument({
      token, requirementId: doc.requirement_id, docType: doc.doc_type, applicantIndex: doc.applicant_index,
      storagePath: doc.storage_path, ocrText: "", status: "pass",
      issues: doc.issues, exifFlag: doc.exif_flag, exifReason: doc.exif_reason,
    });
    await onDocProcessed();
  }

  // How many required slots are complete (pass or acknowledged flagged)?
  const slots: { req: Requirement; applicantIndex: number }[] = [];
  for (const req of program.requirements) {
    if (req.perPerson) people.forEach((_p, i) => slots.push({ req, applicantIndex: i }));
    else slots.push({ req, applicantIndex: 0 });
  }
  const done = slots.filter(({ req, applicantIndex }) => {
    const d = docs.find((x) => x.requirement_id === req.id && x.applicant_index === applicantIndex);
    return d && d.status === "pass";
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("checklist.title")}</h1>
          <p className="text-sm text-muted-foreground">{done} / {slots.length}</p>
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

            <div className="mt-3 flex items-center gap-2 no-print">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted">
                <Camera className="h-4 w-4" />
                {d ? t("checklist.retake") : t("checklist.upload")}
                <input type="file" accept="image/*" capture="environment" className="sr-only"
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

function DonePage({ app }: { app: ApplicationRow; program: ProgramRow; docs: DocumentRow[] }) {
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
