import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, X, Plus, Image as ImageIcon, ClipboardPaste, Trash2 } from "lucide-react";
import type { Requirement, RuleSpec, RuleKind } from "@/lib/rules/engine";
import { RULE_LABELS } from "@/lib/rules/engine";
import { runOcr, runOcrOnPdf, toThumbDataUrl } from "@/lib/ocr";
import { suggestFromText, type Suggestion } from "@/lib/suggest";

const RULE_ORDER: RuleKind[] = [
  "docTypeKeywords", "nameMatch", "recentWithin", "notExpired", "expiryReminder", "hasFields",
];

function blankRule(kind: RuleKind): RuleSpec {
  switch (kind) {
    case "docTypeKeywords": return { kind, keywords: [] };
    case "recentWithin": return { kind, days: 90 };
    case "expiryReminder": return { kind, withinDays: 45 };
    case "hasFields": return { kind, patterns: [{ label: "dollar amount", regex: "\\$\\s?\\d" }] };
    default: return { kind } as RuleSpec;
  }
}

/* -------------------------------------------------------------- keywords */

function KeywordChips({ keywords, onChange }: { keywords: string[]; onChange: (k: string[]) => void }) {
  const [entry, setEntry] = useState("");
  function commit(raw: string) {
    const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...keywords, ...parts])));
    setEntry("");
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">
            {k}
            <button
              type="button"
              aria-label={`Remove keyword ${k}`}
              onClick={() => onChange(keywords.filter((x) => x !== k))}
              className="rounded-full p-0.5 hover:bg-foreground/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {keywords.length === 0 && <span className="text-xs text-muted-foreground">No keywords yet.</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={entry}
          placeholder="Type a word or phrase, then press Enter"
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(entry); } }}
          aria-label="Add keyword"
        />
        <Button type="button" variant="outline" onClick={() => commit(entry)}>Add</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        A document passes this check when <strong>any one</strong> of these appears in the recognized text. Separate several with commas.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ rule editor */

