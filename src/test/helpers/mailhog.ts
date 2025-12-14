type MailHogMessage = {
  ID: string;
  From: { Relays: unknown[]; Mailbox: string; Domain: string; Params: string };
  To: Array<{
    Relays: unknown[];
    Mailbox: string;
    Domain: string;
    Params: string;
  }>;
  Content: {
    Headers: Record<string, string[]>;
    Body: string;
  };
  Created: string;
  MIME: unknown | null;
  Raw: {
    From: string;
    To: string[];
    Data: string;
    Helo: string;
  };
};

type MailHogSearchResponse = {
  total: number;
  count: number;
  start: number;
  items: MailHogMessage[];
};

const MAILHOG_API_URL = "http://localhost:8025";
const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_RETRY_DELAY_MS = 100;

const OTP_STYLED_SPAN_REGEX =
  /<span[^>]*font-size:\s*32px[^>]*>[\s\n]*(\d{6})[\s\n]*<\/span>/i;
const OTP_SIMPLE_REGEX = /\b(\d{6})\b/;

async function searchEmailsByRecipient(
  email: string
): Promise<MailHogMessage[]> {
  const url = new URL(`${MAILHOG_API_URL}/api/v2/search`);
  url.searchParams.set("kind", "to");
  url.searchParams.set("query", email);
  url.searchParams.set("limit", "50");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `MailHog API request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as MailHogSearchResponse;

  return data.items.sort(
    (a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime()
  );
}

function extractOTPFromEmailBody(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");

  const spanMatch = decodedBody.match(OTP_STYLED_SPAN_REGEX);

  if (spanMatch?.[1]) {
    return spanMatch[1];
  }

  const simpleMatch = decodedBody.match(OTP_SIMPLE_REGEX);

  return simpleMatch?.[1] ?? null;
}

function throwMailHogUnavailableError(): never {
  throw new Error(
    `MailHog is not available at ${MAILHOG_API_URL}. Ensure MailHog is running (docker compose up -d).`
  );
}

function throwNoEmailsError(email: string, maxRetries: number): never {
  throw new Error(
    `No emails found for ${email} after ${maxRetries} attempts. Is MailHog running on port 8025?`
  );
}

function throwOTPNotFoundError(
  email: string,
  subject: string | undefined
): never {
  throw new Error(
    `Found email for ${email} but could not extract OTP from body. Email subject: "${subject ?? "N/A"}"`
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryGetOTPFromEmail(email: string): Promise<string | null> {
  const messages = await searchEmailsByRecipient(email);

  if (messages.length === 0) {
    return null;
  }

  const latestEmail = messages[0];
  const otp = extractOTPFromEmailBody(latestEmail.Content.Body);

  if (!otp) {
    throwOTPNotFoundError(email, latestEmail.Content.Headers.Subject?.[0]);
  }

  return otp;
}

export async function waitForOTP(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const otp = await tryGetOTPFromEmail(email);

      if (otp) {
        return otp;
      }

      if (attempt >= maxRetries) {
        throwNoEmailsError(email, maxRetries);
      }

      await delay(delayMs);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throwMailHogUnavailableError();
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      await delay(delayMs);
    }
  }

  throw new Error(`OTP not found for ${email} after ${maxRetries} retries`);
}
