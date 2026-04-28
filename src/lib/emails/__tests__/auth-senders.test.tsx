import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockSendEmail = mock(() => Promise.resolve());

mock.module("@/lib/emails/mailer", () => ({
  sendEmail: mockSendEmail,
  sendBestEffort: async (send: () => Promise<void>) => {
    try {
      await send();
    } catch {
      // best-effort path; tests don't exercise this here
    }
  },
}));

const { sendAccountAnonymizedEmail } = await import(
  "@/lib/emails/senders/auth"
);

describe("sendAccountAnonymizedEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear();
    mockSendEmail.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    mockSendEmail.mockReset();
  });

  test("calls sendEmail with the recipient address and Portuguese subject", async () => {
    await sendAccountAnonymizedEmail({ email: "user@example.com" });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [args] = mockSendEmail.mock.calls[0] as unknown as [
      {
        to: string;
        subject: string;
        html: string;
        text?: string;
      },
    ];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toBe("Sua conta foi anonimizada no Synnerdata");
    expect(args.html.length).toBeGreaterThan(0);
    expect(args.text?.length ?? 0).toBeGreaterThan(0);
    expect(args.html).toContain("user@example.com");
    expect(args.text ?? "").toContain("user@example.com");
  });

  test("propagates errors thrown by sendEmail", async () => {
    const failure = new Error("smtp down");
    mockSendEmail.mockImplementation(() => Promise.reject(failure));

    await expect(
      sendAccountAnonymizedEmail({ email: "user@example.com" })
    ).rejects.toBe(failure);
  });
});
