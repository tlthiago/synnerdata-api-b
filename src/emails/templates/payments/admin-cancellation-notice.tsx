import { Heading, Hr, Text } from "@react-email/components";
import { EmailInfoTable } from "../../components/email-info-table";
import { EmailLayout } from "../../components/email-layout";
import { formatDateLong } from "../../constants";

type AdminCancellationNoticeEmailProps = {
  organizationName: string;
  planName: string;
  ownerEmail: string;
  canceledAt: Date;
  reason?: string;
  comment?: string;
};

export function AdminCancellationNoticeEmail({
  organizationName,
  planName,
  ownerEmail,
  canceledAt,
  reason,
  comment,
}: AdminCancellationNoticeEmailProps) {
  const rows = [
    { label: "Organização", value: organizationName },
    { label: "Plano", value: planName },
    { label: "Email do responsável", value: ownerEmail },
    { label: "Data do cancelamento", value: formatDateLong(canceledAt) },
    ...(reason ? [{ label: "Motivo", value: reason }] : []),
  ];

  return (
    <EmailLayout preview={`Cancelamento de assinatura — ${organizationName}`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Cancelamento de Assinatura
      </Heading>
      <Text className="mb-2 text-base text-gray-600 leading-6">
        Um usuário solicitou o cancelamento da assinatura. Confira os detalhes
        abaixo:
      </Text>
      <Hr className="my-4 border-gray-200" />
      <EmailInfoTable rows={rows} />
      {comment ? (
        <>
          <Hr className="my-4 border-gray-200" />
          <Heading as="h2" className="mb-2 text-gray-800 text-lg">
            Observações do usuário
          </Heading>
          <Text className="whitespace-pre-wrap text-base text-gray-600 leading-6">
            {comment}
          </Text>
        </>
      ) : null}
    </EmailLayout>
  );
}
