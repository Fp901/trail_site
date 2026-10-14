// Owner-uploaded marketing photos (CLAUDE.md Part 18, migration 0022). Server only.
//
// Files live in the PRIVATE Storage bucket `marketing-photos` (no public access, no storage
// policies); one row per file in marketing.photos. The service role uploads and reads; agents only
// ever receive short-lived signed URLs through get_photo_library.
//
// Validation never trusts the browser: the type comes from the file's own magic bytes (not its
// name or declared MIME type), the size is capped here and again by the bucket, and the object
// path is generated server-side.
import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabase';
import {
  PHOTO_LODGE_BY_KEY,
  PHOTO_UPLOAD_MAX_BYTES,
  type PhotoCategory,
  type PhotoLodge,
  type PhotoUploadType,
} from '../data/photo-library';
import { MARKETING_PHOTO_COLUMNS, sel, type MarketingPhotoRow } from './db.types';
import { PHOTO_USED_STATUSES } from '../../marketing/contracts';

export const MARKETING_PHOTO_BUCKET = 'marketing-photos';
// Agents' sessions are capped at 20 minutes, so an hour comfortably covers a run.
export const SIGNED_URL_SECONDS = 3600;
export const UPLOAD_ID_PREFIX = 'upload-';

const EXT: Record<PhotoUploadType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// JPEG FF D8 FF; PNG 89 50 4E 47 0D 0A 1A 0A; WebP "RIFF" .... "WEBP".
export function sniffImageType(b: Uint8Array): PhotoUploadType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// The reason a file is refused, or the type and server-generated object path to store it under.
export function checkPhotoUpload(
  bytes: Uint8Array,
): { ok: true; type: PhotoUploadType; path: string } | { ok: false; message: string } {
  if (bytes.byteLength === 0) return { ok: false, message: 'The file is empty.' };
  if (bytes.byteLength > PHOTO_UPLOAD_MAX_BYTES) {
    return { ok: false, message: `The photo is larger than ${PHOTO_UPLOAD_MAX_BYTES / 1024 / 1024} MB. Please resize it and try again.` };
  }
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, message: 'Only JPEG, PNG or WebP photos can be uploaded.' };
  return { ok: true, type, path: `uploads/${crypto.randomUUID()}.${EXT[type]}` };
}

export interface UploadedLibraryPhoto {
  id: string;
  category: PhotoCategory;
  lodge: PhotoLodge | null;
  alt: string;
  // Uploads are not measured, so their shape is unknown: open the URL to see it.
  orientation: 'unknown';
  url: string | null;
  url_expires_in_seconds: number;
  uploaded_at: string;
}

const COLS = ['id', 'created_at', 'storage_path', 'category', 'lodge', 'alt'] as const satisfies readonly (typeof MARKETING_PHOTO_COLUMNS)[number][];
type Row = Pick<MarketingPhotoRow, (typeof COLS)[number]>;

// The newest uploads, each with a short-lived signed URL. Throws on a database error so the caller
// can fall back to the static library.
export async function uploadedPhotos(limit = 100): Promise<UploadedLibraryPhoto[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .schema('marketing')
    .from('photos')
    .select(sel<MarketingPhotoRow, typeof COLS>(COLS))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const signed = await sb.storage.from(MARKETING_PHOTO_BUCKET).createSignedUrls(
    rows.map((r) => r.storage_path),
    SIGNED_URL_SECONDS,
  );
  const urlByPath = new Map<string, string | null>();
  for (const s of signed.data ?? []) if (s.path) urlByPath.set(s.path, s.signedUrl ?? null);

  return rows.map((r) => ({
    id: UPLOAD_ID_PREFIX + r.id,
    category: r.category,
    lodge: r.lodge ? PHOTO_LODGE_BY_KEY[r.lodge] : null,
    alt: r.alt,
    orientation: 'unknown' as const,
    url: urlByPath.get(r.storage_path) ?? null,
    url_expires_in_seconds: SIGNED_URL_SECONDS,
    uploaded_at: r.created_at,
  }));
}

// Which of these upload ids exist. Ids that are not "upload-<uuid>" are ignored.
export async function existingUploadIds(ids: string[]): Promise<Set<string>> {
  const uuids = ids
    .filter((id) => id.startsWith(UPLOAD_ID_PREFIX))
    .map((id) => id.slice(UPLOAD_ID_PREFIX.length))
    .filter((u) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u));
  if (uuids.length === 0) return new Set();
  const { data, error } = await getSupabaseAdmin().schema('marketing').from('photos').select('id').in('id', uuids);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { id: string }[]).map((r) => UPLOAD_ID_PREFIX + r.id));
}

// Every photo id already on a pending or approved draft. A photo is used once and never again
// (CLAUDE.md Part 18); exceptDraft leaves out the flagged draft a fix is replacing.
export async function usedPhotoIds(exceptDraft?: string): Promise<Set<string>> {
  let q = getSupabaseAdmin().schema('marketing').from('drafts').select('id, photo_ids').in('status', [...PHOTO_USED_STATUSES]);
  if (exceptDraft) q = q.neq('id', exceptDraft);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { photo_ids: string[] | null }[]).flatMap((r) => r.photo_ids ?? []));
}
