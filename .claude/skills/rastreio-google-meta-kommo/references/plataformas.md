# O que vai para o Google e para a Meta, campo a campo

Montado pelos nós `google_monta.js` e `meta_monta.js` a partir do lote que o banco entrega
(`rastreio_lote`). O telefone e o e-mail chegam ao n8n JÁ em SHA-256: o texto cru nunca sai do banco
no caminho de envio.

Itens marcados **conferir na doc** foram escritos pelo que se sabia em 10/10/2026 e não foram testados
contra a API real. O ensaio (`validateOnly` / `test_event_code`) é onde se confirmam, antes de armar.

## Google: Data Manager API

`POST https://datamanager.googleapis.com/v1/events:ingest`, credencial OAuth2 com escopo
`https://www.googleapis.com/auth/datamanager`. Uma requisição por ação de conversão.

```json
{
  "destinations": [{
    "operatingAccount": { "accountType": "GOOGLE_ADS", "accountId": "1234567890" },
    "loginAccount":     { "accountType": "GOOGLE_ADS", "accountId": "<MCC, se houver>" },
    "productDestinationId": "<id da ação Importar de cliques>"
  }],
  "encoding": "HEX",
  "validateOnly": true,
  "events": [{
    "transactionId": "<lead_id>:<evento>",
    "eventTimestamp": "2026-10-10T12:00:00.000Z",
    "eventSource": "WEB",
    "adIdentifiers": { "gclid": "..." },
    "userData": { "userIdentifiers": [{ "phoneNumber": "<sha256 hex de +55...>" }, { "emailAddress": "<sha256>" }] },
    "conversionValue": 6800, "currency": "BRL",
    "consent": { "adUserData": "CONSENT_GRANTED", "adPersonalization": "CONSENT_GRANTED" }
  }]
}
```

- `gclid` vence `gbraid`, que vence `wbraid`: vai um só.
- Sem valor, não vai `currency`. Sem `google_consentimento` no config, não vai `consent` (não se inventa consentimento).
- `transactionId` = `event_id` da fila: reenvio do mesmo evento não conta duas vezes.
- Desde 15/06/2026 o `UploadClickConversions` da Google Ads API recusa conta nova; desde 09/09/2026 não há developer token.
- Conferido na doc em 10/10/2026: `productDestinationId` = id da ação de conversão (tipo `UPLOAD_CLICKS`,
  "Importar > Acompanhar conversões de cliques"); `eventSource: WEB` vale; telefone em E.164 COM `+` antes do
  hash; `encoding: HEX`; até 2.000 eventos por requisição; enviar em até 24 h do clique rende mais; nos 14
  primeiros dias de uma ação nova o valor não pode ser atualizado; `transactionId` deduplica dentro da ação.
- Acesso: conta de serviço do Google Cloud adicionada como usuário na conta do Google Ads evita o OAuth em
  "Testando", que morre em 7 dias. No n8n isso é a credencial "Google Service Account" (o `rastreio.py` ainda
  monta como `oAuth2Api`: ajustar na fase de credenciais se a escolha for conta de serviço).
- **Conferir no ensaio:** nome exato de `productDestinationId` para Google Ads, `eventSource` aceito (`WEB` x outro para conversão vinda de CRM), limite de eventos por requisição, e se `encoding: HEX` vale para o hash que o banco gera (hex minúsculo).

## Meta: Conversions API

`POST https://graph.facebook.com/<versão>/<dataset_id>/events`, credencial `httpHeaderAuth`
(`Authorization: Bearer <token do sistema>`). Até 1000 eventos por chamada.

```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1760097600,
    "event_id": "<lead_id>:venda",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": { "ph": ["<sha256 dos dígitos, sem +>"], "ctwa_clid": "...", "whatsapp_business_account_id": "<WABA>" },
    "custom_data": { "value": 6800, "currency": "BRL" }
  }],
  "test_event_code": "TEST12345"
}
```

- `business_messaging` só quando o lead veio de clique para WhatsApp (tem `ctwa_clid`) **e a conta do WhatsApp
  (WABA) está no config**. O resto vai `system_generated` com telefone em hash e `fbc`/`fbp` se houver.
- **Medido em 11/10/2026 contra a API real, com `test_event_code`:**
  - `system_generated` com `fbc` e `fbp`, ou só com telefone em hash, é aceito: HTTP 200 `events_received`.
    `Purchase` com `custom_data.value` também.
  - `business_messaging` sem `whatsapp_business_account_id` nem `page_id` é recusado: HTTP 400, código 100,
    subcode 2804116. Por isso o banco só monta evento de mensagem com a WABA no config; sem ela o lead de
    anúncio de WhatsApp sai como `system_generated` pelo telefone, e sem telefone não sai (`sem_waba_da_meta`).
  - O token gerado no Gerenciador de Eventos ("Gerar token de acesso") ENVIA evento e não LÊ o dataset:
    `GET /<dataset>` devolve `(#100) Missing Permission`. A prova do token é um envio com `data: []`: a resposta
    `param data must be non-empty` quer dizer token e dataset aceitos; subcode 33 quer dizer sem acesso ao dataset.
  - O código de teste fica em Gerenciador de Eventos, o dataset, Eventos de teste, canal Site, "eventos do seu
    servidor". A aba só mostra o que chega enquanto está aberta.
- `test_event_code` só com a Meta desarmada. Desarmada e sem código: o banco nem entrega lote.
- `event_id` igual ao do pixel, se o site também mandar o evento: a Meta deduplica.
- Nomes aceitos para business messaging (doc da Meta, conferida em 10/10/2026): Purchase, LeadSubmitted,
  InitiateCheckout, AddToCart, ViewContent, OrderCreated, OrderShipped, OrderDelivered, OrderCanceled,
  OrderReturned, CartAbandoned, QualifiedLead, RatingProvided, ReviewProvided. `QualifiedLead` é aceito.
- **A Meta NÃO deduplica eventos de business messaging**: quem garante "uma vez só" é a fila
  (`unique (plataforma, event_id)`). Nunca apagar linha da fila para reenviar.
- Pré-requisitos: app com `whatsapp_business_management` e `whatsapp_business_manage_events`; dataset criado
  ou lido em `/{WABA_ID}/dataset`; token de usuário do sistema do MESMO Business Manager do dataset (token de
  outro BM volta erro 100). App, WABA e dataset no mesmo BM dispensam acesso avançado (desenvolvedor direto).
- `ctwa_clid` some em anúncio de Status do WhatsApp: sem ele, o evento vai `system_generated`.
- **Ainda não medido:** `business_messaging` COM a WABA (a bancada não tem WhatsApp ligado a dataset). Conferir na
  doc se o dataset precisa estar ligado à WABA, a versão da Graph em uso (`meta_versao`, padrão `v21.0`), e se `whatsapp_business_account_id` vai em `user_data` ou no nível do evento.

## Respostas e estados da fila

| Resposta | Estado | O que acontece |
|---|---|---|
| 2xx armado | `enviado` | fim |
| 2xx desarmado | `ensaio_ok` | volta para `pendente` com `rastreio_rearmar('<plataforma>')` quando armar |
| 4xx (fora 401/403/429) | `recusado` | a saúde avisa; corrigir o dado |
| 429, 5xx, rede | `erro` | tenta de novo no próximo lote |
| 401/403 | o workflow ESTOURA | o errorWorkflow avisa: credencial |
| `enviando` há mais de 30 min | volta ao lote | execução que caiu no meio não perde evento |
