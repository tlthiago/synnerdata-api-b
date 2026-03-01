import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "../../components/email-button";
import { EmailLayout } from "../../components/email-layout";
import { getAppUrl } from "../../constants";

type WelcomeEmailProps = {
  userName: string;
};

export function WelcomeEmail({ userName }: WelcomeEmailProps) {
  return (
    <EmailLayout preview={`Bem-vindo ao Synnerdata, ${userName}!`}>
      <Heading as="h1" className="mb-4 text-2xl text-gray-800">
        Bem-vindo ao Synnerdata!
      </Heading>

      <Text className="text-gray-600 text-sm leading-6">
        Olá <strong>{userName}</strong>,
      </Text>

      <Text className="text-gray-600 text-sm leading-6">
        Estamos muito felizes em ter você conosco!
      </Text>

      <Text className="text-gray-600 text-sm leading-6">
        Sua conta foi criada com sucesso e você já pode começar a explorar todos
        os recursos da plataforma.
      </Text>

      <Heading as="h2" className="mt-6 mb-2 text-gray-800 text-lg">
        Próximos passos
      </Heading>

      <Text className="text-gray-600 text-sm leading-6">
        - Complete seu perfil
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        - Crie sua primeira organização
      </Text>
      <Text className="text-gray-600 text-sm leading-6">
        - Explore os recursos disponíveis no seu plano
      </Text>

      <Section className="mt-6">
        <EmailButton href={getAppUrl("/relatorios")}>
          Acessar Relatórios
        </EmailButton>
      </Section>
    </EmailLayout>
  );
}
