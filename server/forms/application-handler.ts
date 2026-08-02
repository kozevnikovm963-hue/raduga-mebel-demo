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
import { logEvent, safeIntegrationError, safeRequestError } from "@/server/logging";

export type ApplicationHandlerResult =
  | { ok: true; message: string }
  | { ok: false; status: 400 | 429 | 500 | 503; message: string; errors?: ApplicationErrors };

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function handleApplicationForm(
  formData: FormData,
  request: { ip: string; requestId: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<ApplicationHandlerResult> {
  if (!checkRateLimit(request.ip)) {
    logEvent("warn", "application.rejected", {
      requestId: request.requestId,
      code: "RATE_LIMITED",
    });
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
    logEvent("info", "application.discarded", {
      requestId: request.requestId,
      code: "HONEYPOT",
    });
    return { ok: true, message: "Спасибо! Заявка принята." };
  }

  const validation = validateApplicationInput(raw);
  if (Object.keys(validation.errors).length > 0) {
    logEvent("warn", "application.rejected", {
      requestId: request.requestId,
      code: "VALIDATION_ERROR",
    });
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

    logChannelResult(request.requestId, "vk", vkResult);
    logChannelResult(request.requestId, "email", emailResult);

    const vkSent = vkResult.status === "fulfilled" && vkResult.value.status === "sent";
    const emailSent = emailResult.status === "fulfilled" && emailResult.value.status === "sent";

    if (!vkSent && !emailSent) {
      logEvent("error", "application.failed", {
        requestId: request.requestId,
        code: "ALL_DELIVERY_CHANNELS_FAILED",
      });
      return {
        ok: false,
        status: 503,
        message: "Отправка заявок пока настраивается. Пожалуйста, позвоните нам по номеру +7 953 677-03-48.",
      };
    }

    logEvent("info", "application.accepted", {
      requestId: request.requestId,
      vkSent,
      emailSent,
    });
    return { ok: true, message: "Спасибо! Заявка успешно отправлена менеджеру." };
  } catch (error) {
    if (error instanceof PhotoValidationError) {
      logEvent("warn", "application.rejected", {
        requestId: request.requestId,
        code: "PHOTO_VALIDATION_ERROR",
      });
      return {
        ok: false,
        status: 400,
        message: "Проверьте прикреплённые фотографии.",
        errors: { photos: error.message },
      };
    }
    const safeError = safeRequestError(error);
    logEvent("error", "application.failed", {
      requestId: request.requestId,
      code: safeError.code,
      message: safeError.message,
    });
    return {
      ok: false,
      status: 500,
      message: "Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.",
    };
  } finally {
    await removePreparedPhotos(directory);
  }
}

function logChannelResult(
  requestId: string,
  channel: "vk" | "email",
  result: PromiseSettledResult<{ status: "sent" } | { status: "skipped"; code: "CONFIG_MISSING" }>,
): void {
  if (result.status === "rejected") {
    const safeError = safeIntegrationError(channel, result.reason);
    logEvent("error", "application.channel", {
      requestId,
      channel,
      status: "failed",
      code: safeError.code,
      message: safeError.message,
    });
    return;
  }

  logEvent(result.value.status === "sent" ? "info" : "warn", "application.channel", {
    requestId,
    channel,
    status: result.value.status,
    code: result.value.status === "skipped" ? result.value.code : "DELIVERED",
  });
}
