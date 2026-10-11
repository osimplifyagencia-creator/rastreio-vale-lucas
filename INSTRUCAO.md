# Rastreio de valeambientes: o que fazer quando o projeto chegar

1. Baixe o zip e descompacte, ou clone o repositório, numa pasta sua.
2. Abra essa pasta no VS Code (Arquivo, Abrir pasta) com a extensão do Claude Code.
3. No terminal do VS Code, na raiz da pasta, rode `npm install` uma vez. Precisa de Python 3.10+ e Node 20+.
4. **Só se você clonou pelo git:** os arquivos de chave não vêm no clone, de propósito. Em
   `clientes/valeambientes/` há três modelos terminados em `.exemplo` (um na pasta, um em `n8n/` e o `rastreio.env.exemplo`).
   Faça uma cópia de cada um, no mesmo lugar, tirando o `.exemplo` do nome.
5. Abra o `OPERACAO.md`. A Parte 1 lista cada chave, onde pegar e em qual arquivo colar. Cole só o valor depois do `=`.
   Nunca cole chave no chat da IA e nunca faça commit de chave.
6. Com as chaves nos arquivos, abra o `PROMPTS.md` e mande os prompts na ordem, um de cada vez, esperando o
   `FECHADA` de cada etapa. Quem preferir tudo de uma vez usa a Parte 2 do `OPERACAO.md` como mensagem única.
7. A IA roda cada passo em seco, confere e aplica sozinha: credenciais, banco, campo, os 8 workflows ativados,
   webhooks e a prova com um lead `[QA]`. Ela só para se uma prova falhar ou faltar chave.
8. No fim ela devolve um resumo (Resultado, Prova, Não feito ou risco) e pergunta se pode armar. Leia o ensaio do
   Google Ads e da Meta Ads antes de responder "pode armar": é aí que a conversão passa a ser real.

Plataformas ligadas: Kommo, n8n, Supabase, Google Ads e Meta Ads. As chaves das 5 estão na Parte 1.

Cuidados:
- O projeto tem o endereço dos webhooks. Não repasse em grupo.
- A chave do n8n enxerga outros workflows da instância. Mexa só no que começa com `[RASTREIO]`.
- Até o "pode armar", o envio de conversão fica em modo de ensaio: nada chega de verdade nas contas de anúncio.
