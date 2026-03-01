import { Heading, Hr, Text } from "@react-email/components";
import { EmailAlertBox } from "../../components/email-alert-box";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";
import { formatDateLong, getAppUrl } from "../../constants";

type PaymentFailedEmailProps = {
  organizationName: string;
  planName: string;
  gracePeriodEnds: Date;
  errorMessage?: string;
};

export function PaymentFailedEmail({
  organizationName,
  planName,
  gracePeriodEnds,
  errorMessage,
}: PaymentFailedEmailProps) {
  const formattedDate = formatDateLong(gracePeriodEnds);

  return (
    <EmailLayout preview={`Falha no pagamento do plano ${planName}`}>
      <Heading as="h1" className="mb-4 text-2xl text-red-500">
        Falha no Pagamento
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{organizationName}</strong>,
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        Não foi possível processar o pagamento da sua assinatura do plano{" "}
        <strong>{planName}</strong>.
      </Text>
      {!!errorMessage && (
        <EmailAlertBox variant="error">Motivo: {errorMessage}</EmailAlertBox>
      )}
      <Hr className="my-5 border-gray-200" />
      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        O que acontece agora?
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">
        Sua assinatura está em <strong>período de graça</strong> e continuará
        funcionando normalmente até <strong>{formattedDate}</strong>.
      </Text>
      <EmailAlertBox variant="warning">
        Importante: Se o pagamento não for regularizado até {formattedDate}, sua
        assinatura será cancelada automaticamente.
      </EmailAlertBox>
      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Como resolver?
      </Heading>
      <Text className="mb-4 text-gray-600 text-sm leading-6">
        Atualize seu método de pagamento para evitar a interrupção do serviço:
      </Text>
      <EmailButton href={getAppUrl("/billing")}>
        Atualizar Pagamento
      </EmailButton>
    </EmailLayout>
  );
}
