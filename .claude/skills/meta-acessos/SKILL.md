---
name: meta-acessos
description: "Acessos da Meta de ponta a ponta: app no Meta for Developers, usuário do sistema, token que não vence, ativos atribuídos, permissões e o conjunto de dados da Conversions API. Use quando: \"pega o token da Meta\", \"o token não enxerga a conta\", \"cria o dataset\", \"erro 100 ou 200 na Graph\". Não é: subir anúncio."
---

# Acessos da Meta: app, usuário do sistema, token e ativos

Tudo na Meta (anúncio, WhatsApp, Conversions API) depende da mesma corrente. Quando algo "não tem permissão",
o elo quebrado é um destes:

```
portfólio (Gerenciador de Negócios) ── dono do ── app (casos de uso)
      │                                            │
      └─ usuário do sistema ───────────────────────┘ app instalado nele
              │
              ├─ ativos ATRIBUÍDOS (conta de anúncio, página, conta do WhatsApp) com tarefas
              └─ token (gerado no app, com as permissões marcadas, validade "Nunca")
```

**Escopo não é acesso.** O token pode ter a permissão e não enxergar o ativo, porque o ativo não foi atribuído
ao usuário do sistema. A prova nunca é a lista de permissões sozinha: é o ativo responder.

## A prova de qualquer token

```bash
python .claude/skills/meta-acessos/scripts/meta_acesso.py --env clientes/<slug>/rastreio.env --var META_SYSTEM_USER_TOKEN
```

Mostra, sem imprimir o token: app, tipo (SYSTEM_USER, USER, PAGE), quando vence, permissões, contas de anúncio,
páginas, contas do WhatsApp e números. Confere cada id que o arquivo promete (`META_WABA_ID`, `AD_ACCOUNT_ID`,
`FB_PAGE_ID`...) contra o que o token enxerga. Saída `0` tudo certo, `3` token válido mas algum ativo não
responde, `2` token inválido.

## Passo a passo no painel

Os rótulos mudam com frequência; o fluxo vale. Senha, chave de acesso e código do celular são da pessoa dona do
login: a IA para e pede.

1. **Portfólio certo.** `business.facebook.com/settings`, confira no topo o portfólio do cliente. O id está em
   Informações da empresa. Precisa haver uma pessoa de verdade com controle total.
2. **App no portfólio do cliente.** `developers.facebook.com/apps`, Criar app. Casos de uso do objetivo:
   "Criar e gerenciar anúncios com a API de Marketing" e "Conectar-se com clientes pelo WhatsApp". Em Empresa,
   escolha o portfólio do cliente (sem isso o usuário do sistema dele não instala o app). Em Configurações,
   Básico: anote o ID do app e a chave secreta; preencha ícone, política de privacidade e exclusão de dados;
   publique ("Ao vivo"). Se o cliente já tem app nesse portfólio, reaproveite.
3. **Usuário do sistema.** Configurações do portfólio, Usuários, Usuários do sistema, Adicionar. Papel
   Administrador. Com acesso padrão, o portfólio comporta 1 usuário do sistema comum e 1 administrador: se já
   existe um, reaproveite.
4. **Atribuir ativos** ao usuário do sistema: o app (Gerenciar app), a conta de anúncio (Gerenciar campanhas e
   Ver desempenho), a página e a conta do WhatsApp (Controle total).
5. **Gerar token** no usuário do sistema: escolha o app, validade **Nunca**, marque só as permissões do
   objetivo. A tela só lista o que o app tem: permissão que não aparece é caso de uso que falta no app. Copie na
   hora direto para o `.env`; a Meta não mostra de novo.
6. **Provar** com o `meta_acesso.py` e uma chamada real do objetivo.

## Permissões por objetivo

| Objetivo | Permissões |
|---|---|
| Ler campanha, gasto e resultado | `ads_read` |
| Criar e editar anúncio; público, pixel e conjunto de dados | `ads_management` |
| Listar o portfólio e atribuir ativo | `business_management` |
| Conta do WhatsApp, números, modelos | `whatsapp_business_management` |
| Mandar e receber mensagem | `whatsapp_business_messaging` |
| **Conversão de conversa do WhatsApp (o rastreio)** | `whatsapp_business_manage_events` + `whatsapp_business_management` |

Peça só o que o objetivo usa. Token não ganha permissão depois de gerado: é sempre um token novo.

## Conversions API para conversa do WhatsApp

É o que o workflow [RASTREIO 7] usa. Conferido na documentação em 10/10/2026.

- O conjunto de dados é ligado à conta do WhatsApp: `GET /{WABA_ID}/dataset` lê o que existe e
  `POST /{WABA_ID}/dataset` cria. O id que volta é o `META_DATASET_ID`.
- O token tem de ser de usuário do sistema do MESMO portfólio dono do conjunto de dados. Token de outro
  portfólio volta erro 100.
- App, conta do WhatsApp e conjunto de dados no mesmo portfólio dispensam acesso avançado.
- Envio: `POST /{DATASET_ID}/events` com `action_source: "business_messaging"`,
  `messaging_channel: "whatsapp"` e, em `user_data`, o `ctwa_clid` e o `whatsapp_business_account_id`.
- Nomes de evento aceitos: Purchase, LeadSubmitted, InitiateCheckout, AddToCart, ViewContent, QualifiedLead,
  OrderCreated e os demais de pedido. `QualifiedLead` é aceito.
- **A Meta não deduplica evento de business messaging.** Mandar duas vezes conta duas vezes.
- O `ctwa_clid` vem no `referral` da primeira mensagem de quem clicou no anúncio. Anúncio no Status do WhatsApp
  não manda.
- Para ensaiar sem sujar o resultado: `test_event_code` (Gerenciador de Eventos, o conjunto de dados, aba
  Testar eventos). O evento aparece só nessa aba.

```bash
set -a; . clientes/<slug>/rastreio.env; set +a
curl -s "https://graph.facebook.com/v21.0/$META_WABA_ID/dataset" -H "Authorization: Bearer $META_SYSTEM_USER_TOKEN"
```

## Por código de erro

| Código | O que costuma ser | Saída |
|---|---|---|
| 190 | token vencido, revogado ou colado errado (aspas, quebra de linha) | conferir o `.env`; gerar novo |
| 200 | falta a permissão **ou** o ativo não está atribuído ao usuário do sistema | `meta_acesso.py`: se a permissão está lá, é atribuição |
| 100 | id errado, campo que não existe na versão, ativo que o token não enxerga, ou token de outro portfólio | conferir id e atribuição |
| 10 | permissão não liberada ao app | somar o caso de uso; ver Análise do App |
| 3 | o app não tem a capacidade | somar o caso de uso no app |
| 4, 17, 613, 80004 | limite de chamadas | espaçar |
| 368 | bloqueio temporário por política | parar; ver Qualidade da conta |
| 131042 | WhatsApp: pagamento do portfólio; o envio volta "aceito" e a mensagem morre | método de pagamento |

## Regras

- Token e chave secreta do app vão direto para o `.env`. Nunca para o chat, para print ou para nó do n8n.
- Não mexa na assinatura de webhook do app nem da conta do WhatsApp: trocar o callback derruba a entrada de
  mensagens de quem já usa o número.
- Trocar token: gerar o novo, trocar em todos os lugares que guardam cópia (o `.env` e a credencial do n8n),
  provar, e só então revogar o antigo. Em vazamento, revogar primeiro.
