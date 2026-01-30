const USERNAME_REGEX = /@([A-Za-z0-9_]{1,15})/;
const X_URL_REGEX = /https?:\/\/(x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/;

export type ParsedSubmission = {
  claimedUsername: string | null;
  xUrl: string | null;
  urlUsername: string | null;
};

export function parseSubmission(text: string): ParsedSubmission {
  const trimmed = text.trim();
  const usernameMatch = trimmed.match(USERNAME_REGEX);
  const urlMatch = trimmed.match(X_URL_REGEX);

  return {
    claimedUsername: usernameMatch ? usernameMatch[1] : null,
    xUrl: urlMatch ? urlMatch[0] : null,
    urlUsername: urlMatch ? urlMatch[2] : null,
  };
}

export function normalizeUsername(value: string): string {
  return value.replace(/^@/, "").toLowerCase();
}
