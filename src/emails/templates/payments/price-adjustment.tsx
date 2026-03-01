import { Heading, Hr, Text } from "@react-email/components";
import { EmailAlertBox } from "../../components/email-alert-box";
import { EmailButton } from "../../components/email-button";
import { EmailInfoTable } from "../../components/email-info-table";
import { EmailLayout } from "../../components/email-layout";
import { formatBRL, getAppUrl } from "../../constants";

type PriceAdjustmentEmailProps = {
  organizationName: string;
  planName: string;
  oldPrice: number;
  newPrice: number;
  reason: string;
};

export function PriceAdjustmentEmail({
  organizationName,
  planName,
  oldPrice,
  newPrice,
  reason,
}: PriceAdjustmentEmailProps) {
  return (
    <EmailLayout preview="Aviso de reajuste no valor da sua assinatura">
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Reajuste no Valor da Assinatura
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{organizationName}</strong>,
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        Informamos que o valor da sua assinatura do plano{" "}
        <strong>{planName}</strong> será reajustado.
      </Text>
      <Hr className="my-5 border-gray-200" />
      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Detalhes do Reajuste
      </Heading>
      <EmailInfoTable
        rows={[
          { label: "Plano:", value: planName },
          { label: "Valor atual:", value: `${formatBRL(oldPrice)}/mês` },
          { label: "Novo valor:", value: `${formatBRL(newPrice)}/mês` },
          { label: "Motivo:", value: reason },
        ]}
      />
      <Hr className="my-5 border-gray-200" />
      <EmailAlertBox variant="warning">
        O novo valor será aplicado a partir do próximo ciclo de cobrança.
      </EmailAlertBox>
      <EmailButton href={getAppUrl("/billing")}>Ver Assinatura</EmailButton>
    </EmailLayout>
  );
}
