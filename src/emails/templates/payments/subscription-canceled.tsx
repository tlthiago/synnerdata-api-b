import { Heading, Hr, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailInfoTable } from "../../components/email-info-table";
import { EmailLayout } from "../../components/email-layout";
import { formatDate, formatDateTime, getAppUrl } from "../../constants";

type SubscriptionCanceledEmailProps = {
  organizationName: string;
  planName: string;
  canceledAt: Date;
  accessUntil: Date | null;
};

export function SubscriptionCanceledEmail({
  organizationName,
  planName,
  canceledAt,
  accessUntil,
}: SubscriptionCanceledEmailProps) {
  const rows = [
    { label: "Plano cancelado:", value: planName },
    { label: "Data do cancelamento:", value: formatDateTime(canceledAt) },
    ...(accessUntil
      ? [{ label: "Acesso até:", value: formatDate(accessUntil) }]
      : []),
  ];

  return (
    <EmailLayout preview={`Assinatura do plano ${planName} cancelada`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Assinatura Cancelada
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{organizationName}</strong>,
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        Confirmamos o cancelamento da sua assinatura do plano{" "}
        <strong>{planName}</strong>.
      </Text>
      <Hr className="my-5 border-gray-200" />
      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Detalhes do Cancelamento
      </Heading>
      <EmailInfoTable rows={rows} />
      <Hr className="my-5 border-gray-200" />
      <Text className="mb-4 text-gray-600 text-sm leading-6">
        Sentiremos sua falta! Se mudar de ideia, você pode reativar sua
        assinatura a qualquer momento.
      </Text>
      <EmailButton href={getAppUrl("/billing")}>
        Reativar Assinatura
      </EmailButton>
    </EmailLayout>
  );
}
