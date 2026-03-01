import { Heading, Hr, Text } from "@react-email/components";
import { EmailAlertBox } from "../../components/email-alert-box";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";
import { formatDateLong, getAppUrl } from "../../constants";

type CancellationScheduledEmailProps = {
  organizationName: string;
  planName: string;
  accessUntil: Date;
};

export function CancellationScheduledEmail({
  organizationName,
  planName,
  accessUntil,
}: CancellationScheduledEmailProps) {
  const formattedDate = formatDateLong(accessUntil);

  return (
    <EmailLayout
      preview={`Cancelamento agendado — acesso até ${formattedDate}`}
    >
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Cancelamento Agendado
      </Heading>
      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{organizationName}</strong>,
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        Confirmamos sua solicitação de cancelamento do plano{" "}
        <strong>{planName}</strong>.
      </Text>
      <EmailAlertBox variant="warning">
        Sua assinatura continua ativa até {formattedDate}.
      </EmailAlertBox>
      <Text className="text-gray-600 text-sm leading-6">
        Até lá, você pode continuar usando todos os recursos do plano {planName}{" "}
        normalmente.
      </Text>
      <Hr className="my-5 border-gray-200" />
      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Mudou de ideia?
      </Heading>
      <Text className="mb-4 text-gray-600 text-sm leading-6">
        Você pode restaurar sua assinatura a qualquer momento antes de{" "}
        {formattedDate} e continuar aproveitando todos os benefícios.
      </Text>
      <EmailButton href={getAppUrl("/billing")} variant="success">
        Restaurar Assinatura
      </EmailButton>
      <Hr className="my-5 border-gray-200" />
      <Text className="text-gray-400 text-xs">
        Após {formattedDate}, sua assinatura será cancelada definitivamente e
        você perderá acesso aos recursos premium.
      </Text>
    </EmailLayout>
  );
}
