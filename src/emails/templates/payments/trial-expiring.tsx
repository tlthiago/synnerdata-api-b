import { Heading, Hr, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";
import { formatDateLong, getAppUrl } from "../../constants";

type TrialExpiringEmailProps = {
  userName: string;
  organizationName: string;
  daysRemaining: number;
  trialEndDate: Date;
};

export function TrialExpiringEmail({
  userName,
  organizationName,
  daysRemaining,
  trialEndDate,
}: TrialExpiringEmailProps) {
  return (
    <EmailLayout preview={`Seu trial expira em ${daysRemaining} dias`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Seu trial está acabando!
      </Heading>

      <Text className="text-base text-gray-600 leading-6">
        Olá <strong>{userName}</strong>,
      </Text>

      <Text className="text-base text-gray-600 leading-6">
        O período de trial da organização <strong>{organizationName}</strong>{" "}
        expira em <strong>{daysRemaining} dias</strong> (
        {formatDateLong(trialEndDate)}).
      </Text>

      <Text className="mb-6 text-base text-gray-600 leading-6">
        Para continuar usando todos os recursos do Synnerdata, faça o upgrade
        para um plano pago.
      </Text>

      <EmailButton href={getAppUrl("/billing/upgrade")}>
        Fazer Upgrade Agora
      </EmailButton>

      <Hr className="my-5 border-gray-200" />

      <Text className="text-gray-400 text-sm">
        Após o trial, você perderá acesso às funcionalidades premium. Seus dados
        serão mantidos por 30 dias.
      </Text>
    </EmailLayout>
  );
}
