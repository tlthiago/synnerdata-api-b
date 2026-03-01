import { Heading, Hr, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailInfoTable } from "../../components/email-info-table";
import { EmailLayout } from "../../components/email-layout";
import { formatBRL, formatDate, getAppUrl } from "../../constants";

type UpgradeConfirmationEmailProps = {
  organizationName: string;
  planName: string;
  planPrice: number;
  nextBillingDate: Date | null;
  cardLast4?: string;
};

export function UpgradeConfirmationEmail({
  organizationName,
  planName,
  planPrice,
  nextBillingDate,
  cardLast4,
}: UpgradeConfirmationEmailProps) {
  const rows = [
    { label: "Plano:", value: planName },
    { label: "Valor:", value: `${formatBRL(planPrice)}/mês` },
    {
      label: "Próxima cobrança:",
      value: nextBillingDate ? formatDate(nextBillingDate) : "N/A",
    },
    ...(cardLast4 ? [{ label: "Cartão:", value: `**** ${cardLast4}` }] : []),
  ];

  return (
    <EmailLayout preview={`Bem-vindo ao Plano ${planName}! Upgrade concluído.`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Bem-vindo ao Plano {planName}!
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{organizationName}</strong>,
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        Seu upgrade foi concluído com sucesso!
      </Text>
      <Hr className="my-5 border-gray-200" />
      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Detalhes da Assinatura
      </Heading>
      <EmailInfoTable rows={rows} />
      <Hr className="my-5 border-gray-200" />
      <Text className="mb-4 text-gray-600 text-sm">
        Você agora tem acesso a todos os recursos do plano {planName}!
      </Text>
      <EmailButton href={getAppUrl("/billing")}>
        Gerenciar Assinatura
      </EmailButton>
    </EmailLayout>
  );
}
