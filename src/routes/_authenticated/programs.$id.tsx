import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Requirement } from "@/lib/rules/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Copy, Trash2, Plus, Download } from "lucide-react";

interface ProgramFull {
  id: string; name: string; program_type: string; link_token: string;
  requirements: Requirement[]; owner_id: string; retention_days: number | null;
}
interface AppRow {
  id: string; status: string; applicant: { name?: string }; last_activity_at: string; submitted_at: string | null;
}

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

  // Realtime: refresh applications when they change.
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

  if (!prog) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">← All programs</Link>
        <h1 className="mt-2 text-2xl font-semibold">{prog.name}</h1>
        <p className="text-sm text-muted-foreground">{prog.program_type}</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {(["share","requirements","applications","team","analytics","settings"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "share" && (
        <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Share this program with renters</h2>
            <p className="mt-1 text-sm text-muted-foreground">Anyone with the link can start an application. The link is unguessable.</p>
          </div>
          {qr && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <img src={qr} alt="QR code for renter link" width={240} height={240} className="rounded-md border border-border" />
              <a href={qr} download={`${prog.name}-qr.png`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <Download className="h-4 w-4" />Download QR PNG
              </a>
            </div>
          )}
          <div className="mt-6 flex gap-2">
            <Input readOnly value={shareUrl} aria-label="Renter share link" />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("Copied."); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {tab === "requirements" && <Requirements value={prog.requirements ?? []} onChange={saveRequirements} />}

      {tab === "applications" && (
        <div>
          <div className="mb-3 flex justify-between">
            <p className="text-sm text-muted-foreground">{apps.length} application(s)</p>
            <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center justify-between p-4">
                <div>
                  <Link to="/applications/$id" params={{ id: a.id }} className="font-medium hover:underline">
                    {a.applicant?.name || "(no name yet)"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <StatusText s={a.status} /> · last active {new Date(a.last_activity_at).toLocaleString()}
                  </p>
                </div>
                <Link to="/applications/$id" params={{ id: a.id }} className="text-sm text-primary">Review →</Link>
              </li>
            ))}
            {apps.length === 0 && <li className="p-4 text-sm text-muted-foreground">No applications yet.</li>}
          </ul>
        </div>
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

function Requirements({ value, onChange }: { value: Requirement[]; onChange: (v: Requirement[]) => void }) {
  const [draft, setDraft] = useState<Requirement[]>(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-3">
      {draft.map((r, i) => (
        <div key={r.id} className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={r.name} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            </div>
            <div className="flex items-center gap-2 pt-6 text-sm">
              <input id={`pp-${i}`} type="checkbox" checked={r.perPerson}
                onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, perPerson: e.target.checked } : x))} />
              <label htmlFor={`pp-${i}`}>Required per person</label>
            </div>
          </div>
          <div className="mt-2">
            <Label>Description for renters</Label>
            <textarea className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2}
              value={r.description}
              onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Checks: {r.rules.map((rr) => rr.kind).join(", ") || "none"}</p>
          <button className="mt-2 inline-flex items-center gap-1 text-sm text-destructive" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />Remove
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setDraft([...draft, { id: crypto.randomUUID(), name: "New requirement", description: "", perPerson: false, rules: [] }])}>
          <Plus className="mr-2 h-4 w-4" />Add requirement
        </Button>
        <Button onClick={() => onChange(draft)}>Save changes</Button>
      </div>
    </div>
  );
}

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
    setEmail(""); await load();
    toast.success("Invitation added. They'll get access when they sign up with this email.");
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input type="email" placeholder="caseworker@housing.gov" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Invite email" />
        <Button onClick={invite}>Invite</Button>
      </div>
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
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Applications</p>
        <p className="text-3xl font-semibold">{stats.total}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Avg time to submit</p>
        <p className="text-3xl font-semibold">{stats.avgHours == null ? "—" : `${stats.avgHours.toFixed(1)}h`}</p>
      </div>
      <div className="sm:col-span-2 rounded-lg border border-border bg-card p-4">
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

function SettingsTab({ prog, onSaved }: { prog: ProgramFull; onSaved: () => void }) {
  const [days, setDays] = useState<number>(prog.retention_days ?? 90);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("programs")
      .update({ retention_days: days } as never)
      .eq("id", prog.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Retention window updated.");
    onSaved();
  }
  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold">Data retention</h2>
      <p className="text-sm text-muted-foreground">
        Uploaded document images are deleted automatically after this many days of inactivity, or once a decision is made — whichever comes first.
      </p>
      <div>
        <Label htmlFor="ret">Days of inactivity before auto-purge</Label>
        <Input id="ret" type="number" min={7} max={365} value={days} onChange={(e) => setDays(Math.max(7, Math.min(365, Number(e.target.value) || 90)))} />
      </div>
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
    </div>
  );
}
