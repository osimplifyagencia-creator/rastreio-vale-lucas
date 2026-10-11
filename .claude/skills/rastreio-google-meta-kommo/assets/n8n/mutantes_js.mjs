// Mutantes dos códigos dos nós: cada sabotagem tem de ser PEGA pelo provar_js.mjs.
// Mutante que escapa = prova fraca. Uso: node mutantes_js.mjs
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const aqui = dirname(fileURLToPath(import.meta.url))
const MUTANTES = [
  ['kommo_msg_extrai.js', "if (tipo && tipo !== 'incoming') continue;", '', 'aceita mensagem enviada por nós'],
  ['kommo_msg_extrai.js', "if (cfg.kommo_conta && String(b['account[id]']) !== String(cfg.kommo_conta)) continue;", '', 'aceita post de outra conta'],
  ['etapa_extrai.js', 'if (!mapa.has(chave)) continue;', '', 'segue etapa fora do mapa'],
  ['casamento_resolve.js', 'throw new Error', 'void new Error', 'engole credencial recusada'],
  ['casamento_decide.js', 'throw new Error', 'void new Error', 'engole credencial recusada no lead'],
  ['google_monta.js', 'validateOnly: !lote.armado', 'validateOnly: false', 'envia de verdade desarmado'],
  ['meta_monta.js', 'test_event_code', 'test_event_codigo', 'perde o codigo de teste'],
  ['casamento_patch_confere.js', 'const ok = st >= 200 && st < 300;', 'const ok = true;', 'marca casado com PATCH recusado'],
  ['envio_resultado.js', 'throw new Error', 'void new Error', 'engole 401 no envio'],
]
let escaparam = 0
for (const [arq, de, para, nome] of MUTANTES) {
  const dir = mkdtempSync(join(tmpdir(), 'rastreio-mut-'))
  cpSync(join(aqui, 'js'), dir, { recursive: true })
  const alvo = join(dir, arq)
  const orig = readFileSync(alvo, 'utf8')
  if (!orig.includes(de)) { console.log('TRECHO SUMIU', arq, nome); escaparam++; rmSync(dir, { recursive: true }); continue }
  writeFileSync(alvo, orig.split(de).join(para))
  const r = spawnSync(process.execPath, [join(aqui, 'provar_js.mjs')], { env: { ...process.env, RASTREIO_JS_DIR: dir }, encoding: 'utf8' })
  const pego = r.status !== 0
  if (!pego) escaparam++
  console.log(pego ? 'PEGO    ' : 'ESCAPOU ', nome)
  rmSync(dir, { recursive: true })
}
console.log(`MUTANTES total=${MUTANTES.length} escaparam=${escaparam}`)
process.exitCode = escaparam ? 1 : 0
