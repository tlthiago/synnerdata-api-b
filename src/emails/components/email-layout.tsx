import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  pixelBasedPreset,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { getLogoUrl } from "../constants";

type EmailLayoutProps = {
  preview: string;
  children: ReactNode;
};

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="m-0 bg-gray-100 p-0 font-sans">
          <Container className="mx-auto my-10 max-w-[600px] overflow-hidden rounded-lg bg-white">
            <Section className="bg-[#7C3AED] px-6 py-8 text-center">
              <Img
                alt="Synnerdata"
                className="mx-auto"
                height="120"
                src={getLogoUrl()}
                width="120"
              />
            </Section>

            <Section className="px-8 py-10">{children}</Section>

            <Hr className="mx-8 border-gray-200" />

            <Section className="px-8 py-6">
              <Text className="m-0 text-center text-gray-400 text-xs leading-relaxed">
                Precisa de ajuda? Responda este email.
              </Text>
              <Text className="m-0 mt-2 text-center text-gray-400 text-xs">
                Equipe Synnerdata
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
