// [RASTREIO 4] Resposta da busca no Kommo vira o lead_id certo (ou o motivo de não ter achado).
// O nó HTTP anterior roda com resposta em TEXTO e sem estourar: o Kommo responde 204 sem corpo quando a
// busca não acha nada, e o parser de JSON do n8n quebra nisso. Credencial recusada, porém, ESTOURA aqui.
function corpo(j) {
  if (j.error) {
    const m = String((j.error && j.error.message) || j.error);
    if (/401|403|unauthori|forbidden|credential/i.test(m)) throw new Error('Kommo recusou a credencial: ' + m.slice(0, 200));
    if (/json|string|undefined|204|empty/i.test(m)) return null;
    throw new Error('Kommo devolveu erro: ' + m.slice(0, 200));
  }
  const st = Number(j.statusCode || 200);
  if (st === 204) return null;
  if (st === 401 || st === 403) throw new Error('Kommo recusou a credencial (HTTP ' + st + ')');
  if (st >= 400) return { __status: st };
  let b = j.body !== undefined ? j.body : j.data;
  if (typeof b === 'string') { if (!b.trim()) return null; b = JSON.parse(b); }
  return b || null;
}
function chaveTel(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d.slice(2, 4) + d.slice(-8);
  return d || null;
}
const fontes = $('explode').all();
const respostas = $input.all();
if (fontes.length !== respostas.length) {
  throw new Error(`pareamento quebrado: ${fontes.length} buscas e ${respostas.length} respostas`);
}
const cfg = $('configuracoes').first().json;
const out = [];
respostas.forEach((it, i) => {
  const r = fontes[i].json;
  const b = corpo(it.json);
  let leadId = null, contatoId = r.contato_id || null, motivo = null;
  if (r.busca_tipo === 'lead') {
    if (b && b.id) { leadId = b.id; contatoId = contatoId || (((b._embedded || {}).contacts || [])[0] || {}).id || null; }
    else motivo = b && b.__status ? 'kommo_http_' + b.__status : 'lead_nao_existe';
  } else if (r.busca_tipo === 'contato_id') {
    // o Kommo disse qual contato escreveu: o lead é o mais novo dele (o filtro de funil e idade é do decide)
    const leads = (((b || {})._embedded || {}).leads || []).map((l) => l.id).sort((a, z) => z - a);
    if (b && b.id && leads.length) { leadId = leads[0]; contatoId = b.id; }
    else motivo = b && b.__status ? 'kommo_http_' + b.__status : (b && b.id ? 'contato_sem_lead' : 'contato_nao_existe');
  } else {
    const contatos = ((b || {})._embedded || {}).contacts || [];
    const casam = contatos.filter((c) => (c.custom_fields_values || [])
      .filter((f) => f.field_code === 'PHONE')
      .some((f) => (f.values || []).some((v) => chaveTel(v.value) === r.tel_chave)));
    // o lead mais novo do contato que casou; o filtro de funil e de idade é do decide
    const leads = casam.flatMap((c) => (((c._embedded || {}).leads) || []).map((l) => ({ id: l.id, contato: c.id })));
    leads.sort((a, z) => z.id - a.id);
    if (leads.length) { leadId = leads[0].id; contatoId = leads[0].contato; }
    else motivo = contatos.length ? 'telefone_nao_confere' : 'contato_nao_achado';
  }
  out.push({ json: { ...r, lead_id: leadId, contato_id: contatoId, motivo,
                     lead_url: leadId ? `${cfg.kommo_api}/leads/${leadId}` : null } });
});
return out;
