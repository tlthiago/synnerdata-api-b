import { describe, expect, test } from "bun:test";
import { Heading, Text } from "@react-email/components";
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
});
