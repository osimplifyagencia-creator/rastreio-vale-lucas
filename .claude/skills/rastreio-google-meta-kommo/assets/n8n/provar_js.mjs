// Prova dos códigos dos nós (assets/n8n/js) rodando o MESMO arquivo que vai para o n8n, com $input e $ falsos.
// Dois sentidos em cada nó: o caso certo passa e o errado é barrado. Uso: node provar_js.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CFG = {
  cliente: 'teste', kommo_api: 'https://x.kommo.com/api/v4', kommo_conta: 111, pipelines: [10],
  campos_tracking: { UTM_SOURCE: 1, UTM_MEDIUM: 2, UTM_CAMPAIGN: 3, UTM_CONTENT: 4, UTM_TERM: 5, GCLID: 6, FBCLID: 7 },
  campo_origem_id: 99, origem_enums: { 'Google Ads': 901, 'Meta Ads': 902, Site: 903 },
  etapas_mapeadas: ['10:20', '10:142'], espera_sessoes: true, lead_max_horas_antes: 48,
}
const it = (j) => ({ json: j })
async function rodar(arquivo, entrada, nos = {}) {
  const code = readFileSync(join(process.env.RASTREIO_JS_DIR || join(aqui, 'js'), arquivo), 'utf8')
  // nó que lê o gatilho pelo nome roda DEPOIS do configuracoes: o $input dele é a config, como no n8n
  const peloGatilho = code.includes("$('gatilho')")
  const doInput = peloGatilho ? [CFG] : entrada
  const $input = { all: () => doInput.map(it), first: () => it(doInput[0]) }
  const $ = (nome) => {
    const v = nome === 'configuracoes' ? [CFG] : nome === 'gatilho' && peloGatilho ? entrada : nos[nome]
    if (!v) throw new Error('no nao simulado: ' + nome)
    return { all: () => v.map(it), first: () => it(v[0]) }
  }
  const r = await new AsyncFunction('$input', '$', code)($input, $)
  return r.map((x) => x.json)
}
let falhas = 0, total = 0
const confere = (nome, cond) => { total++; if (!cond) { falhas++; console.log('FALHOU', nome) } }
const estoura = async (nome, fn) => { total++; try { await fn(); falhas++; console.log('FALHOU (nao estourou)', nome) } catch (e) { /* certo */ } }

// ---- 1 sessão
let r = await rodar('sessao_valida.js', [
  { body: { codigo: '7kq2m', gclid: 'G1', lixo: 'x', pagina: 'a'.repeat(900), evento: 'whatsapp_click' } },
  { body: { codigo: '7KQ0M' } }, { body: { codigo: 'ABCD' } }, { body: '{"codigo":"ZZZZZ","utm_source":"google"}' },
  { body: 'nao e json' }, { body: { codigo: 'AAAAA', evento: 'apagar_tudo' } }])
confere('sessao passa 3', r.length === 3)
confere('sessao maiuscula', r[0].p.codigo === '7KQ2M' && r[0].p.gclid === 'G1' && !('lixo' in r[0].p))
confere('sessao corta pagina', r[0].p.pagina.length === 500)
confere('sessao corpo string', r[1].p.codigo === 'ZZZZZ' && r[1].p.utm_source === 'google')
confere('sessao evento desconhecido cai', !('evento' in r[2].p))

// ---- 2 mensagem do Kommo
const msg = (i, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`message[add][${i}][${k}]`, v]))
r = await rodar('kommo_msg_extrai.js', [
  { body: { 'account[id]': '111', ...msg(0, { id: 'm1', type: 'incoming', text: 'Olá! quero sofá [7kq2m]', entity_type: 'lead', entity_id: '555', contact_id: '777' }),
            ...msg(1, { id: 'm2', type: 'outgoing', text: 'resposta [7KQ2M]', entity_type: 'lead', entity_id: '555' }),
            ...msg(2, { id: 'm3', type: 'incoming', text: 'sem codigo', entity_type: 'lead', entity_id: '555' }) } },
  { body: { 'account[id]': '999', ...msg(0, { id: 'm9', type: 'incoming', text: '[7KQ2M]', entity_type: 'lead', entity_id: '1' }) } }])
