// [RASTREIO 8] Uma vez por dia: se algo saiu da faixa, o workflow ESTOURA de propósito, e o errorWorkflow
// da instância avisa (com o freio de repetição que ele já tem). Verde com contador em zero é suspeito.
const cfg = $('configuracoes').first().json;
const s = $input.first().json || {};
const alertas = [];
if (cfg.espera_sessoes && Number(s.sessoes_24h) === 0) alertas.push('nenhuma visita registrada pela etiqueta em 24 h (a etiqueta saiu da página?)');
if (Number(s.cliques_whatsapp_24h) > 5 && Number(s.casadas_24h) === 0) alertas.push(`${s.cliques_whatsapp_24h} cliques no WhatsApp e nenhum lead casado em 24 h (o webhook do Kommo parou?)`);
if (Number(s.sem_lead_24h) > (cfg.teto_sem_lead || 10)) alertas.push(`${s.sem_lead_24h} provas de origem sem lead em 24 h`);
if (Number(s.fila_parada) > 0) alertas.push(`${s.fila_parada} conversões paradas há mais de 6 h na fila`);
if (Number(s.recusados_24h) > 0) alertas.push(`${s.recusados_24h} conversões recusadas pela plataforma em 24 h`);
if (Number(s.valor_suspeito_24h) > 0) alertas.push(`${s.valor_suspeito_24h} vendas com valor fora da faixa (centavos?), não enviadas`);
return [{ json: { ...s, alertas, tem_alerta: alertas.length > 0,
  mensagem: `[RASTREIO ${cfg.cliente}] ` + alertas.join(' | ') } }];
