import { Heading, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailFallbackLink } from "../../components/email-fallback-link";
import { EmailLayout } from "../../components/email-layout";

type PasswordResetEmailProps = {
  url: string;
};

export function PasswordResetEmail({ url }: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Redefinir sua senha no Synnerdata">
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Redefinir sua senha
      </Heading>

      <Text className="mb-6 text-base text-gray-600 leading-6">
        Você solicitou a redefinição da sua senha. Clique no botão abaixo:
      </Text>

      <EmailButton href={url}>Redefinir Senha</EmailButton>

      <EmailFallbackLink url={url} />

      <Text className="text-gray-400 text-sm">
        Este link expira em 1 hora. Se você não solicitou a redefinição, ignore
        este email.
      </Text>
    </EmailLayout>
  );
}
