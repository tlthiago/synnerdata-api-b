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
const DEFAULT_MAX_RETRIES = 30;
const DEFAULT_RETRY_DELAY_MS = 300;

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

// ============================================================
// VERIFICATION EMAIL
// ============================================================

export type VerificationEmailData = {
  subject: string;
  verificationUrl: string;
  body: string;
};

const VERIFICATION_SUBJECT_PATTERN = "Verifique seu email";
const VERIFICATION_URL_REGEX = /href=["']([^"']*verify-email[^"']*)["']/i;
const VERIFICATION_URL_FALLBACK_REGEX =
  /href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?Verificar Email/i;

function isVerificationEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(VERIFICATION_SUBJECT_PATTERN);
}

function extractVerificationUrl(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const match =
    decodedBody.match(VERIFICATION_URL_REGEX) ??
    decodedBody.match(VERIFICATION_URL_FALLBACK_REGEX);
  return match?.[1] ?? null;
}

async function tryGetVerificationEmail(
  email: string
): Promise<VerificationEmailData | null> {
  const messages = await searchEmailsByRecipient(email);
  const verificationEmail = messages.find(isVerificationEmail);

  if (!verificationEmail) {
    return null;
  }

  const subject = verificationEmail.Content.Headers.Subject?.[0] ?? "";
  const body = verificationEmail.Content.Body;
  const verificationUrl = extractVerificationUrl(body);

  if (!verificationUrl) {
    throw new Error(
      `Found verification email for ${email} but could not extract URL from body.`
    );
  }

  return { subject, verificationUrl, body };
}

export async function waitForVerificationEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<VerificationEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetVerificationEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No verification email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(
    `Verification email not found for ${email} after ${maxRetries} retries`
  );
}

// ============================================================
// PASSWORD RESET EMAIL
// ============================================================

export type PasswordResetEmailData = {
  subject: string;
  resetUrl: string;
  body: string;
};

const RESET_SUBJECT_PATTERN = "Redefinir sua senha";
const RESET_URL_REGEX = /href=["']([^"']*reset-password[^"']*)["']/i;
const RESET_URL_FALLBACK_REGEX =
  /href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?Redefinir Senha/i;

function isPasswordResetEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(RESET_SUBJECT_PATTERN);
}

function extractResetUrl(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const match =
    decodedBody.match(RESET_URL_REGEX) ??
    decodedBody.match(RESET_URL_FALLBACK_REGEX);
  return match?.[1] ?? null;
}

async function tryGetPasswordResetEmail(
  email: string
): Promise<PasswordResetEmailData | null> {
  const messages = await searchEmailsByRecipient(email);
  const resetEmail = messages.find(isPasswordResetEmail);

  if (!resetEmail) {
    return null;
  }

  const subject = resetEmail.Content.Headers.Subject?.[0] ?? "";
  const body = resetEmail.Content.Body;
  const resetUrl = extractResetUrl(body);

  if (!resetUrl) {
    throw new Error(
      `Found password reset email for ${email} but could not extract URL from body.`
    );
  }

  return { subject, resetUrl, body };
}

export async function waitForPasswordResetEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<PasswordResetEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetPasswordResetEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No password reset email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(
    `Password reset email not found for ${email} after ${maxRetries} retries`
  );
}

// ============================================================
// ACTIVATION EMAIL
// ============================================================

export type ActivationEmailData = {
  subject: string;
  activationUrl: string;
  body: string;
};

const ACTIVATION_SUBJECT_PATTERNS = ["Ative sua conta", "Ative_sua_conta"];
const ACTIVATION_URL_REGEX = /href=["']([^"']*definir-senha[^"']*)["']/i;
const ACTIVATION_URL_FALLBACK_REGEX =
  /href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?Definir Senha/i;

function isActivationEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return ACTIVATION_SUBJECT_PATTERNS.some((pattern) =>
    subject.includes(pattern)
  );
}

function extractActivationUrl(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const match =
    decodedBody.match(ACTIVATION_URL_REGEX) ??
    decodedBody.match(ACTIVATION_URL_FALLBACK_REGEX);
  if (!match?.[1]) {
    return null;
  }
  // HTML encodes & as &amp; in href attributes
  return match[1].replace(/&amp;/g, "&");
}

async function tryGetActivationEmail(
  email: string
): Promise<ActivationEmailData | null> {
  const messages = await searchEmailsByRecipient(email);
  const activationMsg = messages.find(isActivationEmail);

  if (!activationMsg) {
    return null;
  }

  const subject = activationMsg.Content.Headers.Subject?.[0] ?? "";
  const body = activationMsg.Content.Body;
  const activationUrl = extractActivationUrl(body);

  if (!activationUrl) {
    throw new Error(
      `Found activation email for ${email} but could not extract URL from body.`
    );
  }

  return { subject, activationUrl, body };
}

