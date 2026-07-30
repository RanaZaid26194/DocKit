// Renter document library (suggested feature #11).
//
// Privacy rule for DocKit: a renter's documents never sit on our servers
// longer than a review needs them. So the "library" is **local only** — it
// lives in the renter's own browser (IndexedDB), never syncs, and is wiped
// by "Start over" or by clearing site data. When a renter reuses an entry in
// a second program, the image is re-run through OCR, the EXIF check, and
// that program's rules from scratch. Nothing is trusted just because it
// passed somewhere else.

const DB_NAME = "dockit-library";
const STORE = "docs";
const VERSION = 1;
const MAX_ENTRIES = 24;

export interface LibraryEntry {
  id: string;
  label: string;
  /** Requirement name it was originally uploaded for, for smarter matching. */
  requirementName: string;
  mime: string;
  savedAt: number;
  /** Small preview so the picker can render without decoding the full blob. */
  thumb: string;
  blob: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const all = await tx<LibraryEntry[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function saveToLibrary(entry: Omit<LibraryEntry, "id" | "savedAt">): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await tx("readwrite", (s) =>
      s.put({ ...entry, id: crypto.randomUUID(), savedAt: Date.now() } as LibraryEntry),
    );
    const all = await listLibrary();
    for (const stale of all.slice(MAX_ENTRIES)) await removeFromLibrary(stale.id);
  } catch { /* library is a convenience, never block an upload on it */ }
}

export async function removeFromLibrary(id: string): Promise<void> {
  try { await tx("readwrite", (s) => s.delete(id)); } catch { /* ignore */ }
}

export async function clearLibrary(): Promise<void> {
  try { await tx("readwrite", (s) => s.clear()); } catch { /* ignore */ }
}

/** Rough relevance: entries saved for a similarly-named requirement come first. */
export function rankForRequirement(entries: LibraryEntry[], requirementName: string): LibraryEntry[] {
  const target = requirementName.toLowerCase();
  const tokens = target.split(/\W+/).filter((t) => t.length > 3);
  return [...entries].sort((a, b) => {
    const s = (e: LibraryEntry) => {
      const n = e.requirementName.toLowerCase();
      if (n === target) return 100;
      return tokens.reduce((acc, t) => acc + (n.includes(t) ? 10 : 0), 0);
    };
    return s(b) - s(a);
  });
}
