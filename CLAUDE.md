# Rastreio Google e Meta até o Kommo: valeambientes

Projeto pronto para operar o rastreio de origem do cliente `valeambientes`: saber quem veio do Google Ads e da Meta,
gravar isso no lead do Kommo e, depois, devolver a venda para as duas plataformas. Tudo roda no n8n e no Supabase
do cliente. O roteiro da operação está em [OPERACAO.md](OPERACAO.md).

## Como trabalhar aqui

1. **Skill primeiro.** Antes de mexer em qualquer coisa, carregue a skill da área (pasta `.claude/skills/`):
   `rastreio-google-meta-kommo` (a operação inteira), `n8n-pela-api`, `kommo-pela-api`, `meta-acessos`,
   `google-ads-conversoes`.
2. **Seco antes de aplicar.** Todo comando do `rastreio.py` que escreve em produção mostra o que faria quando
   roda sem `--aplicar` (ou sem `--enviar`). Rode em seco, mostre a saída para quem está operando e só aplique
   com o ok dessa pessoa, dado na conversa.
3. **Provar nos dois sentidos.** O caso certo passa e o errado é barrado. Vale o efeito (linha no banco, campo no
   lead do Kommo), nunca só a execução verde do n8n.
4. **Relatar assim:** Resultado, Prova (o que foi medido e onde conferir), Não feito ou risco, Próximo passo.
   Sem prova, diga "não provado".

## Segredos

- Chave nenhuma vai para o chat, para print, para nó do n8n ou para arquivo `.md` e `.json`. Os valores moram só
  nos três arquivos `.env` de `clientes/valeambientes/` (fora do git) e nas credenciais do n8n.
- Não leia nem imprima o conteúdo de `.env`. Os scripts leem sozinhos e nunca mostram valor.
- O caminho de cada webhook (em `config.json`, bloco `rastreio.webhooks`) é o segredo dele: não colar em grupo.

## Regras que não se negociam

- **Nunca criar um segundo gatilho do WhatsApp** no n8n: ele re-inscreve o callback do app da Meta e rouba a
  entrada de mensagens do workflow que já roda. A Meta entra como sub-workflow, pelo comando `ligar-meta`.
- **O n8n do cliente tem workflows que não são deste projeto.** Só toque nos workflows `[RASTREIO N]`, na
  credencial `[RASTREIO] ...` e, pelo `ligar-meta`, no único nó novo do workflow do gatilho. Não liste, não abra e
  não altere o resto.
- **Primeiro toque vence:** o rastreio só grava em campo VAZIO do lead. Não troque isso.
- **Armar o envio de conversão** (`google_armado`, `meta_armado`) é decisão do dono do projeto, tomada à parte.
  Desarmado, o Google roda com `validateOnly` e a Meta só com `test_event_code`.
- **Um remetente por plataforma.** Se outro sistema já manda conversão do Kommo para a Meta ou para o Google,
  pare e avise antes de armar: dois remetentes contam a venda em dobro.
- Teste nasce marcado: lead de teste tem `[QA]` no nome e sai do funil no fim.

## Onde as coisas estão

```
OPERACAO.md                          o que coletar e o roteiro para a IA
clientes/valeambientes/config.json        fonte da verdade (bloco rastreio): ids, webhooks, credenciais do n8n
clientes/valeambientes/.env               KOMMO_TOKEN
clientes/valeambientes/n8n/.env           N8N_API_KEY
clientes/valeambientes/rastreio.env       Supabase, Google Ads e Meta
clientes/valeambientes/n8n/rastreio/      os 8 workflows (1-sessao.json a 8-saude.json) e o LEIA-ME.md deles
clientes/valeambientes/supabase/          rastreio_002_config.sql (config do banco, gerada)
.claude/skills/                      as 5 skills
.mcp.json                            MCP do n8n do cliente (só falta a chave)
```

Atalho usado nos roteiros: `R` = `python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py`.
