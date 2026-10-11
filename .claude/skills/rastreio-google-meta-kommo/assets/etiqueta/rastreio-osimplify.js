/*!
 * Etiqueta de rastreio da Osimplify (skill rastreio-google-meta-kommo).
 *
 * O que faz na página do cliente:
 *  1. guarda o clique do anúncio (gclid, gbraid, wbraid, fbclid) e as UTMs;
 *  2. sorteia um código curto (5 letras, sem 0/O/1/I) e manda para o n8n do cliente;
 *  3. no clique de qualquer botão de WhatsApp, põe o código no fim da mensagem: "... [7KQ2M]".
 * O n8n lê o código quando a mensagem chega no Kommo e grava a origem no lead.
 *
 * Instalação (uma linha, antes do </body>):
 *   <script src="rastreio-osimplify.js" data-endpoint="https://<webhook do n8n>/webhook/rastreio-sessao-<slug>" defer></script>
 * Atributos opcionais: data-texto="Olá! Quero um orçamento" (quando o link do WhatsApp não tem texto),
 *                      data-ensaio="1" (marca as sessões como teste).
 *
 * Por que assim:
 *  - envia por fetch keepalive, form-urlencoded, sem credencial: é requisição "simples", sem preflight,
 *    e o CORS com "*" do n8n aceita. O sendBeacon vai COM credencial e o "*" bloqueia, calado.
 *  - o código troca quando chega um clique NOVO de anúncio; sem clique novo, reaproveita por 30 dias.
 *  - o código só é posto no CLIQUE: link copiado da página não leva a identidade de ninguém.
 */
(function (raiz) {
  'use strict';

  var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var CHAVE = 'osi_rastreio';
  var VALIDADE_MS = 30 * 24 * 3600 * 1000;
  var CLIQUES = ['gclid', 'gbraid', 'wbraid', 'fbclid'];
  var UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var MARCA = /\[[A-HJ-NP-Z2-9]{5}\]/;

  function sortearCodigo(aleatorio) {
    var r = aleatorio || Math.random, s = '';
    for (var i = 0; i < 5; i++) s += ALFABETO.charAt(Math.floor(r() * ALFABETO.length));
    return s;
  }

  function lerParametros(busca) {
    var out = {}, q = new URLSearchParams(busca || '');
    CLIQUES.concat(UTMS).forEach(function (k) {
      var v = q.get(k);
      if (v) out[k] = String(v).slice(0, 300);
    });
    return out;
  }

  // Decide se o código guardado continua valendo.
  function decidirSessao(guardada, params, agora) {
    var temCliqueNovo = CLIQUES.some(function (k) { return params[k] && (!guardada || guardada[k] !== params[k]); });
    var vencida = !guardada || !guardada.criado || (agora - guardada.criado) > VALIDADE_MS;
    if (!guardada || vencida || temCliqueNovo) {
      var nova = { codigo: null, criado: agora };
      CLIQUES.concat(UTMS).forEach(function (k) { if (params[k]) nova[k] = params[k]; });
      return { sessao: nova, nova: true };
    }
    // mesma sessão: UTM nova não troca o primeiro toque
    return { sessao: guardada, nova: false };
  }

  function ehLinkDeWhatsapp(href) {
    return /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|(www\.)?whatsapp\.com\/send)|^whatsapp:\/\//i.test(href || '');
  }

  // Põe "[CODIGO]" no fim do texto do link. Não duplica e não mexe no resto do endereço.
  function marcarLink(href, codigo, textoPadrao) {
    if (!href || !codigo || !ehLinkDeWhatsapp(href)) return href;
    var m = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    var base = m[1], q = new URLSearchParams((m[2] || '').slice(1)), ancora = m[3] || '';
    var texto = q.get('text') || textoPadrao || 'Olá!';
    if (MARCA.test(texto)) return href;
    q.set('text', texto.replace(/\s+$/, '') + ' [' + codigo + ']');
    return base + '?' + q.toString().replace(/\+/g, '%20') + ancora;
  }

  var api = { sortearCodigo: sortearCodigo, lerParametros: lerParametros, decidirSessao: decidirSessao,
              ehLinkDeWhatsapp: ehLinkDeWhatsapp, marcarLink: marcarLink, ALFABETO: ALFABETO };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (!raiz || !raiz.document) return;

  // ---------------------------------------------------------------- no navegador
  var doc = raiz.document;
  var script = doc.currentScript || doc.querySelector('script[data-endpoint]');
  var endpoint = script && script.getAttribute('data-endpoint');
  if (!endpoint) return;
  var textoPadrao = (script.getAttribute('data-texto') || '').trim();
  var ensaio = script.getAttribute('data-ensaio') === '1';

  function ler() { try { return JSON.parse(raiz.localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } }
  function guardar(s) { try { raiz.localStorage.setItem(CHAVE, JSON.stringify(s)); } catch (e) { /* aba anônima: segue sem memória */ } }
  function cookie(nome) {
    var m = doc.cookie.match(new RegExp('(?:^|; )' + nome + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function enviar(sessao, evento) {
    var corpo = { codigo: sessao.codigo, pagina: raiz.location.pathname, referrer: doc.referrer || '' };
    CLIQUES.concat(UTMS).forEach(function (k) { if (sessao[k]) corpo[k] = sessao[k]; });
    var fbp = cookie('_fbp'), fbc = cookie('_fbc');
    if (!fbc && sessao.fbclid) fbc = 'fb.1.' + sessao.criado + '.' + sessao.fbclid;
    if (fbp) corpo.fbp = fbp;
    if (fbc) corpo.fbc = fbc;
    if (evento) corpo.evento = evento;
    if (ensaio) corpo.ensaio = 'true';
    try {
      raiz.fetch(endpoint, { method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: true,
                             body: new URLSearchParams(corpo) });
    } catch (e) { /* rastreio nunca quebra a página */ }
  }

  var agora = Date.now();
  var r = decidirSessao(ler(), lerParametros(raiz.location.search), agora);
  var sessao = r.sessao;
  if (!sessao.codigo) sessao.codigo = sortearCodigo();
  guardar(sessao);
  if (r.nova) enviar(sessao, 'visita');

  // Clique em link de WhatsApp: põe o código e avisa. Fase de captura, antes de qualquer outro script.
  doc.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || !ehLinkDeWhatsapp(a.getAttribute('href'))) return;
    a.setAttribute('href', marcarLink(a.getAttribute('href'), sessao.codigo, textoPadrao));
    enviar(sessao, 'whatsapp_click');
  }, true);

  // Botão que abre o WhatsApp por window.open (comum em widget flutuante).
  var abrir = raiz.open;
  raiz.open = function (url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === 'string' && ehLinkDeWhatsapp(url)) {
      args[0] = marcarLink(url, sessao.codigo, textoPadrao);
      enviar(sessao, 'whatsapp_click');
    }
    return abrir.apply(raiz, args);
  };
})(typeof window !== 'undefined' ? window : null);
