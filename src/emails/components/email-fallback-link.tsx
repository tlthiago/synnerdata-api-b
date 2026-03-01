import { Text } from "@react-email/components";

type EmailFallbackLinkProps = {
  url: string;
};

export function EmailFallbackLink({ url }: EmailFallbackLinkProps) {
  return (
    <Text className="mt-6 text-gray-400 text-sm">
      Se o botão não funcionar, copie e cole este link no navegador: {url}
    </Text>
  );
}
