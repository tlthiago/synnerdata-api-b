/**
 * Seed script to populate an organization with test data.
 *
 * Usage:
 *   bun run db:seed:org --org <organizationId> --user <userId> [--preset <preset>]
 *
 * Examples:
 *   bun run db:seed:org --org org-123 --user user-456
 *   bun run db:seed:org --org org-123 --user user-456 --preset large
 *   bun run db:seed:org --org org-123 --user user-456 --preset enterprise
 *
 * Environment variables (alternative to CLI args):
 *   SEED_ORG_ID=org-123
 *   SEED_USER_ID=user-456
 *   SEED_PRESET=large
 *
 * Available presets: minimal, small, medium, large, enterprise
 */

import {
  type SeedOrganizationConfig,
  seedOrganization,
  seedPresets,
} from "@/test/helpers/seed-organization";

type PresetName = keyof typeof seedPresets;

type ParsedArgs = {
  organizationId: string;
  userId: string;
  preset: PresetName;
};

const ARG_FLAGS = {
  org: ["--org", "-o"],
  user: ["--user", "-u"],
  preset: ["--preset", "-p"],
  help: ["--help", "-h"],
} as const;

function isFlag(arg: string, flags: readonly string[]): boolean {
  return flags.includes(arg);
}

function parseArgsFromCli(args: string[]): {
  organizationId: string;
  userId: string;
  preset: string;
  showHelp: boolean;
} {
  let organizationId = "";
  let userId = "";
  let preset = "";
  let showHelp = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (isFlag(arg, ARG_FLAGS.org) && nextArg) {
      organizationId = nextArg;
      i += 1;
    } else if (isFlag(arg, ARG_FLAGS.user) && nextArg) {
      userId = nextArg;
      i += 1;
    } else if (isFlag(arg, ARG_FLAGS.preset) && nextArg) {
      preset = nextArg;
      i += 1;
    } else if (isFlag(arg, ARG_FLAGS.help)) {
      showHelp = true;
    }
  }

  return { organizationId, userId, preset, showHelp };
}

function validateArgs(parsed: {
  organizationId: string;
  userId: string;
  preset: string;
}): ParsedArgs {
  const { organizationId, userId, preset } = parsed;

  if (!(organizationId && userId)) {
    console.error("❌ Erro: organizationId e userId são obrigatórios.\n");
    printHelp();
    process.exit(1);
  }

  const resolvedPreset = (preset || "medium") as PresetName;
  if (!(resolvedPreset in seedPresets)) {
    console.error(`❌ Erro: preset "${resolvedPreset}" não existe.`);
    console.error(
      `   Presets disponíveis: ${Object.keys(seedPresets).join(", ")}\n`
    );
    process.exit(1);
  }

  return { organizationId, userId, preset: resolvedPreset };
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const cliArgs = parseArgsFromCli(args);

  if (cliArgs.showHelp) {
    printHelp();
    process.exit(0);
  }

  const envArgs = {
    organizationId: cliArgs.organizationId || process.env.SEED_ORG_ID || "",
    userId: cliArgs.userId || process.env.SEED_USER_ID || "",
    preset: cliArgs.preset || process.env.SEED_PRESET || "",
  };

  return validateArgs(envArgs);
}

function printHelp(): void {
  console.log(`
Seed de Organização - Popula uma organização com dados de teste

USO:
  bun run db:seed:org --org <organizationId> --user <userId> [opções]

OPÇÕES:
  -o, --org <id>      ID da organização (obrigatório)
  -u, --user <id>     ID do usuário (obrigatório)
  -p, --preset <name> Preset de configuração (padrão: medium)
  -h, --help          Mostra esta ajuda

PRESETS DISPONÍVEIS:
  minimal    - 3 funcionários, mínimo de estrutura
  small      - 15 funcionários, estrutura básica
  medium     - 50 funcionários (padrão)
  large      - 100 funcionários, mais ocorrências
  enterprise - 200 funcionários, dados completos

VARIÁVEIS DE AMBIENTE (alternativa aos argumentos):
  SEED_ORG_ID   - ID da organização
  SEED_USER_ID  - ID do usuário
  SEED_PRESET   - Preset a usar

EXEMPLOS:
  bun run db:seed:org --org org-abc123 --user user-xyz789
  bun run db:seed:org -o org-abc123 -u user-xyz789 -p large
  SEED_ORG_ID=org-123 SEED_USER_ID=user-456 bun run db:seed:org
`);
}