confere('kommo so a recebida com codigo', r.length === 1)
confere('kommo campos', r[0].p.codigo === '7KQ2M' && r[0].p.lead_id === 555 && r[0].p.contato_id === 777 && r[0].p.chave_unica === 'kommo:m1')

// ---- 3 referral da Meta
r = await rodar('meta_referral_extrai.js', [
  { entry: [{ changes: [{ value: { metadata: { phone_number_id: 'P1' }, messages: [
    { id: 'w1', from: '554899466301', referral: { source_type: 'ad', source_id: 'AD1', ctwa_clid: 'C1', headline: 'Sofá' } },
    { id: 'w2', from: '554899466301', text: { body: 'oi' } }] } }] }] }])
confere('meta so anuncio', r.length === 1 && r[0].p.ad_id === 'AD1' && r[0].p.ctwa_clid === 'C1' && r[0].p.chave_unica === 'wamid:w1')
confere('meta sem texto da conversa', !JSON.stringify(r).includes('"oi"'))

// ---- 4 casamento
const explode = await rodar('casamento_explode.js', [{ itens: [
  { evidencia_id: 1, lead_id: 555, fonte: 'kommo_codigo' },
  { evidencia_id: 2, lead_id: null, busca_tel: '99466301', tel_chave: '4899466301', fonte: 'meta_referral', criado_em: '2026-10-10T12:00:00Z' },
  { evidencia_id: 3, lead_id: null, busca_tel: '99466301', tel_chave: '4899466301', fonte: 'meta_referral' },
  { evidencia_id: 4, lead_id: null, busca_tel: '11112222', tel_chave: '1111112222', fonte: 'meta_referral' }] }])
const soContato = await rodar('casamento_explode.js', [{ itens: [{ evidencia_id: 7, lead_id: null, contato_id: 70, fonte: 'kommo_codigo' },
  { evidencia_id: 8, lead_id: null, contato_id: null, busca_tel: null, fonte: 'kommo_codigo' }] }])
confere('explode contato sem lead', soContato.length === 1 && soContato[0].busca_tipo === 'contato_id' && soContato[0].busca_url.endsWith('/contacts/70?with=leads'))
r = await rodar('casamento_resolve.js', [{ statusCode: 200, body: JSON.stringify({ id: 70, _embedded: { leads: [{ id: 800 }, { id: 812 }] } }) }], { explode: soContato })
confere('resolve contato_id pega o lead mais novo', r[0].lead_id === 812 && r[0].contato_id === 70)
r = await rodar('casamento_resolve.js', [{ statusCode: 200, body: JSON.stringify({ id: 70, _embedded: { leads: [] } }) }], { explode: soContato })
confere('resolve contato sem lead', r[0].lead_id === null && r[0].motivo === 'contato_sem_lead')
confere('explode urls',explode[0].busca_url.endsWith('/leads/555?with=contacts') && explode[1].busca_url.includes('/contacts?query=99466301'))
const contato = (id, tel, leads) => ({ id, custom_fields_values: [{ field_code: 'PHONE', values: [{ value: tel }] }], _embedded: { leads: leads.map((x) => ({ id: x })) } })
const respBusca = [
  { statusCode: 200, body: JSON.stringify({ id: 555, _embedded: { contacts: [{ id: 777 }] } }) },
  { statusCode: 200, body: JSON.stringify({ _embedded: { contacts: [contato(70, '+55 48 99946-6301', [800, 812]), contato(71, '+55 11 99946-6301', [999])] } }) },
  { statusCode: 200, body: JSON.stringify({ _embedded: { contacts: [contato(72, '+55 11 99946-6301', [999])] } }) },
  { statusCode: 204, body: '' }]
