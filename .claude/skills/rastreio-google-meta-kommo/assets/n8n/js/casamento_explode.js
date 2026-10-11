// [RASTREIO 4] Lista do banco (rastreio_a_casar) vira um item por evidência, com o endereço de busca no Kommo.
// Evidência do Kommo já sabe o lead; a da Meta só tem o telefone e procura o contato pelos 8 finais
// (a busca do Kommo) para depois conferir DDD + 8 no resolve.
const cfg = $('configuracoes').first().json;
const out = [];
for (const it of $input.all()) {
  for (const r of (it.json.itens || [])) {
    let url = null;
    let tipo = null;
    if (r.lead_id) { url = `${cfg.kommo_api}/leads/${r.lead_id}?with=contacts`; tipo = 'lead'; }
    else if (r.contato_id) { url = `${cfg.kommo_api}/contacts/${r.contato_id}?with=leads`; tipo = 'contato_id'; }
    else if (r.busca_tel) { url = `${cfg.kommo_api}/contacts?query=${encodeURIComponent(r.busca_tel)}&with=leads&limit=50`; tipo = 'contato'; }
    if (!url) continue;  // o banco já grava essas como ignoradas; aqui é só a segunda trava
    out.push({ json: { ...r, busca_url: url, busca_tipo: tipo } });
  }
}
return out;
