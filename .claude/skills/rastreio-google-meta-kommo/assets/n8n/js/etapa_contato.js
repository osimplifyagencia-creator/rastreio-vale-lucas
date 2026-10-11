// [RASTREIO 5] Lido o lead: guarda valor e rastreio do Kommo e monta o endereço do contato principal.
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
const cfg = $('configuracoes').first().json;
const fontes = $('extrai').all();
const respostas = $input.all();
if (fontes.length !== respostas.length) throw new Error(`pareamento quebrado: ${fontes.length} x ${respostas.length}`);
const t = cfg.campos_tracking || {};
const out = [];
respostas.forEach((it, i) => {
  const r = fontes[i].json;
  const lead = corpo(it.json);
  if (!lead || !lead.id) return;  // lead apagado entre o webhook e a leitura: nada a enviar
  const cf = {};
  for (const f of (lead.custom_fields_values || [])) cf[f.field_id] = ((f.values || [])[0] || {}).value;
  const contatos = ((lead._embedded || {}).contacts) || [];
  const principal = contatos.find((c) => c.is_main) || contatos[0] || null;
  out.push({ json: { ...r,
    valor: lead.price ?? r.valor_webhook ?? null,
    gclid: t.GCLID ? (cf[t.GCLID] || null) : null,
    fbclid: t.FBCLID ? (cf[t.FBCLID] || null) : null,
    // sem contato, relê o próprio lead: o monta acha zero telefone e o banco decide pelo clique
    contato_url: principal ? `${cfg.kommo_api}/contacts/${principal.id}` : `${cfg.kommo_api}/leads/${lead.id}`,
  } });
});
return out;
