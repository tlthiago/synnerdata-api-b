import { Heading, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";

type VerificationEmailProps = {
  url: string;
};

export function VerificationEmail({ url }: VerificationEmailProps) {
  return (
    <EmailLayout preview="Verifique seu email no Synnerdata">
      <Heading as="h2" className="mb-4 text-gray-800 text-xl">
        Verifique seu email
      </Heading>

      <Text className="mb-6 text-gray-600 text-sm leading-6">
        Clique no botão abaixo para verificar seu endereço de email:
      </Text>

      <EmailButton href={url}>Verificar Email</EmailButton>

      <Text className="mt-6 text-gray-400 text-xs">
        Se o botão não funcionar, copie e cole este link: {url}
      </Text>

      <Text className="text-gray-400 text-xs">
        Se você não criou uma conta, ignore este email.
      </Text>
    </EmailLayout>
  );
}
