import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALLOWED_PHOTO_EXTENSIONS,
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_COUNT,
  MAX_PHOTO_SIZE,
  validatePhotoList,
} from "@/lib/forms/validation";

export type PreparedPhoto = {
  originalName: string;
  safeName: string;
  contentType: string;
  size: number;
  path: string;
};

export class PhotoValidationError extends Error {}

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) =>
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  "image/webp": (bytes) =>
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
};

function extensionFor(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export async function prepareUploadedPhotos(files: File[]): Promise<{
  directory: string | null;
  photos: PreparedPhoto[];
}> {
  const listError = validatePhotoList(files);
  if (listError) throw new PhotoValidationError(listError);
  if (files.length === 0) return { directory: null, photos: [] };

  if (files.length > MAX_PHOTO_COUNT) throw new PhotoValidationError("Можно прикрепить не больше 5 фотографий.");

  const directory = join(tmpdir(), `korpus-form-${randomUUID()}`);
  await mkdir(directory, { recursive: false, mode: 0o700 });
  const photos: PreparedPhoto[] = [];

  try {
    for (const file of files) {
      const extension = extensionFor(file);
      const contentType = file.type.toLowerCase();
      if (
        file.size > MAX_PHOTO_SIZE ||
        !ALLOWED_PHOTO_TYPES.has(contentType) ||
        !ALLOWED_PHOTO_EXTENSIONS.has(extension)
      ) {
        throw new PhotoValidationError("Проверьте формат и размер прикреплённых фотографий.");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!signatures[contentType]?.(bytes)) {
        throw new PhotoValidationError("Одна из фотографий повреждена или имеет неверный формат.");
      }

      const safeName = `${randomUUID()}.${extension}`;
      const path = join(directory, safeName);
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
      photos.push({
        originalName: file.name.slice(0, 150),
        safeName,
        contentType,
        size: file.size,
        path,
      });
    }

    return { directory, photos };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function removePreparedPhotos(directory: string | null): Promise<void> {
  if (!directory) return;
  await rm(directory, { recursive: true, force: true });
}
