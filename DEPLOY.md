# Deploy do Gestock (servidor com Docker)

Caminho recomendado: **um servidor (VPS) no Brasil rodando o mesmo `docker compose` do
desenvolvimento**, com o **Caddy** na frente para o HTTPS. Front e API ficam no mesmo domínio
(o cookie de sessão `SameSite=Strict` e o PWA funcionam sem ajuste).

```
internet ──https──▶ Caddy (443, certificado automático) ──▶ nginx do front (8080) ──/api──▶ API ──▶ Postgres
                                                              banco e API: só 127.0.0.1
```

## 1. Servidor

- Linux (Ubuntu 24.04), **1 vCPU e 2 GB de RAM** bastam para começar (ver "Capacidade").
- Região **São Paulo** (latência menor para a loja).
- Um domínio (ou subdomínio) apontando para o IP do servidor (registro DNS `A`).
- Instale Docker e Git:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # saia e entre de novo
```

### Oracle Cloud Always Free (custo zero)

Funciona: a máquina gratuita é ARM (Ampere A1) e todas as peças do Gestock têm versão ARM
(Node, PostgreSQL, nginx, argon2; o Prisma baixa o motor ARM no build). Na criação da instância:

- **Região de origem**: escolha **Brazil East (São Paulo)** — fica perto da loja. Ela tem um só
  domínio de disponibilidade, então o erro *Out of capacity* é mais provável; se persistir, tente
  em outros horários ou passe a conta para *Pay As You Go* (continua sem custo dentro dos limites
  gratuitos — crie um **alerta de orçamento** em Billing para não ser cobrado por engano).
  **A região de origem não muda depois.**
- Imagem **Ubuntu 24.04 (aarch64)**, formato **Ampere A1**: 2 OCPU e 12 GB já sobram para o
  Gestock (deixe o resto da cota livre). Volume de inicialização de 100–200 GB.
- Gere e **guarde a chave SSH** (não dá para baixar de novo). IP público ligado.

Diferenças em relação a guias genéricos:

1. **Firewall em dois lugares.** Na Oracle é preciso liberar 80 e 443 na **Security List** da VCN
   (Networking → Virtual Cloud Networks → sua VCN → Security Lists → Ingress Rules) **e** no
   iptables do servidor. Não use `ufw` nessas imagens (elas já vêm com regras de iptables):
   ```bash
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
   Não abra outras portas (nada de 5432, 3333, 8080 ou 8000).
2. **Coolify é dispensável.** O Gestock já sobe com `docker compose` + Caddy (passos abaixo).
   O Coolify ocupa as portas 80/443 com o próprio proxy e expõe um painel na 8000 — só use se
   quiser um painel web, e nesse caso pule o Caddy.
3. **Instância ociosa pode ser recuperada.** A Oracle reserva-se o direito de recuperar instâncias
   Always Free com uso muito baixo por 7 dias seguidos (conta gratuita, não *Pay As You Go*).
   Uma loja pequena usa pouca CPU: confira a política atual na documentação da Oracle e, na
   dúvida, passe para *Pay As You Go* — e mantenha o **backup fora do servidor** (passo 4).

## 2. Aplicação

```bash
git clone <repositório> gestock && cd gestock
cp .env.example .env
nano .env
```

No `.env`:

| Variável | Valor |
|---|---|
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` | senhas **novas e longas** (só letras, números e hífen) |
| `JWT_ACCESS_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` (ou `openssl rand -base64 48 \| tr -d '/+='`) |
| `PUBLIC_URL` | `https://gestock.seudominio.com.br` |
| `TRUST_PROXY` | `2` (Caddy + nginx) |

```bash
docker compose up --build -d
docker compose ps        # db, backend e frontend "healthy"; migrate "exited (0)"
```

**Não rode o seed** em produção (a conta demo tem senha pública; a API também se recusa).

## 3. HTTPS com Caddy

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDY'
gestock.seudominio.com.br {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
CADDY
sudo systemctl reload caddy
```

O Caddy emite e renova o certificado sozinho. Libere só 22, 80 e 443 no firewall (na Oracle,
veja os comandos de iptables acima; em outros provedores, por exemplo:
`sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable`).

> A porta 8080 do front fica publicada pelo Docker; o Docker ignora o `ufw`. Para ela também
> responder só ao Caddy, troque no `docker-compose.yml` `'${FRONTEND_PORT:-8080}:80'` por
> `'127.0.0.1:${FRONTEND_PORT:-8080}:80'`.

## 4. Backup diário (obrigatório)

```bash
mkdir -p ~/backups
crontab -e
# todo dia às 3h: dump compactado; guarda 14 dias
0 3 * * * cd ~/gestock && docker compose exec -T db pg_dump -U postgres -Fc gestock > ~/backups/gestock-$(date +\%F).dump && find ~/backups -name 'gestock-*.dump' -mtime +14 -delete
```

**Copie os backups para fora do servidor** (Google Drive com `rclone`, outro servidor, S3...):
backup no mesmo disco não protege contra perda do servidor.

Restaurar (teste isto pelo menos uma vez!):

```bash
docker compose exec -T db pg_restore -U postgres -d gestock --clean --if-exists < ~/backups/gestock-AAAA-MM-DD.dump
```

## 5. Atualizar a versão

```bash
cd ~/gestock && git pull
docker compose up --build -d      # o serviço migrate aplica migrations novas antes da API subir
```

## 6. Monitorar

- `https://gestock.seudominio.com.br/api/health` → `{"status":"ok","database":"ok"}`.
  Cadastre num monitor gratuito (UptimeRobot, Better Stack) para receber alerta se cair.
- Logs: `docker compose logs -f backend` (limitados a 3 × 10 MB por serviço).

## Capacidade (medida em 15/11/2026)

Teste com **3 anos de uma loja movimentada** (167 mil vendas, 1 milhão de baixas de estoque):

| | |
|---|---|
| Tamanho do banco | ~400 MB (≈ 135 MB por ano para ~150 vendas/dia; uma loja com 50 vendas/dia usa ~45 MB/ano) |
| Painel (30 dias) | ~0,3 s · Estoque ~20 ms · Previsão ~0,25 s · Registrar venda ~0,1 s |
| Uso simultâneo | 25 pessoas sem parar (≈ 37 requisições/s) sem erros. Uma loja real fica abaixo de 1 req/s |
| Acima do limite | responde "servidor ocupado, tente de novo" (503) — não quebra nem perde venda |

O saldo do estoque é mantido pelo banco (tabela `ingredient_balances`), então as telas não
ficam mais lentas com o passar dos anos. Sessões antigas são apagadas sozinhas a cada 6 h.

## Checklist antes de abrir para a loja

- [ ] `.env` com senhas e segredo novos (nada de `troque-...`)
- [ ] `PUBLIC_URL` com `https://` e `TRUST_PROXY=2`
- [ ] HTTPS funcionando (cadeado no navegador) — sem ele o PWA não instala
- [ ] banco e API **não** acessíveis de fora (`curl http://IP:5432` e `:3333` devem falhar)
- [ ] backup diário rodando **e cópia fora do servidor**; restauração testada uma vez
- [ ] monitor apontando para `/api/health`
- [ ] conta do dono criada pelo cadastro do próprio site (sem seed)
