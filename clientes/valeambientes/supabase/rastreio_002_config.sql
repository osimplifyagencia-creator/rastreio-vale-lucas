-- Config do rastreio de valeambientes. GERADO por rastreio.py montar a partir do config.json.
-- Roda DEPOIS do 001_rastreio.sql da skill. Idempotente. NÃO arma nada: armar é decisão à parte
-- (update rastreio_config set google_armado = true / meta_armado = true), com o ok do Nilton.
begin;
update public.rastreio_config set
  google_conta = null, google_conta_login = null, google_consentimento = null,
  meta_dataset_id = null, meta_waba_id = null, meta_test_event_code = null,
  meta_so_origem_meta = false, valor_max = 150000, janela_casamento_min = 30, atualizado_em = now()
where id = 1;
delete from public.rastreio_mapa;
insert into public.rastreio_mapa (pipeline_id, status_id, evento, google_acao_id, meta_evento, com_valor) values (12405720, 95858036, 'qualificado', null, 'QualifiedLead', false);
insert into public.rastreio_mapa (pipeline_id, status_id, evento, google_acao_id, meta_evento, com_valor) values (12405720, 95858040, 'orcamento', null, 'InitiateCheckout', false);
insert into public.rastreio_mapa (pipeline_id, status_id, evento, google_acao_id, meta_evento, com_valor) values (12405720, 142, 'venda', null, 'Purchase', true);
commit;
