// Thin wrappers around the SECURITY DEFINER RPCs that back the renter flow.
// No user session is involved — everything is scoped by the unguessable
// session_token in the URL.
import { supabase } from "@/integrations/supabase/client";
import type { Requirement } from "./rules/engine";

export interface Applicant { name: string; phone?: string; email?: string }
export interface ApplicationRow {
  id: string;
  program_id: string;
  session_token: string;
  applicant: Applicant;
  co_applicants: Applicant[];
  status: string;
  language: string;
  packet_path: string | null;
  submitted_at: string | null;
}
export interface ProgramRow {
  id: string;
  name: string;
  program_type: string;
  requirements: Requirement[];
  link_token: string;
}
export interface DocumentRow {
  id: string;
  requirement_id: string;
  doc_type: string;
  applicant_index: number;
  storage_path: string | null;
  ocr_text: string | null;
  status: "pending" | "pass" | "needs_fixing" | "flagged";
  issues: { rule: string; message: string; severity: string }[];
  exif_flag: boolean;
  exif_reason: string | null;
  acknowledged: boolean;
}

export async function getProgramByToken(token: string): Promise<ProgramRow | null> {
  const { data, error } = await supabase.rpc("renter_get_program", { _token: token });
  if (error) throw error;
  return (data as unknown as ProgramRow) ?? null;
}

export async function startApplication(programToken: string): Promise<string> {
  const { data, error } = await supabase.rpc("renter_start_application", { _program_token: programToken });
  if (error) throw error;
  return data as string;
}

export async function getApplication(sessionToken: string) {
  const { data, error } = await supabase.rpc("renter_get_application", { _token: sessionToken });
  if (error) throw error;
  return data as unknown as { application: ApplicationRow; program: ProgramRow; documents: DocumentRow[] } | null;
}

export async function updateApplicant(
  token: string,
  applicant: Applicant,
  co: Applicant[],
  lang: string,
) {
  const { error } = await supabase.rpc("renter_update_applicant", {
    _token: token,
    _applicant: applicant as unknown as Record<string, unknown>,
    _co: co as unknown as Record<string, unknown>[],
    _lang: lang,
  });
  if (error) throw error;
}

export interface SaveDocInput {
  token: string;
  requirementId: string;
  docType: string;
  applicantIndex: number;
  storagePath: string | null;
  ocrText: string;
  status: "pass" | "needs_fixing" | "flagged";
  issues: unknown[];
  exifFlag: boolean;
  exifReason: string | null;
}

export async function saveDocument(input: SaveDocInput) {
  const { error } = await supabase.rpc("renter_save_document", {
    _token: input.token,
    _requirement_id: input.requirementId,
    _doc_type: input.docType,
    _applicant_index: input.applicantIndex,
    _storage_path: input.storagePath ?? "",
    _ocr_text: input.ocrText,
    _status: input.status,
    _issues: input.issues as unknown as Record<string, unknown>[],
    _exif_flag: input.exifFlag,
    _exif_reason: input.exifReason ?? "",
  });
  if (error) throw error;
}

export async function submitApplication(token: string, packetPath: string) {
  const { error } = await supabase.rpc("renter_submit", { _token: token, _packet_path: packetPath });
  if (error) throw error;
}

export async function startOver(token: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("renter_start_over", { _token: token });
  if (error) throw error;
  const paths = (data as string[] | null) ?? [];
  if (paths.length) await supabase.storage.from("documents").remove(paths);
  return paths;
}

export async function uploadDoc(token: string, applicationId: string, file: Blob, ext: string): Promise<string> {
  const id = crypto.randomUUID();
  const path = `${token}/${applicationId}/${id}.${ext}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, {
    contentType: (file as File).type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
