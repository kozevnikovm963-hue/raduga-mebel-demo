import {
  type ApplicationErrors,
  type ApplicationInput,
  validateApplicationInput,
} from "@/lib/forms/validation";
import {
  PhotoValidationError,
  prepareUploadedPhotos,
  removePreparedPhotos,
} from "@/server/forms/file-processing";
import { checkRateLimit } from "@/server/forms/rate-limit";
import { sendApplicationEmail } from "@/server/integrations/email";
import { sendApplicationToVk } from "@/server/integrations/vk";

export type ApplicationHandlerResult =
  | { ok: true; message: string }
  | { ok: false; status: 400 | 429 | 500 | 503; message: string; errors?: ApplicationErrors };

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function handleApplicationForm(
  formData: FormData,
  request: { ip: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<ApplicationHandlerResult> {
  if (!checkRateLimit(request.ip)) {
    return {
      ok: false,
      status: 429,
      message: "Слишком много попыток. Пожалуйста, попробуйте отправить заявку немного позже.",
    };
  }

  const raw: ApplicationInput = {
    name: stringValue(formData, "name"),
    phone: stringValue(formData, "phone"),
    furnitureType: stringValue(formData, "furnitureType"),
    comment: stringValue(formData, "comment"),
    website: stringValue(formData, "website"),
  };

  if (raw.website.trim()) {
    return { ok: true, message: "Спасибо! Заявка принята." };
  }

  const validation = validateApplicationInput(raw);
  if (Object.keys(validation.errors).length > 0) {
    return {
      ok: false,
      status: 400,
      message: "Проверьте заполнение формы.",
      errors: validation.errors,
    };
  }

  const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  let directory: string | null = null;

  try {
    const prepared = await prepareUploadedPhotos(files);
    directory = prepared.directory;
    const [vkResult, emailResult] = await Promise.allSettled([
      sendApplicationToVk(validation.data, prepared.photos, env),
      sendApplicationEmail(validation.data, prepared.photos, env),
    ]);

    if (vkResult.status === "rejected") {
      console.error("[application] VK delivery failed:", safeError(vkResult.reason));
    }
    if (emailResult.status === "rejected") {
      console.error("[application] email delivery failed:", safeError(emailResult.reason));
    }

    const vkSent = vkResult.status === "fulfilled" && vkResult.value.status === "sent";
    const emailSent = emailResult.status === "fulfilled" && emailResult.value.status === "sent";

    if (!vkSent && !emailSent) {
      return {
        ok: false,
        status: 503,
        message: "Отправка заявок пока настраивается. Пожалуйста, позвоните нам по номеру +7 953 677-03-48.",
      };
    }

    return { ok: true, message: "Спасибо! Заявка успешно отправлена менеджеру." };
  } catch (error) {
    if (error instanceof PhotoValidationError) {
      return {
        ok: false,
        status: 400,
        message: "Проверьте прикреплённые фотографии.",
        errors: { photos: error.message },
      };
    }
    console.error("[application] processing failed:", safeError(error));
    return {
      ok: false,
      status: 500,
      message: "Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.",
    };
  } finally {
    await removePreparedPhotos(directory);
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown delivery error";
}
