import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PRESETS, PRESET_DISCLAIMER, type PresetKey } from "@/lib/presets";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";

interface ProgRow { id: string; name: string; program_type: string; link_token: string; created_at: string }

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Programs — DocKit" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [rows, setRows] = useState<ProgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<PresetKey>("section8");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("programs").select("id,name,program_type,link_token,created_at").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as ProgRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Realtime: refresh list when a program changes.
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-programs")
      .on("postgres_changes", { event: "*", schema: "public", table: "programs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function create() {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return;
    const req = PRESETS[preset];
    const { error } = await supabase.from("programs").insert({
      owner_id: userRes.user.id,
      name: name || req.label,
      program_type: preset === "scratch" ? "custom" : preset,
      requirements: req.requirements as never,
    });
    if (error) return toast.error(error.message);
    setName(""); setCreating(false); await load();
    toast.success("Program created.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your programs</h1>
          <p className="text-sm text-muted-foreground">Create a program, share the link with renters, review packets as they come in.</p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}><Plus className="mr-2 h-4 w-4" />New program</Button>
      </div>

      {creating && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Create a new program</h2>
          <p className="mt-1 text-xs text-muted-foreground">{PRESET_DISCLAIMER}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="pname">Program name</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Section 8 — 2026 waitlist" />
            </div>
            <div>
              <Label htmlFor="preset">Starting point</Label>
              <select id="preset" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={preset} onChange={(e) => setPreset(e.target.value as PresetKey)}>
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                  <option key={k} value={k}>{PRESETS[k].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={create}>Create program</Button>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium">No programs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first program above to get a share link.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Link to="/programs/$id" params={{ id: r.id }} className="text-lg font-semibold hover:underline">{r.name}</Link>
                  <p className="text-xs text-muted-foreground">{r.program_type} · created {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <Link to="/programs/$id" params={{ id: r.id }} className="text-sm text-primary hover:underline">Manage →</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
