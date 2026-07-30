import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Requirement } from "@/lib/rules/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import QRCode from "qrcode";
import JSZip from "jszip";
import { Copy, Plus, Download, Archive, LayoutTemplate, CheckSquare } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { RequirementCard } from "@/components/RequirementEditor";
import { PRESETS, TEMPLATE_DIRECTORY, PRESET_DISCLAIMER } from "@/lib/presets";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProgramFull {
  id: string; name: string; program_type: string; link_token: string;
  requirements: Requirement[]; owner_id: string; retention_days: number | null;
  default_pre_marked: string[] | null;
}
interface AppRow {
  id: string; status: string; applicant: { name?: string }; last_activity_at: string; submitted_at: string | null;
}

const OPEN_STATUSES = new Set(["in_progress", "submitted"]);

export const Route = createFileRoute("/_authenticated/programs/$id")({
  head: () => ({ meta: [{ title: "Program — DocKit" }, { name: "robots", content: "noindex" }] }),
  component: ProgramDetail,
});

function ProgramDetail() {
  const { id } = Route.useParams();
  const [prog, setProg] = useState<ProgramFull | null>(null);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [qr, setQr] = useState<string>("");
  const [tab, setTab] = useState<"share" | "requirements" | "applications" | "team" | "analytics" | "settings">("share");

  const load = useCallback(async () => {
    const { data: p, error } = await supabase.from("programs").select("*").eq("id", id).single();
    if (error) return toast.error(error.message);
    setProg((p as unknown) as ProgramFull);
    const { data: a } = await supabase.from("applications").select("id,status,applicant,last_activity_at,submitted_at").eq("program_id", id).order("last_activity_at", { ascending: false });
    setApps((a ?? []) as AppRow[]);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`program-${id}-apps`)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications", filter: `program_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

  const shareUrl = useMemo(() => prog ? `${window.location.origin}/r/${prog.link_token}` : "", [prog]);
  useEffect(() => {
    if (!shareUrl) return;
    QRCode.toDataURL(shareUrl, { width: 320, margin: 1 }).then(setQr);
  }, [shareUrl]);

  async function saveRequirements(reqs: Requirement[]) {
    if (!prog) return;
    const { error } = await supabase.from("programs").update({ requirements: reqs as never }).eq("id", prog.id);
    if (error) return toast.error(error.message);
    setProg({ ...prog, requirements: reqs });
    toast.success("Saved.");
  }

  function exportCsv() {
    const header = ["id","status","applicant_name","last_activity","submitted_at"].join(",");
    const rows = apps.map((a) => [
      a.id, a.status, JSON.stringify(a.applicant?.name ?? ""),
      a.last_activity_at, a.submitted_at ?? "",
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${prog?.name ?? "program"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function zipPackets(ids: string[], filename: string) {
    if (!prog) return;
    if (ids.length === 0) return toast.error("Nothing selected to export.");
    toast.info(`Bundling ${ids.length} packet(s)…`);
    const { data: rows } = await supabase.from("applications")
      .select("id, packet_path, applicant")
      .in("id", ids);
    const zip = new JSZip();
    let added = 0;
    for (const r of (rows ?? []) as { id: string; packet_path: string | null; applicant: { name?: string } }[]) {
      if (!r.packet_path) continue;
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(r.packet_path, 60 * 5);
      if (!signed?.signedUrl) continue;
      const res = await fetch(signed.signedUrl);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const safe = (r.applicant?.name ?? r.id).replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40);
      zip.file(`${safe}-${r.id.slice(0, 8)}.pdf`, buf);
      added += 1;
    }
    if (added === 0) return toast.error("No packet files are still available (retention window may have passed).");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Bundled ${added} packet(s).`);
  }

  if (!prog) return <Spinner label="Loading program" />;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline">← All programs</Link>
        <h1 className="mt-2 text-2xl font-semibold">{prog.name}</h1>
        <p className="text-sm text-muted-foreground">{prog.program_type}</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {(["share","requirements","applications","team","analytics","settings"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-2 text-sm capitalize transition-colors ${tab === t ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "share" && (
        <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Share this program with renters</h2>
            <p className="mt-1 text-sm text-muted-foreground">Anyone with the link can start an application. The link is unguessable.</p>
          </div>
          {qr && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <img src={qr} alt="QR code for renter link" width={240} height={240} className="rounded-md border border-border" />
              <a href={qr} download={`${prog.name}-qr.png`} className="inline-flex items-center gap-1 text-sm text-primary transition-colors hover:underline">
                <Download className="h-4 w-4" />Download QR PNG
              </a>
            </div>
          )}
          <div className="mt-6 flex gap-2">
            <Input readOnly value={shareUrl} aria-label="Renter share link" />
            <Button variant="outline" aria-label="Copy renter link" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("Copied."); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {tab === "requirements" && <Requirements value={prog.requirements ?? []} onChange={saveRequirements} />}

      {tab === "applications" && (
        <ApplicationsTab apps={apps} onExportCsv={exportCsv} onZip={zipPackets} onChanged={load} programName={prog.name} />
      )}

      {tab === "team" && <TeamTab programId={prog.id} />}
      {tab === "analytics" && <AnalyticsTab programId={prog.id} />}
      {tab === "settings" && <SettingsTab prog={prog} onSaved={() => { load(); }} />}
    </div>
  );
}

function StatusText({ s }: { s: string }) {
  const labels: Record<string, string> = {
    in_progress: "In progress",
    submitted: "Awaiting review",
    approved: "Approved",
    rejected: "Not approved",
    withdrawn: "Withdrawn",
  };
  return <span>{labels[s] ?? s}</span>;
}

/* ------------------------------------------------------- requirements tab */

function Requirements({ value, onChange }: { value: Requirement[]; onChange: (v: Requirement[]) => void }) {
  const [draft, setDraft] = useState<Requirement[]>(value);
  const [showTemplates, setShowTemplates] = useState(false);
  useEffect(() => setDraft(value), [value]);

  function addTemplate(key: (typeof TEMPLATE_DIRECTORY)[number]["key"]) {
    const incoming = PRESETS[key].requirements.filter((r) => !draft.some((d) => d.id === r.id || d.name === r.name));
    if (incoming.length === 0) return toast.info("Every requirement from that template is already here.");
    setDraft([...draft, ...incoming.map((r) => ({ ...r }))]);
    toast.success(`Added ${incoming.length} requirement(s). Review and save.`);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{draft.length} requirement(s)</p>
        <Button variant="outline" size="sm" onClick={() => setShowTemplates((v) => !v)}>
          <LayoutTemplate className="mr-1 h-4 w-4" />Starter templates
        </Button>
      </div>

      {showTemplates && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Fork a starter template</p>
          <p className="mt-1 text-xs text-muted-foreground">{PRESET_DISCLAIMER}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {TEMPLATE_DIRECTORY.map((t) => (
              <div key={t.key} className="rounded-md border border-border p-3 transition-shadow hover:shadow-md">
                <p className="text-sm font-medium">{t.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.blurb}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => addTemplate(t.key)}>
                  <Plus className="mr-1 h-3 w-3" />Add {t.count} requirement(s)
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {draft.map((r, i) => (
        <RequirementCard
          key={r.id}
          value={r}
          onChange={(nr) => setDraft(draft.map((x, j) => (j === i ? nr : x)))}
          onRemove={() => setDraft(draft.filter((_, j) => j !== i))}
        />
      ))}

      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button variant="outline" onClick={() => setDraft([...draft, {
          id: crypto.randomUUID(), name: "New requirement", description: "", perPerson: false,
          rules: [{ kind: "docTypeKeywords", keywords: [] }],
        }])}>
          <Plus className="mr-2 h-4 w-4" />Add requirement
        </Button>
        <Button onClick={() => onChange(draft)} disabled={!dirty}>{dirty ? "Save changes" : "Saved"}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- applications tab */

function ApplicationsTab({
  apps, onExportCsv, onZip, onChanged, programName,
}: {
  apps: AppRow[];
  onExportCsv: () => void;
  onZip: (ids: string[], filename: string) => Promise<void>;
  onChanged: () => Promise<void>;
  programName: string;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<null | "approved" | "withdrawn" | "rejected">(null);
  const [busy, setBusy] = useState(false);

  const selected = apps.filter((a) => sel.has(a.id));
  const toggle = (id: string) =>
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = apps.length > 0 && sel.size === apps.length;

  const eligible = selected.filter((a) => OPEN_STATUSES.has(a.status));

  async function runBulk(status: "approved" | "withdrawn" | "rejected") {
    setBusy(true);
    let ok = 0;
    for (const a of eligible) {
      const { data, error } = await supabase.rpc("manager_decide_application", { _app_id: a.id, _new_status: status });
      if (error) continue;
      const paths = (data as string[] | null) ?? [];
      if (paths.length) await supabase.storage.from("documents").remove(paths);
      ok += 1;
    }
    setBusy(false);
    setPending(null);
    setSel(new Set());
    await onChanged();
    toast.success(`Updated ${ok} application(s). Their uploaded images were deleted.`);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{apps.length} application(s){sel.size > 0 ? ` · ${sel.size} selected` : ""}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onZip(apps.filter((a) => a.status === "approved").map((a) => a.id), `${programName}-approved-packets.zip`)}>
            <Archive className="mr-2 h-4 w-4" />Bulk ZIP (approved)
          </Button>
          <Button variant="outline" onClick={onExportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
      </div>

      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent p-3">
          <CheckSquare className="h-4 w-4" />
          <span className="text-sm font-medium">{sel.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPending("approved")} disabled={!eligible.length}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => setPending("rejected")} disabled={!eligible.length}>Not approve</Button>
            <Button size="sm" variant="outline" onClick={() => setPending("withdrawn")} disabled={!eligible.length}>Withdraw</Button>
            <Button size="sm" variant="outline" onClick={() => onZip([...sel], `${programName}-selected-packets.zip`)}>Export ZIP</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <input id="sel-all" type="checkbox" className="h-4 w-4 min-h-0" checked={allChecked}
          onChange={(e) => setSel(e.target.checked ? new Set(apps.map((a) => a.id)) : new Set())} />
        <label htmlFor="sel-all">Select all</label>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {apps.map((a) => (
          <li key={a.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
            <input type="checkbox" className="h-4 w-4 min-h-0" checked={sel.has(a.id)}
              onChange={() => toggle(a.id)} aria-label={`Select ${a.applicant?.name || "application"}`} />
            <div className="min-w-0 flex-1">
              <Link to="/applications/$id" params={{ id: a.id }} className="font-medium transition-colors hover:text-primary hover:underline">
                {a.applicant?.name || "(no name yet)"}
              </Link>
              <p className="text-xs text-muted-foreground">
                <StatusText s={a.status} /> · last active {new Date(a.last_activity_at).toLocaleString()}
              </p>
            </div>
            <Link to="/applications/$id" params={{ id: a.id }} className="text-sm text-primary transition-colors hover:underline">Review →</Link>
          </li>
        ))}
        {apps.length === 0 && <li className="p-4 text-sm text-muted-foreground">No applications yet.</li>}
      </ul>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "approved" ? "Approve" : pending === "rejected" ? "Mark not approved" : "Withdraw"} {eligible.length} application(s)?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>This records a decision for each of the following and permanently deletes their uploaded images. Closed applications in your selection are skipped.</p>
                <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-sm">
                  {eligible.map((a) => <li key={a.id}>{a.applicant?.name || a.id.slice(0, 8)}</li>)}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (pending) runBulk(pending); }}>
              {busy ? "Working…" : "Yes, apply to all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------- team tab */

function TeamTab({ programId }: { programId: string }) {
  const [members, setMembers] = useState<{ id: string; invited_email: string; role: string; user_id: string | null }[]>([]);
  const [email, setEmail] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("team_members").select("id,invited_email,role,user_id").eq("program_id", programId);
    setMembers((data ?? []) as never);
  }, [programId]);
  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!email) return;
    const { error } = await supabase.from("team_members").insert({ program_id: programId, invited_email: email.toLowerCase(), role: "member" });
    if (error) return toast.error(error.message);
    // NOTE: email delivery is intentionally disabled in this build.
    // See src/routes/api/public/mailersend.ts — uncomment to send invites.
    // await sendInviteEmail(email, programId);
    setEmail(""); await load();
    toast.success("Invitation added. They'll get access when they sign up with this email.");
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input type="email" placeholder="caseworker@housing.gov" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Invite email" />
        <Button onClick={invite}>Invite</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Email sending is switched off in this build, so nothing is mailed out. Share the sign-up link yourself; access links up automatically when they create an account with this address.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {members.map((m) => (
          <li key={m.id} className="flex justify-between p-3 text-sm">
            <span>{m.invited_email}</span>
            <span className="text-muted-foreground">{m.user_id ? m.role : `${m.role} (pending sign-up)`}</span>
          </li>
        ))}
        {members.length === 0 && <li className="p-3 text-sm text-muted-foreground">No team members yet.</li>}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------- analytics tab */

function AnalyticsTab({ programId }: { programId: string }) {
  const [stats, setStats] = useState<{ total: number; failReasons: { rule: string; count: number }[]; avgHours: number | null }>({ total: 0, failReasons: [], avgHours: null });
  useEffect(() => {
    (async () => {
      const { data: appRows } = await supabase.from("applications").select("id,created_at,submitted_at,status").eq("program_id", programId);
      const submitted = (appRows ?? []).filter((a) => a.submitted_at);
      const avgHours = submitted.length
        ? submitted.reduce((s, a) => s + (new Date(a.submitted_at as string).getTime() - new Date(a.created_at).getTime()), 0) / submitted.length / 3600000
        : null;

      const ids = (appRows ?? []).map((a) => a.id);
      if (!ids.length) return setStats({ total: 0, failReasons: [], avgHours });
      const { data: docs } = await supabase.from("documents").select("issues,status").in("application_id", ids);
      const counter: Record<string, number> = {};
      (docs ?? []).forEach((d) => {
        (d.issues as { rule?: string; severity?: string }[] | null | undefined)?.forEach((i) => {
          if (i.severity === "fail" && i.rule) counter[i.rule] = (counter[i.rule] ?? 0) + 1;
        });
      });
      const failReasons = Object.entries(counter).map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
      setStats({ total: appRows?.length ?? 0, failReasons, avgHours });
    })();
  }, [programId]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-xs text-muted-foreground">Applications</p>
        <p className="text-3xl font-semibold">{stats.total}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-xs text-muted-foreground">Avg time to submit</p>
        <p className="text-3xl font-semibold">{stats.avgHours == null ? "—" : `${stats.avgHours.toFixed(1)}h`}</p>
      </div>
      <div className="sm:col-span-2 rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">Most common fix-reasons</p>
        {stats.failReasons.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No data yet.</p> : (
          <ul className="mt-2 space-y-1 text-sm">
            {stats.failReasons.map((f) => <li key={f.rule} className="flex justify-between"><span>{f.rule}</span><span className="tabular-nums">{f.count}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- settings tab */

function SettingsTab({ prog, onSaved }: { prog: ProgramFull; onSaved: () => void }) {
  const [days, setDays] = useState<number>(prog.retention_days ?? 90);
  const [preMarked, setPreMarked] = useState<string[]>(prog.default_pre_marked ?? []);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("programs")
      .update({ retention_days: days, default_pre_marked: preMarked } as never)
      .eq("id", prog.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Settings updated.");
    onSaved();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="font-semibold">Data retention</h2>
        <p className="text-sm text-muted-foreground">
          Uploaded document images are deleted automatically after this many days of inactivity, or once a decision is made, whichever comes first.
        </p>
        <div>
          <Label htmlFor="ret">Days of inactivity before auto-purge</Label>
          <Input id="ret" type="number" min={7} max={365} value={days} onChange={(e) => setDays(Math.max(7, Math.min(365, Number(e.target.value) || 90)))} />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="font-semibold">Caseworker pre-checks</h2>
        <p className="text-sm text-muted-foreground">
          Tick anything your office already holds on file. New applications start with these hidden from the renter's checklist,
          so nobody is asked to re-upload something a caseworker already collected. You can still override this per application.
        </p>
        <ul className="space-y-2">
          {(prog.requirements ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <input id={`pm-${r.id}`} type="checkbox" className="h-4 w-4 min-h-0"
                checked={preMarked.includes(r.id)}
                onChange={(e) => setPreMarked(e.target.checked ? [...preMarked, r.id] : preMarked.filter((x) => x !== r.id))} />
              <label htmlFor={`pm-${r.id}`}>{r.name}</label>
            </li>
          ))}
          {(prog.requirements ?? []).length === 0 && <li className="text-sm text-muted-foreground">Add requirements first.</li>}
        </ul>
      </div>

      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
    </div>
  );
}
