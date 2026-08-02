import assert from "node:assert/strict";
import test from "node:test";
import {
  safeIntegrationError,
  safeRequestError,
} from "../server/logging.ts";

test("VK errors are reduced to a safe code and message", () => {
  const result = safeIntegrationError(
    "vk",
    new Error("request failed: access_token=sensitive-value"),
  );

  assert.deepEqual(result, {
    code: "VK_DELIVERY_ERROR",
    message: "VK delivery failed",
  });
  assert.doesNotMatch(JSON.stringify(result), /sensitive-value|access_token/i);
});

test("email errors are reduced to a safe timeout code", () => {
  const result = safeIntegrationError(
    "email",
    new Error("SMTP timeout with password=sensitive-value"),
  );

  assert.deepEqual(result, {
    code: "EMAIL_TIMEOUT",
    message: "EMAIL delivery timed out",
  });
  assert.doesNotMatch(JSON.stringify(result), /sensitive-value|password/i);
});

test("request errors never expose the original message", () => {
  const result = safeRequestError(
    new Error("invalid multipart data containing private form values"),
  );

  assert.deepEqual(result, {
    code: "REQUEST_PROCESSING_ERROR",
    message: "Application request processing failed",
  });
  assert.doesNotMatch(JSON.stringify(result), /multipart|private form values/i);
});
