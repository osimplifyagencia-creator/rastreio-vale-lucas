# Cliente: valeambientes

Gerado em 10/10/2026 a partir do `clientes/valeambientes/config.json`, que é a fonte da verdade.

| O quê | Valor |
|---|---|
| Kommo | `reginaldovaleambientescombr.kommo.com`, conta `32040023` |
| Funis do rastreio | `12405720` |
| n8n | `https://n8n.valeambientes.cloud` (webhooks em `https://n8n-webhook.valeambientes.cloud/webhook`) |
| Supabase | `https://awdxhenuyvsqsivvkycj.supabase.co` |
| Campos de rastreio no lead | FBCLID `330534`, GCLID `330532`, GCLIENTID `330530`, REFERRER `330528`, UTM_CAMPAIGN `330520`, UTM_CONTENT `330516`, UTM_MEDIUM `330518`, UTM_REFERRER `330526`, UTM_SOURCE `330522`, UTM_TERM `330524` |
| Campo "Origem comprovada" | a criar (`campo-origem`) |
| Workflow com o gatilho do WhatsApp | `6EqMv8QUuOmcKlAl`, credencial do gatilho `vale-ambientes` |
| Workflow de alerta (errorWorkflow) | `EredNPgTvKpCDUmI` |
| Teto de valor de venda | `150000` |

## Mapa de etapas

| Etapa | Evento | Meta | Ação do Google | Leva valor |
|---|---|---|---|---|
| Interesse/Qualificado (`12405720:95858036`) | `qualificado` | `QualifiedLead` | falta | não |
| Orçamento Enviado (`12405720:95858040`) | `orcamento` | `InitiateCheckout` | falta | não |
| Ganho (`12405720:142`) | `venda` | `Purchase` | falta | sim |

## Observações medidas

- O Kommo já tem um webhook de terceiro (id 46291588, OneClickAds) recebendo status_lead da conta de anúncios act_10150261043852081. É provável que ele já mande conversão para a Meta: decidir um só remetente ANTES de armar o [RASTREIO 7].
- O workflow do gatilho do WhatsApp (6EqMv8QUuOmcKlAl) tem mais de um gatilho. O ligar-meta escolhe o da credencial vale-ambientes. O resto desse workflow não é deste projeto: não alterar.
- Esse mesmo workflow já grava utm_source=meta e utm_medium=cpc no lead, por cima do que houver. O [RASTREIO 3] roda em paralelo a ele; desligar a gravação antiga é decisão posterior, depois de 7 dias comparando os dois.
- A origem que existe hoje no campo 'Origem do Lead' (962553) é gravada por uma regra do Kommo na criação do lead, lendo a frase da primeira mensagem, sem prova (em 30 dias: 211 leads 'Google Ads' e nenhum com GCLID). Por isso o rastreio grava no campo novo 'Origem comprovada' e nunca no 962553.
- O campo de valor do lead mistura centavos e reais: venda acima de valor_max (150000) não é enviada e a saúde avisa.
- Credencial do Kommo já criada no n8n: DfhIaL8GcP4nm2cu. A credencial Supabase candidata (lpwidibzuryVXPca, 'vale-ambientes') ainda não foi provada pelo uso: a primeira rodada da saúde [RASTREIO 8] prova.
- Site valeambientes.com.br na Loja Integrada: falta confirmar se aceita script no <head> e como é o link do botão do WhatsApp.
- Google Cloud: projeto 'osimplify' (conta osimplify.agencia@gmail.com), Data Manager API ATIVADA em 10/10/2026, tela de consentimento em produção. Cliente OAuth 'Rastreio Vale Ambientes (n8n)' já criado, com o redirecionamento https://n8n.valeambientes.cloud/rest/oauth2-credential/callback: o ID e a chave secreta vêm por fora, para criar a credencial OAuth2 no editor do n8n. Conta de administrador do Google Ads vista: 654-432-3282 (MCC - Osimplify); falta confirmar se a conta da Vale está debaixo dela.
