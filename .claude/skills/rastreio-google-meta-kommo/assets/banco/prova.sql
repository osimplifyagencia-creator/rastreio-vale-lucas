-- Prova do 001_rastreio.sql nos dois sentidos: o caso certo passa e o errado é barrado.
-- Roda no PGlite (Postgres descartável), nunca em produção: ver o LEIA-ME da skill.
-- A última linha tem de ser: PROVA_DESFEITA falhas=0
do $$
declare
  falhas int := 0; r jsonb; x jsonb; n int; t text[]; ok boolean;
  procedure_falha text;
begin
  -- 1. telefone: as duas formas do mesmo celular, e a chave com DDD
  t := public.rastreio_tel_variantes('(48) 99946-6301');
  if t <> array['5548999466301', '554899466301'] then falhas := falhas + 1; raise notice 'F1 variantes %', t; end if;
  if public.rastreio_tel_variantes('554899466301') <> array['5548999466301', '554899466301'] then
    falhas := falhas + 1; raise notice 'F1b sem o nove'; end if;
  if public.rastreio_tel_chave('5548999466301') <> '4899466301' then falhas := falhas + 1; raise notice 'F1c chave'; end if;
  -- mesmo final, DDD diferente: chave diferente (nunca juntar pelos 8 últimos)
  if public.rastreio_tel_chave('5511999466301') = public.rastreio_tel_chave('5548999466301') then
    falhas := falhas + 1; raise notice 'F1d DDD ignorado'; end if;

  -- 2. hash igual ao calculado fora (python hashlib)
  if public.rastreio_sha256('+5548999466301') <> '8d9907a3bf23a0f174442f6acd3b160d7054b2997b91c492c6df2d996ae303f7'
     or public.rastreio_sha256('5548999466301') <> 'faa01507db312b5c9008e8622949c7fe2d0304d29df440e251c6eeb42d5a0c9b' then
    falhas := falhas + 1; raise notice 'F2 hash'; end if;

  -- 3. sessão: grava; código inválido é barrado
  r := public.rastreio_sessao_gravar('{"codigo":"7KQ2M","gclid":"CLIQUE-1","utm_source":"google","utm_medium":"cpc","pagina":"/sofas"}');
  if (r->>'novo')::boolean is not true then falhas := falhas + 1; raise notice 'F3 novo %', r; end if;
  ok := false;
  begin perform public.rastreio_sessao_gravar('{"codigo":"7KQ0M"}'); exception when others then ok := true; end;
  if not ok then falhas := falhas + 1; raise notice 'F3b codigo com 0 passou'; end if;
  ok := false;
  begin perform public.rastreio_sessao_gravar('{"codigo":"abc"}'); exception when others then ok := true; end;
  if not ok then falhas := falhas + 1; raise notice 'F3c codigo curto passou'; end if;

  -- 4. primeiro toque: segundo envio com outro gclid não troca; clique no WhatsApp entra
  r := public.rastreio_sessao_gravar('{"codigo":"7KQ2M","gclid":"CLIQUE-2","evento":"whatsapp_click"}');
  if (r->>'novo')::boolean then falhas := falhas + 1; raise notice 'F4 virou novo'; end if;
  if (select gclid from public.rastreio_sessoes where codigo = '7KQ2M') <> 'CLIQUE-1' then
    falhas := falhas + 1; raise notice 'F4b gclid sobrescrito'; end if;
  if (select clicou_whatsapp_em from public.rastreio_sessoes where codigo = '7KQ2M') is null then
    falhas := falhas + 1; raise notice 'F4c clique nao gravado'; end if;
  perform public.rastreio_sessao_gravar('{"codigo":"S4TE2"}');                      -- sessão sem anúncio
  perform public.rastreio_sessao_gravar('{"codigo":"FBXRG","fbclid":"FB-1"}');      -- fbclid sem UTM paga

  -- 5. evidências: repetida não entra duas vezes; sem código é barrada
  r := public.rastreio_evidencia_gravar('{"fonte":"kommo_codigo","chave_unica":"kommo:m1","codigo":"7kq2m","lead_id":1001,"contato_id":2001}');
  if (r->>'repetida')::boolean then falhas := falhas + 1; raise notice 'F5'; end if;
  r := public.rastreio_evidencia_gravar('{"fonte":"kommo_codigo","chave_unica":"kommo:m1","codigo":"7KQ2M","lead_id":1001}');
  if not (r->>'repetida')::boolean then falhas := falhas + 1; raise notice 'F5b duplicou'; end if;
  ok := false;
  begin perform public.rastreio_evidencia_gravar('{"fonte":"kommo_codigo","chave_unica":"kommo:m9"}'); exception when others then ok := true; end;
  if not ok then falhas := falhas + 1; raise notice 'F5c sem codigo passou'; end if;
  ok := false;
  begin perform public.rastreio_evidencia_gravar('{"fonte":"chute","chave_unica":"x"}'); exception when others then ok := true; end;
  if not ok then falhas := falhas + 1; raise notice 'F5d fonte inventada passou'; end if;
  perform public.rastreio_evidencia_gravar('{"fonte":"kommo_codigo","chave_unica":"kommo:m2","codigo":"S4TE2","lead_id":1002}');
  perform public.rastreio_evidencia_gravar('{"fonte":"kommo_codigo","chave_unica":"kommo:m3","codigo":"FBXRG","lead_id":1003}');
  perform public.rastreio_evidencia_gravar('{"fonte":"meta_referral","chave_unica":"wamid:1","telefone":"554899466301","ad_id":"AD9","ctwa_clid":"CTWA-1","headline":"Sofá retrátil"}');
  -- código sem lead, sem contato e sem telefone: nunca casa, então não pode entrar na fila (travaria a vez dos outros)
  perform public.rastreio_evidencia_gravar('{"fonte":"kommo_codigo","chave_unica":"kommo:orfa","codigo":"S4TE2"}');
  if (select estado from public.rastreio_evidencias where chave_unica = 'kommo:orfa') <> 'ignorado' then
    falhas := falhas + 1; raise notice 'F5e orfa entrou na fila'; end if;

  -- 6. a casar (a órfã acima NÃO conta: são 4): a origem certa para cada caso
  r := public.rastreio_a_casar(50);
  n := jsonb_array_length(r->'itens');
  if n <> 4 then falhas := falhas + 1; raise notice 'F6 itens %', n; end if;
  select x2 into x from jsonb_array_elements(r->'itens') x2 where (x2->>'lead_id') = '1001';
  if x->>'origem' <> 'Google Ads' or x->'dados'->>'gclid' <> 'CLIQUE-1' then falhas := falhas + 1; raise notice 'F6b google %', x; end if;
  select x2 into x from jsonb_array_elements(r->'itens') x2 where (x2->>'lead_id') = '1002';
  if x->>'origem' <> 'Site' then falhas := falhas + 1; raise notice 'F6c site %', x; end if;
  select x2 into x from jsonb_array_elements(r->'itens') x2 where (x2->>'lead_id') = '1003';
  if x->>'origem' <> 'Site' then falhas := falhas + 1; raise notice 'F6d fbclid sozinho virou anuncio %', x; end if;
  select x2 into x from jsonb_array_elements(r->'itens') x2 where x2->>'fonte' = 'meta_referral';
  if x->>'origem' <> 'Meta Ads' or x->>'tel_chave' <> '4899466301' or x->>'busca_tel' <> '99466301' then
    falhas := falhas + 1; raise notice 'F6e meta %', x; end if;

  -- 7. casamento: grava o lead; segundo casamento com outra origem não troca
  r := public.rastreio_casado(jsonb_build_object('evidencia_id', (select id from public.rastreio_evidencias where chave_unica = 'kommo:m1'), 'ok', true, 'lead_id', 1001));
  if r->>'origem' <> 'Google Ads' then falhas := falhas + 1; raise notice 'F7 %', r; end if;
  r := public.rastreio_casado(jsonb_build_object('evidencia_id', (select id from public.rastreio_evidencias where chave_unica = 'wamid:1'), 'ok', true, 'lead_id', 1001));
  if (select origem from public.rastreio_leads where lead_id = 1001) <> 'Google Ads' then
    falhas := falhas + 1; raise notice 'F7b primeiro toque sobrescrito'; end if;
  if (select ctwa_clid from public.rastreio_leads where lead_id = 1001) <> 'CTWA-1' then
    falhas := falhas + 1; raise notice 'F7c campo vazio nao preenchido'; end if;
  -- não casou: dentro da janela continua a_casar; fora vira sem_lead
  perform public.rastreio_evidencia_gravar('{"fonte":"meta_referral","chave_unica":"wamid:2","telefone":"5511988887777"}');
  r := public.rastreio_casado(jsonb_build_object('evidencia_id', (select id from public.rastreio_evidencias where chave_unica = 'wamid:2'), 'ok', false, 'motivo', 'nao_achou'));
  if r->>'estado' <> 'a_casar' then falhas := falhas + 1; raise notice 'F7d %', r; end if;
  update public.rastreio_evidencias set criado_em = now() - interval '2 hours' where chave_unica = 'wamid:2';
  r := public.rastreio_casado(jsonb_build_object('evidencia_id', (select id from public.rastreio_evidencias where chave_unica = 'wamid:2'), 'ok', false));
  if r->>'estado' <> 'sem_lead' then falhas := falhas + 1; raise notice 'F7e %', r; end if;
  ok := false;
  begin perform public.rastreio_casado(jsonb_build_object('evidencia_id', (select id from public.rastreio_evidencias where chave_unica = 'kommo:m2'), 'ok', true)); exception when others then ok := true; end;
  if not ok then falhas := falhas + 1; raise notice 'F7f casado sem lead passou'; end if;
  perform public.rastreio_casado(jsonb_build_object('evidencia_id', (select id from public.rastreio_evidencias where chave_unica = 'kommo:m2'), 'ok', true, 'lead_id', 1002));

  -- 8. etapa: fora do mapa não enfileira; venda enfileira nas duas; repetir não duplica
  insert into public.rastreio_mapa values (12405720, 95858036, 'qualificado', 'ACAO-QUALI', 'QualifiedLead', false),
                                          (12405720, 142, 'venda', 'ACAO-VENDA', 'Purchase', true);
  update public.rastreio_config set valor_min = 300, valor_max = 150000, google_conta = '1234567890' where id = 1;
  r := public.rastreio_etapa('{"lead_id":1001,"pipeline_id":12405720,"status_id":95856292}');
  if (r->>'enfileirados')::int <> 0 then falhas := falhas + 1; raise notice 'F8 fora do mapa %', r; end if;
  r := public.rastreio_etapa('{"lead_id":1001,"pipeline_id":12405720,"status_id":142,"valor":6800,"telefones":["(48) 99946-6301"],"emails":[" Cliente@Exemplo.com "]}');
  if (r->>'google')::int <> 1 or (r->>'meta')::int <> 1 then falhas := falhas + 1; raise notice 'F8b %', r; end if;
  r := public.rastreio_etapa('{"lead_id":1001,"pipeline_id":12405720,"status_id":142,"valor":6800}');
  if (r->>'enfileirados')::int <> 0 then falhas := falhas + 1; raise notice 'F8c duplicou %', r; end if;
  select identificadores into x from public.rastreio_eventos where plataforma = 'google' and lead_id = 1001;
  if x->>'gclid' <> 'CLIQUE-1' or not (x->'telefones') ? '8d9907a3bf23a0f174442f6acd3b160d7054b2997b91c492c6df2d996ae303f7'
     or not (x->'emails') ? 'ad2df71d41942d725885ffc3a9ca7b4b7227b4c324735678c9ee6eb972eb01bb' then
    falhas := falhas + 1; raise notice 'F8d identificadores google %', x; end if;
  if (select action_source from public.rastreio_eventos where plataforma = 'meta' and lead_id = 1001) <> 'business_messaging' then
    falhas := falhas + 1; raise notice 'F8e meta sem ctwa'; end if;
  if (select identificadores->'telefones' from public.rastreio_eventos where plataforma = 'meta' and lead_id = 1001)
     ? '8d9907a3bf23a0f174442f6acd3b160d7054b2997b91c492c6df2d996ae303f7' then
    falhas := falhas + 1; raise notice 'F8f meta recebeu o hash com +'; end if;
  -- lead que veio do site sem clique do Google: Google não recebe, Meta recebe
  r := public.rastreio_etapa('{"lead_id":1002,"pipeline_id":12405720,"status_id":142,"valor":5000,"telefones":["11977776666"]}');
  if (r->>'google')::int <> 0 or r->>'motivo_google' <> 'sem_clique_do_google' or (r->>'meta')::int <> 1 then
    falhas := falhas + 1; raise notice 'F8g %', r; end if;
  -- valor em centavos (680000) é suspeito: entra como ignorado, não sai
  r := public.rastreio_etapa('{"lead_id":1003,"pipeline_id":12405720,"status_id":142,"valor":680000,"telefones":["11966665555"]}');
  if (select estado from public.rastreio_eventos where lead_id = 1003 and plataforma = 'meta') <> 'ignorado' then
    falhas := falhas + 1; raise notice 'F8h valor suspeito saiu'; end if;
  -- etapa sem valor: o valor do card não vai
  r := public.rastreio_etapa('{"lead_id":1001,"pipeline_id":12405720,"status_id":95858036,"valor":999}');
  if (select valor from public.rastreio_eventos where event_id = '1001:qualificado' and plataforma = 'google') is not null then
    falhas := falhas + 1; raise notice 'F8i valor em etapa sem valor'; end if;
  -- origem "Google Ads" só pela UTM, sem gclid (codificação automática desligada): o Google recusa o evento sem
  -- clique com DESTINATION_ACCOUNT_NOT_ENABLED_ENHANCED_CONVERSIONS_FOR_LEADS e a recusa derruba o lote inteiro
  insert into public.rastreio_leads (lead_id, origem, grau, utm_source, utm_medium) values (1009, 'Google Ads', 'A', 'google', 'cpc');
  r := public.rastreio_etapa('{"lead_id":1009,"pipeline_id":12405720,"status_id":95858036,"telefones":["11955554444"]}');
  if (r->>'google')::int <> 0 or r->>'motivo_google' <> 'sem_clique_do_google' or (r->>'meta')::int <> 1 then
    falhas := falhas + 1; raise notice 'F8j google sem clique entrou na fila %', r; end if;
  -- com a trava desligada (conta com conversões otimizadas para leads), o mesmo lead sai só com o telefone
  update public.rastreio_config set google_so_com_clique = false where id = 1;
  insert into public.rastreio_leads (lead_id, origem, grau) values (1010, 'Google Ads', 'A');
  r := public.rastreio_etapa('{"lead_id":1010,"pipeline_id":12405720,"status_id":95858036,"telefones":["11944443333"]}');
  if (r->>'google')::int <> 1 then falhas := falhas + 1; raise notice 'F8k trava desligada nao enfileirou %', r; end if;
  update public.rastreio_eventos set estado = 'ignorado', motivo = 'prova' where lead_id in (1009, 1010);
  update public.rastreio_config set google_so_com_clique = true where id = 1;

  -- 9. lote: meta desarmada e sem código de teste não entrega nada
  r := public.rastreio_lote('meta', 50);
  if jsonb_array_length(r->'itens') <> 0 or r->>'motivo' <> 'meta_desarmada_sem_codigo_de_teste' then
    falhas := falhas + 1; raise notice 'F9 %', r; end if;
  update public.rastreio_config set meta_test_event_code = 'TEST123', meta_dataset_id = 'DS1' where id = 1;
  r := public.rastreio_lote('meta', 50);
  if jsonb_array_length(r->'itens') <> 3 or r->>'meta_test_event_code' <> 'TEST123' then
    falhas := falhas + 1; raise notice 'F9b %', r; end if;
  -- chamado de novo logo depois: o que está 'enviando' não sai duas vezes
  if jsonb_array_length(public.rastreio_lote('meta', 50)->'itens') <> 0 then falhas := falhas + 1; raise notice 'F9c enviou duas vezes'; end if;
  r := public.rastreio_resultado(jsonb_build_object('ids', (select jsonb_agg(id) from public.rastreio_eventos where plataforma = 'meta' and estado = 'enviando'), 'estado', 'ensaio_ok'));
  if (r->>'atualizados')::int <> 3 then falhas := falhas + 1; raise notice 'F9d %', r; end if;
  ok := false;
  begin perform public.rastreio_resultado('{"ids":[1],"estado":"inventado"}'); exception when others then ok := true; end;
  if not ok then falhas := falhas + 1; raise notice 'F9e estado inventado passou'; end if;
  r := public.rastreio_rearmar('meta');
  if (r->>'voltaram')::int <> 3 then falhas := falhas + 1; raise notice 'F9f %', r; end if;
  -- google armado=false continua saindo (validateOnly), com a conta
  r := public.rastreio_lote('google', 50);
  if jsonb_array_length(r->'itens') <> 2 or (r->>'armado')::boolean or r->>'google_conta' <> '1234567890' then
    falhas := falhas + 1; raise notice 'F9g %', r; end if;

  -- 10. saúde lê sem erro
  r := public.rastreio_saude();
  if r->>'sem_lead_24h' is null then falhas := falhas + 1; raise notice 'F10 %', r; end if;

  raise exception 'PROVA_DESFEITA falhas=%', falhas;
end $$;
