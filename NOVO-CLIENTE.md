# Replicar o rastreio em outro cliente

Este projeto serve para qualquer cliente que use Kommo, n8n, Supabase, Google Ads e Meta Ads. Cada cliente fica
numa pasta `clientes/<slug>/`, com o próprio `config.json`, as próprias chaves e os próprios workflows. Nada é
copiado de um cliente para outro: os 8 workflows e o SQL são gerados de novo a partir do `config.json` de cada um.

O `<slug>` é o apelido do cliente, em minúsculas, sem espaço (exemplo: `clinica-sorriso`).

## O que o cliente precisa ter antes

| Plataforma | Requisito |
|---|---|
| Kommo | conta com o rastreio de UTM ligado (os campos UTM e GCLID existem no lead) e uma integração privada com token de longa duração |
| n8n | instância própria com a API pública ligada (Settings, n8n API) e, para a origem da Meta, um workflow com o gatilho do WhatsApp |
| Supabase | um projeto (pode ser novo e vazio) |
| Google Ads | conta que anuncia e uma ação de conversão "Importar de cliques" por evento |
| Meta Ads | Gerenciador de Negócios com a conta do WhatsApp, um conjunto de dados e um usuário do sistema |
| Site | dá para colar um `<script>` no `<head>` e o botão do WhatsApp é um link `wa.me` ou `api.whatsapp.com` |

## Três passos

Atalho: `R = python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py`

**1. Abrir a pasta do cliente** (local, não chama rede):

```bash
R novo <slug> --kommo <subdomínio do Kommo> --n8n <https://n8n.do-cliente> --supabase <ref do projeto>
```

Se o n8n do cliente recebe webhook em outro endereço, acrescente `--webhook <https://host/webhook>`.
Isso cria `clientes/<slug>/` com o `config.json`, os 3 arquivos de chave vazios, o `historico.md` e o `PROMPTS.md`
já com o nome do cliente.

**2. Colar as chaves.** A lista, com onde pegar cada uma, é a Parte 1 do `OPERACAO.md` (vale para qualquer cliente,
só muda a pasta):

| Arquivo | Chaves |
|---|---|
| `clientes/<slug>/.env` | `KOMMO_TOKEN` |
| `clientes/<slug>/n8n/.env` | `N8N_API_KEY` |
| `clientes/<slug>/rastreio.env` | Supabase, Google Ads e Meta Ads |

**3. Mandar os prompts.** Abra o `clientes/<slug>/PROMPTS.md` e mande na ordem, começando pelo prompt 0 abaixo.

## Prompt 0: cliente novo (antes do prompt 1)

Troque `<slug>` pelo apelido do cliente.

```text
Cliente novo no rastreio: <slug>. A pasta clientes/<slug>/ já foi aberta com o comando novo e as chaves já estão nos
arquivos .env (não leia nem imprima esses arquivos).

Atalho: R = python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py

1. R levantar <slug> --gravar
   Lê o Kommo e o n8n e preenche no clientes/<slug>/config.json o que estava vazio: conta do Kommo, ids dos campos de
   UTM e GCLID, funil principal, proposta de mapa de etapas e o workflow com o gatilho do WhatsApp.
2. Me mostre o bloco rastreio do config e me pergunte, uma coisa por vez, só o que o levantar não resolveu:
   - o mapa de etapas (qual etapa do funil vira qualificado, orcamento e venda) está certo?
   - o webhook_base é o endereço em que o n8n desse cliente recebe webhook?
   - se o levantar achou mais de um gatilho do WhatsApp: qual é o deste cliente?
   - valor_max: qual é o maior valor de venda plausível? Venda acima disso não é enviada como conversão.
   - error_workflow: existe um workflow de alerta de erro no n8n? Qual o id?
3. Grave as minhas respostas no config.json e rode R levantar <slug> de novo, sem --gravar.

Fechado quando a última linha do levantar for "config.rastreio: completo para montar".
Termine com "ETAPA 0 FECHADA" ou "PAROU: <motivo>". Depois eu mando o prompt 1 do clientes/<slug>/PROMPTS.md.
```

## O que muda de um cliente para outro

Só o `config.json` e as chaves. O que cada campo do bloco `rastreio` faz:

| Campo | De onde vem |
|---|---|
| `kommo_api`, `supabase_url`, `webhook_base` | do comando `novo` |
| `kommo_conta`, `campos_tracking`, `pipelines` | do `levantar --gravar` |
| `etapas` | proposta do `levantar --gravar`, confirmada por você |
| `meta_whatsapp_workflow`, `meta_whatsapp_credencial` | do `levantar --gravar` quando há um gatilho só; senão, você escolhe |
| `campo_origem_id`, `origem_enums` | do `campo-origem --aplicar` |
| `credenciais`, `google`, `meta` | do `plugar --aplicar`, a partir do `rastreio.env` |
| `webhooks`, `workflows` | do `montar` e do `criar --aplicar` |

Tempo esperado com as chaves em mãos: o que demora é coletar as chaves do Google Ads e da Meta. A configuração em
si são os 9 prompts, do 0 ao 8.
