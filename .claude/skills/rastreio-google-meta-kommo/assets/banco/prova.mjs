// Prova do banco do rastreio num Postgres descartável (PGlite com pgcrypto). Nunca toca produção.
// Uso (da raiz do repo), reaproveitando o PGlite já instalado da prova da implantação:
//   NODE_PATH=.claude/skills/implantacao-de-cliente/assets/prova-descartavel/node_modules \
//     node .claude/skills/rastreio-google-meta-kommo/assets/banco/prova.mjs
// A última linha tem de ser "PROVA_DESFEITA falhas=0". Roda a migration DUAS vezes (idempotência).
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..', '..', '..', '..', '..')
// PGlite: o da prova da implantação (repo da casa) ou o da raiz (pacote entregue: `npm install` na raiz)
let req
for (const base of ['.claude/skills/implantacao-de-cliente/assets/prova-descartavel/package.json', 'package.json']) {
  req = createRequire(join(raiz, base))
  try { req.resolve('@electric-sql/pglite'); break } catch (e) { req = null }
}
if (!req) { console.log('ERRO: falta o PGlite. Rode `npm install` na raiz do projeto.'); process.exit(1) }
const { PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href)
const { pgcrypto } = await import(pathToFileURL(req.resolve('@electric-sql/pglite/contrib/pgcrypto')).href)

const db = new PGlite({ extensions: { pgcrypto } })
const prelude = 'create role anon; create role authenticated; create role service_role;'
const passos = [['prelude', prelude],
  ['001_rastreio.sql', readFileSync(join(aqui, '001_rastreio.sql'), 'utf8')],
  ['001_rastreio.sql (2a vez)', readFileSync(join(aqui, '001_rastreio.sql'), 'utf8')],
  ['prova.sql', readFileSync(join(aqui, 'prova.sql'), 'utf8')]]
// Com um argumento (o rastreio_002_config.sql gerado pelo montar), aplica a config do cliente em vez da prova
// e mostra o que ficou: prova que o SQL gerado roda e não arma nada.
if (process.argv[2]) {
  passos.pop()
  passos.push(['config do cliente', readFileSync(process.argv[2], 'utf8')], ['config do cliente (2a vez)', readFileSync(process.argv[2], 'utf8')])
}
db.onNotice?.((n) => console.log('  aviso:', n.message))
for (const [nome, sql] of passos) {
  try { await db.exec(sql); console.log('ok   ', nome) }
  catch (e) {
    console.log((/PROVA_DESFEITA/.test(e.message) ? 'fim  ' : 'ERRO '), nome, '::', e.message)
    if (!/PROVA_DESFEITA falhas=0/.test(e.message)) process.exitCode = 1
  }
}
if (process.argv[2]) {
  const c = (await db.query('select google_armado, meta_armado, google_conta, meta_dataset_id, valor_max from public.rastreio_config')).rows[0]
  const m = (await db.query('select pipeline_id, status_id, evento, google_acao_id, meta_evento, com_valor from public.rastreio_mapa order by status_id')).rows
  console.log('config', JSON.stringify(c))
  m.forEach((x) => console.log('mapa  ', JSON.stringify(x)))
  if (c.google_armado || c.meta_armado) { console.log('ERRO a config gerada ARMOU o envio'); process.exitCode = 1 }
}
