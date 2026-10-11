// Prova que o corpo que o `rastreio.py testar` monta passa (ou é barrado) nos MESMOS nós que vão para o n8n.
// Uso (da raiz do repo): node .claude/skills/rastreio-google-meta-kommo/assets/n8n/provar_testar.mjs \
//        clientes/<slug>/n8n/rastreio python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py <slug>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'node:querystring'; // o n8n lê form-urlencoded com querystring: chaves PLANAS

const [dir, py, script, slug] = process.argv.slice(2);
const wf = (n) => JSON.parse(readFileSync(`${dir}/${n}`, 'utf8'));
const no = (w, nome) => w.nodes.find((x) => x.name === nome).parameters.jsCode;
const roda = async (js, input, refs) => {
  const f = new (Object.getPrototypeOf(async () => {}).constructor)('$input', '$', js);
  const lista = (itens) => ({ all: () => itens, first: () => itens[0] });
  return f(lista(input), (nome) => lista(refs[nome] || []));
};
const corpoDe = (args) => {
  const out = execFileSync(py, [script, 'testar', slug, ...args], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const l = out.split(/\r?\n/);
  return { tipo: l[1].replace('Content-Type: ', ''), corpo: l[2] };
};
let falhas = 0;
const confere = (nome, ok, det) => { if (!ok) falhas++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${nome}${det ? ' :: ' + det : ''}`); };

// 1 sessão: a etiqueta manda texto; o n8n entrega body como string
const s = corpoDe(['sessao', '--codigo', 'ABCDE']);
let r = await roda(no(wf('1-sessao.json'), 'valida'), [{ json: { body: s.corpo } }], {});
confere('sessao certa passa', r.length === 1 && r[0].json.p.codigo === 'ABCDE' && /^TESTE-QA-/.test(r[0].json.p.gclid) && r[0].json.p.ensaio === true, JSON.stringify(r[0]?.json.p));
r = await roda(no(wf('1-sessao.json'), 'valida'), [{ json: { body: s.corpo.replace('ABCDE', 'AB0DE') } }], {});
confere('sessao com codigo invalido (0) e barrada', r.length === 0);

// 2 mensagem do Kommo
const w2 = wf('2-kommo_msg.json');
const cfg = (await roda(no(w2, 'configuracoes'), [], {}))[0];
const msg = async (args) => {
  const c = corpoDe(['mensagem', '--lead', '999', ...args]);
  return roda(no(w2, 'extrai'), [cfg], { gatilho: [{ json: { body: parse(c.corpo) } }], configuracoes: [cfg] });
};
r = await msg(['--codigo', 'ABCDE']);
confere('mensagem com codigo vira evidencia do lead', r.length === 1 && r[0].json.p.codigo === 'ABCDE' && r[0].json.p.lead_id === 999 && r[0].json.p.fonte === 'kommo_codigo', JSON.stringify(r[0]?.json.p));
r = await msg(['--sem-codigo']);
confere('mensagem sem codigo e barrada', r.length === 0);
r = await msg(['--codigo', 'ABCDE', '--conta', '1']);
confere('conta errada (post forjado) e barrada', r.length === 0);

// 5 etapa
const w5 = wf('5-etapa.json');
const cfg5 = (await roda(no(w5, 'configuracoes'), [], {}))[0];
const etapa = async (args, mexe = (b) => b) => {
  const c = corpoDe(['etapa', '--lead', '999', ...args]);
  return roda(no(w5, 'extrai'), [cfg5], { gatilho: [{ json: { body: mexe(parse(c.corpo)) } }], configuracoes: [cfg5] });
};
r = await etapa(['--etapa', '2']);
confere('etapa do mapa segue', r.length === 1 && r[0].json.lead_id === 999 && r[0].json.status_id === 142, JSON.stringify(r[0]?.json));
r = await etapa([], (b) => ({ ...b, 'leads[status][0][status_id]': '1' }));
confere('etapa fora do mapa e barrada', r.length === 0);
r = await etapa(['--conta', '1']);
confere('etapa com conta errada e barrada', r.length === 0);

// 4 decide: com e sem o campo "Origem comprovada" no config (sem ele, grava UTM e GCLID e nunca a origem)
const w4 = wf('4-casamento.json');
const cfg4 = (await roda(no(w4, 'configuracoes'), [], {}))[0];
const decide = async (c, camposDoLead = []) => {
  const fonte = { json: { evidencia_id: 1, lead_id: 999, contato_id: null, busca_tipo: 'lead', origem: 'Google Ads', grau: 'A',
    criado_em: new Date().toISOString(), dados: { gclid: 'TESTE-QA-1', utm_source: 'google', utm_medium: 'cpc' } } };
  const lead = { id: 999, pipeline_id: c.json.pipelines[0], created_at: Math.floor(Date.now() / 1000), custom_fields_values: camposDoLead };
  const out = await roda(no(w4, 'decide'), [{ json: { statusCode: 200, body: JSON.stringify(lead) } }],
    { configuracoes: [c], 'achou lead?': [fonte] });
  return out[0].json;
};
const t = cfg4.json.campos_tracking;
let d = await decide(cfg4);
const temOrigem = (j) => j.gravados.includes('origem');
confere('decide grava GCLID no campo vazio', d.tem_patch && d.patch.custom_fields_values.some((f) => f.field_id === Number(t.GCLID)), d.gravados.join(','));
confere(cfg4.json.campo_origem_id ? 'config COM campo de origem: grava a origem' : 'config SEM campo de origem: nao grava origem',
  temOrigem(d) === Boolean(cfg4.json.campo_origem_id));
const comCampo = { json: { ...cfg4.json, campo_origem_id: 777001, origem_enums: { 'Google Ads': 9001, 'Meta Ads': 9002, Site: 9003 } } };
d = await decide(comCampo);
confere('com o campo novo, a origem sai pelo enum certo', d.patch.custom_fields_values.some((f) => f.field_id === 777001 && f.values[0].enum_id === 9001));
d = await decide(comCampo, [{ field_id: 777001, values: [{ value: 'Meta Ads', enum_id: 9002 }] }, { field_id: Number(t.GCLID), values: [{ value: 'JA-TINHA' }] }]);
confere('campo ja preenchido nao e trocado (primeiro toque vence)', !temOrigem(d) && !d.gravados.includes('gclid'), d.gravados.join(','));

console.log(`PROVA_TESTAR falhas=${falhas}`);
process.exit(falhas ? 1 : 0);
