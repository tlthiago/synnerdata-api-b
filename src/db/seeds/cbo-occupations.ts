import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { cboOccupations } from "@/db/schema/cbo-occupations";

const BATCH_SIZE = 500;

const dataDir = resolve(import.meta.dir, "data");

const familyFilePath = resolve(dataDir, "cbo2002-familia.csv");
const occupationFilePath = resolve(dataDir, "cbo2002-ocupacao.csv");

const parseCsv = (filePath: string): Array<{ code: string; title: string }> => {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");

  // Skip header row
  return lines.slice(1).map((line) => {
    const [code, title] = line.split(";");
    return { code: code.trim(), title: title.trim() };
  });
};

const formatOccupationCode = (raw: string): string =>
  `${raw.slice(0, 4)}-${raw.slice(4)}`;

const main = async () => {
  console.log("Starting CBO occupations seed...");

  // Build family map
  const familyRows = parseCsv(familyFilePath);
  const familyMap = new Map<string, string>();
  for (const row of familyRows) {
    familyMap.set(row.code, row.title);
  }
  console.log(`Loaded ${familyMap.size} family entries`);

  // Parse occupations
  const occupationRows = parseCsv(occupationFilePath);
  console.log(`Loaded ${occupationRows.length} occupation entries`);

  const records = occupationRows.map((row) => {
    const formattedCode = formatOccupationCode(row.code);
    const familyCode = row.code.slice(0, 4);
    const familyTitle = familyMap.get(familyCode) ?? "";

    return {
      id: `cbo-${formattedCode}`,
      code: formattedCode,
      title: row.title,
      familyCode,
      familyTitle,
    };
  });

  // Upsert in batches
  let processed = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    await db
      .insert(cboOccupations)
      .values(batch)
      .onConflictDoUpdate({
        target: cboOccupations.code,
        set: {
          title: sql`excluded.title`,
          familyCode: sql`excluded.family_code`,
          familyTitle: sql`excluded.family_title`,
          updatedAt: sql`now()`,
        },
      });

    processed += batch.length;
    console.log(`Upserted ${processed}/${records.length} occupations`);
  }

  console.log("CBO occupations seed completed successfully");
  process.exit(0);
};

main().catch((error) => {
  console.error("CBO occupations seed failed:", error);
  process.exit(1);
});
