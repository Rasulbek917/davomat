import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError, Errors } from "@/lib/errors";
import { ACCEPTED_AVATAR_TYPES, MAX_AVATAR_BYTES } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

/**
 * Avatar storage.
 *
 * Uploads are:
 *   * size limited,
 *   * validated by content type AND real image decoding,
 *   * re-encoded to a fixed-size WebP (strips EXIF and neutralises any
 *     polyglot/embedded payload),
 *   * stored under a random name outside the web root,
 * and served only through an authenticated route handler.
 */

// `UPLOAD_DIR` is operator-configurable, so the target path is genuinely
// dynamic. The `turbopackIgnore` hint stops the bundler from tracing the whole
// project as a dependency of this module.
function uploadRoot(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), serverEnv().UPLOAD_DIR);
}

export async function ensureUploadDir(sub = "avatars"): Promise<string> {
  const dir = path.join(/* turbopackIgnore: true */ uploadRoot(), sub);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveAvatar(file: File, userId: string): Promise<string> {
  if (file.size === 0) throw Errors.validation("Fayl bo‘sh.");
  if (file.size > MAX_AVATAR_BYTES) {
    throw Errors.validation("Rasm hajmi 2 MB dan oshmasligi kerak.");
  }
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
    throw Errors.validation("Faqat JPEG, PNG yoki WebP rasm yuklash mumkin.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Re-encode: this both validates the image and strips metadata.
  let processed: Buffer;
  try {
    processed = await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw Errors.validation("Rasm fayli o‘qilmadi yoki buzilgan.");
  }

  const dir = await ensureUploadDir("avatars");
  const filename = `${userId}-${randomToken(6)}.webp`;
  await writeFile(path.join(dir, filename), processed);
  return `avatars/${filename}`;
}

export async function deleteAvatar(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  const target = path.resolve(/* turbopackIgnore: true */ uploadRoot(), relativePath);
  // Guard against path traversal.
  if (!target.startsWith(uploadRoot())) return;
  await unlink(target).catch(() => undefined);
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  const target = path.resolve(/* turbopackIgnore: true */ uploadRoot(), relativePath);
  if (!target.startsWith(uploadRoot())) throw Errors.notFound();
  try {
    return await readFile(target);
  } catch {
    throw Errors.notFound("Fayl topilmadi.");
  }
}

export function contentTypeForStoredFile(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  switch (ext) {
    case ".webp":
      return "image/webp";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

export { AppError };
