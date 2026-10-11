---
name: n8n-pela-api
description: "Operar o n8n pela API pública: ler, criar, alterar, ativar workflow, credencial e execução, sem quebrar o que roda. Use quando: \"ativa o workflow\", \"muda esse nó\", \"por que a execução ficou verde e não fez nada\", \"cria a credencial\". Não é: desenhar automação do zero no editor."
---

# n8n pela API

Base: `N8N_BASE_URL` e `N8N_API_KEY` em `clientes/<slug>/n8n/.env`. Cabeçalho `X-N8N-API-KEY`. Mande sempre um
`User-Agent`: instância atrás do Cloudflare recusa `POST` e `PUT` sem ele (403, erro 1010).

```bash
set -a; . clientes/<slug>/n8n/.env; set +a
curl -s "$N8N_BASE_URL/api/v1/workflows?limit=100" -H "X-N8N-API-KEY: $N8N_API_KEY" -A rastreio
```

## Chamadas que resolvem quase tudo

| Quero | Chamada |
|---|---|
| Listar workflows (paginar por `nextCursor`) | `GET /api/v1/workflows?limit=100&cursor=` |
| Ler um workflow inteiro | `GET /api/v1/workflows/{id}` |
| Criar (nasce desligado) | `POST /api/v1/workflows` com `{name, nodes, connections, settings}` |
| Alterar | `GET`, mexer só no nó, `PUT /api/v1/workflows/{id}` com `{name, nodes, connections, settings}` |
| Ativar / desativar | `POST /api/v1/workflows/{id}/activate` · `/deactivate` |
| Listar credenciais (só id, nome e tipo) | `GET /api/v1/credentials?limit=100` |
| Campos de um tipo de credencial | `GET /api/v1/credentials/schema/{tipo}` |
| Criar credencial | `POST /api/v1/credentials` com `{name, type, data}` |
| Execuções de um workflow | `GET /api/v1/executions?workflowId={id}&limit=5` |
| Uma execução com os dados | `GET /api/v1/executions/{id}?includeData=true` |

A API nunca devolve o valor de uma credencial. Não dá para "conferir a chave" lendo: a prova é um workflow rodar
com ela e responder 200.

## Mudança cirúrgica: GET, mexer no nó, PUT

1. `GET` do workflow e **guarde uma cópia** em arquivo antes de mexer (é o seu desfazer).
2. Altere só o objeto do nó. Não reconstrua o nó: editar preserva a credencial e o `id`.
3. No `PUT`, mande apenas `name`, `nodes`, `connections` e `settings`. Em `settings` só passam
   `executionOrder`, `timezone`, `errorWorkflow`, `executionTimeout`, `saveExecutionProgress`,
   `saveManualExecutions`, `saveDataErrorExecution`, `saveDataSuccessExecution`; qualquer outra chave volta 400.
   Tire `rewireOutputLogTo` dos nós.
4. **Releia com `GET`** e confira o que mudou. O retorno do `PUT` não prova o que ficou gravado.
5. Feche a aba do workflow no editor antes: aba aberta salva a versão antiga por cima.
6. Em instância com versões, o gatilho roda a versão PUBLICADA: compare `versionId` e `activeVersionId` depois
   do `PUT`. Se forem diferentes, falta publicar no editor.

## As falhas que ficam verdes

Nenhuma dá erro. São a causa mais comum de "está funcionando" que não está.

- **Depois de um nó HTTP, `$json` é a resposta da API**, não o seu item. Use `$('Nó').item.json.campo`.
- **`$('Nó').all()[$itemIndex]` desalinha depois de um IF**: o índice é o do subconjunto que passou.
- **Credencial anexada não é credencial usada.** Nó HTTP com `credentials` e sem o par
  `"authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"` manda a chamada sem
  cabeçalho e a API responde 401. Assinatura: `authentication: "none"` com `credentials` preenchido.
- **`onError: continueRegularOutput` transforma erro de credencial em item normal.** Se o nó de leitura é
  obrigatório, o Code seguinte tem de estourar: `if (r.error) throw new Error(...)`.
- **Resposta em texto (`responseFormat: text`) com `neverError`**: quem espera `_embedded` recebe `[]` sem
  erro. Leia sempre por um Code que normaliza e estoura em 401 e 403.
- **Nó que pode devolver 0 itens sem `alwaysOutputData`** mata a cadeia em silêncio.
- **Nó `disabled` passa a entrada adiante** e a expressão que o cita vira `undefined`.
- **Workflow verde com contador em zero é suspeito**, não "sem movimento": abra o corpo cru da execução.
- **Retry de execução reusa a saída em cache** dos nós, não o código novo. Só execução nova prova o conserto.

## Regras de construção

- Todo nó que fala com API de terceiro com limite (Kommo, Meta, Google): `retryOnFail: true`, `maxTries: 4`,
  `waitBetweenTries: 3000`. Sem isso, um 429 derruba a execução inteira.
- Workflow que roda por relógio declara `settings.timezone` (ex.: `America/Sao_Paulo`).
- Webhook que só recebe: `responseMode: onReceived` (responde 200 na hora; quem chama não espera o resto).
- Webhook de produção (`/webhook/<caminho>`) só responde com o workflow ATIVO. `/webhook-test/<caminho>` só
  com o editor em "Listen for test event".
- Corpo `application/x-www-form-urlencoded` chega com chaves planas: `body['leads[status][0][id]']`.
- `settings.errorWorkflow` aponta para o workflow de alerta. Ele só dispara em execução de PRODUÇÃO que quebra;
  o que encerra limpo é invisível para ele.
- Dois gatilhos do WhatsApp do mesmo app da Meta disputam o callback: o último publicado leva tudo. Para somar
  lógica à entrada do WhatsApp, use um nó Execute Workflow saindo do gatilho que já existe.
- JS de nó Code gerado por script: valide com `node --check` antes de subir. Um `'\n'` mal escapado vira quebra
  de linha dentro de aspas e o nó morre com "Invalid or unexpected token".

## Cuidados com a instância

- Não leia execuções em massa com `includeData=true`: derruba instância pequena. Peça 1 a 5 por vez.
- A chave da API enxerga todos os workflows e credenciais da instância. Toque só no que é do seu projeto.
- Nunca cole token em nó. Token literal em `jsCode` ou em cabeçalho fica visível para quem abre o workflow e
  vaza em qualquer exportação.
