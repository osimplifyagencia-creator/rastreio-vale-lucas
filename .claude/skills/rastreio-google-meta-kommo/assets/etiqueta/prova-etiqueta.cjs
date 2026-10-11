// Prova das funções puras da etiqueta, nos dois sentidos. Uso: node prova-etiqueta.cjs
const e = require('./rastreio-osimplify.js');
let falhas = 0;
const confere = (nome, cond) => { if (!cond) { falhas++; console.log('FALHOU', nome); } };

// código: 5 letras do alfabeto, nunca 0, O, 1, I
let seq = 0; const fixo = () => (seq++ % 32) / 32;
const c = e.sortearCodigo(fixo);
confere('codigo tamanho', c.length === 5);
for (let i = 0; i < 2000; i++) {
  const x = e.sortearCodigo();
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(x)) { confere('alfabeto ' + x, false); break; }
}

// parâmetros
const p = e.lerParametros('?gclid=ABC&utm_source=google&utm_medium=cpc&outro=x');
confere('gclid lido', p.gclid === 'ABC' && p.utm_source === 'google' && !p.outro);

// sessão: nova sem guardada; reaproveita sem clique novo; troca com gclid novo; vence em 30 dias
const t0 = 1_700_000_000_000;
let r = e.decidirSessao(null, p, t0);
confere('nova sem guardada', r.nova && r.sessao.gclid === 'ABC');
const guardada = { ...r.sessao, codigo: 'AAAAA' };
r = e.decidirSessao(guardada, {}, t0 + 1000);
confere('reaproveita', !r.nova && r.sessao.codigo === 'AAAAA');
r = e.decidirSessao(guardada, { utm_source: 'outro' }, t0 + 1000);
confere('utm nova nao troca primeiro toque', !r.nova && r.sessao.utm_source === 'google');
r = e.decidirSessao(guardada, { gclid: 'ABC' }, t0 + 1000);
confere('mesmo gclid nao troca', !r.nova);
r = e.decidirSessao(guardada, { gclid: 'NOVO' }, t0 + 1000);
confere('gclid novo troca', r.nova && r.sessao.gclid === 'NOVO' && !r.sessao.codigo);
r = e.decidirSessao(guardada, {}, t0 + 31 * 24 * 3600 * 1000);
confere('vence em 30 dias', r.nova);

// links
confere('wa.me', e.ehLinkDeWhatsapp('https://wa.me/5548999466301'));
confere('api.whatsapp', e.ehLinkDeWhatsapp('https://api.whatsapp.com/send?phone=55'));
confere('whatsapp://', e.ehLinkDeWhatsapp('whatsapp://send?phone=55'));
confere('nao e whatsapp', !e.ehLinkDeWhatsapp('https://exemplo.com/wa.me'));
confere('nao e whatsapp 2', !e.ehLinkDeWhatsapp('https://valeambientes.com.br/contato'));

const m1 = e.marcarLink('https://wa.me/5548999466301?text=Ol%C3%A1!%20Preciso%20de%20ajuda', '7KQ2M');
confere('marca no fim', decodeURIComponent(m1.split('text=')[1]) === 'Olá! Preciso de ajuda [7KQ2M]');
confere('nao duplica', e.marcarLink(m1, '7KQ2M') === m1);
confere('nao troca codigo ja posto', e.marcarLink(m1, 'ZZZZZ') === m1);
const m2 = e.marcarLink('https://wa.me/5548999466301', '7KQ2M', 'Quero um orçamento');
confere('sem texto usa o padrao', decodeURIComponent(m2.split('text=')[1]) === 'Quero um orçamento [7KQ2M]');
const m3 = e.marcarLink('https://api.whatsapp.com/send?phone=5548999466301&text=Oi', '7KQ2M');
confere('mantem o telefone', m3.includes('phone=5548999466301') && decodeURIComponent(m3).includes('Oi [7KQ2M]'));
confere('espaco como %20, nunca +', !m1.includes('+'));
confere('outro link intacto', e.marcarLink('https://exemplo.com/?a=1', '7KQ2M') === 'https://exemplo.com/?a=1');

// a marca que o n8n procura casa com o que a etiqueta escreve
const marca = /\[([A-HJ-NP-Z2-9]{5})\]/;
confere('n8n acha o codigo', (decodeURIComponent(m1.split('text=')[1]).toUpperCase().match(marca) || [])[1] === '7KQ2M');

console.log(falhas ? `ETIQUETA falhas=${falhas}` : 'ETIQUETA falhas=0');
process.exitCode = falhas ? 1 : 0;
