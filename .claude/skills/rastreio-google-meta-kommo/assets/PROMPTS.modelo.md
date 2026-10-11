# Sequência de prompts: configurar o rastreio de {{SLUG}}

São 8 prompts, na ordem. Abra esta pasta no VS Code com o Claude Code e mande um de cada vez.

Como usar:
- Antes do prompt 1, as chaves já têm de estar nos arquivos `.env` (Parte 1 do `OPERACAO.md`).
- Cada resposta da IA termina com `FECHADA` ou `PAROU`. Só mande o próximo prompt depois de um `FECHADA`.
- Se vier `PAROU`, leia o motivo, resolva (quase sempre é chave faltando ou errada) e mande o prompt de retomada
  que está no fim deste arquivo.
- Mantenha a mesma conversa do começo ao fim. Se precisar abrir outra, mande o prompt 1 de novo antes de continuar:
  ele só lê, não muda nada.

Plataformas configuradas: Kommo, n8n, Supabase, Google Ads e Meta Ads.

---

## Prompt 1: contexto, ambiente e levantamento (só leitura)

```text
Você vai colocar no ar o rastreio do cliente {{SLUG}} neste projeto, ligando 5 plataformas: Kommo, n8n, Supabase,
Google Ads e Meta Ads. Eu vou te mandar um prompt por etapa.

Antes de tudo: leia o CLAUDE.md da raiz e o OPERACAO.md, e carregue a skill rastreio-google-meta-kommo. As skills
de apoio são n8n-pela-api, kommo-pela-api, meta-acessos e google-ads-conversoes.

Regras que valem para a conversa inteira:
- Atalho: R = python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py
- As chaves estão nos arquivos .env de clientes/{{SLUG}}/. Não leia nem imprima esses arquivos: os scripts leem
  sozinhos. Nunca escreva chave no chat, em workflow nem em arquivo versionado, e não faça commit.
- Todo comando que escreve em produção roda primeiro em seco (sem --aplicar ou --enviar). Se a saída em seco não
  tiver erro, aplique em seguida sem me perguntar: você tem o meu ok para as etapas que eu mandar.
- Se uma prova falhar, um comando der erro ou faltar chave, pare e me mostre a saída. Não contorne.
- No n8n, mexa só no que começa com [RASTREIO], mais o único nó que o ligar-meta acrescenta. Não altere nem
  desligue workflow, webhook, campo ou automação que já existia.
- Termine cada resposta com uma linha: "ETAPA N FECHADA" ou "PAROU: <motivo e o que eu preciso fazer>".

Agora a etapa 1, que é só leitura:
1. python --version (3.10+), node --version (20+) e npm install na raiz.
2. node .claude/skills/rastreio-google-meta-kommo/assets/banco/prova.mjs  -> última linha "PROVA_DESFEITA falhas=0"
3. node .claude/skills/rastreio-google-meta-kommo/assets/n8n/provar_js.mjs -> "NOS total=54 falhas=0"
4. R levantar {{SLUG}}

Me devolva: as 3 provas, os campos de UTM e GCLID do Kommo, os funis, os webhooks já cadastrados no Kommo e os
workflows do n8n com gatilho do WhatsApp.
```

## Prompt 2: credenciais das 5 plataformas

```text
Etapa 2: credenciais. Nada de workflow antes disto.

1. R plugar {{SLUG}}             (em seco: diz o que cria e o que falta)
2. R plugar {{SLUG}} --aplicar   (prova cada chave numa chamada real, cria as credenciais no n8n, grava os ids no config)

Fechada quando aparecem as duas linhas: "módulo 1 (origem no Kommo): credenciais prontas" e "módulo 2 (volta da
venda): credenciais prontas".

Se faltar chave, PARE e me diga, numa tabela: a chave, a plataforma, o arquivo onde ela vai e onde eu pego (está na
Parte 1 do OPERACAO.md). Não siga para a próxima etapa com chave faltando.

Me devolva: o nome e o id de cada credencial criada no n8n (Kommo, Supabase, Google, Meta) e o que cada prova de
chave respondeu, sem mostrar valor nenhum.
```

## Prompt 3: Kommo, workflows montados e banco no Supabase

```text
Etapa 3: campo no Kommo, montagem dos workflows e banco.

1. R campo-origem {{SLUG}}  e depois  --aplicar
   Prova: campo_origem_id e origem_enums preenchidos no clientes/{{SLUG}}/config.json.
2. R montar {{SLUG}}
   Prova: "MONTAGEM workflows=8 erros=0" e nenhum "sem credencial".
3. node .claude/skills/rastreio-google-meta-kommo/assets/n8n/provar_testar.mjs clientes/{{SLUG}}/n8n/rastreio python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py {{SLUG}}
   Prova: "PROVA_TESTAR falhas=0".
4. R banco {{SLUG}}  e depois  --aplicar
   Prova: a saúde responde e "armado: False".

Se o banco não aplicar por falta do SUPABASE_ACCESS_TOKEN, me entregue o caminho dos 2 arquivos SQL, na ordem, para
eu colar no SQL Editor do Supabase, e espere eu avisar para conferir com: select public.rastreio_saude();

Me devolva: o id do campo "Origem comprovada", as 3 linhas de prova e a resposta da saúde.
```

## Prompt 4: criar e ativar os workflows no n8n

