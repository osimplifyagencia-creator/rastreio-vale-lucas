# Operação: rastreio Google e Meta até o Kommo (valeambientes)

Gerado em 11/10/2026. Este arquivo tem duas partes. A Parte 1 é para você, que vai coletar as chaves. A Parte 2 é
o roteiro que você entrega para a sua IA quando as chaves estiverem nos arquivos.

O resultado final, numa operação só, com as 5 plataformas ligadas:

| Plataforma | Papel |
|---|---|
| Kommo | recebe a origem provada em cada lead (GCLID, UTMs, anúncio da Meta, campo "Origem comprovada") e avisa quando o lead muda de etapa |
| n8n | roda os 8 workflows `[RASTREIO]` que ligam tudo |
| Supabase | guarda sessões, cliques, eventos, a fila de envio e a saúde |
| Google Ads | recebe a etapa do Kommo como conversão (Data Manager API) |
| Meta Ads | entrega o anúncio de origem da conversa e recebe a etapa como conversão (Conversions API) |

---

## Parte 1: o que coletar

Cole cada valor no arquivo indicado, depois do `=`, sem aspas. **Nunca no chat com a IA, nunca neste arquivo.**
Marque a coluna "Tenho" à mão para acompanhar. A operação completa pede as chaves das 5 plataformas.

### Kommo, n8n e Supabase

