import { describe, expect, test } from "bun:test";
import { Heading, Text } from "@react-email/components";
import { EmailFallbackLink } from "../components/email-fallback-link";
import { EmailLayout } from "../components/email-layout";
import { renderEmail } from "../render";

describe("renderEmail", () => {
  test("should render a component to html and plain text", async () => {
    const { html, text } = await renderEmail(
      <EmailLayout preview="Test preview">
        <Heading as="h1">Test Title</Heading>
        <Text>Hello World</Text>
      </EmailLayout>
    );

    expect(html).toContain("Test Title");
    expect(html).toContain("Hello World");
    expect(html).toContain("<!DOCTYPE html");
    expect(html).toContain("Synnerdata");
    expect(text).toContain("TEST TITLE");
    expect(text).toContain("Hello World");
  });

  test("should include preview text in html", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="Preview snippet">
        <Text>Content</Text>
      </EmailLayout>
    );

    expect(html).toContain("Preview snippet");
  });

  test("should include logo image", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <Text>Content</Text>
      </EmailLayout>
    );

    expect(html).toContain("synnerdata-logo.png");
    expect(html).toContain('alt="Synnerdata"');
  });

  test("should include color-scheme meta for dark mode", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <Text>Content</Text>
      </EmailLayout>
    );

    expect(html).toContain("color-scheme");
  });

  test("should include complete footer with company name and copyright", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <Text>Content</Text>
      </EmailLayout>
    );

    expect(html).toContain("Synnerdata");
    expect(html).toContain("Tecnologia para gestão de pessoas");
    expect(html).toContain("©");
  });

  test("EmailFallbackLink renders url with fallback text", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <EmailFallbackLink url="https://app.test/verify?token=abc" />
      </EmailLayout>
    );

    expect(html).toContain("https://app.test/verify?token=abc");
    expect(html).toContain("copie e cole");
  });
});
