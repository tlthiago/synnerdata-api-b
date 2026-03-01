import { Heading, Hr, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";
import { getAppUrl } from "../../constants";

type TrialExpiredEmailProps = {
  userName: string;
  organizationName: string;
};

export function TrialExpiredEmail({
  userName,
  organizationName,
}: TrialExpiredEmailProps) {
  return (
    <EmailLayout preview="Seu período de trial expirou">
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Seu período de trial expirou
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">Olá {userName},</Text>
      <Text className="text-gray-600 text-sm leading-6">
        O período de trial da organização <strong>{organizationName}</strong>{" "}
        chegou ao fim.
      </Text>
      <Text className="mb-6 text-gray-600 text-sm leading-6">
        Para continuar usando todos os recursos do Synnerdata, faça o upgrade
        para um plano pago agora mesmo.
      </Text>
      <EmailButton href={getAppUrl("/billing/upgrade")}>
        Fazer Upgrade Agora
      </EmailButton>
      <Hr className="my-5 border-gray-200" />
      <Text className="text-gray-400 text-xs">
        Seus dados serão mantidos por 30 dias. Após esse período, eles poderão
        ser removidos permanentemente.
      </Text>
    </EmailLayout>
  );
}
