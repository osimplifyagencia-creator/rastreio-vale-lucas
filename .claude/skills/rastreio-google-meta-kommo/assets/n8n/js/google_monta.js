// [RASTREIO 6] Lote da fila vira o corpo da Data Manager API (events:ingest), uma requisição por ação
// de conversão. Desarmado = validateOnly: o Google confere tudo e não registra nada.
// Um evento inválido derruba a requisição inteira: por isso o banco só entrega evento com identificador.
const lote = $input.first().json;
const itens = lote.itens || [];
if (!itens.length) return [];
const conta = String(lote.google_conta || '').replace(/\D/g, '');
if (conta.length !== 10) throw new Error('google_conta precisa ter 10 digitos (rastreio_config)');
const login = String(lote.google_conta_login || '').replace(/\D/g, '');
const porAcao = {};
for (const ev of itens) (porAcao[ev.destino] = porAcao[ev.destino] || []).push(ev);
const out = [];
for (const [acao, evs] of Object.entries(porAcao)) {
  const destino = { operatingAccount: { accountType: 'GOOGLE_ADS', accountId: conta }, productDestinationId: String(acao) };
  if (login) destino.loginAccount = { accountType: 'GOOGLE_ADS', accountId: login };
  const events = evs.map((ev) => {
    const ids = ev.identificadores || {};
    const e = { transactionId: ev.event_id, eventTimestamp: new Date(ev.ocorrido_em).toISOString(),
                eventSource: lote.google_fonte_evento || 'WEB' };
    if (ids.gclid) e.adIdentifiers = { gclid: ids.gclid };
    else if (ids.gbraid) e.adIdentifiers = { gbraid: ids.gbraid };
    else if (ids.wbraid) e.adIdentifiers = { wbraid: ids.wbraid };
    const u = [...(ids.telefones || []).map((h) => ({ phoneNumber: h })), ...(ids.emails || []).map((h) => ({ emailAddress: h }))];
    if (u.length) e.userData = { userIdentifiers: u.slice(0, 10) };
    if (ev.valor !== null && ev.valor !== undefined) { e.conversionValue = Number(ev.valor); e.currency = ev.moeda || 'BRL'; }
    if (lote.google_consentimento) e.consent = { adUserData: lote.google_consentimento, adPersonalization: lote.google_consentimento };
    return e;
  });
  out.push({ json: { ids: evs.map((e) => e.id), armado: !!lote.armado,
    body: { destinations: [destino], encoding: 'HEX', events, validateOnly: !lote.armado } } });
}
return out;
