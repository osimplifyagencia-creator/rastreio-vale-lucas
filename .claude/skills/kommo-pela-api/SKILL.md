---
name: kommo-pela-api
description: "Operar o Kommo pela API REST v4: leads, contatos, campos personalizados, funis, webhooks e eventos. Use quando: \"cria o campo no Kommo\", \"cadastra o webhook\", \"quem gravou esse campo\", \"busca o lead pelo telefone\". Não é: montar Salesbot ou regra pela tela."
---

# Kommo pela API (v4)

Base: `https://<subdominio>.kommo.com/api/v4`. Token de longa duração em `clientes/<slug>/.env` (`KOMMO_TOKEN`),
cabeçalho `Authorization: Bearer <token>`. O subdomínio fica em `DOMAIN` no mesmo arquivo.

```bash
set -a; . clientes/<slug>/.env; set +a
API="https://$DOMAIN/api/v4"
curl -s "$API/account" -H "Authorization: Bearer $KOMMO_TOKEN"      # prova do token: 200 e o id da conta
```

## Chamadas mais usadas

| Quero | Chamada |
|---|---|
| Provar o token e ver a conta | `GET /account` |
| Funis e etapas | `GET /leads/pipelines` (etapa ganha = `142`, perdida = `143`, em todo funil) |
| Campos do lead | `GET /leads/custom_fields?limit=250&page=1` |
| Criar campo | `POST /leads/custom_fields` com `[{name, type, enums: [{value, sort}]}]` |
| Ler um lead com contatos | `GET /leads/{id}?with=contacts` |
| Buscar por telefone, nome ou texto | `GET /contacts?query=<8 últimos dígitos>&with=leads` |
| Gravar campo no lead | `PATCH /leads/{id}` com `{custom_fields_values: [{field_id, values: [{value}]}]}` |
| Campo de lista | mesmo `PATCH`, com `values: [{enum_id}]` |
| Quem mexeu no lead | `GET /events?filter[entity]=lead&filter[entity_id]={id}` (`created_by: 0` = robô ou integração) |
| Webhooks cadastrados | `GET /webhooks` |
| Cadastrar webhook | `POST /webhooks` com `{destination, settings: ["add_message"]}` |
| Remover webhook | `DELETE /webhooks` com `{destination}` |

## O que só se descobre apanhando

- **204 sem corpo** quando a busca não acha nada. Não é erro: trate corpo vazio antes de fazer `JSON.parse`.
- **Limite de 7 requisições por segundo** por conta. Rajada devolve 429; insistir rende 403 e bloqueio do IP.
  Em lote, 5 por segundo com pausa de 1 segundo.
- **A resposta vem como `application/hal+json`**: alguns clientes HTTP não fazem o parse sozinhos e entregam o
  corpo como texto.
- **Webhook chega em `application/x-www-form-urlencoded` com chaves planas**:
  `message[add][0][text]`, `message[add][0][entity_id]`, `leads[status][0][id]`, `leads[status][0][status_id]`,
  `account[id]`. Confira `account[id]` contra a conta esperada: o endereço do webhook é público.
- **O webhook tem de responder em até 2 segundos.** Mais de 100 respostas ruins em 2 horas e o Kommo desliga o
  webhook sem avisar. Por isso o destino responde 200 na hora e trabalha depois, e só se cadastra o webhook com o
  destino já no ar.
- **Cadastrar webhook pela API pede plano Avançado ou superior.** Em plano menor, cadastre pela tela:
  Configurações, Integrações, Webhooks.
- **Telefone: a busca casa pelos últimos dígitos.** Confira o DDD no resultado antes de aceitar; os 8 finais
  iguais com DDD diferente são pessoas diferentes.
- **Antes de escrever num campo, veja quem já escreve nele** (`/events` do lead). Regra de automação do Kommo,
  Salesbot e integração gravam com `created_by: 0`, muitas vezes no mesmo segundo em que o lead nasce.
- **Só grave em campo vazio** quando o dado é de origem (UTM, GCLID): primeiro toque vence e o histórico do
  cliente não é apagado.
- **Campo de lista só aceita `enum_id` que existe.** Guarde os ids das opções junto do id do campo.
- **Erro 402** em gravação: conta com pagamento pendente. A leitura segue funcionando, o que engana.
- **Token de longa duração não renova**: quando vence, gera-se outro na integração privada e troca-se em todo
  lugar que guarda cópia (o `.env` e a credencial do n8n).
- A CAPI nativa do Kommo para a Meta só manda Lead e Purchase. Evento intermediário (lead qualificado,
  orçamento) precisa de envio próprio.

## Teste que nasce marcado

Lead de teste tem `[QA]` no nome desde a criação e sai do funil no fim. Nunca use lead de cliente real para
provar gravação de campo.
