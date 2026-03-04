import { Heading, Hr, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailFallbackLink } from "../../components/email-fallback-link";
import { EmailInfoTable } from "../../components/email-info-table";
import { EmailLayout } from "../../components/email-layout";
import { roleLabels } from "../../constants";

type OrganizationInvitationEmailProps = {
  inviterName: string;
  inviterEmail: string;
  organizationName: string;
  inviteLink: string;
  role: string;
};

export function OrganizationInvitationEmail({
  inviterName,
  inviterEmail,
  organizationName,
  inviteLink,
  role,
}: OrganizationInvitationEmailProps) {
  const roleLabel = roleLabels[role] ?? role;

  return (
    <EmailLayout
      preview={`${inviterName} convidou você para ${organizationName}`}
    >
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Você foi convidado para {organizationName}
      </Heading>

      <Text className="text-base text-gray-600 leading-6">
        <strong>{inviterName}</strong> ({inviterEmail}) convidou você para fazer
        parte da organização <strong>{organizationName}</strong> no Synnerdata.
      </Text>

      <Hr className="my-5 border-gray-200" />

      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Detalhes do Convite
      </Heading>

      <EmailInfoTable
        rows={[
          { label: "Organização:", value: organizationName },
          { label: "Função:", value: roleLabel },
          { label: "Convidado por:", value: inviterName },
        ]}
      />

      <Hr className="my-5 border-gray-200" />

      <Text className="mb-4 text-base text-gray-600 leading-6">
        Clique no botão abaixo para aceitar o convite:
      </Text>

      <EmailButton href={inviteLink}>Aceitar Convite</EmailButton>

      <EmailFallbackLink url={inviteLink} />

      <Text className="text-gray-400 text-sm">
        Se você não esperava este convite, pode ignorar este email.
      </Text>
    </EmailLayout>
  );
}
