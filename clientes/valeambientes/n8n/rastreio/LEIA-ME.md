# Rastreio de valeambientes: plugar e testar

GERADO por `rastreio.py montar valeambientes` a partir do bloco `rastreio` do `config.json`. Mudou algo? Edite o config
e monte de novo; não edite os JSON à mão.

Os 8 workflows nascem DESLIGADOS e sem credencial. **Módulo 1 (origem no Kommo): 1, 2, 3, 4 e 8.**
Módulo 2 (venda de volta ao Google e à Meta): 5, 6 e 7.

## 0. Antes de importar

1. Banco do cliente: aplicar `.claude/skills/rastreio-google-meta-kommo/assets/banco/001_rastreio.sql` e depois
   `clientes/valeambientes/supabase/rastreio_002_config.sql`. Prova: `select public.rastreio_saude();` responde.
2. Credenciais no n8n do cliente, cada uma provada por uma chamada real que deu 200 (portão da casa):

   | chave no config | tipo no n8n | serve para |
   |---|---|---|
   | `supabase` | Supabase (credencial `Supabase API` do projeto https://awdxhenuyvsqsivvkycj.supabase.co) | todos os nós de banco |
   | `kommo` | Header Auth `Authorization: Bearer <token>`, token de longa duração do Kommo | buscar e gravar no lead |
   | `google` | OAuth2 do Google, escopo `https://www.googleapis.com/auth/datamanager` | [6], só módulo 2 |
   | `meta` | Header Auth `Authorization: Bearer <token>`, token de usuário do sistema | [7], só módulo 2 |

   Anote `{id, name}` de cada uma em `rastreio.credenciais` e rode `montar` de novo: os JSON saem com a
   credencial já anexada. Se preferir anexar no editor, siga a tabela da seção 1.

3. **Campo "Origem comprovada" ainda não existe no config.** Sem ele, o [4] grava só UTM e GCLID.
   `python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py campo-origem valeambientes` (seco) e depois
   `--aplicar` com o ok. Ele cria o campo de lista no Kommo, grava os ids no config; rode `montar` de novo.

## 1. Importar, nesta ordem

No editor do n8n: Workflows, Import from File, um por vez. Depois de importar, anote o id (o que aparece na URL)
em `rastreio.workflows.<chave>` do config. Ou, com as credenciais no config e o ok do Nilton:
`rastreio.py criar valeambientes --aplicar` cria todos desligados e grava os ids sozinho (`--modulo 1` cria só o módulo 1
e pede só as credenciais Supabase e Kommo).

| arquivo | workflow | módulo | nós que pedem credencial |
|---|---|---|---|
| `1-sessao.json` | [RASTREIO 1] Sessão do site | 1 | `grava sessao`: Supabase |
| `2-kommo_msg.json` | [RASTREIO 2] Entrada Kommo (código) | 1 | `grava evidencia`: Supabase |
| `3-meta.json` | [RASTREIO 3] Meta referral (sub) | 1 | `grava evidencia`: Supabase |
| `4-casamento.json` | [RASTREIO 4] Casamento com o lead | 1 | `a casar`: Supabase<br>`busca`: Kommo (anexada)<br>`le lead`: Kommo (anexada)<br>`grava no lead`: Kommo (anexada)<br>`marca casado`: Supabase<br>`marca sem patch`: Supabase<br>`marca sem lead`: Supabase |
| `5-etapa.json` | [RASTREIO 5] Etapa do Kommo vira conversão | 2 | `le lead`: Kommo (anexada)<br>`le contato`: Kommo (anexada)<br>`enfileira`: Supabase |
| `6-google.json` | [RASTREIO 6] Envio Google (Data Manager) | 2 | `lote`: Supabase<br>`envia`: Google<br>`grava resultado`: Supabase |
| `7-meta_envio.json` | [RASTREIO 7] Envio Meta (Conversions API) | 2 | `lote`: Supabase<br>`envia`: Meta<br>`grava resultado`: Supabase |
| `8-saude.json` | [RASTREIO 8] Saúde diária | 1 | `saude`: Supabase |

## 2. Ligar as pontas

| ponta | onde | URL |
|---|---|---|
| etiqueta da página | `<head>` do site, `data-endpoint` | `https://n8n-webhook.valeambientes.cloud/webhook/rastreio-sessao-valeambientes-bf831347162f` |
| Kommo `add_message` | webhook do Kommo -> [2] | `https://n8n-webhook.valeambientes.cloud/webhook/rastreio-kommo-msg-valeambientes-4bdd02935bd4` |
| Kommo `status_lead` (módulo 2) | webhook do Kommo -> [5] | `https://n8n-webhook.valeambientes.cloud/webhook/rastreio-etapa-valeambientes-f3caa11757eb` |

O caminho de cada URL é o segredo do webhook: não colar em grupo nem em chat público.

- **Etiqueta:** `<script src=".../rastreio-osimplify.js" data-endpoint="https://n8n-webhook.valeambientes.cloud/webhook/rastreio-sessao-valeambientes-bf831347162f" data-ensaio="1" defer></script>`.
  Ela mantém o texto que o botão do WhatsApp já tem e acrescenta ` [XXXXX]` no fim. A regra do Kommo que lê a frase
  tem de estar em "contém", não em "igual a".
- **Webhook do Kommo:** Configurações, Integrações, Webhooks, ou `POST /api/v4/webhooks` com `{destination, settings: ["add_message"]}`.
  O Kommo desliga o webhook depois de 100 respostas ruins em 2 horas: ligue o workflow ANTES de cadastrar.
- **Meta [3]:** é sub-workflow, sem gatilho próprio. Nunca crie um 2º gatilho do WhatsApp (rouba o callback do app).
  `rastreio.py ligar-meta valeambientes` (seco) e depois `--aplicar`: pendura o [3] no gatilho de `6EqMv8QUuOmcKlAl` (credencial `vale-ambientes`),
  em paralelo ao que já roda. À mão: nó Execute Workflow saindo do gatilho, workflow = id do [3], sem esperar o fim.

## 3. Testar, ponta por ponta

Cada teste é seco por padrão (mostra o que mandaria). `--enviar` manda de verdade para o webhook de PRODUÇÃO
(workflow ligado); `--url-teste` usa o `/webhook-test/` (editor aberto em "Listen for test event").

| # | comando | prova no banco ou no Kommo |
|---|---|---|
| 1 | `rastreio.py testar valeambientes sessao --enviar` | `select codigo, gclid, utm_source from rastreio_sessoes order by criado_em desc limit 1;` mostra o código e `TESTE-QA-...` |
| 2 | `rastreio.py testar valeambientes mensagem --codigo <o do teste 1> --lead <id de um lead [QA]> --enviar` | `select fonte, codigo, lead_id, estado from rastreio_evidencias order by criado_em desc limit 1;` com `kommo_codigo` e o lead |
| 3 | esperar o [4] (5 min) ou rodar no editor | o lead `[QA]` ganhou GCLID e UTM no Kommo; `estado = 'casado'` na evidência; `select origem, gclid from rastreio_leads where lead_id = <id>;` |
| 4 | mensagem SEM código (sentido contrário) | `testar ... mensagem --sem-codigo`: nenhuma linha nova em `rastreio_evidencias` |
| 5 | conta errada (sentido contrário) | `testar ... mensagem --conta 1`: nenhuma linha nova |
| 6 | módulo 2: `rastreio.py testar valeambientes etapa --lead <id [QA]> --enviar` | linhas novas em `rastreio_eventos` (uma por plataforma com destino); [6] e [7] fazem só ensaio enquanto desarmados |

Lead de teste nasce com `[QA]` no nome e sai do funil no fim. Saúde: `select public.rastreio_saude();`.

## 4. Com as chaves em mãos: a sequência inteira

As chaves que vêm de fora entram em `clientes/valeambientes/rastreio.env` (fora do git; modelo comentado em
`.claude/skills/rastreio-google-meta-kommo/assets/rastreio.env.modelo`). Cada comando é seco sem `--aplicar` e
só escreve na produção com o ok do Nilton. `R` = `python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py`.

| # | comando | o que faz | pronto quando |
|---|---|---|---|
| 1 | `R plugar valeambientes --aplicar` | prova cada chave numa chamada real, cria as credenciais no n8n, grava os ids no config | `módulo 1: credenciais prontas` |
| 2 | `R banco valeambientes --aplicar` | passa o SQL na prova local e aplica o 001 e o 002 no Supabase do cliente | saúde responde e `armado: False` |
| 3 | `R campo-origem valeambientes --aplicar` | cria o campo "Origem comprovada" no Kommo | ids no config |
| 4 | `R montar valeambientes` | regenera os JSON com credencial e campo | `MONTAGEM workflows=8 erros=0`, nenhum "sem credencial" no módulo 1 |
| 5 | `R criar valeambientes --modulo 1 --aplicar` | cria 1, 2, 3, 4 e 8 desligados | ids em `rastreio.workflows` |
| 6 | ligar 1, 2, 4 e 8 no editor; webhook `add_message` no Kommo; `R ligar-meta valeambientes --aplicar` | pontas ligadas | seção 2 |
| 7 | testes da seção 3 com um lead `[QA]` | prova nos dois sentidos | lead com GCLID e origem; os contrários não gravam |
