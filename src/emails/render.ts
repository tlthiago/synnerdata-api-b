import { render } from "@react-email/components";
import type { ReactElement } from "react";

type RenderedEmail = {
  html: string;
  text: string;
};

export async function renderEmail(
  component: ReactElement
): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(component),
    render(component, { plainText: true }),
  ]);

  return { html, text };
}
