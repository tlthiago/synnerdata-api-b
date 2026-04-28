import { Column, Row, Section, Text } from "@react-email/components";

type EmailInfoTableProps = {
  rows: Array<{ label: string; value: string }>;
};

export function EmailInfoTable({ rows }: EmailInfoTableProps) {
  return (
    <Section>
      {rows.map((row) => (
        <Row className="mb-1" key={row.label}>
          <Column className="w-[45%] align-top">
            <Text className="m-0 font-bold text-gray-800 text-sm">
              {row.label}
            </Text>
          </Column>
          <Column className="w-[55%] align-top">
            <Text className="m-0 text-gray-600 text-sm">{row.value}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}
