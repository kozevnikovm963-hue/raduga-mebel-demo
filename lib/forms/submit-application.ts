export const APPLICATION_ENDPOINT = "/api/application";
export const SUBMISSION_ERROR_MESSAGE =
  "Не удалось отправить заявку. Попробуйте ещё раз или свяжитесь с нами по телефону";

type ApplicationResponse = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
};

export class ApplicationSubmissionError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string> = {}) {
    super(SUBMISSION_ERROR_MESSAGE);
    this.name = "ApplicationSubmissionError";
    this.fieldErrors = fieldErrors;
  }
}

export async function sendApplication(
  formData: FormData,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let response: Response;

  try {
    response = await fetcher(APPLICATION_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });
  } catch {
    throw new ApplicationSubmissionError();
  }

  let result: ApplicationResponse = {};
  try {
    result = (await response.json()) as ApplicationResponse;
  } catch {
    throw new ApplicationSubmissionError();
  }

  if (!response.ok || result.ok !== true) {
    throw new ApplicationSubmissionError(result.errors ?? {});
  }

  return result.message ?? "Спасибо! Заявка успешно отправлена менеджеру.";
}
