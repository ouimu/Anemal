// src/backend/utils/filename.ts
// Shared filename-safety control for storage-key construction (relocated
// from upload.service.ts before that file's deletion — ADR-0022 §5).
// Strips path-unsafe characters and caps length; applied by every
// key-builder (EMR attachments, pet photos) so a hostile filename can never
// become part of a filesystem path.
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

// multer (busboy) decodes the multipart filename as latin1, so a UTF-8
// filename — e.g. Thai "คู่มือ.pdf" — arrives as mojibake ("Ã¤Â¸..."). Re-read
// the raw bytes as UTF-8 to recover the real name for DISPLAY (the stored
// `fileName` column). Storage keys still go through sanitizeFilename, which
// keeps them ASCII-safe regardless. No-op for pure-ASCII names.
export function decodeMulterFilename(originalname: string): string {
  return Buffer.from(originalname, 'latin1').toString('utf8')
}
