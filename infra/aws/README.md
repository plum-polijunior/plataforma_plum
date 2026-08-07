# infra/aws

Como subir o serviço executor do PLUM.

## Comece aqui

**[PASSO-A-PASSO.md](PASSO-A-PASSO.md)** — o roteiro completo, seis etapas.

Não precisa de Docker na sua máquina: a imagem é construída pelo GitHub
Actions.

## Os arquivos

| Arquivo | O que é | Onde rodar |
|---|---|---|
| `PASSO-A-PASSO.md` | O roteiro. Comece por ele. | — |
| `provision.sh` | Cria a "casa" na AWS: ECR, segredos, roles, OIDC. Idempotente. | Git Bash |
| `valores-supabase.sh` | Monta os comandos de segredo do Supabase, já preenchidos | Git Bash |
| `smoke-test.sh` | Confere que o endpoint não é público e que a função responde | Git Bash |

## Como as peças se encaixam

```
  provision.sh          cria ECR, segredos no SSM, roles, OIDC, usuário
      │                 (sem Docker, menos de um minuto)
      │  imprime o ARN da role de deploy
      ▼
  GitHub Actions        você cola o ARN num secret e clica "Run workflow"
      │                 ele testa, constrói a imagem, publica, cria o Lambda
      │                 e falha o deploy se o endpoint ficar público
      ▼
  valores-supabase.sh   lê a URL, gera a chave da Edge Function, lê o HMAC
      │                 e imprime os 5 comandos prontos
      ▼
  npx supabase          secrets set + functions deploy
```

## Por que o Docker ficou fora

Docker Desktop no Windows exige virtualização habilitada na BIOS mais WSL2.
São três reinicializações e uma visita ao firmware, para publicar um container
que muda uma vez por semana. O runner do GitHub já tem Docker, então a imagem
é construída lá.

Efeito colateral bom: o build passa a ser reprodutível e a acontecer sempre no
mesmo ambiente, em vez de depender da máquina de quem publicou.
