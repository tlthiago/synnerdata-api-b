import { env } from "@/env";

export const colors = {
  primary: "#7C3AED",
  primaryDark: "#6D28D9",
  success: "#16A34A",
  error: "#EF4444",
  warningBg: "#FEF3C7",
  warningBorder: "#F59E0B",
  warningText: "#92400E",
  errorBg: "#FEE2E2",
  errorBorder: "#EF4444",
  errorText: "#991B1B",
} as const;

export function getLogoUrl(): string {
  return `${env.APP_URL}/synnerdata-logo.png`;
}

export function getAppUrl(path = ""): string {
  return `${env.APP_URL}${path}`;
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  supervisor: "Supervisor",
  viewer: "Visualizador",
};
