// Sabotagens do 001_rastreio.sql: cada uma tem de ser PEGA pela prova.sql. Prova que só passa não prova nada.
// Uso (da raiz do repo): node .claude/skills/rastreio-google-meta-kommo/assets/banco/mutantes.mjs
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..').split('\\').join('/')
let req
for (const base of ['/.claude/skills/implantacao-de-cliente/assets/prova-descartavel/package.json', '/package.json']) {
  req = createRequire(raiz + base)
  try { req.resolve('@electric-sql/pglite'); break } catch (e) { req = null }
}
if (!req) { console.log('ERRO: falta o PGlite. Rode `npm install` na raiz do projeto.'); process.exit(1) }
const { PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href)
const { pgcrypto } = await import(pathToFileURL(req.resolve('@electric-sql/pglite/contrib/pgcrypto')).href)
const dir = raiz + '/.claude/skills/rastreio-google-meta-kommo/assets/banco/'
const base = readFileSync(dir + '001_rastreio.sql', 'utf8'), prova = readFileSync(dir + 'prova.sql', 'utf8')
const mut = [
  ['primeiro toque quebrado', 'gclid              = coalesce(s.gclid, excluded.gclid)', 'gclid              = excluded.gclid'],
  ['fbclid vira anuncio', "when src in ('facebook', 'fb'", "when s.fbclid is not null or src in ('facebook', 'fb'"],
  ['chave so 8 ultimos', "return substr(v[1], 3, 2) || right(v[1], 8);", "return right(v[1], 8);"],
  ['sem idempotencia na fila', '  unique (plataforma, event_id)\n);', '  check (true)\n);'],
  ['valor suspeito liberado', "then suspeito := true;", "then suspeito := false;"],
  ['meta desarmada envia', "if pl = 'meta' and not c.meta_armado and c.meta_test_event_code is null then", "if false then"],
  ['enviando sai de novo', "or (ev.estado = 'enviando' and ev.tentado_em < now() - interval '30 minutes')", "or ev.estado = 'enviando'"],
  ['orfa entra na fila', "then 'ignorado' else 'a_casar' end", "then 'a_casar' else 'a_casar' end"],
  ['hash com + na meta', "select coalesce(array_agg(public.rastreio_sha256(x) order by x), '{}') into ph_m", "select coalesce(array_agg(public.rastreio_sha256('+' || x) order by x), '{}') into ph_m"],
]
for (const [nome, de, para] of mut) {
  if (!base.includes(de)) { console.log('NAO ACHEI O TRECHO:', nome); process.exitCode = 1; continue }
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(base.replace(de, para))
  try { await db.exec(prova) } catch (e) {
    const m = e.message.match(/falhas=(\d+)/)
    // erro fora da prova (a função quebrou) também é sabotagem detectada
    const pego = !m || +m[1] > 0
    if (!pego) process.exitCode = 1
    console.log(pego ? 'PEGO   ' : 'ESCAPOU', nome, '::', e.message.slice(0, 80))
  }
}
