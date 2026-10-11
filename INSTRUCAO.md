# Rastreio de valeambientes: o que fazer quando o projeto chegar

1. Baixe o zip e descompacte, ou clone o repositório, numa pasta sua.
2. Abra essa pasta no VS Code (Arquivo, Abrir pasta) com a extensão do Claude Code.
3. No terminal do VS Code, na raiz da pasta, rode `npm install` uma vez. Precisa de Python 3.10+ e Node 20+.
4. **Só se você clonou pelo git:** os arquivos de chave não vêm no clone, de propósito. Em
   `clientes/valeambientes/` há três modelos terminados em `.exemplo` (um na pasta, um em `n8n/` e o `rastreio.env.exemplo`).
   Faça uma cópia de cada um, no mesmo lugar, tirando o `.exemplo` do nome.
5. Abra o `OPERACAO.md`. A Parte 1 lista cada chave, onde pegar e em qual arquivo colar. Cole só o valor depois do `=`.
   Nunca cole chave no chat da IA e nunca faça commit de chave.
6. Com as chaves nos arquivos, copie a Parte 2 do `OPERACAO.md` (o bloco de texto inteiro) e mande como primeira
   mensagem para a IA.
7. A IA roda cada passo primeiro em seco e mostra o que faria. Só diga "pode aplicar" depois de ler.
8. No fim de cada fase ela devolve Resultado, Prova, Não feito ou risco e Próximo passo. Mande esse resumo de volta.

Cuidados:
- O projeto tem o endereço dos webhooks. Não repasse em grupo nem deixe o repositório público.
- A chave do n8n enxerga outros workflows da instância. Mexa só no que começa com `[RASTREIO]`.
- Nada é armado: os workflows nascem desligados e o envio de conversão fica em modo de ensaio até o dono liberar.
