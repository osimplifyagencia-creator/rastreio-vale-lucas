// [RASTREIO 1] Valida o que a etiqueta da página mandou. Nada aqui confia no navegador:
// só passam o código no formato certo e os campos conhecidos, cortados no tamanho.
const CODIGO = /^[A-HJ-NP-Z2-9]{5}$/;
const CAMPOS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_content', 'utm_term', 'pagina', 'referrer', 'evento'];
const EVENTOS = ['visita', 'whatsapp_click'];
const out = [];
for (const it of $input.all()) {
  let b = it.json.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { continue; } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
  const codigo = String(b.codigo || '').toUpperCase();
  if (!CODIGO.test(codigo)) continue;
  const p = { codigo };
  for (const c of CAMPOS) {
    const v = b[c];
    if (v === undefined || v === null || v === '') continue;
    p[c] = String(v).slice(0, (c === 'pagina' || c === 'referrer') ? 500 : 300);
  }
  if (p.evento && !EVENTOS.includes(p.evento)) delete p.evento;
  if (b.ensaio === true || b.ensaio === 'true') p.ensaio = true;
  out.push({ json: { p } });
}
return out;
