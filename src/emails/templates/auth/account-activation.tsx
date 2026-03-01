import { Heading, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";

type AccountActivationEmailProps = {
  userName: string;
  url: string;
};

export function AccountActivationEmail({
  userName,
  url,
}: AccountActivationEmailProps) {
  return (
    <EmailLayout preview="Ative sua conta no Synnerdata">
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Ative sua conta
      </Heading>

      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{userName}</strong>,
      </Text>

      <Text className="mb-6 text-gray-600 text-sm leading-6">
        Sua conta foi criada no Synnerdata. Clique no botão abaixo para definir
        sua senha e começar a usar.
      </Text>

      <EmailButton href={url}>Definir Senha e Ativar Conta</EmailButton>

      <Text className="mt-6 text-gray-400 text-xs">
        Se o botão não funcionar, copie e cole este link: {url}
      </Text>

      <Text className="text-gray-400 text-xs">
        Este link expira em 1 hora. Se você não esperava este email, ignore-o.
      </Text>
    </EmailLayout>
  );
}
