---
name: rastreio-google-meta-kommo
description: "Origem Google Ads e Meta até o Kommo e a conversão de volta (Data Manager e Conversions API), por n8n e Supabase do cliente. Use quando: ligar, testar ou consertar o rastreio de origem; \"quem veio do Google pro WhatsApp\"; \"mandar a venda do Kommo pro Google ou Meta\". Não é: subir campanha."
---

# Rastreio Google e Meta até o Kommo, com volta para as plataformas

Pacote pronto: banco (migration provada), etiqueta da página, 8 workflows n8n montados a partir do `config.json`
do cliente e um script que levanta, pluga, monta, cria e testa. O roteiro fase a fase está no `OPERACAO.md` da
raiz; os ids medidos do cliente estão em [references/cliente.md](references/cliente.md).

`R` = `python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py`

## Como funciona, em uma tela

```
Google Ads ─clique─> página com a etiqueta ─grava sessão (gclid, UTMs) + código [7KQ2M]─> [RASTREIO 1]
                         └─ botão WhatsApp leva "Olá ... [7KQ2M]" ─> Kommo ─add_message─> [RASTREIO 2] evidência
Meta (clique p/ WhatsApp) ─ gatilho do WhatsApp que JÁ existe ─> [RASTREIO 3] evidência (referral, ctwa_clid)
[RASTREIO 4] a cada 5 min: evidência + lead do Kommo ─> grava UTM, GCLID e Origem SÓ no campo vazio
Kommo muda etapa (status_lead) ─> [RASTREIO 5] ─> fila (hash do telefone e e-mail feito NO BANCO)
[RASTREIO 6] Google Data Manager · [RASTREIO 7] Meta CAPI, a cada 15 min, desarmados = ensaio
[RASTREIO 8] saúde diária: estoura de propósito se algo saiu da faixa (o errorWorkflow avisa)
```

O Google não tem um "referral" no WhatsApp como a Meta tem. A ponte é o **código de 5 letras** que a etiqueta
acrescenta no fim da mensagem pré-preenchida do botão: sem ele, quem veio do Google chega no Kommo sem prova.

**Módulo 1 (origem no Kommo): workflows 1, 2, 3, 4 e 8**, só com credencial Supabase e Kommo.
**Módulo 2 (venda de volta): 5, 6 e 7**, com credencial Google e Meta.

## Comandos

Todos os que escrevem em produção são secos por padrão: sem `--aplicar` (ou `--enviar`) só mostram o que fariam.

| Comando | O que faz | Pronto quando |
|---|---|---|
| `R novo <slug> --kommo <subdomínio> --n8n <url> --supabase <ref> [--webhook <base>]` | local: abre `clientes/<slug>/` de um cliente novo (config, `.env` vazios, `PROMPTS.md`). Roteiro em `NOVO-CLIENTE.md` | pasta criada, nada sobrescrito |
| `R levantar <slug> [--gravar]` | só leitura: campos, funis e webhooks do Kommo; workflows e credenciais do n8n. Com `--gravar`, preenche no config o que estava vazio (conta, campos, funil, proposta de etapas, gatilho do WhatsApp) | `config.rastreio: completo para montar` |
| `R plugar <slug> [--aplicar] [--so kommo,supabase,google,meta]` | lê `clientes/<slug>/rastreio.env`, prova cada chave numa chamada real, cria a credencial no n8n, grava ids no config | `módulo 1: credenciais prontas` |
| `R banco <slug> [--aplicar]` | passa o SQL num Postgres descartável e aplica o 001 e o 002 pela API de gestão do Supabase | saúde responde, `armado: False` |
| `R campo-origem <slug> [--aplicar]` | cria no Kommo o campo de lista "Origem comprovada" (Google Ads, Meta Ads, Site) e os de texto "Anúncio de origem (id)" e "Clique do WhatsApp (ctwa_clid)" | ids no config (`campo_origem_id`, `campos_extra`) |
| `R montar <slug>` | local: gera `1-sessao.json` a `8-saude.json`, o `LEIA-ME.md` e o `rastreio_002_config.sql` | `MONTAGEM workflows=8 erros=0` |
| `R criar <slug> [--aplicar] [--modulo 1] [--sem-credencial]` | cria os workflows DESLIGADOS no n8n | ids em `rastreio.workflows`, releitura bate |
| `R ligar-meta <slug> [--aplicar]` | publica o [3] e pendura no gatilho do WhatsApp que já existe (faz backup antes) | nó `rastreio (sub)` lido de volta |
| `R testar <slug> sessao\|mensagem\|etapa [--codigo X] [--lead N] [--etapa i] [--sem-codigo] [--conta N] [--url-teste] [--enviar]` | manda o mesmo corpo que a página e o Kommo mandam; imprime a consulta SQL da prova | a consulta mostra a linha (ou vazio, no sentido contrário) |