| Tenho | Chave | Onde pegar | Onde colar |
|---|---|---|---|
| [ ] | `KOMMO_TOKEN` | Kommo, Configurações, Integrações, integração privada, aba Chaves e escopos: token de longa duração | `clientes/valeambientes/.env` |
| [ ] | `N8N_API_KEY` | n8n (https://n8n.valeambientes.cloud), Settings, n8n API, Create an API key | `clientes/valeambientes/n8n/.env` |
| [ ] | `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens, com acesso ao projeto `awdxhenuyvsqsivvkycj` | `clientes/valeambientes/rastreio.env` |
| [ ] | `SUPABASE_SERVICE_ROLE_KEY` **ou** `N8N_CRED_SUPABASE_ID` | A chave `service_role` em Project Settings, API. Ou o id de uma credencial "Supabase API" que já existe no n8n (já apontada no arquivo: `lpwidibzuryVXPca`, falta provar pelo uso) | `clientes/valeambientes/rastreio.env` |
| [ ] | `N8N_MCP_TOKEN` (opcional) | n8n, Settings, MCP access | variável de ambiente (ver LEIA-ME.md) |

Sem o `SUPABASE_ACCESS_TOKEN` a operação ainda sai: a IA entrega os 2 arquivos SQL para colar no SQL Editor.

### Google Ads

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

### Meta Ads

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
Você vai colocar no ar o rastreio do cliente valeambientes neste projeto, de ponta a ponta, ligando 5 plataformas:
Kommo, n8n, Supabase, Google Ads e Meta Ads. Leia o CLAUDE.md da raiz e carregue a skill
rastreio-google-meta-kommo antes de qualquer comando. Para cada plataforma há uma skill de apoio: n8n-pela-api,
kommo-pela-api, meta-acessos e google-ads-conversoes. As chaves já estão nos arquivos .env de clientes/valeambientes/
(não leia nem imprima esses arquivos: os scripts leem sozinhos).

Atalho: R = python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py

Autorização: você tem o meu ok para aplicar em produção da FASE 0 até a FASE 8, sem parar entre as fases. Em
cada passo rode PRIMEIRO em seco (sem --aplicar ou --enviar), confira a saída e, se não houver erro, rode em
seguida aplicando, sem me perguntar. Isso inclui criar credencial no n8n, criar campo e webhook no Kommo, aplicar
o banco no Supabase, criar e ATIVAR os 8 workflows e mandar evento de ensaio para o Google Ads e para a Meta.

Pare e me mostre a saída somente se:
- uma prova falhar ou um comando devolver erro (não contorne);
- faltar uma chave (diga qual e em qual arquivo ela vai);
- o passo tocar em workflow, webhook ou campo que não seja do rastreio. No n8n, mexa só no que começa com
  [RASTREIO], mais o único nó que o ligar-meta acrescenta.

A única coisa que espera a minha palavra é a FASE 9 (armar o envio real de conversão).

FASE 0. Ambiente
- python --version (3.10+), node --version (20+), npm install na raiz.
- node .claude/skills/rastreio-google-meta-kommo/assets/banco/prova.mjs  -> última linha "PROVA_DESFEITA falhas=0"
- node .claude/skills/rastreio-google-meta-kommo/assets/n8n/provar_js.mjs -> "NOS total=54 falhas=0"

FASE 1. Levantar (só leitura)
- R levantar valeambientes
- Guarde para o resumo: campos de UTM e GCLID, funis, webhooks do Kommo e os workflows com gatilho do WhatsApp.

FASE 2. Credenciais das 5 plataformas (portão: nada de workflow antes disto)
- R plugar valeambientes            -> seco: diz o que cria e o que falta
- R plugar valeambientes --aplicar  -> prova cada chave numa chamada real (Kommo, Supabase, Google Ads, Meta), cria as
  credenciais no n8n e grava os ids no config
- Pronto quando aparecem as duas linhas: "módulo 1 (origem no Kommo): credenciais prontas" e "módulo 2 (volta da
  venda): credenciais prontas". Se só a primeira aparecer, me diga quais chaves do Google ou da Meta faltam e siga
  com o que dá: nas fases 4 e 5 use "R criar valeambientes --modulo 1" e ative só 1, 2, 4 e 8.

FASE 3. Kommo: campo "Origem comprovada"
- R campo-origem valeambientes  e depois  --aplicar
- Pronto quando: campo_origem_id e origem_enums aparecem no config.

FASE 4. Montar os workflows e aplicar o banco no Supabase
- R montar valeambientes                        -> "MONTAGEM workflows=8 erros=0", sem nenhum "sem credencial"
- node .claude/skills/rastreio-google-meta-kommo/assets/n8n/provar_testar.mjs clientes/valeambientes/n8n/rastreio python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py valeambientes   -> "PROVA_TESTAR falhas=0"
- R banco valeambientes  e depois  --aplicar    -> passa na prova local e aplica o 001 e o 002 (conta do Google, conjunto
  de dados da Meta e mapa de etapas) no Supabase do cliente
- Pronto quando: a saúde responde e "armado: False". Sem SUPABASE_ACCESS_TOKEN: me entregue o caminho dos 2
  arquivos SQL, na ordem, para eu colar no SQL Editor, e confira depois com select public.rastreio_saude();

FASE 5. n8n: criar e ativar os 8 workflows
- R criar valeambientes  e depois  --aplicar    -> cria os 8 desligados; ids em rastreio.workflows
- Ative pela API do n8n (skill n8n-pela-api): 1, 2, 4, 5, 6, 7 e 8. O 3 é sub-workflow: quem publica ele é o `ligar-meta`, antes de pendurar (n8n novo recusa chamar sub-workflow não publicado).
- Pronto quando: GET de cada workflow devolve active=true (menos o 3) e todo nó HTTP tem credencial.

FASE 6. Ligar as pontas (siga a seção 2 do clientes/valeambientes/n8n/rastreio/LEIA-ME.md)
- Kommo (skill kommo-pela-api), só DEPOIS de ativar o workflow de destino: webhook add_message para a URL do [2]
  e webhook status_lead para a URL do [5].
- Meta: R ligar-meta valeambientes  e depois  --aplicar: pendura o [3] no gatilho do WhatsApp que já existe. Feche a
  aba desse workflow no editor antes. Nunca crie um segundo gatilho do WhatsApp.
- Google: me entregue a linha <script> da etiqueta pronta (está no LEIA-ME dos workflows) para colar no <head>
  do site. É ela que carrega o clique do Google até o WhatsApp.

FASE 7. Provar a origem no Kommo, nos dois sentidos, com um lead [QA]
- Crie um lead de teste com [QA] no nome, no funil do config.
- R testar valeambientes sessao --enviar                              -> anote o código devolvido
- R testar valeambientes mensagem --codigo <código> --lead <id> --enviar
- Espere o [4] rodar (5 minutos) e confira: o lead ganhou GCLID, UTMs e "Origem comprovada = Google Ads".
- Sentido contrário, os dois têm de NÃO gravar nada:
  R testar valeambientes mensagem --lead <id> --sem-codigo --enviar
  R testar valeambientes mensagem --codigo <código> --lead <id> --conta 1 --enviar
- Cada comando imprime a consulta SQL da prova. Rode a consulta e guarde o resultado.

FASE 8. Provar a conversão em ensaio no Google Ads e na Meta Ads
- R testar valeambientes etapa --lead <id [QA]> --etapa 0 --enviar
- Pronto quando: há linhas em rastreio_eventos com estado ensaio_ok para o Google e para a Meta, e o evento
  aparece na aba Testar eventos do conjunto de dados da Meta.
- Tire o lead [QA] do funil.
- Me devolva o resumo final (abaixo) e pergunte: "ensaio ok nas duas, posso armar?".

FASE 9. Armar (só com o meu "pode armar")
- Armar faz a etapa de lead de verdade virar conversão real nas contas de anúncio. No SQL Editor do Supabase:
  update public.rastreio_config set google_armado = true, meta_armado = true where id = 1;
- Prova: select public.rastreio_saude(); e, na próxima mudança de etapa de um lead real com origem, uma linha em
  rastreio_eventos com estado enviado e a conversão aparecendo no Google Ads e no Gerenciador de Eventos.

Não faça, mesmo com tudo verde:
- não grave no campo de origem antigo do Kommo: o rastreio escreve só em "Origem comprovada";
- não altere nem desligue workflow, webhook ou automação que já existia;
- não cole chave no chat, em workflow nem em arquivo versionado, e não faça commit.

Resumo final, um só, depois da FASE 8: por fase, Resultado, Prova (saída do comando ou da consulta) e Não feito
ou risco. Depois a lista dos 8 workflows com id e se está ativo, as credenciais criadas no n8n, os webhooks
cadastrados no Kommo e a linha <script> do site. Atualize o clientes/valeambientes/historico.md com uma linha por fase
fechada.

Observações deste cliente:
- O workflow do gatilho do WhatsApp (6EqMv8QUuOmcKlAl) tem mais de um gatilho. O ligar-meta escolhe o da credencial vale-ambientes. O resto desse workflow não é deste projeto: não alterar.
- Esse mesmo workflow já grava utm_source=meta e utm_medium=cpc no lead, por cima do que houver. O [RASTREIO 3] roda em paralelo a ele; desligar a gravação antiga é decisão posterior, depois de 7 dias comparando os dois.
- A origem que existe hoje no campo 'Origem do Lead' (962553) é gravada por uma regra do Kommo na criação do lead, lendo a frase da primeira mensagem, sem prova (em 30 dias: 211 leads 'Google Ads' e nenhum com GCLID). Por isso o rastreio grava no campo novo 'Origem comprovada' e nunca no 962553.
- O campo de valor do lead mistura centavos e reais: venda acima de valor_max (150000) não é enviada e a saúde avisa.
- Credencial do Kommo já criada no n8n: DfhIaL8GcP4nm2cu. A credencial Supabase candidata (lpwidibzuryVXPca, 'vale-ambientes') ainda não foi provada pelo uso: a primeira rodada da saúde [RASTREIO 8] prova.
- Site valeambientes.com.br na Loja Integrada: falta confirmar se aceita script no <head> e como é o link do botão do WhatsApp.
- Google Cloud: projeto 'osimplify' (conta osimplify.agencia@gmail.com), Data Manager API ATIVADA em 10/10/2026, tela de consentimento em produção. Cliente OAuth 'Rastreio Vale Ambientes (n8n)' já criado, com o redirecionamento https://n8n.valeambientes.cloud/rest/oauth2-credential/callback: o ID e a chave secreta vêm por fora, para criar a credencial OAuth2 no editor do n8n.
- Google Ads, medido em 11/10/2026 pelo navegador: a conta de anúncios da Vale NÃO está na conta de administrador da agência nem nas contas diretas dela. Sem acesso não há id de conta, nem ação de conversão, nem credencial OAuth que funcione. Caminho: o dono da conta de anúncios da Vale informa o número de 10 dígitos e aceita o vínculo com a conta de administrador da agência (aí GOOGLE_ADS_CONTA_LOGIN é o número dela), ou cria as 3 ações e conecta a credencial com o próprio login.
- Site valeambientes.com.br, medido em 11/10/2026: tag do Google Ads AW-330570521, GA4 G-CQX8H0DKPD, contêiner GTM-56XR5P4 (fora das contas de Tag Manager da casa) e pixel da Meta 1520424521471459 (candidato a META_DATASET_ID, falta confirmar no Gerenciador de Eventos). Os botões do WhatsApp são links wa.me e api.whatsapp.com para 5548999466301, formato que a etiqueta aceita.
- O ensaio do Google (envio com validateOnly, casamento e fila) foi provado em 11/10/2026 numa bancada da agência, fora da Vale: o caminho funciona. Na Vale falta só o acesso à conta de anúncios.
```
