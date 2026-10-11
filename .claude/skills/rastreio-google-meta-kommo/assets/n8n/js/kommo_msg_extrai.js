// [RASTREIO 2] Mensagem que chegou no Kommo (webhook add_message, corpo form-urlencoded com chaves
// planas do tipo body['message[add][0][text]']). Só interessa mensagem RECEBIDA com o código "[XXXXX]".
// O caminho do webhook é o segredo; a conta no corpo é a segunda trava contra post forjado.
const MARCA = /\[([A-HJ-NP-Z2-9]{5})\]/;
const cfg = $('configuracoes').first().json;
const out = [];
for (const it of $('gatilho').all()) {  // o gatilho, nao o $input: antes daqui roda o configuracoes
  const b = it.json.body || {};
  if (cfg.kommo_conta && String(b['account[id]']) !== String(cfg.kommo_conta)) continue;
  for (let i = 0; i < 50; i++) {
    const k = (campo) => b[`message[add][${i}][${campo}]`];
    if (k('id') === undefined && k('text') === undefined) break;
    const tipo = k('type');
    if (tipo && tipo !== 'incoming') continue;
    const m = String(k('text') || '').toUpperCase().match(MARCA);
    if (!m) continue;
    const ehLead = (k('entity_type') || k('element_type')) === 'lead' || String(k('element_type')) === '2';
    const leadId = Number(ehLead ? (k('entity_id') || k('element_id')) : 0) || null;
    out.push({ json: { p: {
      fonte: 'kommo_codigo',
      chave_unica: 'kommo:' + (k('id') || `${k('talk_id')}:${k('created_at')}`),
      codigo: m[1],
      lead_id: leadId,
      contato_id: Number(k('contact_id')) || null,
    } } });
  }
}
return out;