r = await rodar('casamento_resolve.js', respBusca, { explode })
confere('resolve lead direto', r[0].lead_id === 555 && r[0].contato_id === 777)
confere('resolve pega o lead mais novo do DDD certo', r[1].lead_id === 812 && r[1].contato_id === 70)
confere('resolve barra DDD diferente', r[2].lead_id === null && r[2].motivo === 'telefone_nao_confere')
confere('resolve 204 = nao achou', r[3].lead_id === null && r[3].motivo === 'contato_nao_achado')
await estoura('resolve credencial', () => rodar('casamento_resolve.js', [{ statusCode: 401, body: '' }, ...respBusca.slice(1)], { explode }))
await estoura('resolve erro de credencial no item', () => rodar('casamento_resolve.js', [{ error: { message: '401 Unauthorized' } }, ...respBusca.slice(1)], { explode }))
await estoura('resolve pareamento', () => rodar('casamento_resolve.js', respBusca.slice(0, 2), { explode }))

const achou = [
  { evidencia_id: 1, lead_id: 555, busca_tipo: 'lead', origem: 'Google Ads', grau: 'A', dados: { gclid: 'G1', utm_source: 'google', utm_campaign: 'sofas' } },
  { evidencia_id: 2, lead_id: 812, busca_tipo: 'contato', criado_em: '2026-10-10T12:00:00Z', origem: 'Meta Ads', dados: { utm_source: 'meta', ad_id: 'AD1' } },
  { evidencia_id: 5, lead_id: 813, busca_tipo: 'lead', origem: 'Google Ads', dados: { gclid: 'G2' } },
  { evidencia_id: 6, lead_id: 814, busca_tipo: 'contato', criado_em: '2026-10-10T12:00:00Z', origem: 'Meta Ads', dados: {} }]
const t10 = Date.parse('2026-10-10T12:00:00Z') / 1000
const leadsLidos = [
  { statusCode: 200, body: JSON.stringify({ id: 555, pipeline_id: 10, created_at: t10, custom_fields_values: [{ field_id: 1, values: [{ value: 'ja tinha' }] }] }) },
  { statusCode: 200, body: JSON.stringify({ id: 812, pipeline_id: 10, created_at: t10 - 3600, custom_fields_values: [{ field_id: 99, values: [{ enum_id: 903, value: 'Site' }] }] }) },
  { statusCode: 200, body: JSON.stringify({ id: 813, pipeline_id: 77, created_at: t10 }) },
  { statusCode: 200, body: JSON.stringify({ id: 814, pipeline_id: 10, created_at: t10 - 10 * 86400 }) }]
r = await rodar('casamento_decide.js', leadsLidos, { 'achou lead?': achou })
const ids = (x) => x.patch.custom_fields_values.map((c) => c.field_id).sort((a, b) => a - b)
confere('decide nao sobrescreve utm_source', !ids(r[0]).includes(1) && ids(r[0]).includes(6) && ids(r[0]).includes(3))
confere('decide grava origem vazia', r[0].patch.custom_fields_values.some((c) => c.field_id === 99 && c.values[0].enum_id === 901))
confere('decide nao troca origem preenchida', !ids(r[1]).includes(99) && r[1].ok)
confere('decide fora do funil', !r[2].ok && r[2].motivo === 'fora_do_funil_77' && !r[2].tem_patch)
confere('decide lead antigo pelo telefone', !r[3].ok && r[3].motivo === 'lead_antigo')
await estoura('decide credencial', () => rodar('casamento_decide.js', [{ statusCode: 403 }, ...leadsLidos.slice(1)], { 'achou lead?': achou }))