function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR");
}

async function main(): Promise<void> {
  const { organizationId, userId, preset } = parseArgs();
  const config: SeedOrganizationConfig = seedPresets[preset];

  console.log("\n🌱 Seed de Organização");
  console.log("═".repeat(50));
  console.log(`📦 Organização: ${organizationId}`);
  console.log(`👤 Usuário:     ${userId}`);
  console.log(`📋 Preset:      ${preset}`);
  console.log("═".repeat(50));
  console.log("\n⏳ Gerando dados... isso pode levar alguns minutos.\n");

  const startTime = Date.now();

  const result = await seedOrganization({
    organizationId,
    userId,
    ...config,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("✅ Seed concluído!\n");
  console.log("═".repeat(50));
  console.log("📊 RESUMO");
  console.log("═".repeat(50));

  console.log("\n🏢 Estrutura Organizacional:");
  console.log(
    `   • Filiais:           ${formatNumber(result.branches.length)}`
  );
  console.log(`   • Setores:           ${formatNumber(result.sectors.length)}`);
  console.log(
    `   • Centros de custo:  ${formatNumber(result.costCenters.length)}`
  );
  console.log(
    `   • Cargos:            ${formatNumber(result.jobPositions.length)}`
  );
  console.log(
    `   • Classificações:    ${formatNumber(result.jobClassifications.length)}`
  );
  console.log(
    `   • Projetos:          ${formatNumber(result.projects.length)}`
  );
  console.log(
    `   • Itens de EPI:      ${formatNumber(result.ppeItems.length)}`
  );

  console.log("\n👥 Funcionários:");
  console.log(
    `   • Total:             ${formatNumber(result.summary.totalEmployees)}`
  );
  console.log(
    `   • Ativos:            ${formatNumber(result.summary.activeEmployees)}`
  );
  console.log(
    `   • Desligados:        ${formatNumber(result.summary.terminatedEmployees)}`
  );
  console.log(
    `   • Em projetos:       ${formatNumber(result.summary.employeesInProjects)}`
  );

  console.log("\n📋 Ocorrências:");
  console.log(
    `   • Faltas:            ${formatNumber(result.occurrences.absences.length)}`
  );
  console.log(
    `   • Acidentes:         ${formatNumber(result.occurrences.accidents.length)}`
  );
  console.log(
    `   • Férias:            ${formatNumber(result.occurrences.vacations.length)}`
  );
  console.log(
    `   • Advertências:      ${formatNumber(result.occurrences.warnings.length)}`
  );
  console.log(
    `   • Atestados:         ${formatNumber(result.occurrences.medicalCertificates.length)}`
  );
  console.log(
    `   • Promoções:         ${formatNumber(result.occurrences.promotions.length)}`
  );
  console.log(
    `   • Entregas EPI:      ${formatNumber(result.occurrences.ppeDeliveries.length)}`
  );
  console.log(
    `   • Processos trab.:   ${formatNumber(result.occurrences.laborLawsuits.length)}`
  );
  console.log(
    `   • Análises CPF:      ${formatNumber(result.occurrences.cpfAnalyses.length)}`
  );
  console.log(
    `   • Desligamentos:     ${formatNumber(result.occurrences.terminations.length)}`
  );

  console.log(`\n${"═".repeat(50)}`);
  console.log(
    `📈 Total de ocorrências: ${formatNumber(result.summary.totalOccurrences)}`
  );
  console.log(`⏱️  Tempo de execução: ${elapsed}s`);
  console.log(`${"═".repeat(50)}\n`);
}

main().catch((error) => {
  console.error("❌ Erro ao executar seed:", error);
  process.exit(1);
});
