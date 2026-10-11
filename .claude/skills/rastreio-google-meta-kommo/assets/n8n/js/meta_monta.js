// [RASTREIO 7] Lote da fila vira o corpo da Conversions API da Meta (até 1000 eventos por chamada).
// Desarmada: vai com test_event_code (aparece só em "Eventos de teste", não conta para a campanha).
const lote = $input.first().json;
const itens = lote.itens || [];
if (!itens.length) return [];
if (!lote.meta_dataset_id) throw new Error('meta_dataset_id vazio (rastreio_config)');
const data = itens.map((ev) => {
  const ids = ev.identificadores || {};
  const user = {};
  if ((ids.telefones || []).length) user.ph = ids.telefones;
  if ((ids.emails || []).length) user.em = ids.emails;
  if (ids.fbc) user.fbc = ids.fbc;
  if (ids.fbp) user.fbp = ids.fbp;
  const e = { event_name: ev.destino, event_time: Math.floor(Date.parse(ev.ocorrido_em) / 1000),
              event_id: ev.event_id, action_source: ev.action_source || 'system_generated', user_data: user };
  if (e.action_source === 'business_messaging') {
    e.messaging_channel = 'whatsapp';
    if (ids.ctwa_clid) user.ctwa_clid = ids.ctwa_clid;
    if (lote.meta_waba_id) user.whatsapp_business_account_id = lote.meta_waba_id;
  }
  if (ev.valor !== null && ev.valor !== undefined) e.custom_data = { value: Number(ev.valor), currency: ev.moeda || 'BRL' };
  return e;
});
const body = { data };
if (!lote.armado && lote.meta_test_event_code) body.test_event_code = lote.meta_test_event_code;
return [{ json: { ids: itens.map((e) => e.id), armado: !!lote.armado,
  url: `https://graph.facebook.com/${lote.meta_versao || 'v21.0'}/${lote.meta_dataset_id}/events`, body } }];
