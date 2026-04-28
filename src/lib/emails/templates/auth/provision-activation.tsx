import { Heading, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailFallbackLink } from "../../components/email-fallback-link";
import { EmailLayout } from "../../components/email-layout";

type ProvisionActivationEmailProps = {
  userName: string;
  organizationName: string;
  url: string;
  isTrial: boolean;
};

export function ProvisionActivationEmail({
  userName,
  organizationName,
  url,
  isTrial,
}: ProvisionActivationEmailProps) {
  return (
    <EmailLayout
      preview={`Ative sua conta no Synnerdata — ${organizationName}`}
    >
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Bem-vindo ao Synnerdata!
      </Heading>

      <Text className="text-base text-gray-600 leading-6">
        Olá <strong>{userName}</strong>,
      </Text>

      <Text className="text-base text-gray-600 leading-6">
        A organização <strong>{organizationName}</strong> foi cadastrada no
        Synnerdata
        {isTrial
          ? " com um período de teste gratuito"
          : " e o pagamento foi confirmado"}
        .
      </Text>

      <Text className="mb-6 text-base text-gray-600 leading-6">
        Para começar a usar, defina sua senha clicando no botão abaixo:
      </Text>

      <EmailButton href={url}>Definir Senha e Ativar Conta</EmailButton>

      <EmailFallbackLink url={url} />

      <Text className="text-gray-400 text-sm">
        Este link expira em 1 hora. Se você não reconhece este cadastro, ignore
        este email.
      </Text>
    </EmailLayout>
  );
}
