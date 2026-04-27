import { Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

type EmailAlertBoxProps = {
  variant: "warning" | "error";
  children: ReactNode;
};

const variantStyles = {
  warning: {
    container: "bg-[#FEF3C7] border-l-4 border-l-[#F59E0B] border-solid",
    text: "text-[#92400E]",
  },
  error: {
    container: "bg-[#FEE2E2] border-l-4 border-l-[#EF4444] border-solid",
    text: "text-[#991B1B]",
  },
} as const;

export function EmailAlertBox({ variant, children }: EmailAlertBoxProps) {
  const styles = variantStyles[variant];
  return (
    <Section className={`my-5 rounded p-4 ${styles.container}`}>
      <Text className={`m-0 font-bold text-sm ${styles.text}`}>{children}</Text>
    </Section>
  );
}
