# Employee Branch Clearable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário "remova" a filial de um funcionário no formulário de edição, retornando-o à matriz (modelo de negócio: funcionário sem filial pertence implicitamente à matriz).

**Architecture:** Backend já suporta `branchId: null` em `updateEmployeeSchema` e o helper `validateRelationships` aceita branch ausente. O gap é exclusivo no frontend: o `Select` do shadcn em `employee-form.tsx` não tem item sentinel para "Matriz", então uma vez selecionada uma filial não há caminho UI pra desfazer. Solução: adicionar `SelectItem` sentinel "Matriz" que mapeia bidirecionalmente para string vazia no estado do form (`emptyToValue` já cuida da conversão pra `null` no payload de update). Acompanha melhoria correlata: trocar fallback `"-"` por `"Matriz"` no detalhe e no export, deixando o conceito explícito.

**Tech Stack:** Next.js (App Router) + React Hook Form + shadcn Select + Tailwind. Backend não é tocado.

**Cross-repo:** apenas `synnerdata-web-n`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/app/(client)/funcionarios/_components/employee-form.tsx` | Modify | Adicionar sentinel "Matriz" no Select de filial + lógica bidirecional value/onChange |
| `src/app/(client)/funcionarios/[employeeId]/page.tsx` | Modify | Trocar fallback `?? "-"` por `?? "Matriz"` em duas linhas (detalhe + organograma section) |
| `src/app/(client)/funcionarios/_components/data-table/data-table-toolbar.tsx` | Modify | Trocar fallback do export `?? "-"` por `?? "Matriz"` |

---

## Constants

Sentinel value reusado entre value-set e value-render no Select:

```ts
const NO_BRANCH_VALUE = "__matriz__";
```

**Por que sentinel não-vazio:** shadcn `Select` (radix-ui) emite warning se algum `SelectItem` tem `value=""` (string vazia é reservada pra "nada selecionado"). Usar `"__matriz__"` evita o warning. A conversão pra string vazia acontece apenas no estado interno do form (`field.value`); o submit handler já existente (`emptyToValue`) traduz `""` → `null` (edit) ou `undefined` (create).

---

## Task 1: Form — Sentinel "Matriz" no Select de filial

**Files:**
- Modify: `src/app/(client)/funcionarios/_components/employee-form.tsx:1133-1161`

- [ ] **Step 1: Adicionar a constante `NO_BRANCH_VALUE` no topo do componente**

Localizar onde estão outras constantes/labels do componente (logo após os imports, antes do schema Zod ou logo depois). Adicionar:

```tsx
const NO_BRANCH_VALUE = "__matriz__";
```

Se não houver bloco óbvio de constantes, adicionar imediatamente antes do schema Zod (`const employeeFormSchema = z.object({`).

- [ ] **Step 2: Atualizar o Controller de `branchId` para usar o sentinel**

Substituir o bloco completo do `Controller name="branchId"` (linhas ~1133-1161) por:

```tsx
<Controller
  control={form.control}
  name="branchId"
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor="employee-branchId">Filial</FieldLabel>
      <Select
        disabled={isDisabled}
        onValueChange={(value) =>
          field.onChange(value === NO_BRANCH_VALUE ? "" : value)
        }
        value={field.value === "" || field.value == null ? NO_BRANCH_VALUE : field.value}
      >
        <SelectTrigger
          aria-invalid={fieldState.invalid}
          id="employee-branchId"
        >
          <SelectValue placeholder="Selecione a filial" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_BRANCH_VALUE}>Matriz (sem filial)</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={[fieldState.error]} />
    </Field>
  )}
