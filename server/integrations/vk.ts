import { readFile } from "node:fs/promises";
import type { ApplicationInput } from "@/lib/forms/validation";
import type { PreparedPhoto } from "@/server/forms/file-processing";

export type IntegrationResult =
  | { status: "sent" }
  | { status: "skipped"; code: "CONFIG_MISSING" };

function buildVkMessage(data: ApplicationInput, photos: PreparedPhoto[]): string {
  return [
    "🔥 Новая заявка с сайта KORPUS",
    "",
    `Имя: ${data.name}`,
    `Телефон: ${data.phone}`,
    `Интересует: ${data.furnitureType || "Не указано"}`,
    `Комментарий: ${data.comment || "Не указан"}`,
    `Фотографий: ${photos.length}`,
  ].join("\n");
}

export async function sendApplicationToVk(
  data: ApplicationInput,
  photos: PreparedPhoto[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<IntegrationResult> {
  const token = env.VK_TOKEN?.trim();
  const receiverId = env.VK_RECEIVER_ID?.trim();
  const groupId = env.VK_GROUP_ID?.trim();

  if (!token || !receiverId || !groupId) {
    return { status: "skipped", code: "CONFIG_MISSING" };
  }

  const attachments: string[] = [];
  for (const photo of photos) {
    attachments.push(await uploadMessagePhoto(photo, token, receiverId, groupId));
  }

  const params = new URLSearchParams({
    access_token: token,
    peer_id: receiverId,
    random_id: String(Math.floor(Math.random() * 2_147_483_647)),
    message: buildVkMessage(data, photos),
    group_id: groupId,
    v: "5.199",
  });
  if (attachments.length > 0) params.set("attachment", attachments.join(","));
  const response = await fetch("https://api.vk.com/method/messages.send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(12_000),
  });
  const result = (await response.json()) as { error?: { error_code?: number } };

  if (!response.ok || result.error) {
    throw new Error("VK delivery failed");
  }

  return { status: "sent" };
}

type VkUploadServer = { response?: { upload_url?: string }; error?: unknown };
type VkUploadResult = { photo?: string; server?: number; hash?: string };
type VkSavedPhoto = { owner_id: number; id: number; access_key?: string };

async function uploadMessagePhoto(
  photo: PreparedPhoto,
  token: string,
  receiverId: string,
  groupId: string,
): Promise<string> {
  const serverParams = new URLSearchParams({
    access_token: token,
    peer_id: receiverId,
    group_id: groupId,
    v: "5.199",
  });
  const serverResponse = await fetch(`https://api.vk.com/method/photos.getMessagesUploadServer?${serverParams}`, {
    signal: AbortSignal.timeout(12_000),
  });
  const serverResult = (await serverResponse.json()) as VkUploadServer;
  const uploadUrl = serverResult.response?.upload_url;
  if (!serverResponse.ok || !uploadUrl || serverResult.error) throw new Error("VK photo upload server failed");

  const fileBytes = await readFile(photo.path);
  const uploadForm = new FormData();
  uploadForm.append("photo", new Blob([fileBytes], { type: photo.contentType }), photo.safeName);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: uploadForm,
    signal: AbortSignal.timeout(30_000),
  });
  const uploadResult = (await uploadResponse.json()) as VkUploadResult;
  if (!uploadResponse.ok || !uploadResult.photo || uploadResult.server === undefined || !uploadResult.hash) {
    throw new Error("VK photo upload failed");
  }

  const saveParams = new URLSearchParams({
    access_token: token,
    photo: uploadResult.photo,
    server: String(uploadResult.server),
    hash: uploadResult.hash,
    v: "5.199",
  });
  const saveResponse = await fetch("https://api.vk.com/method/photos.saveMessagesPhoto", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: saveParams,
    signal: AbortSignal.timeout(12_000),
  });
  const saveResult = (await saveResponse.json()) as { response?: VkSavedPhoto[]; error?: unknown };
  const saved = saveResult.response?.[0];
  if (!saveResponse.ok || !saved || saveResult.error) throw new Error("VK photo save failed");

  return `photo${saved.owner_id}_${saved.id}${saved.access_key ? `_${saved.access_key}` : ""}`;
}