```text
Etapa 4: n8n.

1. R criar {{SLUG}}  e depois  --aplicar
   Cria os 8 workflows [RASTREIO] desligados e grava os ids em rastreio.workflows no config.
2. Ative pela API do n8n (skill n8n-pela-api) os workflows 1, 2, 4, 5, 6, 7 e 8. O 3 é sub-workflow e não se ativa.
3. Releia cada um pela API e confira: active=true (menos o 3), e todo nó que fala com Kommo, Supabase, Google ou
   Meta tem credencial anexada e autenticação configurada.

Me devolva uma tabela com os 8: número, nome, id, ativo (sim ou não) e a URL do webhook de produção de quem tem.
```

## Prompt 5: ligar as pontas (Kommo, Meta e site)

```text
Etapa 5: ligar as pontas. Siga a seção 2 do clientes/{{SLUG}}/n8n/rastreio/LEIA-ME.md.

1. Kommo (skill kommo-pela-api): cadastre o webhook add_message para a URL de produção do workflow [2] e o webhook
   status_lead para a URL de produção do [5]. Antes de cadastrar, confirme que o workflow de destino está ativo.
   Prova: GET /api/v4/webhooks lista os dois, com o destino certo. Não toque nos webhooks que já existiam.
2. Meta: R ligar-meta {{SLUG}}  e depois  --aplicar
   Pendura o [3] no gatilho do WhatsApp que já existe. Antes de aplicar, me avise para eu fechar a aba desse
   workflow no editor do n8n. Nunca crie um segundo gatilho do WhatsApp.
   Prova: releitura do workflow do gatilho mostra a ligação nova e todos os nós antigos intactos.
3. Google: me entregue a linha <script> da etiqueta, pronta para colar no <head> do site (está no LEIA-ME dos
   workflows), e diga em uma frase onde eu colo.

Me devolva: os 2 webhooks do Kommo com id e destino, o nome do nó acrescentado no gatilho do WhatsApp e a linha
<script>.
```

## Prompt 6: provar a origem no Kommo, nos dois sentidos

```text
Etapa 6: prova da origem, com um lead de teste.

1. Crie um lead com [QA] no nome, no funil do config. Anote o id.
2. R testar {{SLUG}} sessao --enviar                                       -> anote o código devolvido
3. R testar {{SLUG}} mensagem --codigo <código> --lead <id> --enviar
4. Espere o workflow [4] rodar (até 5 minutos) e confira no Kommo: o lead ganhou GCLID, UTMs e
   "Origem comprovada = Google Ads".
5. Sentido contrário. Os dois abaixo têm de NÃO gravar nada no lead:
   R testar {{SLUG}} mensagem --lead <id> --sem-codigo --enviar
   R testar {{SLUG}} mensagem --codigo <código> --lead <id> --conta 1 --enviar
6. Cada comando imprime a consulta SQL da prova. Rode cada consulta e me mostre o resultado.

Só feche a etapa se o caso certo gravou e os dois casos errados não gravaram. Não apague o lead [QA] ainda: ele é
usado na próxima etapa.

Me devolva: o id do lead, o código da sessão, os campos gravados no Kommo e o resultado das consultas.
```

## Prompt 7: ensaio da conversão no Google Ads e na Meta Ads

```text
Etapa 7: conversão em modo de ensaio. Nada aqui vira conversão real.

1. R testar {{SLUG}} etapa --lead <id do lead [QA]> --etapa 0 --enviar
2. Rode a consulta SQL que o comando imprime e confira em rastreio_eventos: uma linha para o Google e uma para a
   Meta, as duas com estado ensaio_ok. Se alguma vier com erro, me mostre a resposta da plataforma inteira.
3. Me diga onde eu confiro com os meus olhos: na Meta, a aba "Testar eventos" do conjunto de dados.
4. Tire o lead [QA] do funil.
5. select public.rastreio_saude(); e me mostre a resposta.

Depois me devolva o resumo final da configuração:
- por etapa, Resultado, Prova e Não feito ou risco;
- os 8 workflows com id e se estão ativos;
- as credenciais do n8n, os webhooks do Kommo e a linha <script> do site;
- o que ainda depende de mim.
Atualize o clientes/{{SLUG}}/historico.md com uma linha por etapa fechada.

NÃO arme o envio real. Termine perguntando: "ensaio ok nas duas, posso armar?".
```

## Prompt 8: armar (só depois de olhar o ensaio)

Mande este só quando o ensaio do Google e o da Meta estiverem ok e a linha `<script>` já estiver no site. A partir
daqui, lead de verdade que muda de etapa vira conversão real nas contas de anúncio.

```text
Pode armar.

1. Me entregue o comando SQL para eu colar no SQL Editor do Supabase:
   update public.rastreio_config set google_armado = true, meta_armado = true where id = 1;
2. Depois que eu confirmar que rodei, confira com: select public.rastreio_saude();
3. Me diga como eu provo com um lead real: qual etapa do Kommo dispara, em quanto tempo a linha aparece em
   rastreio_eventos com estado enviado e onde a conversão aparece no Google Ads e no Gerenciador de Eventos da Meta.
4. Registre no clientes/{{SLUG}}/historico.md a data e a hora em que o envio foi armado.
```

---

## Prompt de retomada (quando a IA parou)

```text
Resolvi o que travou: <diga o que você fez, por exemplo "colei a chave META_DATASET_ID no rastreio.env">.
Retome a etapa <N> do ponto em que parou. Rode de novo em seco o comando que falhou, mostre a saída e, sem erro,
aplique e siga até fechar a etapa.
```

## Prompt de conferência (a qualquer momento, só leitura)

```text
Sem mudar nada, me diga o estado do rastreio de {{SLUG}} agora: credenciais no n8n, campo no Kommo, banco e saúde no
Supabase, os 8 workflows (id e ativo), webhooks do Kommo e se o envio de conversão está armado ou em ensaio. Para
cada item, diga como você conferiu.
```