/>
```

Mudanças vs versão original:
- `onValueChange={field.onChange}` → wrapper que mapeia sentinel → `""`
- `value={field.value}` → mapeia `""`/`null` → sentinel pra renderizar selecionado
- Novo `SelectItem` "Matriz (sem filial)" como primeiro item

- [ ] **Step 3: Verificar typecheck**

Run: `bun run typecheck` (verificar nome do script em `package.json` — provavelmente `lint:types` ou `tsc`)
Expected: clean.

- [ ] **Step 4: Lint**

Run: `npx ultracite check "src/app/(client)/funcionarios/_components/employee-form.tsx"`
Expected: clean.

- [ ] **Step 5: Smoke test no browser (sequência completa de UX)**

Run: `bun run dev`

Acessar `http://localhost:3000/funcionarios/cadastrar`:
- Verificar que o dropdown "Filial" mostra "Matriz (sem filial)" como primeiro item, seguido das filiais
- Selecionar "Matriz" → o trigger exibe "Matriz (sem filial)"
- Submit do form: payload deve ter `branchId: undefined` (campo omitido) — verificar via Network tab

Acessar `http://localhost:3000/funcionarios/<id-existente-com-filial>/editar`:
- Verificar que dropdown vem pré-selecionado com a filial atual
- Trocar pra "Matriz (sem filial)" → trigger atualiza
- Submit: payload deve ter `branchId: null` (RFC 7396 clear) — Network tab
- Após salvar: voltar pra `/funcionarios/<id>` deve mostrar branch como Matriz / "-" (mudaremos pra "Matriz" na Task 2)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(client)/funcionarios/_components/employee-form.tsx"
git commit -m "feat(funcionarios): allow clearing branch (Matriz sentinel) in form"
```

---

## Task 2: Detail page — fallback "Matriz" em vez de "-"

**Files:**
- Modify: `src/app/(client)/funcionarios/[employeeId]/page.tsx:282,466`

- [ ] **Step 1: Atualizar linha 282 (InfoRow Filial na seção Profissional)**

Substituir:
```tsx
<InfoRow label="Filial" value={employee.branch?.name} />
```

por:
```tsx
<InfoRow label="Filial" value={employee.branch?.name ?? "Matriz"} />
```

- [ ] **Step 2: Atualizar linha 466 (organograma / segunda referência)**

Localizar:
```tsx
<span>{employee.branch?.name ?? "-"}</span>
```

Substituir por:
```tsx
<span>{employee.branch?.name ?? "Matriz"}</span>
```

- [ ] **Step 3: Verificar typecheck + lint**

Run: `bun run typecheck && npx ultracite check "src/app/(client)/funcionarios/[employeeId]/page.tsx"`
Expected: clean.

- [ ] **Step 4: Smoke test no browser**

Acessar `/funcionarios/<id>` de funcionário sem filial (ou que você acabou de mover pra Matriz na Task 1):
- Seção "Dados Profissionais" deve exibir "Filial: Matriz"
- Onde quer que apareça o segundo `<span>` (provavelmente em algum bloco hero/header) também deve mostrar "Matriz"

- [ ] **Step 5: Commit**

```bash
git add "src/app/(client)/funcionarios/[employeeId]/page.tsx"
git commit -m "feat(funcionarios): display 'Matriz' fallback for employees without branch"
```

---

## Task 3: Export — fallback "Matriz" em data-table-toolbar

**Files:**
- Modify: `src/app/(client)/funcionarios/_components/data-table/data-table-toolbar.tsx:150`

- [ ] **Step 1: Atualizar o mapping do export**

Localizar:
```tsx
Filial: employee.branch?.name ?? "-",
```

Substituir por:
```tsx
Filial: employee.branch?.name ?? "Matriz",
```

- [ ] **Step 2: Lint**

Run: `npx ultracite check "src/app/(client)/funcionarios/_components/data-table/data-table-toolbar.tsx"`
Expected: clean.

- [ ] **Step 3: Smoke test no browser**

Acessar `/funcionarios`:
- Click "Exportar" / botão de export (CSV/XLSX)
- Abrir o arquivo gerado: linha de funcionário sem filial deve ter coluna "Filial" = "Matriz" (não "-")

- [ ] **Step 4: Commit**

```bash
git add "src/app/(client)/funcionarios/_components/data-table/data-table-toolbar.tsx"
git commit -m "feat(funcionarios): use 'Matriz' label in export for employees without branch"
```

---

## Task 4: Push e abrir PR

**Files:** N/A

- [ ] **Step 1: Push**

```bash
git push -u origin feat/employee-branch-clearable
```

Expected: branch criada no remote sem rejeições.

- [ ] **Step 2: Abrir PR**

```bash
gh pr create --base preview --title "feat(funcionarios): allow clearing employee branch (Matriz)" --body "$(cat <<'EOF'
## Summary

