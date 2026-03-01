import { Heading, Hr, Text } from "@react-email/components";
import { EmailAlertBox } from "../../components/email-alert-box";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";
import { formatDateTime } from "../../constants";

type CheckoutLinkEmailProps = {
  userName: string;
  organizationName: string;
  planName: string;
  checkoutUrl: string;
  expiresAt: Date;
};

export function CheckoutLinkEmail({
  userName,
  organizationName,
  planName,
  checkoutUrl,
  expiresAt,
}: CheckoutLinkEmailProps) {
  return (
    <EmailLayout preview={`Complete seu upgrade para o Plano ${planName}`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Complete seu upgrade para o Plano {planName}
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{userName}</strong>,
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        Você iniciou o upgrade da organização{" "}
        <strong>{organizationName}</strong> para o plano{" "}
        <strong>{planName}</strong>.
      </Text>
      <Text className="mb-6 text-gray-600 text-sm leading-6">
        Clique no botão abaixo para continuar com o pagamento:
      </Text>
      <EmailButton href={checkoutUrl}>Continuar Pagamento</EmailButton>
      <Hr className="my-5 border-gray-200" />
      <EmailAlertBox variant="warning">
        Este link expira em {formatDateTime(expiresAt)}.
      </EmailAlertBox>
      <Text className="text-gray-400 text-xs">
        Se você não solicitou este upgrade, ignore este email.
      </Text>
    </EmailLayout>
  );
}
