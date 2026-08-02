import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_ENDPOINT,
  ApplicationSubmissionError,
  sendApplication,
  SUBMISSION_ERROR_MESSAGE,
} from "../lib/forms/submit-application.ts";

function validFormData() {
  const formData = new FormData();
  formData.set("name", "Мария");
  formData.set("phone", "+7 999 000-00-00");
  formData.set("furnitureType", "Кухня");
  formData.set("comment", "Нужен расчёт");
  formData.set("consent", "accepted");
  return formData;
}

test("submits the existing FormData to the relative backend endpoint", async () => {
  const formData = validFormData();
  let calls = 0;

  const message = await sendApplication(formData, async (url, init) => {
    calls += 1;
    assert.equal(url, "/api/application");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, formData);
    assert.equal(init?.headers?.Accept, "application/json");
    return Response.json({ ok: true, message: "Заявка принята" });
  });

  assert.equal(APPLICATION_ENDPOINT, "/api/application");
  assert.equal(calls, 1);
  assert.equal(message, "Заявка принята");
});

test("keeps an attached photo inside the submitted FormData", async () => {
  const formData = validFormData();
  formData.append("photos", new Blob(["image"], { type: "image/jpeg" }), "project.jpg");

  await sendApplication(formData, async (_url, init) => {
    const submitted = init?.body;
    assert.ok(submitted instanceof FormData);
    const photo = submitted.get("photos");
    assert.ok(photo instanceof File);
    assert.equal(photo.name, "project.jpg");
    return Response.json({ ok: true, message: "Заявка принята" });
  });
});

test("does not treat an unsuccessful backend response as success", async () => {
  const formData = validFormData();

  await assert.rejects(
    sendApplication(
      formData,
      async () =>
        Response.json(
          { ok: false, errors: { phone: "Проверьте номер телефона." } },
          { status: 400 },
        ),
    ),
    (error) => {
      assert.ok(error instanceof ApplicationSubmissionError);
      assert.equal(error.message, SUBMISSION_ERROR_MESSAGE);
      assert.equal(error.fieldErrors.phone, "Проверьте номер телефона.");
      return true;
    },
  );
});

test("returns the retry message after a network failure", async () => {
  await assert.rejects(
    sendApplication(validFormData(), async () => {
      throw new Error("network unavailable");
    }),
    (error) => {
      assert.ok(error instanceof ApplicationSubmissionError);
      assert.equal(error.message, SUBMISSION_ERROR_MESSAGE);
      return true;
    },
  );
});
