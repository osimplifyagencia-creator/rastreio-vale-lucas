// [RASTREIO 4] Depois do PATCH no lead: só marca "casado" o que o Kommo aceitou.
// 401/403 estoura (o errorWorkflow avisa); outro erro volta para a fila com o motivo e tenta de novo.
const fontes = $('tem patch?').all();
const respostas = $input.all();
if (fontes.length !== respostas.length) throw new Error(`pareamento quebrado: ${fontes.length} x ${respostas.length}`);
const out = [];
respostas.forEach((it, i) => {
  const f = fontes[i].json;
  const j = it.json || {};
  let st = Number(j.statusCode || 0);
  if (j.error) {
    const m = String((j.error && j.error.message) || j.error);
    if (/401|403|unauthori|forbidden|credential/i.test(m)) throw new Error('Kommo recusou a credencial no PATCH: ' + m.slice(0, 200));
    st = st || 599;
  }
  if (st === 401 || st === 403) throw new Error('Kommo recusou a credencial no PATCH (HTTP ' + st + ')');
  const ok = st >= 200 && st < 300;
  out.push({ json: ok ? f : { ...f, ok: false, motivo: 'patch_http_' + st } });
});
return out;
