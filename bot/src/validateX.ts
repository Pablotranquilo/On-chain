import { normalizeUsername, ParsedSubmission } from "./parseSubmission";

const X_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/;

export type ValidationResult = {
  ok: boolean;
  reason?: string;
};

export function validateSubmission(parsed: ParsedSubmission): ValidationResult {
  if (!parsed.claimedUsername) {
    return { ok: false, reason: "Missing @username in message." };
  }

  if (!parsed.xUrl || !parsed.urlUsername) {
    return { ok: false, reason: "Missing valid X link." };
  }

  if (!X_URL_REGEX.test(parsed.xUrl)) {
    return { ok: false, reason: "X link format is invalid." };
  }

  const claimed = normalizeUsername(parsed.claimedUsername);
  const urlUser = normalizeUsername(parsed.urlUsername);

  if (claimed !== urlUser) {
    return { ok: false, reason: "@username does not match the X link username." };
  }

  return { ok: true };
}
