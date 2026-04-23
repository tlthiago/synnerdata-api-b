# Deployment Guide

> Guia de deploy e configuração de infraestrutura para produção.
>
> **Stack:** Coolify + VPS
> **Última atualização:** 2025-12-15

---

## 1. Visão Geral

Este documento detalha as configurações necessárias para deploy seguro da API em produção usando Coolify em uma VPS.

### Stack de Produção

| Camada | Ferramenta | Custo |
|--------|------------|-------|
| **Deploy** | Coolify | Grátis |
| **Erros** | Sentry | Grátis (5K/mês) |
| **Uptime** | UptimeRobot ou BetterStack | Grátis |
| **Métricas VPS** | Netdata | Grátis |
| **Backup DB** | Script cron ou DB gerenciado | - |
| **Segurança** | UFW + Fail2ban | Grátis |

### O que o Coolify já oferece

- Deploy automático (Git push)
- SSL/HTTPS (Let's Encrypt)
- Logs dos containers
- Variáveis de ambiente
- Health checks
- Métricas básicas (CPU/RAM do container)

---

## 2. Segurança da VPS

### 2.1 Firewall (UFW)

Permitir apenas portas necessárias:

```bash
# Habilitar firewall
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw enable

# Verificar status
sudo ufw status
```

### 2.2 Fail2ban

Bloqueia IPs com tentativas de brute force:

```bash
# Instalar
sudo apt install fail2ban

# Habilitar
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Verificar status
sudo fail2ban-client status
```

### 2.3 SSH Seguro

```bash
# Editar configuração SSH
sudo nano /etc/ssh/sshd_config

# Recomendações:
PermitRootLogin no
PasswordAuthentication no  # Usar apenas chave SSH
MaxAuthTries 3

# Reiniciar SSH
sudo systemctl restart sshd
```

### 2.4 Usuário não-root

```bash
# Criar usuário para deploy
sudo adduser deploy
sudo usermod -aG sudo deploy

# Copiar chave SSH para o novo usuário
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /home/deploy/.ssh
```

---

## 3. Performance da VPS

### 3.1 Swap (Importante para VPS com pouca RAM)

Se a VPS tem 2-4GB de RAM, configurar swap:

```bash
# Criar 2GB de swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Tornar permanente
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verificar
free -h
```

### 3.2 Limites de Sistema

```bash
# Aumentar limites de arquivos abertos
sudo nano /etc/security/limits.conf

# Adicionar:
* soft nofile 65535
* hard nofile 65535
```

---

## 4. Backup do Banco de Dados

### 4.1 Script de Backup (PostgreSQL local)

Se o PostgreSQL está na mesma VPS:

```bash
# Criar diretório de backups
sudo mkdir -p /backups
sudo chown deploy:deploy /backups

# Criar script
nano /home/deploy/backup-db.sh
```

Conteúdo do script:

```bash
#!/bin/bash

# Configurações
BACKUP_DIR="/backups"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d-%H%M)

# Backup
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/db-$DATE.sql.gz

# Remover backups antigos
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Log
echo "Backup completed: db-$DATE.sql.gz"
```

```bash
# Tornar executável
chmod +x /home/deploy/backup-db.sh

# Adicionar ao cron (diário às 3h)
crontab -e
# Adicionar linha:
0 3 * * * /home/deploy/backup-db.sh >> /var/log/backup.log 2>&1
```

### 4.2 Alternativa: PostgreSQL Gerenciado

Usar serviço gerenciado elimina preocupação com backups:

| Serviço | Plano Gratuito | Backups |
|---------|----------------|---------|
| **Supabase** | 500MB, 2 projetos | Diários (7 dias) |
| **Neon** | 512MB | Point-in-time |
| **Railway** | $5 crédito/mês | Diários |

---

## 5. Monitoramento

### 5.1 Sentry (Error Tracking)

Captura erros em produção com contexto:

```bash
bun add @sentry/bun
```

```typescript
// src/lib/sentry.ts
import * as Sentry from "@sentry/bun";
import { env } from "@/env";

const isProduction = env.NODE_ENV === "production";

if (isProduction && env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1, // 10% das requests
  });
}

export { Sentry };
```

**Plano gratuito:** 5.000 erros/mês, 1 usuário, 30 dias retenção.

### 5.2 UptimeRobot (Uptime Monitoring)

Configuração básica:

1. Criar conta em [uptimerobot.com](https://uptimerobot.com)
2. Adicionar monitor HTTP(s)
3. URL: `https://api.seudominio.com/health`
4. Intervalo: 5 minutos
5. Alertas: Email/Telegram/Slack

**Plano gratuito:** 50 monitors, intervalos de 5min.

### 5.3 BetterStack (Alternativa)

Uptime + logs em um só lugar:

1. Criar conta em [betterstack.com](https://betterstack.com)
2. Adicionar heartbeat para `/health`
3. Configurar alertas

**Plano gratuito:** 10 monitors, 3 usuários.

### 5.4 Netdata (Métricas da VPS)

Dashboard local de métricas em tempo real:

```bash
# Instalar
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# Acessar
# http://seu-ip:19999
```

**Métricas incluídas:**
- CPU, RAM, Disk I/O
- Network traffic
- Docker containers
- PostgreSQL (se local)

**Segurança:** Configurar acesso apenas via Coolify proxy ou VPN.

### 5.5 Alertas de Disco

Script simples para alertar quando disco > 80%:

```bash
# /home/deploy/check-disk.sh
#!/bin/bash

THRESHOLD=80
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

if [ $DISK_USAGE -gt $THRESHOLD ]; then
  # Enviar alerta via webhook (Discord, Slack, etc.)
  curl -X POST "https://seu-webhook-url" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"⚠️ Alerta: Disco em ${DISK_USAGE}%\"}"
fi
```

```bash
# Cron a cada hora
0 * * * * /home/deploy/check-disk.sh
```

---

## 6. Configuração do Coolify

### 6.1 Projeto

1. Conectar repositório GitHub/GitLab
2. Selecionar branch de produção (`main`)
3. Build pack: Dockerfile ou Nixpacks

### 6.2 Variáveis de Ambiente

Configurar no painel do Coolify:

```env
# Aplicação
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Auth
BETTER_AUTH_SECRET=<gerar-com-openssl-rand-base64-32>
BETTER_AUTH_URL=https://api.seudominio.com

# Segurança
PII_ENCRYPTION_KEY=<gerar-com-openssl-rand-hex-32>
CORS_ORIGIN=https://app.seudominio.com

# Pagar.me
PAGARME_API_KEY=<chave-de-producao>
PAGARME_PUBLIC_KEY=<chave-publica-producao>
PAGARME_WEBHOOK_SECRET=<secret-do-webhook>

# Email
SMTP_HOST=smtp.seuservidor.com
SMTP_PORT=587
SMTP_USER=noreply@seudominio.com
SMTP_PASS=<senha>
EMAIL_FROM=noreply@seudominio.com

# Monitoramento (opcional)
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 6.3 Health Check

Configurar no Coolify:

- **Path:** `/health`
- **Port:** 3000
- **Interval:** 30s
- **Timeout:** 10s
- **Retries:** 3

### 6.4 Domínio e SSL

1. Apontar DNS para IP da VPS (A record)
2. No Coolify, adicionar domínio customizado
3. SSL será gerado automaticamente (Let's Encrypt)

### 6.5 Recursos

Recomendações mínimas:

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1GB | 2GB |
| Disk | 20GB | 40GB |

---

## 7. Checklist Pré-Deploy

### VPS

- [ ] UFW configurado (22, 80, 443)
- [ ] Fail2ban instalado e ativo
- [ ] Swap configurado (se RAM < 4GB)
- [ ] SSH com chave (senha desabilitada)
- [ ] Usuário não-root para deploy
- [ ] Backup de banco configurado

### Coolify

- [ ] Domínio apontando para VPS (DNS A record)
- [ ] SSL/HTTPS ativado
- [ ] Variáveis de ambiente configuradas
- [ ] Health check configurado (`/health`)
- [ ] Auto-deploy habilitado (webhook GitHub)

### Aplicação

- [ ] `DATABASE_URL` de produção
- [ ] `BETTER_AUTH_SECRET` gerado (64+ chars)
- [ ] `BETTER_AUTH_URL` com domínio de produção
- [ ] `PII_ENCRYPTION_KEY` gerado (64 hex chars)
- [ ] `CORS_ORIGIN` com domínio de produção
- [ ] Credenciais Pagar.me de produção
- [ ] Webhook Pagar.me apontando para produção
- [ ] Credenciais SMTP configuradas

### Monitoramento

- [ ] Sentry configurado e testado
- [ ] UptimeRobot/BetterStack monitorando `/health`
- [ ] Alertas de email/Telegram configurados

### Pós-Deploy

- [ ] Testar login/signup
- [ ] Testar criação de organização
- [ ] Testar fluxo de checkout (sandbox primeiro)
- [ ] Verificar logs no Coolify
- [ ] Verificar erros no Sentry
- [ ] Testar webhook do Pagar.me

---

## 8. Troubleshooting

### Container não inicia

```bash
# Ver logs no Coolify ou via SSH
docker logs <container-id>

# Verificar se porta está em uso
sudo lsof -i :3000
```

### Erro de conexão com banco

```bash
# Testar conexão
psql $DATABASE_URL -c "SELECT 1"

# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql
```

### SSL não funciona

1. Verificar se DNS propagou: `dig api.seudominio.com`
2. Verificar logs do Coolify para erros do Let's Encrypt
3. Portas 80/443 abertas no firewall?

### Memória insuficiente

```bash
# Verificar uso
free -h

# Verificar processos
htop

# Aumentar swap se necessário
```

---

## 9. Observabilidade Avançada (Futuro)

Para quando a aplicação escalar significativamente (+1000 req/min):

| Ferramenta | O que faz | Quando implementar |
|------------|-----------|-------------------|
| **Prometheus** | Coleta métricas | Múltiplas instâncias |
| **Grafana** | Dashboards | Junto com Prometheus |
| **Jaeger** | Distributed tracing | Microsserviços |
| **Loki** | Agregação de logs | Alto volume de logs |

**Sinais de que está na hora:**

- Mais de 1000 requests/minuto consistente
- Múltiplas instâncias da API (horizontal scaling)
- Problemas de performance difíceis de debugar
- Time de infra dedicado
- Necessidade de alertas complexos

---

## Referências

- [Coolify Documentation](https://coolify.io/docs)
- [Sentry for Bun](https://docs.sentry.io/platforms/javascript/guides/bun/)
- [UptimeRobot](https://uptimerobot.com)
- [BetterStack](https://betterstack.com)
- [Netdata](https://www.netdata.cloud)
- [UFW Essentials](https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands)
- [Fail2ban Guide](https://www.digitalocean.com/community/tutorials/how-to-protect-ssh-with-fail2ban-on-ubuntu-22-04)
