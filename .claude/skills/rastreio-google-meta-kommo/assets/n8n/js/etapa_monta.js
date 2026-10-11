// [RASTREIO 5] Telefones e e-mails do contato vão CRUS para o banco; o hash é feito lá (rastreio_etapa).
function corpo(j) {
  if (j.error) {
    const m = String((j.error && j.error.message) || j.error);
    if (/401|403|unauthori|forbidden|credential/i.test(m)) throw new Error('Kommo recusou a credencial: ' + m.slice(0, 200));
    return null;
  }
  const st = Number(j.statusCode || 200);
  if (st === 401 || st === 403) throw new Error('Kommo recusou a credencial (HTTP ' + st + ')');
  if (st >= 400 || st === 204) return null;
  let b = j.body !== undefined ? j.body : j.data;
  if (typeof b === 'string') { if (!b.trim()) return null; b = JSON.parse(b); }
  return b || null;
}
const fontes = $('contato').all();
const respostas = $input.all();
if (fontes.length !== respostas.length) throw new Error(`pareamento quebrado: ${fontes.length} x ${respostas.length}`);
const out = [];
respostas.forEach((it, i) => {
  const r = fontes[i].json;
  const c = corpo(it.json) || {};
  const valores = (code) => (c.custom_fields_values || []).filter((f) => f.field_code === code)
    .flatMap((f) => (f.values || []).map((v) => String(v.value || '').trim())).filter(Boolean);
  out.push({ json: { p: {
    lead_id: r.lead_id, pipeline_id: r.pipeline_id, status_id: r.status_id, ocorrido_em: r.ocorrido_em,
    valor: r.valor, gclid: r.gclid, fbclid: r.fbclid,
    telefones: valores('PHONE').slice(0, 5), emails: valores('EMAIL').slice(0, 5),
  } } });
});
return out;
