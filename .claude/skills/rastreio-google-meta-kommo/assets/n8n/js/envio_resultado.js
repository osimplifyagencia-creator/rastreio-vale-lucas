// [RASTREIO 6 e 7] Resposta do Google ou da Meta vira o estado de cada evento da fila.
// 2xx: enviado (armado) ou ensaio_ok (desarmado). 4xx: recusado (não adianta repetir). 5xx e 429: erro (volta).
const fontes = $('monta').all();
const respostas = $input.all();
if (fontes.length !== respostas.length) throw new Error(`pareamento quebrado: ${fontes.length} x ${respostas.length}`);
const out = [];
respostas.forEach((it, i) => {
  const f = fontes[i].json;
  const j = it.json || {};
  let st = Number(j.statusCode || 0);
  let corpo = j.body !== undefined ? j.body : j;
  if (j.error && !st) {
    const m = String((j.error && j.error.message) || j.error);
    const n = m.match(/\b(4\d\d|5\d\d)\b/);
    st = n ? Number(n[1]) : 599;
    corpo = { erro: m.slice(0, 500) };
  }
  if (st === 401 || st === 403) throw new Error('plataforma recusou a credencial (HTTP ' + st + '): ' + JSON.stringify(corpo).slice(0, 300));
  let estado;
  if (st >= 200 && st < 300) estado = f.armado ? 'enviado' : 'ensaio_ok';
  else if (st === 429 || st >= 500) estado = 'erro';
  else estado = 'recusado';
  out.push({ json: { p: { ids: f.ids, estado, motivo: estado === 'recusado' || estado === 'erro' ? 'http_' + st : null,
    resposta: typeof corpo === 'string' ? { texto: corpo.slice(0, 2000) } : corpo } } });
});
return out;
