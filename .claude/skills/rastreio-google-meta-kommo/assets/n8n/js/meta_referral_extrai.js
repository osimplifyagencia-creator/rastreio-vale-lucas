// [RASTREIO 3] Mensagem do WhatsApp pela Meta (gatilho do app DEDICADO do cliente). Só sai quem veio
// de anúncio (tem referral). Nenhum texto de conversa é guardado: só o que prova a origem.
function desembrulha(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) return raw[0] || {};
  if (raw.messaging_product) return raw;
  if (raw.body && raw.body.entry) return ((raw.body.entry[0] || {}).changes || [])[0]?.value || {};
  if (raw.entry) return ((raw.entry[0] || {}).changes || [])[0]?.value || {};
  return raw;
}
const out = [];
for (const it of $input.all()) {
  const v = desembrulha(it.json);
  for (const msg of (v.messages || [])) {
    const ref = msg.referral;
    if (!ref || !msg.from) continue;
    out.push({ json: { p: {
      fonte: 'meta_referral',
      chave_unica: 'wamid:' + msg.id,
      telefone: String(msg.from),
      ad_id: ref.source_type === 'ad' ? (ref.source_id || null) : null,
      ctwa_clid: ref.ctwa_clid || null,
      headline: ref.headline || null,
      source_url: ref.source_url || null,
      dados: { source_type: ref.source_type || null, media_type: ref.media_type || null,
               phone_number_id: (v.metadata || {}).phone_number_id || null },
    } } });
  }
}
return out;
