import { Button } from "@react-email/components";
import type { ReactNode } from "react";

type EmailButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "success";
};

const variantClasses = {
  primary: "bg-[#7C3AED] text-white",
  success: "bg-[#16A34A] text-white",
} as const;

export function EmailButton({
  href,
  children,
  variant = "primary",
}: EmailButtonProps) {
  return (
    <Button
      className={`inline-block rounded px-6 py-3 font-semibold text-sm no-underline ${variantClasses[variant]}`}
      href={href}
    >
      {children}
    </Button>
  );
}