const temPatch = [{ evidencia_id: 1, ok: true, lead_id: 555 }, { evidencia_id: 2, ok: true, lead_id: 812 }, { evidencia_id: 3, ok: true, lead_id: 9 }]
r = await rodar('casamento_patch_confere.js', [{ statusCode: 200 }, { statusCode: 400 }, { error: { message: 'socket hang up' } }], { 'tem patch?': temPatch })
confere('patch aceito marca ok', r[0].ok === true && r[0].evidencia_id === 1)
confere('patch recusado volta para a fila', r[1].ok === false && r[1].motivo === 'patch_http_400' && r[2].ok === false)
await estoura('patch credencial', () => rodar('casamento_patch_confere.js', [{ statusCode: 401 }, { statusCode: 200 }, { statusCode: 200 }], { 'tem patch?': temPatch }))
await estoura('patch pareamento', () => rodar('casamento_patch_confere.js', [{ statusCode: 200 }], { 'tem patch?': temPatch }))

// ---- 5 etapa
const st = (i, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`leads[status][${i}][${k}]`, v]))
r = await rodar('etapa_extrai.js', [
  { body: { 'account[id]': '111', ...st(0, { id: '555', status_id: '142', pipeline_id: '10', old_status_id: '20' }), ...st(1, { id: '556', status_id: '30', pipeline_id: '10' }) } },
  { body: { 'account[id]': '999', ...st(0, { id: '557', status_id: '142', pipeline_id: '10' }) } }])
confere('etapa so a mapeada e da conta', r.length === 1 && r[0].lead_id === 555 && r[0].status_id === 142)
const extrai = r
r = await rodar('etapa_contato.js', [{ statusCode: 200, body: JSON.stringify({ id: 555, price: 6800,
  custom_fields_values: [{ field_id: 6, values: [{ value: 'G9' }] }], _embedded: { contacts: [{ id: 1, is_main: false }, { id: 2, is_main: true }] } }) }], { extrai })
confere('etapa contato principal', r[0].contato_url.endsWith('/contacts/2') && r[0].valor === 6800 && r[0].gclid === 'G9')
r = await rodar('etapa_monta.js', [{ statusCode: 200, body: JSON.stringify({ custom_fields_values: [
  { field_code: 'PHONE', values: [{ value: '+55 48 99946-6301' }, { value: '' }] }, { field_code: 'EMAIL', values: [{ value: 'a@b.com' }] }] }) }], { contato: r })
confere('etapa monta', r[0].p.telefones.length === 1 && r[0].p.emails[0] === 'a@b.com' && r[0].p.valor === 6800 && r[0].p.gclid === 'G9')

// ---- 6 Google
const loteG = { armado: false, google_conta: '123-456-7890', google_fonte_evento: 'WEB', itens: [
  { id: 1, event_id: '555:venda', destino: 'A1', ocorrido_em: '2026-10-10T12:00:00Z', valor: 6800, moeda: 'BRL', identificadores: { gclid: 'G1', gbraid: 'B1', telefones: ['h1'], emails: ['h2'] } },
  { id: 2, event_id: '556:venda', destino: 'A1', ocorrido_em: '2026-10-10T12:00:00Z', valor: null, identificadores: { wbraid: 'W1' } },
  { id: 3, event_id: '555:qualificado', destino: 'A2', ocorrido_em: '2026-10-10T12:00:00Z', identificadores: { gclid: 'G1' } }] }
r = await rodar('google_monta.js', [loteG])
confere('google uma requisicao por acao', r.length === 2 && r[0].ids.join() === '1,2')
confere('google desarmado = validateOnly', r[0].body.validateOnly === true && r[0].armado === false)
confere('google gclid vence gbraid', r[0].body.events[0].adIdentifiers.gclid === 'G1' && !r[0].body.events[0].adIdentifiers.gbraid)
confere('google hash e valor', r[0].body.events[0].userData.userIdentifiers.length === 2 && r[0].body.events[0].conversionValue === 6800)
confere('google sem valor nao manda moeda', !('currency' in r[0].body.events[1]))
confere('google conta so digitos', r[0].body.destinations[0].operatingAccount.accountId === '1234567890')
confere('google sem consentimento nao inventa', !('consent' in r[0].body.events[0]))
r = await rodar('google_monta.js', [{ ...loteG, armado: true, google_consentimento: 'CONSENT_GRANTED' }])
confere('google armado envia de verdade', r[0].body.validateOnly === false && r[0].body.events[0].consent.adUserData === 'CONSENT_GRANTED')
await estoura('google conta errada', () => rodar('google_monta.js', [{ ...loteG, google_conta: '123' }]))
confere('google lote vazio nao chama', (await rodar('google_monta.js', [{ itens: [] }])).length === 0)

