import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { signedUrl } from "@/lib/renter-api";
import { Download, CheckCircle2, XCircle, AlertTriangle, Lock, RotateCcw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface Doc {
  id: string; requirement_id: string; doc_type: string; applicant_index: number;
  storage_path: string | null; status: string; issues: { message: string; severity: string }[]; exif_flag: boolean; exif_reason: string | null;
}
interface App {
  id: string; program_id: string; status: string; applicant: { name?: string }; co_applicants: { name?: string }[];
  submitted_at: string | null; decided_at: string | null; packet_path: string | null; manager_note: string | null;
}
interface Program { id: string; name: string; requirements: { id: string; name: string; perPerson: boolean }[] }

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Awaiting review",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};
const CLOSED = new Set(["approved", "rejected", "withdrawn"]);

export const Route = createFileRoute("/_authenticated/applications/$id")({
  head: () => ({ meta: [{ title: "Application review — DocKit" }, { name: "robots", content: "noindex" }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<App | null>(null);
  const [prog, setProg] = useState<Program | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from("applications").select("*").eq("id", id).single();
    if (!a) return;
    setApp(a as unknown as App);
    setNote((a as { manager_note?: string | null }).manager_note ?? "");
    const { data: p } = await supabase.from("programs").select("id,name,requirements").eq("id", (a as { program_id: string }).program_id).single();
    setProg(p as unknown as Program);
    const { data: d } = await supabase.from("documents").select("*").eq("application_id", id).order("created_at");
    setDocs(((d ?? []) as unknown) as Doc[]);
    const newUrls: Record<string, string> = {};
    for (const doc of d ?? []) {
      if (doc.storage_path) {
        const u = await signedUrl(doc.storage_path);
        if (u) newUrls[doc.id] = u;
      }
    }
    setUrls(newUrls);
    if (!selected && d && d.length) setSelected((d[0] as { id: string }).id);
  }, [id, selected]);
  useEffect(() => { load(); }, [load]);

  // Realtime: refresh when documents change (renter re-uploads, decision made, etc.)
  useEffect(() => {
    const channel = supabase
      .channel(`app-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `application_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "applications", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

  async function decide(newStatus: "approved" | "rejected" | "withdrawn") {
    const label = newStatus === "approved" ? "approved" : newStatus === "rejected" ? "not approved" : "withdrawn";
    if (!confirm(`Mark this application ${label}? Uploaded images will be deleted.`)) return;
    // Capture a signed hash of the packet BEFORE the storage object is removed.
    if (app?.packet_path) {
      try {
        const url = await signedUrl(app.packet_path);
        if (url) {
          const res = await fetch(url);
          if (res.ok) {
            const buf = new Uint8Array(await res.arrayBuffer());
            const digest = await crypto.subtle.digest("SHA-256", buf as unknown as ArrayBuffer);
            const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
            await supabase.from("application_snapshots").insert({ application_id: id, state: newStatus, packet_sha256: sha } as never);
          }
        }
      } catch { /* snapshot is best-effort */ }
    }
    const { data, error } = await supabase.rpc("manager_decide_application", { _app_id: id, _new_status: newStatus });
    if (error) return toast.error(error.message);
    const paths = (data as string[] | null) ?? [];
    if (paths.length) await supabase.storage.from("documents").remove(paths);
    toast.success("Decision recorded and images deleted.");
    await load();
  }

  async function saveNote() {
    setNoteBusy(true);
    const { error } = await supabase.from("applications").update({ manager_note: note } as never).eq("id", id);
    setNoteBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Note saved. The renter will see it on their next visit.");
  }

  async function downloadPacket() {
    if (!app?.packet_path) return;
    const url = await signedUrl(app.packet_path);
    if (!url) return toast.error("Packet is no longer available.");
    window.open(url, "_blank");
  }

  /**
   * "Ask renter to retake" resets one document to `needs_fixing` so the renter's
   * checklist re-opens that slot. We also clear the OCR text so the next upload
   * doesn't get compared against stale content, and append a short note to the
   * manager's overall note so the renter sees why.
   */
  async function requestRetake(doc: Doc) {
    if (!confirm(`Ask the renter to retake "${doc.doc_type}"?`)) return;
    const reason = prompt("Optional note for the renter (why this needs a retake):", "") ?? "";
    const { error } = await supabase.from("documents")
      .update({ status: "needs_fixing", ocr_text: "" } as never)
      .eq("id", doc.id);
    if (error) return toast.error(error.message);
    if (reason.trim()) {
      const prefix = `Please retake "${doc.doc_type}": ${reason.trim()}`;
      const combined = note ? `${prefix}\n\n${note}` : prefix;
      setNote(combined);
      await supabase.from("applications").update({ manager_note: combined } as never).eq("id", id);
    }
    toast.success("Retake requested. The renter will see this on their next visit.");
    await load();
  }

  if (!app || !prog) return <Spinner label="Loading application" />;

  const people = [app.applicant, ...(app.co_applicants ?? [])];
  const isClosed = CLOSED.has(app.status);
  const slots: { req: (typeof prog.requirements)[number]; idx: number }[] = [];
  for (const req of prog.requirements) {
    people.forEach((_p, idx) => {
      if (!req.perPerson && idx > 0) return;
      slots.push({ req, idx });
    });
  }
  const currentDoc = docs.find((d) => d.id === selected);
  const currentSlot = currentDoc ? slots.find((s) => s.req.id === currentDoc.requirement_id && s.idx === currentDoc.applicant_index) : slots[0];

  return (
    <div className="space-y-4">
      <div>
        <Link to="/programs/$id" params={{ id: app.program_id }} className="text-sm text-muted-foreground hover:underline">← Back to program</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{app.applicant?.name || "(unnamed applicant)"}</h1>
            <p className="text-sm text-muted-foreground">Status: {STATUS_LABELS[app.status] ?? app.status}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {app.packet_path && (
              <Button variant="outline" onClick={downloadPacket}>
                <Download className="mr-2 h-4 w-4" />Download packet
              </Button>
            )}
            {!isClosed && (
              <>
                <Button onClick={() => decide("approved")}>Approve</Button>
                <Button variant="outline" onClick={() => decide("rejected")}>Not approve</Button>
                <Button variant="outline" onClick={() => decide("withdrawn")}>Withdraw</Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop: side-by-side. Mobile: stacked. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Document list */}
        <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm font-semibold">Documents ({slots.length})</p>
          </div>
          <ul className="space-y-1">
            {slots.map(({ req, idx }) => {
              const d = docs.find((x) => x.requirement_id === req.id && x.applicant_index === idx);
              const person = people[idx]?.name || `Person ${idx + 1}`;
              const active = d ? selected === d.id : false;
              return (
                <li key={`${req.id}-${idx}`}>
                  <button
                    onClick={() => d && setSelected(d.id)}
                    disabled={!d}
                    className={`w-full rounded-md border p-3 text-left text-sm transition ${active ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted"} ${!d ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{req.name}</p>
                        {req.perPerson && <p className="text-xs text-muted-foreground">For {person}</p>}
                      </div>
                      {d && <StatusPill s={d.status} />}
                    </div>
                    {!d && <p className="mt-1 text-xs text-muted-foreground">Not uploaded</p>}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="rounded-lg border border-border bg-card p-3">
            <label className="text-sm font-semibold" htmlFor="mnote">Note to renter (optional)</label>
            <textarea id="mnote" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. Please retake the pay stub — the date is cut off." />
            <Button size="sm" className="mt-2 w-full" onClick={saveNote} disabled={noteBusy || isClosed}>
              {noteBusy ? "Saving…" : "Save note"}
            </Button>
            {isClosed && <p className="mt-1 text-xs text-muted-foreground"><Lock className="mr-1 inline h-3 w-3" />Application is closed.</p>}
          </div>
        </aside>

        {/* Detail pane */}
        <section className="rounded-lg border border-border bg-card p-4">
          {!currentDoc && <p className="text-sm text-muted-foreground">Select a document on the left to review it.</p>}
          {currentDoc && currentSlot && (
            <div className="space-y-3">
              <div>
                <p className="text-lg font-semibold">{currentSlot.req.name}</p>
                <p className="text-xs text-muted-foreground">
                  {currentSlot.req.perPerson ? `For ${people[currentSlot.idx]?.name || `Person ${currentSlot.idx + 1}`}` : "Household document"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill s={currentDoc.status} />
                {currentDoc.exif_flag && (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">
                    Metadata flag{currentDoc.exif_reason ? ` — ${currentDoc.exif_reason}` : ""}
                  </span>
                )}
                {!isClosed && currentDoc.storage_path && (
                  <Button size="sm" variant="outline" onClick={() => requestRetake(currentDoc)}>
                    <RotateCcw className="mr-1 h-3 w-3" />Ask for retake
                  </Button>
                )}
              </div>
              {currentDoc.issues?.length ? (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {currentDoc.issues.map((i, k) => <li key={k}>• {i.message}</li>)}
                </ul>
              ) : null}
              {currentDoc.storage_path && urls[currentDoc.id] ? (
                <a href={urls[currentDoc.id]} target="_blank" rel="noreferrer">
                  <img src={urls[currentDoc.id]} alt={currentSlot.req.name}
                    className="max-h-[70vh] w-full rounded-md border border-border object-contain" />
                </a>
              ) : app.decided_at ? (
                <p className="text-sm text-muted-foreground">Image deleted (application decided on {new Date(app.decided_at).toLocaleDateString()}).</p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  const cls = s === "pass" ? "status-pass" : s === "flagged" ? "status-flag" : "status-fail";
  const label = s === "pass" ? "Looks good" : s === "flagged" ? "Needs a look" : s === "needs_fixing" ? "Needs fixing" : s;
  const Icon = s === "pass" ? CheckCircle2 : s === "flagged" ? AlertTriangle : XCircle;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}><Icon className="h-3 w-3" />{label}</span>;
}
