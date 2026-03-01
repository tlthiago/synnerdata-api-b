import { Heading, Hr, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailInfoTable } from "../../components/email-info-table";
import { EmailLayout } from "../../components/email-layout";
import { getAppUrl } from "../../constants";

type PlanChangeExecutedEmailProps = {
  organizationName: string;
  previousPlanName: string;
  newPlanName: string;
};

export function PlanChangeExecutedEmail({
  organizationName,
  previousPlanName,
  newPlanName,
}: PlanChangeExecutedEmailProps) {
  return (
    <EmailLayout preview={`Mudança para o plano ${newPlanName} concluída`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Mudança de Plano Executada
      </Heading>

      <Text className="text-base text-gray-600 leading-6">
        Olá <strong>{organizationName}</strong>,
      </Text>

      <Text className="text-base text-gray-600 leading-6">
        Sua mudança de plano foi concluída com sucesso!
      </Text>

      <Hr className="my-5 border-gray-200" />

      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Detalhes da Mudança
      </Heading>

      <EmailInfoTable
        rows={[
          { label: "Plano anterior:", value: previousPlanName },
          { label: "Novo plano:", value: newPlanName },
        ]}
      />

      <Hr className="my-5 border-gray-200" />

      <Text className="mb-4 text-base text-gray-600 leading-6">
        Você agora tem acesso a todos os recursos do plano {newPlanName}!
      </Text>

      <EmailButton href={getAppUrl("/billing")}>
        Gerenciar Assinatura
      </EmailButton>
    </EmailLayout>
  );
}