export async function waitForActivationEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<ActivationEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetActivationEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No activation email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(`No activation email found for ${email}`);
}

// ============================================================
// CONTACT EMAIL
// ============================================================

export type ContactEmailData = {
  subject: string;
  body: string;
};

const CONTACT_SUBJECT_PATTERN = "[Contato Site]";

function isContactEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(CONTACT_SUBJECT_PATTERN);
}

async function tryGetContactEmail(
  email: string
): Promise<ContactEmailData | null> {
  const messages = await searchEmailsByRecipient(email);
  const contactEmail = messages.find(isContactEmail);

  if (!contactEmail) {
    return null;
  }

  const subject = contactEmail.Content.Headers.Subject?.[0] ?? "";
  const body = contactEmail.Content.Body;

  return { subject, body };
}

export async function waitForContactEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<ContactEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetContactEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No contact email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(
    `Contact email not found for ${email} after ${maxRetries} retries`
  );
}

// ============================================================
// ADMIN CANCELLATION NOTICE EMAIL
// ============================================================

export type AdminCancellationNoticeEmailData = {
  subject: string;
  organizationName: string;
  planName: string;
  reason: string | null;
  comment: string | null;
  body: string;
};

const ADMIN_CANCELLATION_SUBJECT_PATTERN = "[Cancelamento]";

function isAdminCancellationNoticeEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(ADMIN_CANCELLATION_SUBJECT_PATTERN);
}

function extractFieldFromEmailBody(
  htmlBody: string,
  label: string
): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const regex = new RegExp(
    `<strong>${label}<\\/strong>[\\s\\S]*?<\\/td>\\s*<td[^>]*>([^<]+)<\\/td>`,
    "i"
  );
  const match = decodedBody.match(regex);
  return match?.[1]?.trim() ?? null;
}

async function tryGetAdminCancellationNoticeEmail(
  email: string
): Promise<AdminCancellationNoticeEmailData | null> {
  const messages = await searchEmailsByRecipient(email);
  const noticeEmail = messages.find(isAdminCancellationNoticeEmail);

  if (!noticeEmail) {
    return null;
  }

  const subject = noticeEmail.Content.Headers.Subject?.[0] ?? "";
  const body = noticeEmail.Content.Body;

  return {
    subject,
    organizationName: extractFieldFromEmailBody(body, "Organização") ?? "",
    planName: extractFieldFromEmailBody(body, "Plano") ?? "",
    reason: extractFieldFromEmailBody(body, "Motivo"),
    comment: extractFieldFromEmailBody(body, "Observações do usuário"),
    body,
  };
}

export async function waitForAdminCancellationNoticeEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<AdminCancellationNoticeEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetAdminCancellationNoticeEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No admin cancellation notice email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(
    `Admin cancellation notice email not found for ${email} after ${maxRetries} retries`
  );
}

// ============================================================
// CLEAR MAILBOX
// ============================================================

export async function clearMailbox(email: string): Promise<void> {
  const messages = await searchEmailsByRecipient(email);
  for (const message of messages) {
    await fetch(`${MAILHOG_API_URL}/api/v1/messages/${message.ID}`, {
      method: "DELETE",
    });
  }
}

// ============================================================
// CHECKOUT EMAIL
// ============================================================

export type CheckoutEmailData = {
  subject: string;
  checkoutUrl: string;
  planName: string;
  body: string;
};

const CHECKOUT_URL_REGEX = /href=["']([^"']*pagar\.me[^"']*)["']/i;
const CHECKOUT_SUBJECT_PATTERN = "Complete seu upgrade";
const PLAN_NAME_FROM_SUBJECT_REGEX = /Plano\s+([^-]+)\s*-\s*Synnerdata/i;

function extractCheckoutUrlFromBody(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const match = decodedBody.match(CHECKOUT_URL_REGEX);
  return match?.[1] ?? null;
}

function extractPlanNameFromSubject(subject: string): string {
  const match = subject.match(PLAN_NAME_FROM_SUBJECT_REGEX);
  return match?.[1]?.trim() ?? "";
}

function isCheckoutEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(CHECKOUT_SUBJECT_PATTERN);
}

async function tryGetCheckoutEmail(
  email: string
): Promise<CheckoutEmailData | null> {
  const messages = await searchEmailsByRecipient(email);

  const checkoutEmail = messages.find(isCheckoutEmail);

  if (!checkoutEmail) {
    return null;
  }

  const subject = checkoutEmail.Content.Headers.Subject?.[0] ?? "";
  const body = checkoutEmail.Content.Body;
  const checkoutUrl = extractCheckoutUrlFromBody(body);

  if (!checkoutUrl) {
    throw new Error(
      `Found checkout email for ${email} but could not extract checkout URL from body.`
    );
  }

  return {
    subject,
    checkoutUrl,
    planName: extractPlanNameFromSubject(subject),
    body,
  };
}

