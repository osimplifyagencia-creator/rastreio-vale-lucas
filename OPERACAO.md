# Operação: rastreio Google e Meta até o Kommo (valeambientes)

Gerado em 10/10/2026. Este arquivo tem duas partes. A Parte 1 é para você, que vai coletar as chaves. A Parte 2 é
o roteiro que você entrega para a sua IA quando as chaves estiverem nos arquivos.

O resultado final: cada lead do Kommo com a origem provada (GCLID, UTMs, anúncio da Meta e o campo "Origem
comprovada") e, numa segunda etapa, a venda do Kommo voltando como conversão para o Google Ads e para a Meta.

---

## Parte 1: o que coletar

Cole cada valor no arquivo indicado, depois do `=`, sem aspas. **Nunca no chat com a IA, nunca neste arquivo.**
Marque a coluna "Tenho" à mão para acompanhar.

### Módulo 1: origem no Kommo (já funciona só com isto)

| Tenho | Chave | Onde pegar | Onde colar |
|---|---|---|---|
| [ ] | `KOMMO_TOKEN` | Kommo, Configurações, Integrações, integração privada, aba Chaves e escopos: token de longa duração | `clientes/valeambientes/.env` |
| [ ] | `N8N_API_KEY` | n8n (https://n8n.valeambientes.cloud), Settings, n8n API, Create an API key | `clientes/valeambientes/n8n/.env` |
| [ ] | `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens, com acesso ao projeto `awdxhenuyvsqsivvkycj` | `clientes/valeambientes/rastreio.env` |
| [ ] | `SUPABASE_SERVICE_ROLE_KEY` **ou** `N8N_CRED_SUPABASE_ID` | A chave `service_role` em Project Settings, API. Ou o id de uma credencial "Supabase API" que já existe no n8n (já apontada no arquivo: `lpwidibzuryVXPca`, falta provar pelo uso) | `clientes/valeambientes/rastreio.env` |
| [ ] | `N8N_MCP_TOKEN` (opcional) | n8n, Settings, MCP access | variável de ambiente (ver LEIA-ME.md) |

Sem o `SUPABASE_ACCESS_TOKEN` a operação ainda sai: a IA entrega os 2 arquivos SQL para colar no SQL Editor.

### Módulo 2: venda de volta ao Google Ads

| Tenho | Chave | Onde pegar | Onde colar |
|---|---|---|---|
| [ ] | `GOOGLE_ADS_CONTA` | Google Ads, canto superior direito: o número de 10 dígitos da conta que anuncia | `rastreio.env` |
| [ ] | `GOOGLE_ADS_CONTA_LOGIN` | O número da conta de administrador (MCC), se o acesso for por ela. Senão, vazio | `rastreio.env` |
| [ ] | `GOOGLE_ACAO_QUALIFICADO` | Id da ação de conversão "Importar de cliques" do evento `qualificado` | `rastreio.env` |
| [ ] | `GOOGLE_ACAO_ORCAMENTO` | Id da ação de conversão "Importar de cliques" do evento `orcamento` | `rastreio.env` |
| [ ] | `GOOGLE_ACAO_VENDA` | Id da ação de conversão "Importar de cliques" do evento `venda` | `rastreio.env` |
| [ ] | `N8N_CRED_GOOGLE_ID` | Credencial OAuth2 criada no editor do n8n (a skill `google-ads-conversoes` tem o passo a passo); cole o id dela | `rastreio.env` |

Cada ação de conversão é criada no Google Ads em Metas, Conversões, Nova ação, **Importar, Acompanhar conversões
de cliques**. O id aparece na URL da ação (`ctId=`). Sem o id, aquele evento não é enviado.

### Módulo 2: venda de volta à Meta

| Tenho | Chave | Onde pegar | Onde colar |
|---|---|---|---|
| [ ] | `META_WABA_ID` | Gerenciador de Negócios, Contas, Contas do WhatsApp: o id da conta do número que recebe os anúncios | `rastreio.env` |
| [ ] | `META_DATASET_ID` | Gerenciador de Eventos: o id do conjunto de dados ligado a essa conta do WhatsApp | `rastreio.env` |
| [ ] | `META_SYSTEM_USER_TOKEN` | Gerenciador de Negócios, Usuários do sistema, Gerar token, com `whatsapp_business_manage_events` e `whatsapp_business_management`, validade "Nunca" | `rastreio.env` |
| [ ] | `META_TEST_EVENT_CODE` | Gerenciador de Eventos, o conjunto de dados, aba Testar eventos | `rastreio.env` |

O token tem de sair do MESMO Gerenciador de Negócios dono do conjunto de dados e da conta do WhatsApp. Token de
outro gerenciador volta erro 100. Passo a passo na skill `meta-acessos`.

### O que não é chave, mas precisa de resposta

| Tenho | Pergunta | Por quê |
|---|---|---|
| [ ] | A OneClickAds já manda conversão do Kommo para a Meta? | O Kommo tem um webhook dela em mudança de etapa. Dois remetentes contam a venda em dobro: escolher um só |
| [ ] | Dá para colar um `<script>` no `<head>` do site e o botão do WhatsApp é um link `wa.me` ou `api.whatsapp.com`? | A etiqueta da página é a ponte do Google: sem ela o clique do Google chega no Kommo sem prova |
| [ ] | A regra do Kommo que lê a frase da primeira mensagem está em "contém" e não em "igual a"? | A etiqueta acrescenta um código de 5 letras no fim da frase; com "igual a" a regra para de casar |
| [ ] | As etapas do funil abaixo são mesmo as que viram conversão? | É o mapa que decide o que vai para o Google e para a Meta |

Mapa de etapas proposto (no `config.json`, bloco `rastreio.etapas`):

| Etapa do Kommo | Evento | Evento na Meta | Leva valor |
|---|---|---|---|
| Interesse/Qualificado (funil 12405720, etapa 95858036) | `qualificado` | `QualifiedLead` | não |
| Orçamento Enviado (funil 12405720, etapa 95858040) | `orcamento` | `InitiateCheckout` | não |
| Ganho (funil 12405720, etapa 142) | `venda` | `Purchase` | sim |

---

## Parte 2: roteiro para a IA

Copie daqui até o fim do arquivo e mande como primeira mensagem, com esta pasta aberta como projeto.

```text
Você vai operar o rastreio de origem do cliente valeambientes neste projeto. Leia o CLAUDE.md da raiz e carregue a
skill rastreio-google-meta-kommo antes de qualquer comando. As chaves já estão nos arquivos .env de
clientes/valeambientes/ (não leia nem imprima esses arquivos: os scripts leem sozinhos).

Atalho: R = python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py

Regra de ouro: todo comando que escreve em produção roda PRIMEIRO em seco (sem --aplicar ou --enviar). Mostre
a saída, espere o meu ok e só então aplique. Depois de cada passo, mostre a prova pedida. Se uma prova falhar,
pare e me mostre a saída: não tente contornar.

FASE 0. Ambiente
- python --version (3.10+), node --version (20+), npm install na raiz.
- node .claude/skills/rastreio-google-meta-kommo/assets/banco/prova.mjs  -> última linha "PROVA_DESFEITA falhas=0"
- node .claude/skills/rastreio-google-meta-kommo/assets/n8n/provar_js.mjs -> "NOS total=54 falhas=0"

FASE 1. Levantar (só leitura)
- R levantar valeambientes
- Me mostre: campos de UTM e GCLID, funis, webhooks do Kommo que apontam para fora do n8n do cliente (terceiro
  que recebe status_lead pode já estar mandando conversão) e os workflows com gatilho do WhatsApp.

FASE 2. Credenciais (portão: nada de workflow antes disto)
- R plugar valeambientes            -> seco: diz o que cria e o que falta
- R plugar valeambientes --aplicar  -> prova cada chave numa chamada real, cria a credencial no n8n, grava o id no config
- Pronto quando: "módulo 1 (origem no Kommo): credenciais prontas".

FASE 3. Banco
- R banco valeambientes             -> seco
- R banco valeambientes --aplicar   -> passa na prova local e aplica o 001 e o 002 no Supabase do cliente
- Pronto quando: a saúde responde e "armado: False". Sem SUPABASE_ACCESS_TOKEN: me entregue o caminho dos 2
  arquivos SQL, na ordem, para eu colar no SQL Editor, e confira depois com select public.rastreio_saude();

FASE 4. Campo "Origem comprovada" no Kommo
- R campo-origem valeambientes  e depois  --aplicar
- Pronto quando: campo_origem_id e origem_enums aparecem no config.

FASE 5. Montar e criar os workflows (desligados)
- R montar valeambientes                        -> "MONTAGEM workflows=8 erros=0", sem "sem credencial" no 1, 2, 3, 4 e 8
- node .claude/skills/rastreio-google-meta-kommo/assets/n8n/provar_testar.mjs clientes/valeambientes/n8n/rastreio python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py valeambientes   -> "PROVA_TESTAR falhas=0"
- R criar valeambientes --modulo 1              -> seco
- R criar valeambientes --modulo 1 --aplicar    -> cria 1, 2, 3, 4 e 8 desligados; ids em rastreio.workflows

FASE 6. Ligar as pontas (siga a seção 2 do clientes/valeambientes/n8n/rastreio/LEIA-ME.md)
- Ativar os workflows 1, 2, 4 e 8 pela API do n8n (skill n8n-pela-api). O 3 é sub-workflow e não se ativa.
- Só DEPOIS de ativar o 2: cadastrar no Kommo o webhook add_message para a URL do [2] (skill kommo-pela-api).
- R ligar-meta valeambientes  e depois  --aplicar: pendura o [3] no gatilho do WhatsApp que já existe. Feche a aba
  desse workflow no editor antes. Nunca crie um segundo gatilho do WhatsApp.
- Etiqueta no site: me entregue a linha <script> pronta (está no LEIA-ME dos workflows) para eu colar no <head>.

FASE 7. Provar o módulo 1, nos dois sentidos, com um lead [QA]
- Crie (ou me peça) um lead de teste com [QA] no nome, no funil do config.
- R testar valeambientes sessao --enviar                              -> anote o código devolvido
- R testar valeambientes mensagem --codigo <código> --lead <id> --enviar
- Espere o [4] rodar (5 minutos) e confira: o lead ganhou GCLID, UTMs e "Origem comprovada = Google Ads".
- Sentido contrário, os dois têm de NÃO gravar nada:
  R testar valeambientes mensagem --lead <id> --sem-codigo --enviar
  R testar valeambientes mensagem --codigo <código> --lead <id> --conta 1 --enviar
- Cada comando imprime a consulta SQL da prova. Rode a consulta e me mostre o resultado.
- No fim, tire o lead [QA] do funil.

FASE 8. Módulo 2 (só se as chaves do Google e da Meta estiverem no rastreio.env)
- R plugar valeambientes --aplicar   -> "módulo 2 (volta da venda): credenciais prontas"
- R montar valeambientes  e  R banco valeambientes --aplicar   (o 002 leva conta, dataset e mapa de etapas)
- R criar valeambientes --aplicar    -> cria 5, 6 e 7 desligados
- Ativar 5, 6 e 7; cadastrar no Kommo o webhook status_lead para a URL do [5].
- R testar valeambientes etapa --lead <id [QA]> --etapa 0 --enviar
- Pronto quando: linhas em rastreio_eventos com estado ensaio_ok nas duas plataformas, e o evento aparece na
  aba Testar eventos da Meta. NÃO arme nada: armar (update rastreio_config set google_armado = true / meta_armado
  = true) é decisão do dono do projeto, depois de olhar o ensaio.

O que você me devolve no fim de cada fase: Resultado, Prova (saída do comando ou da consulta), Não feito ou
risco, Próximo passo. E atualize o clientes/valeambientes/historico.md com uma linha por fase fechada.

Observações deste cliente:
- O Kommo já tem um webhook de terceiro (id 46291588, OneClickAds) recebendo status_lead da conta de anúncios act_10150261043852081. É provável que ele já mande conversão para a Meta: decidir um só remetente ANTES de armar o [RASTREIO 7].
- O workflow do gatilho do WhatsApp (6EqMv8QUuOmcKlAl) tem mais de um gatilho. O ligar-meta escolhe o da credencial vale-ambientes. O resto desse workflow não é deste projeto: não alterar.
- Esse mesmo workflow já grava utm_source=meta e utm_medium=cpc no lead, por cima do que houver. O [RASTREIO 3] roda em paralelo a ele; desligar a gravação antiga é decisão posterior, depois de 7 dias comparando os dois.
- A origem que existe hoje no campo 'Origem do Lead' (962553) é gravada por uma regra do Kommo na criação do lead, lendo a frase da primeira mensagem, sem prova (em 30 dias: 211 leads 'Google Ads' e nenhum com GCLID). Por isso o rastreio grava no campo novo 'Origem comprovada' e nunca no 962553.
- O campo de valor do lead mistura centavos e reais: venda acima de valor_max (150000) não é enviada e a saúde avisa.
- Credencial do Kommo já criada no n8n: DfhIaL8GcP4nm2cu. A credencial Supabase candidata (lpwidibzuryVXPca, 'vale-ambientes') ainda não foi provada pelo uso: a primeira rodada da saúde [RASTREIO 8] prova.
- Site valeambientes.com.br na Loja Integrada: falta confirmar se aceita script no <head> e como é o link do botão do WhatsApp.
- Google Cloud: projeto 'osimplify' (conta osimplify.agencia@gmail.com), Data Manager API ATIVADA em 10/10/2026, tela de consentimento em produção. Cliente OAuth 'Rastreio Vale Ambientes (n8n)' já criado, com o redirecionamento https://n8n.valeambientes.cloud/rest/oauth2-credential/callback: o ID e a chave secreta vêm por fora, para criar a credencial OAuth2 no editor do n8n. Conta de administrador do Google Ads vista: 654-432-3282 (MCC - Osimplify); falta confirmar se a conta da Vale está debaixo dela.
```
