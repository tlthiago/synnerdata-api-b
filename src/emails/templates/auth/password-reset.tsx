import { Heading, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";

type PasswordResetEmailProps = {
  url: string;
};

export function PasswordResetEmail({ url }: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Redefinir sua senha no Synnerdata">
      <Heading as="h2" className="mb-4 text-gray-800 text-xl">
        Redefinir sua senha
      </Heading>

      <Text className="mb-6 text-gray-600 text-sm leading-6">
        Você solicitou a redefinição da sua senha. Clique no botão abaixo:
      </Text>

      <EmailButton href={url}>Redefinir Senha</EmailButton>

      <Text className="mt-6 text-gray-400 text-xs">
        Se o botão não funcionar, copie e cole este link: {url}
      </Text>

      <Text className="text-gray-400 text-xs">
        Este link expira em 1 hora. Se você não solicitou a redefinição, ignore
        este email.
      </Text>
    </EmailLayout>
  );
}