export async function waitForCheckoutEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<CheckoutEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetCheckoutEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No checkout email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(
    `Checkout email not found for ${email} after ${maxRetries} retries`
  );
}

// ============================================================
// PAYMENT FAILED EMAIL
// ============================================================

export type PaymentFailedEmailData = {
  subject: string;
  planName: string;
  errorMessage: string | null;
  body: string;
};

const PAYMENT_FAILED_SUBJECT_PATTERN = "Falha no Pagamento";
const PAYMENT_FAILED_ERROR_REGEX = />Motivo:\s*(?:<!--\s*-->)?\s*([^<]+)<\/p>/i;
const PAYMENT_FAILED_PLAN_NAME_REGEX =
  /Falha no Pagamento\s*-\s*([^-]+)\s*-\s*Synnerdata/i;

function isPaymentFailedEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(PAYMENT_FAILED_SUBJECT_PATTERN);
}

function extractErrorMessageFromBody(htmlBody: string): string | null {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const match = decodedBody.match(PAYMENT_FAILED_ERROR_REGEX);
  return match?.[1]?.trim() ?? null;
}

function extractPlanNameFromPaymentFailedSubject(subject: string): string {
  const match = subject.match(PAYMENT_FAILED_PLAN_NAME_REGEX);
  return match?.[1]?.trim() ?? "";
}

async function tryGetPaymentFailedEmail(
  email: string
): Promise<PaymentFailedEmailData | null> {
  const messages = await searchEmailsByRecipient(email);

  const paymentFailedEmail = messages.find(isPaymentFailedEmail);

  if (!paymentFailedEmail) {
    return null;
  }

  const subject = paymentFailedEmail.Content.Headers.Subject?.[0] ?? "";
  const body = paymentFailedEmail.Content.Body;

  return {
    subject,
    planName: extractPlanNameFromPaymentFailedSubject(subject),
    errorMessage: extractErrorMessageFromBody(body),
    body,
  };
}

export async function waitForPaymentFailedEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<PaymentFailedEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetPaymentFailedEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No payment failed email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(
    `Payment failed email not found for ${email} after ${maxRetries} retries`
  );
}

// ============================================================
// PLAN CHANGE EXECUTED EMAIL
// ============================================================

export type PlanChangeEmailData = {
  subject: string;
  previousPlanName: string;
  newPlanName: string;
  body: string;
};

const PLAN_CHANGE_SUBJECT_PATTERN = "Mudança de Plano";
const PLAN_CHANGE_PREVIOUS_REGEX =
  /<strong>Plano anterior:<\/strong><\/td>\s*<td[^>]*>([^<]+)<\/td>/i;
const PLAN_CHANGE_NEW_REGEX =
  /<strong>Novo plano:<\/strong><\/td>\s*<td[^>]*>([^<]+)<\/td>/i;

function isPlanChangeEmail(message: MailHogMessage): boolean {
  const subject = message.Content.Headers.Subject?.[0] ?? "";
  return subject.includes(PLAN_CHANGE_SUBJECT_PATTERN);
}

function extractPlanNamesFromBody(htmlBody: string): {
  previousPlanName: string;
  newPlanName: string;
} {
  const decodedBody = htmlBody.replace(/=3D/g, "=").replace(/=\r?\n/g, "");
  const previousMatch = decodedBody.match(PLAN_CHANGE_PREVIOUS_REGEX);
  const newMatch = decodedBody.match(PLAN_CHANGE_NEW_REGEX);

  return {
    previousPlanName: previousMatch?.[1]?.trim() ?? "",
    newPlanName: newMatch?.[1]?.trim() ?? "",
  };
}

async function tryGetPlanChangeEmail(
  email: string
): Promise<PlanChangeEmailData | null> {
  const messages = await searchEmailsByRecipient(email);

  const planChangeEmail = messages.find(isPlanChangeEmail);

  if (!planChangeEmail) {
    return null;
  }

  const subject = planChangeEmail.Content.Headers.Subject?.[0] ?? "";
  const body = planChangeEmail.Content.Body;
  const { previousPlanName, newPlanName } = extractPlanNamesFromBody(body);

  return {
    subject,
    previousPlanName,
    newPlanName,
    body,
  };
}

export async function waitForPlanChangeEmail(
  email: string,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<PlanChangeEmailData> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const emailData = await tryGetPlanChangeEmail(email);

      if (emailData) {
        return emailData;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `No plan change email found for ${email} after ${maxRetries} attempts.`
        );
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

  throw new Error(
    `Plan change email not found for ${email} after ${maxRetries} retries`
  );
}
