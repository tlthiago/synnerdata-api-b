import { Heading, Hr, Text } from "@react-email/components";
import { EmailInfoTable } from "../../components/email-info-table";
import { EmailLayout } from "../../components/email-layout";

type ContactMessageEmailProps = {
  name: string;
  email: string;
  company: string;
  phone?: string;
  subject: string;
  message: string;
};

export function ContactMessageEmail({
  name,
  email,
  company,
  phone,
  subject,
  message,
}: ContactMessageEmailProps) {
  const rows = [
    { label: "Nome", value: name },
    { label: "Email", value: email },
    { label: "Empresa", value: company },
    ...(phone ? [{ label: "Celular", value: phone }] : []),
    { label: "Assunto", value: subject },
  ];

  return (
    <EmailLayout preview={`Nova mensagem de contato: ${subject}`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Nova mensagem de contato
      </Heading>
      <Text className="mb-2 text-base text-gray-600 leading-6">
        Uma nova mensagem foi enviada pelo formulário de contato do site.
      </Text>
      <Hr className="my-4 border-gray-200" />
      <EmailInfoTable rows={rows} />
      <Hr className="my-4 border-gray-200" />
      <Heading as="h2" className="mb-2 text-gray-800 text-lg">
        Mensagem
      </Heading>
      <Text className="whitespace-pre-wrap text-base text-gray-600 leading-6">
        {message}
      </Text>
    </EmailLayout>
  );
}
