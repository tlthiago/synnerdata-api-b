import { Heading, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailFallbackLink } from "../../components/email-fallback-link";
import { EmailLayout } from "../../components/email-layout";

type VerificationEmailProps = {
  url: string;
};

export function VerificationEmail({ url }: VerificationEmailProps) {
  return (
    <EmailLayout preview="Verifique seu email no Synnerdata">
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Verifique seu email
      </Heading>

      <Text className="mb-6 text-base text-gray-600 leading-6">
        Clique no botão abaixo para verificar seu endereço de email:
      </Text>

      <EmailButton href={url}>Verificar Email</EmailButton>

      <EmailFallbackLink url={url} />

      <Text className="text-gray-400 text-sm">
        Se você não criou uma conta, ignore este email.
      </Text>
    </EmailLayout>
  );
}
