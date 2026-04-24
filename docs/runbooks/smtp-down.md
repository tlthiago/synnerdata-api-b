# SMTP Down — Runbook

> SMTP (Hostinger Business Email) fora do ar ou emails não saindo. Cobre débito #93.

## Sintomas

- Logs Pino com `type:"<module>:<action>:failed"` (padrão do `sendBestEffort` — OQ-14 resolvida no commit `42699a0`).
- Senders críticos (verification, reset, 2FA OTP, invitation, contact) propagam 500 para o usuário.
- Cliente reporta "não recebi email de verificação/reset".
- Sentry captura exceptions dos senders críticos agrupadas.

## Diagnóstico rápido (≤ 5 min)

1. Logs Pino filtrados por `type:*:failed` e por window — confirmar pico recente.
2. Testar SMTP do host:
   ```bash
   openssl s_client -connect smtp.hostinger.com:465 -servername smtp.hostinger.com
   ```
   Expected: handshake TLS completa. Se timeout ou TLS erro, provider está com problema de rede/TLS.
3. Status page oficial do Hostinger.
4. Se handshake funciona mas credentials falham, testar via curl:
   ```bash
   curl -v --ssl-reqd --url smtps://smtp.hostinger.com:465 \
     --user 'SMTP_USER:SMTP_PASSWORD' \
     --mail-from 'SMTP_FROM' \
     --mail-rcpt 'test@example.com' \
     --upload-file <(echo "Subject: test\n\nbody")
   ```

## Procedimento de recuperação

**Caminho A — Credentials rotacionadas/inválidas:**
1. Hostinger painel → confirmar credentials atuais.
2. Coolify → `app` → Environment Variables → atualizar `SMTP_USER` e `SMTP_PASSWORD`.
3. `Redeploy`.

**Caminho B — Provider down:**
1. Confirmar via status page.
2. `sendBestEffort` swallowa falhas — best-effort emails não causam 500 (plan-change, admin-provision, jobs).
3. Senders críticos propagam 500 (verification, reset, 2FA, invitation, contact) — usuário vê erro e pode retry.
4. Aguardar restauração do provider; monitorar via logs.

**Caminho C — Pool SMTP exausto (raro no volume MVP):**
1. Pool configurado em `src/lib/email.tsx`: `maxConnections: 3`, `maxMessages: 100`.
2. Se logs mostrarem `Too many connections`, restart da API libera.

**Caminho D — Fallback provider:**
Não configurado hoje (OQ-15 decidiu Hostinger exclusivo). Se incidente > 1×/trimestre, abrir issue avaliando SES como fallback.

## Comunicação

- Impacto direto no fluxo de acesso (sign-up/reset/2FA → 500).
- **Avisar cliente em ≤ 30 min** se provider-side, com mensagem explicando impacto específico no acesso por email.
- Mensagem: "Emails transacionais estão com atraso devido a problema no nosso provedor. Se precisar acessar imediatamente, contate o suporte."

## Post-incident

- Registrar duração.
- Se credentials: documentar processo de rotação (quando, por quem).
- Se recorrente: issue para avaliar fallback provider.

## Referências

- Mailer: `src/lib/email.tsx` (pool SMTP + `sendBestEffort` helper).
- Senders críticos vs best-effort: ver changelog da OQ-14 em [changelog](../improvements/changelog.md) (commit `42699a0`).
- Pool dimensioning: OQ-15 resolvida (commit `b4c5204`).
- Débito #93 em [debts.md](../improvements/debts.md).
