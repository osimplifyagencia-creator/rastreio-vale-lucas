// [RASTREIO 4] Decide o que gravar no lead. Regra de ouro: SÓ CAMPO VAZIO. O que o lead já tem
// (escrito pela equipe, pela IA ou por outro rastreio) não é trocado aqui; a prova completa fica no banco.
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
const fontes = $('achou lead?').all();
const respostas = $input.all();
if (fontes.length !== respostas.length) {
  throw new Error(`pareamento quebrado: ${fontes.length} leads e ${respostas.length} respostas`);
}
const out = [];
respostas.forEach((it, i) => {
  const r = fontes[i].json;
  const lead = corpo(it.json);
  const base = { evidencia_id: r.evidencia_id, lead_id: r.lead_id, contato_id: r.contato_id };
  if (!lead || !lead.id) { out.push({ json: { ...base, ok: false, motivo: 'lead_nao_lido', tem_patch: false } }); return; }

  if (cfg.pipelines && cfg.pipelines.length && !cfg.pipelines.includes(lead.pipeline_id)) {
    out.push({ json: { ...base, ok: false, motivo: 'fora_do_funil_' + lead.pipeline_id, tem_patch: false } });
    return;
  }
  // achado só pelo telefone: o lead tem de ter nascido perto da mensagem (senão é um lead antigo da pessoa)
  if (r.busca_tipo === 'contato') {
    const evid = Date.parse(r.criado_em) / 1000;
    const horas = (evid - Number(lead.created_at || 0)) / 3600;
    if (horas > (cfg.lead_max_horas_antes || 48)) {
      out.push({ json: { ...base, ok: false, motivo: 'lead_antigo', tem_patch: false } });
      return;
    }
  }

  const atuais = {};
  for (const f of (lead.custom_fields_values || [])) {
    const v = (f.values || [])[0];
    if (v && v.value !== undefined && v.value !== null && String(v.value).trim() !== '') atuais[f.field_id] = v;
  }
  const d = r.dados || {};
  const campos = [];
  const gravados = [];
  const poe = (fieldId, valor, nome) => {
    if (!fieldId || valor === undefined || valor === null || String(valor).trim() === '') return;
    if (atuais[fieldId]) return;
    campos.push({ field_id: Number(fieldId), values: [{ value: String(valor).slice(0, 250) }] });
    gravados.push(nome);
  };
  const t = cfg.campos_tracking || {};
  poe(t.UTM_SOURCE, d.utm_source, 'utm_source');
  poe(t.UTM_MEDIUM, d.utm_medium, 'utm_medium');
  poe(t.UTM_CAMPAIGN, d.utm_campaign, 'utm_campaign');
  poe(t.UTM_CONTENT, d.utm_content, 'utm_content');
  poe(t.UTM_TERM, d.utm_term, 'utm_term');
  poe(t.GCLID, d.gclid || d.gbraid || d.wbraid, 'gclid');
  poe(t.FBCLID, d.fbclid, 'fbclid');
  const extra = cfg.campos_extra || {};
  poe(extra.codigo, d.codigo, 'codigo');
  poe(extra.ad_id, d.ad_id, 'ad_id');
  poe(extra.ctwa_clid, d.ctwa_clid, 'ctwa_clid');
  poe(extra.grau, r.grau, 'grau');

  // Origem do Lead é lista: só grava se estiver vazia e se a origem tiver opção na lista
  const enumId = r.origem ? (cfg.origem_enums || {})[r.origem] : null;
  if (cfg.campo_origem_id && enumId && !atuais[cfg.campo_origem_id]) {
    campos.push({ field_id: Number(cfg.campo_origem_id), values: [{ enum_id: Number(enumId) }] });
    gravados.push('origem');
  }

  out.push({ json: { ...base, ok: true, motivo: gravados.length ? null : 'nada_vazio_para_gravar',
    gravados, tem_patch: campos.length > 0,
    patch_url: `${cfg.kommo_api}/leads/${lead.id}`,
    patch: { custom_fields_values: campos } } });
});
return out;
