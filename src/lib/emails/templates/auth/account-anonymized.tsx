import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../../components/email-layout";

type AccountAnonymizedEmailProps = {
  email: string;
};

export function AccountAnonymizedEmail({ email }: AccountAnonymizedEmailProps) {
  return (
    <EmailLayout preview="Sua conta foi anonimizada no Synnerdata">
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Sua conta foi anonimizada
      </Heading>

      <Text className="text-base text-gray-600 leading-6">
        Confirmamos que a conta associada ao endereço <strong>{email}</strong>{" "}
        foi anonimizada no Synnerdata.
      </Text>

      <Text className="text-base text-gray-600 leading-6">
        Esta ação é <strong>irreversível</strong>: seus dados pessoais foram
        removidos do nosso sistema e não podem ser recuperados.
      </Text>

      <Text className="text-base text-gray-600 leading-6">
        O histórico de auditoria das ações realizadas pela sua conta foi
        preservado de forma anônima, conforme exigido por lei e por nossa
        política de compliance, sem qualquer informação pessoal identificável.
      </Text>

      <Text className="text-base text-gray-600 leading-6">
        Caso queira voltar a usar o Synnerdata no futuro, este endereço de email
        está liberado para um novo cadastro a qualquer momento.
      </Text>

      <Text className="text-gray-400 text-sm">
        Se você não solicitou esta ação, entre em contato com o nosso suporte
        imediatamente respondendo este email.
      </Text>
    </EmailLayout>
  );
}