// ---- 7 Meta
const loteM = { armado: false, meta_dataset_id: 'DS', meta_waba_id: 'WABA', meta_versao: 'v21.0', meta_test_event_code: 'TEST1', itens: [
  { id: 1, event_id: '555:venda', destino: 'Purchase', ocorrido_em: '2026-10-10T12:00:00Z', valor: 6800, moeda: 'BRL', action_source: 'business_messaging', identificadores: { ctwa_clid: 'C1', telefones: ['h1'] } },
  { id: 2, event_id: '556:venda', destino: 'Purchase', ocorrido_em: '2026-10-10T12:00:00Z', valor: 5000, action_source: 'system_generated', identificadores: { telefones: ['h3'], fbc: 'fb.1.1.x' } }] }
r = await rodar('meta_monta.js', [loteM])
confere('meta teste so desarmada', r[0].body.test_event_code === 'TEST1' && r[0].url.endsWith('/v21.0/DS/events'))
confere('meta ctwa', r[0].body.data[0].messaging_channel === 'whatsapp' && r[0].body.data[0].user_data.ctwa_clid === 'C1' && r[0].body.data[0].user_data.whatsapp_business_account_id === 'WABA')
confere('meta sem ctwa nao vira messaging', !('messaging_channel' in r[0].body.data[1]) && r[0].body.data[1].user_data.fbc === 'fb.1.1.x')
confere('meta event_id para deduplicar', r[0].body.data[0].event_id === '555:venda')
r = await rodar('meta_monta.js', [{ ...loteM, armado: true }])
confere('meta armada sem codigo de teste', !('test_event_code' in r[0].body))

// ---- 6/7 resultado
const monta = [{ ids: [1], armado: true }, { ids: [2], armado: false }, { ids: [3], armado: true }, { ids: [4], armado: true }]
r = await rodar('envio_resultado.js', [{ statusCode: 200, body: {} }, { statusCode: 200, body: {} }, { statusCode: 400, body: { error: 'x' } }, { statusCode: 429, body: {} }], { monta })
confere('resultado estados', r.map((x) => x.p.estado).join() === 'enviado,ensaio_ok,recusado,erro')
r = await rodar('envio_resultado.js', [{ error: { message: 'getaddrinfo ENOTFOUND' } }], { monta: [monta[0]] })
confere('resultado rede caiu = erro', r[0].p.estado === 'erro')
await estoura('resultado credencial', () => rodar('envio_resultado.js', [{ statusCode: 401, body: {} }], { monta: [monta[0]] }))

// ---- 8 saúde
r = await rodar('saude_avalia.js', [{ sessoes_24h: 0, cliques_whatsapp_24h: 0, casadas_24h: 0, sem_lead_24h: 0, fila_parada: 0, recusados_24h: 0, valor_suspeito_24h: 0 }])
confere('saude sem visita alerta', r[0].tem_alerta && r[0].alertas.length === 1)
r = await rodar('saude_avalia.js', [{ sessoes_24h: 40, cliques_whatsapp_24h: 12, casadas_24h: 9, sem_lead_24h: 2, fila_parada: 0, recusados_24h: 0, valor_suspeito_24h: 0 }])
confere('saude normal calada', !r[0].tem_alerta)
r = await rodar('saude_avalia.js', [{ sessoes_24h: 40, cliques_whatsapp_24h: 12, casadas_24h: 0, sem_lead_24h: 0, fila_parada: 3, recusados_24h: 1, valor_suspeito_24h: 0 }])
confere('saude pega casamento parado e fila', r[0].alertas.length === 3)

console.log(`NOS total=${total} falhas=${falhas}`)
process.exitCode = falhas ? 1 : 0