Permite que o usuário desfaça a seleção de filial de um funcionário no formulário, retornando-o ao estado implícito de "Matriz" (sem filial vinculada).

## Background

Modelo de negócio: funcionário sem filial pertence implicitamente à matriz da organização. Backend já suportava \`branchId: null\` no PUT (RFC 7396 — null = clear). O gap era apenas no frontend: o Select de filial em \`employee-form.tsx\` não tinha como sinalizar "nenhuma filial". Uma vez selecionada uma filial, o usuário não conseguia voltar pra Matriz.

## Changes

### Form (\`employee-form.tsx\`)
- Novo SelectItem "Matriz (sem filial)" como primeiro item do dropdown de filial
- Sentinel \`__matriz__\` mapeia bidirecionalmente pra string vazia no estado do form
- \`emptyToValue\` (já existente) traduz string vazia em \`null\` no payload de update / \`undefined\` no create

### Display (\`[employeeId]/page.tsx\`, \`data-table-toolbar.tsx\`)
- Onde aparece a filial sem valor: trocar fallback \`"-"\` por \`"Matriz"\`. Reforça o conceito do domínio em vez de esconder com placeholder neutro.

## Backend

Sem mudanças. Apenas frontend.

## Test plan

- [ ] CI verde (lint + typecheck)
- [ ] Smoke manual:
  - [ ] Cadastrar funcionário com Matriz selecionada → criado sem branch (verificar via detalhe)
  - [ ] Editar funcionário com filial → trocar pra Matriz → salvar → detalhe mostra "Matriz"
  - [ ] Editar de volta pra uma filial → salvar → detalhe mostra a filial
  - [ ] Export CSV/XLSX: coluna Filial mostra "Matriz" pra quem não tem filial

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capturar URL da PR no output e reportar.

---

## Self-Review Checklist

- [x] **Spec coverage:** as 3 mudanças necessárias (form, detail, export) cobertas em Tasks 1-3.
- [x] **Placeholder scan:** sem TBDs, sem "implementar adequadamente". Todo o código de cada step está completo e copiável.
- [x] **Type consistency:** `NO_BRANCH_VALUE` é usada identicamente nas 2 referências da Task 1 (onChange e value). `field.onChange` aceita string. `field.value` é string ou undefined.
- [x] **Sem mudança de payload contract:** create envia `branchId: undefined` (omitido), update envia `branchId: null` ou `branchId: "<id>"`. Backend já aceita as 3 formas.
- [x] **Sem regen de kubb / sem cross-repo:** confirmado.

---

## Riscos

1. **`SelectValue` placeholder ainda aparece em algum estado:** se o `field.value` vier `undefined` em vez de `""` num caminho não-mapeado, o trigger pode mostrar "Selecione a filial" em vez de "Matriz (sem filial)". Mitigação: a condição `field.value === "" || field.value == null` cobre os 3 casos (`""`, `null`, `undefined`). Validar no smoke test do step 5 da Task 1.

2. **Outros componentes que renderizam branch fora de funcionários:** ocorrências (faltas, férias, etc.) podem ter cards/dropdowns que mostram a filial do funcionário. Não escopo desta PR — caso apareçam com "-" e o produto julgar relevante, follow-up cosmético idêntico.

3. **Backwards compat de exports antigos:** se algum cliente tem dashboard de BI que filtra a coluna "Filial" pelo valor literal `"-"` esperando funcionários sem filial, o filtro quebra. Comportamento consistente com a mudança que fizemos em `mealAllowance`/`transportAllowance` — heads-up no PR body cobre o aviso.
