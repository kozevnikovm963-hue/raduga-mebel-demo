export const MAX_PHOTO_COUNT = 5;
export const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
export const MAX_COMMENT_LENGTH = 1000;

export const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const ALLOWED_PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export const FURNITURE_TYPES = [
  "Кухня",
  "Шкаф",
  "Гардеробная",
  "Прихожая",
  "Детская",
  "Другое",
] as const;

export type ApplicationInput = {
  name: string;
  phone: string;
  furnitureType: string;
  comment: string;
  website: string;
};

export type ApplicationField = "name" | "phone" | "furnitureType" | "comment" | "photos" | "form";
export type ApplicationErrors = Partial<Record<ApplicationField, string>>;

export type PhotoLike = {
  name: string;
  size: number;
  type: string;
};

export function sanitizePlainText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) return `+7${digits}`;
  if (digits.length !== 11) return null;
  if (digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.startsWith("7")) return `+${digits}`;

  return null;
}

export function validateApplicationInput(raw: ApplicationInput): {
  data: ApplicationInput & { phone: string };
  errors: ApplicationErrors;
} {
  const data = {
    name: sanitizePlainText(raw.name, 80),
    phone: sanitizePlainText(raw.phone, 40),
    furnitureType: sanitizePlainText(raw.furnitureType, 40),
    comment: sanitizePlainText(raw.comment, MAX_COMMENT_LENGTH),
    website: sanitizePlainText(raw.website, 200),
  };
  const errors: ApplicationErrors = {};
  const normalizedPhone = normalizePhone(data.phone);

  if (data.name.length < 2) {
    errors.name = "Укажите имя — минимум 2 символа.";
  }

  if (!data.phone) {
    errors.phone = "Укажите номер телефона.";
  } else if (!normalizedPhone) {
    errors.phone = "Проверьте номер телефона, например: +7 953 677-03-48.";
  }

  if (data.furnitureType && !FURNITURE_TYPES.includes(data.furnitureType as (typeof FURNITURE_TYPES)[number])) {
    errors.furnitureType = "Выберите тип мебели из списка.";
  }

  if (String(raw.comment ?? "").trim().length > MAX_COMMENT_LENGTH) {
    errors.comment = `Комментарий не должен превышать ${MAX_COMMENT_LENGTH} символов.`;
  }

  return {
    data: { ...data, phone: normalizedPhone ?? data.phone },
    errors,
  };
}

export function validatePhotoList(files: PhotoLike[]): string | null {
  if (files.length > MAX_PHOTO_COUNT) {
    return `Можно прикрепить не больше ${MAX_PHOTO_COUNT} фотографий.`;
  }

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_PHOTO_TYPES.has(file.type.toLowerCase()) || !ALLOWED_PHOTO_EXTENSIONS.has(extension)) {
      return `Файл «${sanitizePlainText(file.name, 100)}» имеет неподдерживаемый формат. Используйте JPG, JPEG, PNG или WEBP.`;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      return `Файл «${sanitizePlainText(file.name, 100)}» больше 10 МБ.`;
    }
  }

  return null;
}
