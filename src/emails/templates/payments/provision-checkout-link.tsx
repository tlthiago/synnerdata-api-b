import { Heading, Hr, Text } from "@react-email/components";
import { EmailAlertBox } from "../../components/email-alert-box";
import { EmailButton } from "../../components/email-button";
import { EmailFallbackLink } from "../../components/email-fallback-link";
import { EmailLayout } from "../../components/email-layout";
import { formatDateTime } from "../../constants";

type ProvisionCheckoutLinkEmailProps = {
  userName: string;
  organizationName: string;
  planName: string;
  checkoutUrl: string;
  expiresAt: Date;
};

export function ProvisionCheckoutLinkEmail({
  userName,
  organizationName,
  planName,
  checkoutUrl,
  expiresAt,
}: ProvisionCheckoutLinkEmailProps) {
  return (
    <EmailLayout
      preview={`Bem-vindo ao Synnerdata — finalize o pagamento do Plano ${planName}`}
    >
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Bem-vindo ao Synnerdata!
      </Heading>

      <Text className="text-base text-gray-600 leading-6">
        Olá <strong>{userName}</strong>,
      </Text>

      <Text className="text-base text-gray-600 leading-6">
        A organização <strong>{organizationName}</strong> foi cadastrada no
        Synnerdata com o plano <strong>{planName}</strong>.
      </Text>

      <Text className="mb-6 text-base text-gray-600 leading-6">
        Para ativar sua conta, finalize o pagamento clicando no botão abaixo:
      </Text>

      <EmailButton href={checkoutUrl}>Finalizar Pagamento</EmailButton>

      <EmailFallbackLink url={checkoutUrl} />

      <Hr className="my-5 border-gray-200" />

      <EmailAlertBox variant="warning">
        Este link expira em {formatDateTime(expiresAt)}.
      </EmailAlertBox>

      <Text className="text-gray-400 text-sm">
        Se você não reconhece este cadastro, ignore este email.
      </Text>
    </EmailLayout>
  );
}
