// [RASTREIO 5] Webhook status_lead do Kommo (chaves planas: body['leads[status][0][id]']).
// Só segue o que está no mapa de etapas: o resto nem chega a gastar chamada no Kommo.
const cfg = $('configuracoes').first().json;
const mapa = new Set((cfg.etapas_mapeadas || []).map(String));
const out = [];
for (const it of $('gatilho').all()) {  // o gatilho, nao o $input: antes daqui roda o configuracoes
  const b = it.json.body || {};
  if (cfg.kommo_conta && String(b['account[id]']) !== String(cfg.kommo_conta)) continue;  // post forjado
  for (let i = 0; i < 50; i++) {
    const k = (campo) => b[`leads[status][${i}][${campo}]`];
    if (k('id') === undefined) break;
    const chave = `${k('pipeline_id')}:${k('status_id')}`;
    if (!mapa.has(chave)) continue;
    out.push({ json: {
      lead_id: Number(k('id')), pipeline_id: Number(k('pipeline_id')), status_id: Number(k('status_id')),
      status_anterior: Number(k('old_status_id')) || null, valor_webhook: k('price') ?? null,
      ocorrido_em: new Date((Number(k('last_modified')) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      lead_url: `${cfg.kommo_api}/leads/${k('id')}?with=contacts`,
    } });
  }
}
return out;