Mudou qualquer coisa no `config.json`? Rode `montar` de novo: os JSON são gerados, não se editam à mão.

## Regras que não se negociam

- **Primeiro toque vence.** UTM, GCLID e Origem só são gravados no campo VAZIO do Kommo; o banco usa `coalesce`.
- **`fbclid` sozinho não prova anúncio.** Só `gclid/gbraid/wbraid`, UTM paga ou `referral` da Meta.
- **Telefone casa por DDD + 8 dígitos**, nunca pelos 8 finais: a busca do Kommo usa os 8, o `resolve` confere o DDD.
- **Hash no banco** (`pgcrypto`): Google recebe SHA-256 de `+55...`; Meta recebe SHA-256 só dos dígitos.
- **Um remetente por plataforma.** Se outro sistema já manda conversão, decidir antes de armar.
- **Nenhum token em nó.** Credencial do n8n por id; o script recusa workflow com `Bearer`, `EAA...`, `eyJ...` ou `ya29.` dentro.
- **Nunca um segundo gatilho do WhatsApp.** Ele re-inscreve o callback do app e rouba a entrada do que já roda.
- **Desarmado é ensaio:** Google com `validateOnly`, Meta só com `test_event_code`.
- **Valor suspeito não sai.** Venda acima de `valor_max` fica `ignorado` e a saúde avisa.

## Gotchas medidos

- **Antes de apontar `campo_origem_id`, ver QUEM já escreve no campo de origem do cliente** (`/api/v4/events` do
  lead, `created_by 0` = robô ou integração). Se uma regra do Kommo já grava a origem na criação do lead, o
  rastreio nunca escreveria ali (só grava em vazio). Por isso existe o campo próprio "Origem comprovada".
- Webhook do Kommo chega com chaves PLANAS: `body['message[add][0][text]']`, `body['leads[status][0][id]']`. A
  conta (`account[id]`) é conferida contra post forjado; o caminho sorteado é o segredo.
- Nos workflows de webhook, o `configuracoes` roda ANTES do `extrai`, então o `extrai` lê o gatilho por
  `$('gatilho')`, não pelo `$input`.
- Kommo devolve 204 sem corpo quando não acha nada: os GET rodam em texto, resposta inteira e `neverError`, e o
  Code seguinte estoura no 401/403 (senão vira execução verde sem trabalho).
- Evidência sem lead, sem contato e sem telefone entra já `ignorado`: em `a_casar` ela travaria a fila.
- Workflow do gatilho pode ter mais de um gatilho do WhatsApp: `ligar-meta` escolhe pela credencial em
  `rastreio.meta_whatsapp_credencial` e recusa se achar zero ou mais de um.
- `PUT` do n8n não aceita `settings` fora da lista nem `rewireOutputLogTo` em nó; o script filtra. Feche a aba do
  workflow no editor antes de `--aplicar` (o editor salva por cima).
- O Kommo desliga o webhook depois de 100 respostas ruins em 2 horas: ative o workflow ANTES de cadastrar.
- Anúncio do Google com recurso de mensagem (WhatsApp direto do anúncio, sem página) não passa `gclid`: não há ponte.
- A Meta NÃO deduplica evento de business messaging: quem garante "uma vez só" é a fila. Nunca apague linha de
  `rastreio_eventos` para reenviar.

## Arquivos

| Caminho | O que é | Prova |
|---|---|---|
| `assets/banco/001_rastreio.sql` | tabelas, funções, RLS, grants só `service_role` | `node assets/banco/prova.mjs` -> `PROVA_DESFEITA falhas=0` |
| `assets/banco/prova.mjs <002.sql>` | aplica a config gerada num Postgres descartável | mostra config e mapa; erro se armou |
| `assets/etiqueta/rastreio-osimplify.js` | etiqueta da página (código, sessão, link do WhatsApp) | `node assets/etiqueta/prova-etiqueta.cjs` -> `ETIQUETA falhas=0` |
| `assets/n8n/js/*.js` | corpo de cada nó Code, o MESMO que vai para o n8n | `node assets/n8n/provar_js.mjs` -> `falhas=0` |
| `assets/n8n/provar_testar.mjs` | o corpo que o `testar` manda, rodado nos nós gerados | `PROVA_TESTAR falhas=0` |
| `assets/rastreio.env.modelo` | as chaves que vêm de fora, comentadas | o `plugar` nunca imprime valor |
| [references/plataformas.md](references/plataformas.md) | o que vai para o Google e para a Meta, campo a campo | |
| [references/cliente.md](references/cliente.md) | ids medidos e observações deste cliente | |
