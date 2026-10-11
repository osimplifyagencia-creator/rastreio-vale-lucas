# Pacote do rastreio: valeambientes

Gerado em 10/10/2026. Esta pasta é um projeto pronto para abrir no Claude Code (ou em outra IA que leia arquivos e
rode comandos). Dentro dela está tudo para ligar o rastreio de origem do cliente: os 8 workflows do n8n, o banco,
os scripts, as skills e o roteiro.

## O que tem aqui

| Arquivo ou pasta | Para que serve |
|---|---|
| [OPERACAO.md](OPERACAO.md) | Parte 1: as chaves a coletar e onde colar. Parte 2: o roteiro para entregar à IA |
| `clientes/valeambientes/n8n/rastreio/` | Os 8 workflows em JSON, numerados, e o `LEIA-ME.md` com a credencial de cada nó |
| `clientes/valeambientes/config.json` | Os ids do cliente (Kommo, funil, campos, webhooks). Já preenchido |
| `clientes/valeambientes/*.env` | Os 3 arquivos onde as chaves entram. Vêm sem valor |
| `.claude/skills/` | 5 skills: rastreio, n8n pela API, Kommo pela API, acessos da Meta, conversões do Google Ads |
| `.mcp.json` | MCP do n8n do cliente. Só falta a chave |
| `CLAUDE.md` | As regras que a IA segue neste projeto |

## Como usar, em 5 passos

1. **Descompacte** em uma pasta sua e abra essa pasta no Claude Code.
2. **Instale o que os scripts usam:** Python 3.10 ou mais novo e Node 20 ou mais novo. Na raiz da pasta, rode
   `npm install` uma vez (baixa o Postgres descartável que prova o banco antes de aplicar).
3. **Colete as chaves** da Parte 1 do [OPERACAO.md](OPERACAO.md) e cole cada uma no arquivo indicado, depois do `=`.
   Nunca cole chave no chat com a IA.
4. **MCP do n8n (opcional):** a chave vai na variável de ambiente `N8N_MCP_TOKEN`. No Windows:
   `setx N8N_MCP_TOKEN "a-chave"` e abra o terminal de novo. No Mac ou Linux: `export N8N_MCP_TOKEN="a-chave"`.
   A operação inteira roda sem o MCP, pela API; ele serve para consultar e validar workflow na conversa.
5. **Entregue o roteiro à IA:** copie a Parte 2 do [OPERACAO.md](OPERACAO.md) e mande como primeira mensagem.

## O que o pacote NÃO traz

- Nenhuma chave. Os `.env` vêm vazios e ficam fora do git (`.gitignore` já cobre).
- Nada armado. Os workflows nascem desligados e o envio de conversão nasce em ensaio.

## Estado na produção do cliente, hoje

- Credenciais já criadas no n8n: kommo (`DfhIaL8GcP4nm2cu`).
- Workflows do rastreio já criados: nenhum.
- Campo "Origem comprovada" no Kommo: ainda não criado.
- Banco do rastreio no Supabase do cliente: conferir com `R banco valeambientes` (seco).
