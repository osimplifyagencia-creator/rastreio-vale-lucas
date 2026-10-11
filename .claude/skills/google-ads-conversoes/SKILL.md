---
name: google-ads-conversoes
description: "Conversão offline do Google Ads: ação \"Importar de cliques\", gclid na URL, credencial do Google no n8n e envio pela Data Manager API. Use quando: \"cria a ação de conversão\", \"pega o id da conta do Google Ads\", \"a conversão não aparece\", \"credencial do Google no n8n\". Não é: criar ou otimizar campanha."
---

# Google Ads: conversão que volta do CRM

O Google só otimiza para venda se a venda voltar ligada ao clique. O clique é o `gclid` (ou `gbraid` e `wbraid`
no iPhone). O workflow [RASTREIO 6] devolve a conversão pela Data Manager API. Os fatos da API foram conferidos
na documentação em 10/10/2026; o que não foi provado contra a API real está marcado "conferir no ensaio". Os
nomes de tela do Google Ads mudam com frequência: o fluxo vale, o rótulo do botão pode ter mudado.

## O que coletar na conta

| Dado | Onde | Vai para |
|---|---|---|
| Conta que anuncia | canto superior direito do Google Ads, 10 dígitos (`123-456-7890`) | `GOOGLE_ADS_CONTA` |
| Conta de administrador (MCC) | o número do topo quando se entra pela conta de administrador | `GOOGLE_ADS_CONTA_LOGIN` |
| Id de cada ação de conversão | Metas, Conversões, a ação; o id está na URL (`ctId=`) | `GOOGLE_ACAO_<EVENTO>` |

## Criar a ação de conversão

1. Metas, Conversões, Resumo, **Nova ação de conversão**.
2. **Importar**, depois **CRMs, arquivos ou outras fontes de dados**, **Acompanhar conversões de cliques**.
   Na API esse tipo é `UPLOAD_CLICKS`. Outro tipo não aceita o envio.
3. Uma ação por evento do funil: lead qualificado, orçamento enviado, venda. Nome claro, com o cliente.
4. Categoria: "Lead qualificado", "Lead convertido" ou "Compra". Valor: "usar valores diferentes" na venda.
5. Contagem: "Uma" para lead, "Todas" para compra. Janela de conversão de clique: 90 dias se a venda demora.
6. Marque como principal só a ação que deve guiar o lance. As outras ficam secundárias (observação).

Nos 14 primeiros dias de uma ação nova o valor de uma conversão enviada não pode ser atualizado.

## O gclid precisa chegar na página

- **Codificação automática ligada:** Administrador, Configurações da conta, Codificação automática. Sem ela não
  existe `gclid`.
- **Sufixo do URL final** (conta ou campanha), para as UTMs irem junto:
  `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}`
- A página de destino não pode perder os parâmetros em redirecionamento. Teste abrindo a página com
  `?gclid=TESTE` e vendo se o parâmetro continua na barra de endereço.
- **Anúncio com recurso de mensagem (WhatsApp direto do anúncio, sem passar pela página) não entrega `gclid`.**
  Para esses cliques não há ponte: o caminho é anúncio, página, botão do WhatsApp.

## Credencial no n8n

O nó `envia` do [RASTREIO 6] usa credencial OAuth2 genérica. Ela pede um clique de consentimento, por isso é
criada no editor, não pela API.

1. Google Cloud Console: um projeto, **Data Manager API** ativada.
2. Tela de consentimento OAuth em **produção**. Em "Testando", o token de atualização morre em 7 dias e o
   envio para sem aviso.
3. Credenciais, Criar ID do cliente OAuth, tipo Aplicativo da Web. URI de redirecionamento:
   `https://<host do n8n>/rest/oauth2-credential/callback`.
4. No n8n: Credentials, New, **OAuth2 API**. Grant type Authorization Code;
   Authorization URL `https://accounts.google.com/o/oauth2/v2/auth`;
   Access Token URL `https://oauth2.googleapis.com/token`; Client ID e Secret do passo 3;
   Scope `https://www.googleapis.com/auth/datamanager`;
   Auth URI Query Parameters `access_type=offline&prompt=consent`; Authentication: Body.
5. **Connect** com um usuário que tenha acesso à conta do Google Ads (padrão ou administrador).
6. Copie o id da credencial (está na URL) para `N8N_CRED_GOOGLE_ID` no `rastreio.env`.

Alternativa sem prazo de 7 dias: conta de serviço do Google Cloud adicionada como usuário na conta do Google
Ads. No n8n é a credencial "Google Service Account". O `rastreio.py` monta o nó como OAuth2: se a escolha for
conta de serviço, troque a credencial do nó `envia` no editor depois de criar o workflow.

## O envio (Data Manager API)

`POST https://datamanager.googleapis.com/v1/events:ingest`, uma requisição por ação de conversão.

- `destinations[].operatingAccount.accountId` = a conta que anuncia; `loginAccount` = o MCC, se houver;
  `productDestinationId` = o id da ação de conversão.
- `adIdentifiers`: vai um só, na ordem `gclid`, `gbraid`, `wbraid`.
- `userData`: telefone em E.164 COM `+` e e-mail, os dois em SHA-256 hexadecimal minúsculo; `encoding: "HEX"`.
- `transactionId` deduplica dentro da ação: reenviar o mesmo evento não conta duas vezes.
- Até 2.000 eventos por requisição. Enviar em até 24 horas do clique rende mais.
- `validateOnly: true` valida sem gravar: é o ensaio. O workflow manda assim enquanto `google_armado` for falso.
- `consent` só vai se o cliente declarou o consentimento (`google.consentimento` no config). Não se inventa.
- **Medido em 11/10/2026 contra a API real, com `validateOnly`:**
  - `eventSource` é obrigatório (`REQUIRED_FIELD_MISSING` sem ele) e `WEB` é aceito.
  - Evento com `gclid` (com `userData` junto e `consent` declarado) valida: HTTP 200 com `requestId`.
  - Evento **só com telefone ou e-mail, sem `gclid`**, é recusado com
    `DESTINATION_ACCOUNT_NOT_ENABLED_ENHANCED_CONVERSIONS_FOR_LEADS` se a conta não tiver "conversões otimizadas para
    leads" ligadas (Metas, Configurações). A recusa derruba a requisição inteira: ou liga o recurso na conta, ou manda
    ao Google só evento com identificador de clique.
  - Ação inexistente: 404 `INVALID_CONVERSION_ACTION_ID`. Conta sem acesso: 403 `PERMISSION_DENIED` em `destinations[0]`.
  - O erro vem em `error.details[]`, no item `google.rpc.BadRequest`, campo `fieldViolations[].reason`.
- **Conferir ainda:** evento com `gclid` e sem `consent`.

## Depois de armar

- A conversão leva algumas horas para aparecer. Confira em Metas, Conversões, a ação, aba Diagnóstico.
- "Clique não encontrado" quase sempre é `gclid` de outra conta, clique com mais de 90 dias ou conta errada em
  `GOOGLE_ADS_CONTA`.
- Duas fontes mandando a mesma venda (este envio e a tag do site, ou outro sistema) contam em dobro: um
  remetente por evento.