function RuleRow({ rule, onChange, onRemove }: { rule: RuleSpec; onChange: (r: RuleSpec) => void; onRemove: () => void }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{RULE_LABELS[rule.kind]}</p>
        <button type="button" onClick={onRemove} aria-label={`Remove check: ${RULE_LABELS[rule.kind]}`}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {rule.kind === "docTypeKeywords" && (
        <div className="mt-2">
          <KeywordChips keywords={rule.keywords} onChange={(keywords) => onChange({ ...rule, keywords })} />
        </div>
      )}

      {rule.kind === "recentWithin" && (
        <div className="mt-2 max-w-[220px]">
          <Label htmlFor={`rw-${rule.days}`}>Must be dated within (days)</Label>
          <Input id={`rw-${rule.days}`} type="number" min={1} max={3650} value={rule.days}
            onChange={(e) => onChange({ ...rule, days: Math.max(1, Number(e.target.value) || 90) })} />
        </div>
      )}

      {rule.kind === "expiryReminder" && (
        <div className="mt-2 max-w-[220px]">
          <Label htmlFor="er">Warn when expiring within (days)</Label>
          <Input id="er" type="number" min={1} max={365} value={rule.withinDays}
            onChange={(e) => onChange({ ...rule, withinDays: Math.max(1, Number(e.target.value) || 45) })} />
        </div>
      )}

      {rule.kind === "hasFields" && (
        <div className="mt-2 space-y-2">
          {rule.patterns.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
              <Input value={p.label} placeholder="What it is (shown to renters)"
                onChange={(e) => onChange({ ...rule, patterns: rule.patterns.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
              <Input value={p.regex} placeholder="Pattern, e.g. \\$\\s?\\d"
                className="font-mono text-xs"
                onChange={(e) => onChange({ ...rule, patterns: rule.patterns.map((x, j) => j === i ? { ...x, regex: e.target.value } : x) })} />
              <Button type="button" variant="outline" size="icon" aria-label="Remove field"
                onClick={() => onChange({ ...rule, patterns: rule.patterns.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm"
            onClick={() => onChange({ ...rule, patterns: [...rule.patterns, { label: "", regex: "" }] })}>
            <Plus className="mr-1 h-3 w-3" />Add a field
          </Button>
        </div>
      )}

      {(rule.kind === "nameMatch" || rule.kind === "notExpired") && (
        <p className="mt-1 text-xs text-muted-foreground">
          {rule.kind === "nameMatch"
            ? "Passes when the applicant's first and last name both appear in the recognized text."
            : "Fails when a detected expiry date is already in the past."}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------- sample + suggestion */

function SampleStudio({
  requirement, onPatch,
}: { requirement: Requirement; onPatch: (patch: Partial<Requirement>) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");

  async function analyzeFile(file: File, alsoShowToRenters: boolean) {
    setBusy("Reading the sample");
    try {
      let text: string;
      if (file.type === "application/pdf") {
        const res = await runOcrOnPdf(file, (p, total) => setBusy(`Reading page ${p} of ${total}`));
        text = res.text;
        if (alsoShowToRenters && res.pages[0]) {
          onPatch({ sampleImage: await toThumbDataUrl(res.pages[0]) });
        }
      } else {
        text = await runOcr(file, { onProgress: (_f, note) => note && setBusy(note) });
        if (alsoShowToRenters) onPatch({ sampleImage: await toThumbDataUrl(file) });
      }
      const s = suggestFromText(text);
      setSug(s);
      if (s.keywords.length === 0) toast.warning("We read the sample but couldn't pull out distinctive words. Try the paste-text option.");
    } catch (e) {
      toast.error("Couldn't read that sample: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function applySuggestion(s: Suggestion, includeExtraRules: boolean) {
    const kept = requirement.rules.filter((r) => r.kind !== "docTypeKeywords");
    const existing = requirement.rules.find((r) => r.kind === "docTypeKeywords");
    const merged = Array.from(new Set([
      ...(existing && existing.kind === "docTypeKeywords" ? existing.keywords : []),
      ...s.keywords,
    ]));
    const extra = includeExtraRules
      ? s.rules.filter((r) => !kept.some((k) => k.kind === r.kind))
      : [];
    onPatch({ rules: [{ kind: "docTypeKeywords", keywords: merged }, ...kept, ...extra] });
    toast.success("Suggestions added. Edit them before saving.");
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">Sample document</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Upload one filled-in example. DocKit reads it on this device to suggest checks, and can also show it to renters as
        a "this is what we need" picture.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[132px_1fr]">
        <div>
          {requirement.sampleImage ? (
            <div className="space-y-1">
              <img src={requirement.sampleImage} alt={`Sample for ${requirement.name}`}
                className="h-28 w-full rounded-md border border-border object-cover" />
              <button type="button" onClick={() => onPatch({ sampleImage: undefined })}
                className="text-xs text-destructive underline-offset-2 hover:underline">Remove sample image</button>
            </div>
          ) : (
            <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              <ImageIcon className="mr-1 h-4 w-4" />No sample
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Analyze &amp; show to renters
              <input type="file" accept="image/*,application/pdf" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeFile(f, true); e.currentTarget.value = ""; }} />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Analyze only
              <input type="file" accept="image/*,application/pdf" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeFile(f, false); e.currentTarget.value = ""; }} />
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen((v) => !v)}>
              <ClipboardPaste className="mr-1 h-3.5 w-3.5" />Paste text instead
            </Button>
          </div>

          {busy && <p className="text-xs text-muted-foreground" aria-live="polite">{busy}…</p>}

          {pasteOpen && (
            <div className="space-y-2">
              <textarea rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste the wording that appears on this document — the letterhead, the title, any standard phrases."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs" />
              <Button type="button" size="sm" variant="outline"
                onClick={() => { setSug(suggestFromText(pasted)); }}>Suggest from this text</Button>
              <p className="text-xs text-muted-foreground">
                Most reliable option: photos of glossy IDs and phone screenshots often read poorly, but pasted text is exact.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor={`hint-${requirement.id}`} className="text-xs">Photo tip shown to renters (optional)</Label>
            <Input id={`hint-${requirement.id}`} value={requirement.sampleHint ?? ""}
              placeholder="e.g. Lay it flat, fill the frame, no flash glare."
              onChange={(e) => onPatch({ sampleHint: e.target.value })} />
          </div>
        </div>
      </div>

      {sug && (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs">
          <p className="font-medium">Suggested keywords</p>
          <p className="mt-1">{sug.keywords.length ? sug.keywords.join(" · ") : "(none found)"}</p>
          {sug.rules.length > 0 && (
            <p className="mt-2">Also suggested: {sug.rules.map((r) => RULE_LABELS[r.kind]).join(", ")}</p>
          )}
          {sug.notes.map((n, i) => <p key={i} className="mt-1 text-muted-foreground">{n}</p>)}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => applySuggestion(sug, true)} disabled={!sug.keywords.length && !sug.rules.length}>
              Add all suggestions
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applySuggestion(sug, false)} disabled={!sug.keywords.length}>
              Keywords only
            </Button>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-muted-foreground">Show the text we recognized</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{sug.text || "(nothing recognized)"}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- export */

export function RequirementCard({
  value, onChange, onRemove,
}: { value: Requirement; onChange: (r: Requirement) => void; onRemove: () => void }) {
  const patch = (p: Partial<Requirement>) => onChange({ ...value, ...p });
  const usedKinds = new Set(value.rules.map((r) => r.kind));
  const hasKeywordCheck = value.rules.some((r) => r.kind === "docTypeKeywords" && r.keywords.length > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`nm-${value.id}`}>Name</Label>
          <Input id={`nm-${value.id}`} value={value.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 pt-6 text-sm">
          <input id={`pp-${value.id}`} type="checkbox" className="h-4 w-4 min-h-0"
            checked={value.perPerson} onChange={(e) => patch({ perPerson: e.target.checked })} />
          <label htmlFor={`pp-${value.id}`}>Required per person</label>
        </div>
      </div>

      <div className="mt-2">
        <Label htmlFor={`ds-${value.id}`}>Description for renters</Label>
        <textarea id={`ds-${value.id}`} rows={2} value={value.description}
          onChange={(e) => patch({ description: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Checks that run on the renter's phone</p>
          <div className="flex flex-wrap gap-1">
            {RULE_ORDER.filter((k) => !usedKinds.has(k)).map((k) => (
              <Button key={k} type="button" variant="outline" size="sm"
                onClick={() => patch({ rules: [...value.rules, blankRule(k)] })}>
                <Plus className="mr-1 h-3 w-3" />{RULE_LABELS[k]}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-2 space-y-2">
          {value.rules.length === 0 && (
            <p className="text-xs text-muted-foreground">No checks yet. Add at least a keyword check so we can tell renters when they've uploaded the wrong document.</p>
          )}
          {value.rules.map((r, i) => (
            <RuleRow key={`${r.kind}-${i}`} rule={r}
              onChange={(nr) => patch({ rules: value.rules.map((x, j) => j === i ? nr : x) })}
              onRemove={() => patch({ rules: value.rules.filter((_, j) => j !== i) })} />
          ))}
        </div>
        {!hasKeywordCheck && (
          <p className="mt-2 text-xs text-warning-foreground">
            This requirement has no keyword check yet. Add one manually, or analyze a sample below.
          </p>
        )}
      </div>

      <SampleStudio requirement={value} onPatch={patch} />

      <button type="button" onClick={onRemove}
        className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-destructive transition-colors hover:bg-destructive/10">
        <Trash2 className="h-4 w-4" />Remove requirement
      </button>
    </div>
  );
}
