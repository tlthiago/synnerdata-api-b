import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout } from "../../components/email-layout";

type TwoFactorOtpEmailProps = {
  otp: string;
};

export function TwoFactorOtpEmail({ otp }: TwoFactorOtpEmailProps) {
  return (
    <EmailLayout preview={`Seu código de verificação: ${otp}`}>
      <Heading as="h2" className="mb-4 text-gray-800 text-xl">
        Código de verificação
      </Heading>

      <Text className="mb-2 text-gray-600 text-sm leading-6">
        Use o código abaixo para completar seu login:
      </Text>

      <Section className="my-6 rounded-lg bg-gray-100 py-5 text-center">
        <Text className="m-0 font-bold text-3xl text-gray-800 tracking-[8px]">
          {otp}
        </Text>
      </Section>

      <Text className="text-gray-400 text-xs">
        Este código expira em 5 minutos. Se você não solicitou este código,
        ignore este email.
      </Text>
    </EmailLayout>
  );
}
