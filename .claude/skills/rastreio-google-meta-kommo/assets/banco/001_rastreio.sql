-- Rastreio de origem e conversão (Google Ads e Meta) até o Kommo, com a volta para as plataformas.
-- Skill: rastreio-google-meta-kommo. Roda no Supabase DO CLIENTE (o da Vale: awdxhenuyvsqsivvkycj).
--
-- Desenho:
--   rastreio_sessoes    o clique que chegou na página (gclid, fbclid, UTMs) e o código que vai na mensagem
--   rastreio_evidencias cada prova de origem que chegou (código lido no Kommo, referral da Meta)
--   rastreio_leads      a origem de cada lead, primeiro toque, nunca sobrescrita
--   rastreio_mapa       etapa do Kommo -> evento de conversão (DADO, não código)
--   rastreio_eventos    a fila do que vai para o Google e para a Meta, uma linha por (plataforma, evento do lead)
--   rastreio_config     os interruptores (armado) e os ids das contas
--
-- Só o service_role lê e escreve (o n8n, pela credencial Supabase). O navegador nunca fala com o banco:
-- a etiqueta da página manda para um webhook do n8n, que valida e chama rastreio_sessao_gravar.
-- Telefone e e-mail viram SHA-256 AQUI, no banco. O texto cru não sai para o n8n de envio.
--
-- Idempotente: pode rodar duas vezes.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.rastreio_config (
  id                      int primary key default 1 check (id = 1),
  google_armado           boolean not null default false,  -- false = validateOnly (ensaio)
  google_conta            text,                            -- id da conta de anúncios, 10 dígitos sem traço
  google_conta_login      text,                            -- conta administradora, se o acesso passar por ela
  google_fonte_evento     text not null default 'WEB',
  google_consentimento    text,                            -- CONSENT_GRANTED / CONSENT_DENIED; nulo = não manda o campo
  google_so_com_clique    boolean not null default true,   -- sem gclid/gbraid/wbraid e sem origem Google, não envia
  meta_armado             boolean not null default false,
  meta_test_event_code    text,                            -- desarmada e sem código de teste = nada sai
  meta_dataset_id         text,
  meta_waba_id            text,
  meta_versao             text not null default 'v21.0',
  meta_so_origem_meta     boolean not null default false,  -- true = só manda lead que veio da Meta
  moeda                   text not null default 'BRL',
  valor_min               numeric not null default 0,
  valor_max               numeric,                         -- acima disso o valor é suspeito (centavos x reais)
  janela_casamento_min    int not null default 30,         -- evidência sem lead depois disso vira sem_lead
  atualizado_em           timestamptz not null default now()
);
insert into public.rastreio_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.rastreio_mapa (
  pipeline_id     bigint not null,
  status_id       bigint not null,
  evento          text   not null check (evento ~ '^[a-z_]{3,30}$'),
  google_acao_id  text,               -- id da ação de conversão "Importar de cliques"
  meta_evento     text,               -- nome do evento na Meta (Purchase, QualifiedLead...)
  com_valor       boolean not null default false,
  primary key (pipeline_id, status_id)
);

create table if not exists public.rastreio_sessoes (
  codigo              text primary key check (codigo ~ '^[A-HJ-NP-Z2-9]{5}$'),
  criado_em           timestamptz not null default now(),
  visto_em            timestamptz not null default now(),
  clicou_whatsapp_em  timestamptz,
  gclid text, gbraid text, wbraid text, fbclid text, fbc text, fbp text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  pagina text, referrer text,
  ensaio              boolean not null default false
);

create table if not exists public.rastreio_evidencias (
  id            bigint generated always as identity primary key,
  criado_em     timestamptz not null default now(),
  fonte         text not null check (fonte in ('kommo_codigo', 'meta_referral', 'google_formulario')),
  chave_unica   text not null unique,          -- id da mensagem: o mesmo evento nunca entra duas vezes
  codigo        text,
  telefone      text,
  lead_id       bigint,
  contato_id    bigint,
  ad_id         text,
  ctwa_clid     text,
  headline      text,
  source_url    text,
  dados         jsonb not null default '{}'::jsonb,
  estado        text not null default 'a_casar' check (estado in ('a_casar', 'casado', 'sem_lead', 'ignorado')),
  tentativas    int not null default 0,
  motivo        text,
  casado_em     timestamptz,
  ensaio        boolean not null default false
);
create index if not exists rastreio_evidencias_a_casar on public.rastreio_evidencias (id) where estado = 'a_casar';

create table if not exists public.rastreio_leads (
  lead_id       bigint primary key,
  origem        text,
  grau          text check (grau in ('A', 'B', 'D')),
  codigo        text,
  gclid text, gbraid text, wbraid text, fbclid text, fbc text, fbp text,
  ctwa_clid text, ad_id text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  evidencia_id  bigint references public.rastreio_evidencias (id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.rastreio_eventos (
  id              bigint generated always as identity primary key,
  event_id        text not null,                 -- lead_id:evento, igual nas duas plataformas
  plataforma      text not null check (plataforma in ('google', 'meta')),
  lead_id         bigint not null,
  evento          text not null,
  destino         text not null,                 -- google: id da ação; meta: nome do evento
  ocorrido_em     timestamptz not null,
  valor           numeric,
  moeda           text,
  action_source   text,
  identificadores jsonb not null default '{}'::jsonb,
  estado          text not null default 'pendente'
                  check (estado in ('pendente', 'enviando', 'enviado', 'ensaio_ok', 'recusado', 'erro', 'ignorado')),
  tentativas      int not null default 0,
  motivo          text,
  resposta        jsonb,
  criado_em       timestamptz not null default now(),
  tentado_em      timestamptz,
  enviado_em      timestamptz,
  unique (plataforma, event_id)
);
create index if not exists rastreio_eventos_fila on public.rastreio_eventos (plataforma, id)
  where estado in ('pendente', 'erro', 'enviando');

alter table public.rastreio_config     enable row level security;
alter table public.rastreio_mapa       enable row level security;
alter table public.rastreio_sessoes    enable row level security;
alter table public.rastreio_evidencias enable row level security;
alter table public.rastreio_leads      enable row level security;
alter table public.rastreio_eventos    enable row level security;
revoke all on public.rastreio_config, public.rastreio_mapa, public.rastreio_sessoes,
              public.rastreio_evidencias, public.rastreio_leads, public.rastreio_eventos
  from anon, authenticated;

-- ---------------------------------------------------------------- telefone

-- Só dígitos.
create or replace function public.rastreio_tel_digitos(t text) returns text
language sql immutable as $$ select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '') $$;

-- As formas do mesmo celular brasileiro, com e sem o nono dígito, sempre com o 55 na frente.
-- O WhatsApp entrega uns números sem o 9 e o Kommo guarda com: mandar as duas não erra a pessoa.
create or replace function public.rastreio_tel_variantes(t text) returns text[]
language plpgsql immutable as $$
declare d text := public.rastreio_tel_digitos(t); nac text; ddd text; num text; r text[] := '{}';
begin
  if d is null then return r; end if;
  if length(d) in (10, 11) then d := '55' || d; end if;
  if left(d, 2) <> '55' or length(d) not in (12, 13) then return array[d]; end if;
  nac := substr(d, 3); ddd := left(nac, 2); num := substr(nac, 3);
  if length(num) = 9 and left(num, 1) = '9' then
    r := array['55' || ddd || num, '55' || ddd || substr(num, 2)];
  elsif length(num) = 8 and left(num, 1) in ('6', '7', '8', '9') then
    r := array['55' || ddd || '9' || num, '55' || ddd || num];
  else
    r := array['55' || ddd || num];
  end if;
  return r;
end $$;

-- A chave para casar pessoa: DDD + 8 últimos. NUNCA só os 8 últimos (junta DDDs diferentes).
create or replace function public.rastreio_tel_chave(t text) returns text
language plpgsql immutable as $$
declare v text[] := public.rastreio_tel_variantes(t);
begin
  if coalesce(array_length(v, 1), 0) = 0 then return null; end if;
  if left(v[1], 2) = '55' and length(v[1]) in (12, 13) then
    return substr(v[1], 3, 2) || right(v[1], 8);
  end if;
  return v[1];
end $$;

create or replace function public.rastreio_sha256(t text) returns text
language sql immutable as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;

-- ---------------------------------------------------------------- entrada

-- A etiqueta da página, já validada pelo n8n. Primeiro toque: o que já tem valor não é trocado.
create or replace function public.rastreio_sessao_gravar(p jsonb) returns jsonb
language plpgsql as $$
declare cod text := upper(coalesce(p->>'codigo', '')); novo boolean;
begin
  if cod !~ '^[A-HJ-NP-Z2-9]{5}$' then
    raise exception 'rastreio: codigo invalido (%)', left(cod, 20);
  end if;
  insert into public.rastreio_sessoes as s (
    codigo, gclid, gbraid, wbraid, fbclid, fbc, fbp,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, pagina, referrer, ensaio, clicou_whatsapp_em)
  values (
    cod, nullif(p->>'gclid', ''), nullif(p->>'gbraid', ''), nullif(p->>'wbraid', ''),
    nullif(p->>'fbclid', ''), nullif(p->>'fbc', ''), nullif(p->>'fbp', ''),
    nullif(p->>'utm_source', ''), nullif(p->>'utm_medium', ''), nullif(p->>'utm_campaign', ''),
    nullif(p->>'utm_content', ''), nullif(p->>'utm_term', ''),
    left(nullif(p->>'pagina', ''), 500), left(nullif(p->>'referrer', ''), 500),
    coalesce((p->>'ensaio')::boolean, false),
    case when p->>'evento' = 'whatsapp_click' then now() end)
  on conflict (codigo) do update set
    visto_em           = now(),
    gclid              = coalesce(s.gclid, excluded.gclid),
    gbraid             = coalesce(s.gbraid, excluded.gbraid),
    wbraid             = coalesce(s.wbraid, excluded.wbraid),
    fbclid             = coalesce(s.fbclid, excluded.fbclid),
    fbc                = coalesce(s.fbc, excluded.fbc),
    fbp                = coalesce(s.fbp, excluded.fbp),
    utm_source         = coalesce(s.utm_source, excluded.utm_source),
    utm_medium         = coalesce(s.utm_medium, excluded.utm_medium),
    utm_campaign       = coalesce(s.utm_campaign, excluded.utm_campaign),
    utm_content        = coalesce(s.utm_content, excluded.utm_content),
    utm_term           = coalesce(s.utm_term, excluded.utm_term),
    pagina             = coalesce(s.pagina, excluded.pagina),
    referrer           = coalesce(s.referrer, excluded.referrer),
    clicou_whatsapp_em = coalesce(s.clicou_whatsapp_em, excluded.clicou_whatsapp_em)
  returning (xmax = 0) into novo;
  return jsonb_build_object('codigo', cod, 'novo', novo);
end $$;

-- Uma prova de origem: o código lido numa mensagem do Kommo ou o referral da Meta.
-- Grava primeiro, casa depois (a mensagem da Meta pode chegar antes de o Kommo criar o lead).
create or replace function public.rastreio_evidencia_gravar(p jsonb) returns jsonb
language plpgsql as $$
declare f text := p->>'fonte'; novo_id bigint;
begin
  if f not in ('kommo_codigo', 'meta_referral', 'google_formulario') then
    raise exception 'rastreio: fonte desconhecida (%)', f;
  end if;
  if coalesce(p->>'chave_unica', '') = '' then raise exception 'rastreio: chave_unica vazia'; end if;
  if f = 'kommo_codigo' and coalesce(p->>'codigo', '') = '' then raise exception 'rastreio: kommo_codigo sem codigo'; end if;
  if f = 'meta_referral' and public.rastreio_tel_digitos(p->>'telefone') is null then
    raise exception 'rastreio: meta_referral sem telefone';
  end if;
  -- sem lead, sem contato e sem telefone não há como casar: entra já IGNORADA. Em a_casar ela ficaria na
  -- frente da fila para sempre (a fila anda por id) e tomaria a vez das outras.
  insert into public.rastreio_evidencias (
    fonte, chave_unica, codigo, telefone, lead_id, contato_id, ad_id, ctwa_clid, headline, source_url, dados, ensaio,
    estado, motivo)
  values (
    f, p->>'chave_unica', upper(nullif(p->>'codigo', '')), public.rastreio_tel_digitos(p->>'telefone'),
    nullif(p->>'lead_id', '')::bigint, nullif(p->>'contato_id', '')::bigint,
    nullif(p->>'ad_id', ''), nullif(p->>'ctwa_clid', ''), left(nullif(p->>'headline', ''), 200),
    left(nullif(p->>'source_url', ''), 500), coalesce(p->'dados', '{}'::jsonb), coalesce((p->>'ensaio')::boolean, false),
    case when nullif(p->>'lead_id', '') is null and nullif(p->>'contato_id', '') is null
              and public.rastreio_tel_digitos(p->>'telefone') is null then 'ignorado' else 'a_casar' end,
    case when nullif(p->>'lead_id', '') is null and nullif(p->>'contato_id', '') is null
              and public.rastreio_tel_digitos(p->>'telefone') is null then 'sem_lead_contato_ou_telefone' end)
  on conflict (chave_unica) do nothing
  returning id into novo_id;
  return jsonb_build_object('id', novo_id, 'repetida', novo_id is null);
end $$;

-- ---------------------------------------------------------------- casamento

-- A origem que uma evidência prova. Um classificador só, usado no casamento e em nenhum outro lugar.
create or replace function public.rastreio_origem_da_evidencia(e public.rastreio_evidencias) returns jsonb
language plpgsql stable as $$
declare s public.rastreio_sessoes; src text; med text; origem text;
begin
  if e.fonte = 'meta_referral' then
    return jsonb_build_object('origem', 'Meta Ads', 'grau', 'A', 'dados', jsonb_strip_nulls(jsonb_build_object(
      'ad_id', e.ad_id, 'ctwa_clid', e.ctwa_clid,
      -- marca honesta: é clique para WhatsApp, não UTM de URL
      'utm_source', 'meta', 'utm_medium', 'ctwa', 'utm_content', e.headline, 'utm_term', e.ad_id)));
  end if;
  select * into s from public.rastreio_sessoes where codigo = e.codigo;
  if not found then
    return jsonb_build_object('origem', null, 'grau', null, 'dados', '{}'::jsonb, 'motivo', 'codigo_sem_sessao');
  end if;
  src := lower(coalesce(s.utm_source, '')); med := lower(coalesce(s.utm_medium, ''));
  origem := case
    when s.gclid is not null or s.gbraid is not null or s.wbraid is not null then 'Google Ads'
    when src in ('google', 'adwords') and med in ('cpc', 'ppc', 'paid', 'pago', 'ads') then 'Google Ads'
    -- fbclid sozinho NÃO prova anúncio: link orgânico do Instagram também leva fbclid
    when src in ('facebook', 'fb', 'instagram', 'ig', 'meta') and med in ('cpc', 'paid', 'pago', 'ads', 'paid_social', 'cpm') then 'Meta Ads'
    else 'Site' end;
  return jsonb_build_object('origem', origem, 'grau', 'A', 'dados', jsonb_strip_nulls(jsonb_build_object(
    'codigo', s.codigo, 'gclid', s.gclid, 'gbraid', s.gbraid, 'wbraid', s.wbraid,
    'fbclid', s.fbclid, 'fbc', s.fbc, 'fbp', s.fbp,
    'utm_source', s.utm_source, 'utm_medium', s.utm_medium, 'utm_campaign', s.utm_campaign,
    'utm_content', s.utm_content, 'utm_term', s.utm_term)));
end $$;

create or replace function public.rastreio_a_casar(limite int default 50) returns jsonb
language sql stable as $$
  select jsonb_build_object('itens', coalesce(jsonb_agg(
    jsonb_build_object(
      'evidencia_id', e.id, 'fonte', e.fonte, 'criado_em', e.criado_em, 'ensaio', e.ensaio,
      'lead_id', e.lead_id, 'contato_id', e.contato_id,
      'busca_tel', right(public.rastreio_tel_digitos(e.telefone), 8),
      'tel_chave', public.rastreio_tel_chave(e.telefone)
    ) || public.rastreio_origem_da_evidencia(e)
    order by e.id), '[]'::jsonb))
  -- `e` tem de ser a TABELA (não uma subconsulta): a função de origem recebe o tipo da linha
  from public.rastreio_evidencias e
  where e.id in (select id from public.rastreio_evidencias where estado = 'a_casar' order by id limit greatest(limite, 1))
$$;

-- Resultado do casamento. ok = achou o lead (e o n8n já gravou no Kommo só o campo vazio).
create or replace function public.rastreio_casado(p jsonb) returns jsonb
language plpgsql as $$
declare e public.rastreio_evidencias; o jsonb; d jsonb; janela int;
begin
  select * into e from public.rastreio_evidencias where id = (p->>'evidencia_id')::bigint for update;
  if not found then raise exception 'rastreio: evidencia % nao existe', p->>'evidencia_id'; end if;
  if e.estado <> 'a_casar' then return jsonb_build_object('estado', e.estado, 'mudou', false); end if;

  if coalesce((p->>'ok')::boolean, false) is false then
    select janela_casamento_min into janela from public.rastreio_config where id = 1;
    update public.rastreio_evidencias set
      tentativas = tentativas + 1, motivo = left(p->>'motivo', 200),
      estado = case when now() - criado_em > make_interval(mins => janela) then 'sem_lead' else 'a_casar' end
    where id = e.id returning * into e;
    return jsonb_build_object('estado', e.estado, 'mudou', e.estado <> 'a_casar');
  end if;

  if nullif(p->>'lead_id', '') is null then raise exception 'rastreio: casado sem lead_id'; end if;
  o := public.rastreio_origem_da_evidencia(e);
  d := coalesce(o->'dados', '{}'::jsonb);
  update public.rastreio_evidencias set
    estado = 'casado', casado_em = now(), lead_id = (p->>'lead_id')::bigint,
    contato_id = coalesce(nullif(p->>'contato_id', '')::bigint, contato_id), motivo = left(p->>'motivo', 200)
  where id = e.id;

  -- primeiro toque: o que o lead já tem não é trocado
  insert into public.rastreio_leads as l (
    lead_id, origem, grau, codigo, gclid, gbraid, wbraid, fbclid, fbc, fbp, ctwa_clid, ad_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, evidencia_id)
  values (
    (p->>'lead_id')::bigint, o->>'origem', o->>'grau', d->>'codigo', d->>'gclid', d->>'gbraid', d->>'wbraid',
    d->>'fbclid', d->>'fbc', d->>'fbp', d->>'ctwa_clid', d->>'ad_id',
    d->>'utm_source', d->>'utm_medium', d->>'utm_campaign', d->>'utm_content', d->>'utm_term', e.id)
  on conflict (lead_id) do update set
    origem = coalesce(l.origem, excluded.origem),
    grau = case when l.origem is null then excluded.grau else l.grau end,
    codigo = coalesce(l.codigo, excluded.codigo),
    gclid = coalesce(l.gclid, excluded.gclid), gbraid = coalesce(l.gbraid, excluded.gbraid),
    wbraid = coalesce(l.wbraid, excluded.wbraid), fbclid = coalesce(l.fbclid, excluded.fbclid),
    fbc = coalesce(l.fbc, excluded.fbc), fbp = coalesce(l.fbp, excluded.fbp),
    ctwa_clid = coalesce(l.ctwa_clid, excluded.ctwa_clid), ad_id = coalesce(l.ad_id, excluded.ad_id),
    utm_source = coalesce(l.utm_source, excluded.utm_source), utm_medium = coalesce(l.utm_medium, excluded.utm_medium),
    utm_campaign = coalesce(l.utm_campaign, excluded.utm_campaign),
    utm_content = coalesce(l.utm_content, excluded.utm_content), utm_term = coalesce(l.utm_term, excluded.utm_term),
    evidencia_id = coalesce(l.evidencia_id, excluded.evidencia_id),
    atualizado_em = now();
  return jsonb_build_object('estado', 'casado', 'mudou', true, 'origem', o->>'origem');
end $$;

-- ---------------------------------------------------------------- volta para as plataformas

-- A etapa do lead mudou no Kommo. Se a etapa está no mapa, enfileira o evento (uma vez por lead).
-- p: lead_id, pipeline_id, status_id, ocorrido_em, valor, telefones[], emails[], gclid, fbclid (do Kommo)
create or replace function public.rastreio_etapa(p jsonb) returns jsonb
language plpgsql as $$
declare
  c public.rastreio_config; m public.rastreio_mapa; l public.rastreio_leads;
  lead bigint := (p->>'lead_id')::bigint;
  quando timestamptz := coalesce(nullif(p->>'ocorrido_em', '')::timestamptz, now());
  v numeric := nullif(p->>'valor', '')::numeric;
  suspeito boolean := false;
  gclid text; gbraid text; wbraid text; fbc text; fbp text; ctwa text; origem text;
  tels text[]; ph_g text[]; ph_m text[]; em text[];
  ids jsonb; ev text; n_g int := 0; n_m int := 0; motivo_g text; motivo_m text; asrc text;
begin
  select * into c from public.rastreio_config where id = 1;
  select * into m from public.rastreio_mapa
   where pipeline_id = (p->>'pipeline_id')::bigint and status_id = (p->>'status_id')::bigint;
  if not found then return jsonb_build_object('enfileirados', 0, 'motivo', 'etapa_fora_do_mapa'); end if;

  select * into l from public.rastreio_leads where lead_id = lead;
  origem := l.origem;
  gclid := coalesce(l.gclid, nullif(p->>'gclid', '')); gbraid := l.gbraid; wbraid := l.wbraid;
  fbc := coalesce(l.fbc, case when nullif(p->>'fbclid', '') is not null
                         then 'fb.1.' || (extract(epoch from quando) * 1000)::bigint || '.' || (p->>'fbclid') end);
  fbp := l.fbp; ctwa := l.ctwa_clid;

  select coalesce(array_agg(distinct v2), '{}') into tels
    from jsonb_array_elements_text(coalesce(p->'telefones', '[]'::jsonb)) t(x),
         unnest(public.rastreio_tel_variantes(t.x)) v2;
  select coalesce(array_agg(public.rastreio_sha256('+' || x) order by x), '{}') into ph_g from unnest(tels) x;
  select coalesce(array_agg(public.rastreio_sha256(x) order by x), '{}') into ph_m from unnest(tels) x;
  select coalesce(array_agg(distinct public.rastreio_sha256(lower(trim(x)))), '{}') into em
    from jsonb_array_elements_text(coalesce(p->'emails', '[]'::jsonb)) e(x) where trim(x) like '%@%';

  if not m.com_valor then v := null;
  elsif v is null or v < c.valor_min or (c.valor_max is not null and v > c.valor_max) then suspeito := true;
  end if;
  ev := lead || ':' || m.evento;

  -- Google
  if m.google_acao_id is not null then
    if c.google_so_com_clique and gclid is null and gbraid is null and wbraid is null
       and coalesce(origem, '') <> 'Google Ads' then
      motivo_g := 'sem_clique_do_google';
    elsif gclid is null and gbraid is null and wbraid is null and cardinality(ph_g) = 0 and cardinality(em) = 0 then
      motivo_g := 'sem_identificador';
    else
      ids := jsonb_strip_nulls(jsonb_build_object(
        'gclid', gclid, 'gbraid', case when gclid is null then gbraid end,
        'wbraid', case when gclid is null and gbraid is null then wbraid end,
        'telefones', to_jsonb(ph_g[1:5]), 'emails', to_jsonb(em[1:5])));
      insert into public.rastreio_eventos (event_id, plataforma, lead_id, evento, destino, ocorrido_em, valor, moeda,
                                           identificadores, estado, motivo)
      values (ev, 'google', lead, m.evento, m.google_acao_id, quando, case when suspeito then null else v end, c.moeda,
              ids, case when suspeito then 'ignorado' else 'pendente' end, case when suspeito then 'valor_suspeito' end)
      on conflict (plataforma, event_id) do nothing;
      get diagnostics n_g = row_count;
      if n_g = 0 then motivo_g := 'ja_enfileirado'; end if;
    end if;
  end if;

  -- Meta
  if m.meta_evento is not null then
    if c.meta_so_origem_meta and coalesce(origem, '') <> 'Meta Ads' then
      motivo_m := 'origem_nao_e_meta';
    elsif ctwa is null and fbc is null and fbp is null and cardinality(ph_m) = 0 and cardinality(em) = 0 then
      motivo_m := 'sem_identificador';
    else
      asrc := case when ctwa is not null then 'business_messaging' else 'system_generated' end;
      ids := jsonb_strip_nulls(jsonb_build_object(
        'ctwa_clid', ctwa, 'fbc', fbc, 'fbp', fbp, 'telefones', to_jsonb(ph_m), 'emails', to_jsonb(em)));
      insert into public.rastreio_eventos (event_id, plataforma, lead_id, evento, destino, ocorrido_em, valor, moeda,
                                           action_source, identificadores, estado, motivo)
      values (ev, 'meta', lead, m.evento, m.meta_evento, quando, case when suspeito then null else v end, c.moeda,
              asrc, ids, case when suspeito then 'ignorado' else 'pendente' end, case when suspeito then 'valor_suspeito' end)
      on conflict (plataforma, event_id) do nothing;
      get diagnostics n_m = row_count;
      if n_m = 0 then motivo_m := 'ja_enfileirado'; end if;
    end if;
  end if;

  return jsonb_strip_nulls(jsonb_build_object('enfileirados', n_g + n_m, 'evento', m.evento,
    'google', n_g, 'meta', n_m, 'motivo_google', motivo_g, 'motivo_meta', motivo_m, 'valor_suspeito', suspeito));
end $$;

-- Pega um lote para enviar e marca como 'enviando'. Quem envia devolve com rastreio_resultado.
create or replace function public.rastreio_lote(plataforma text, limite int default 200) returns jsonb
language plpgsql as $$
declare c public.rastreio_config; itens jsonb; pl text := plataforma;
begin
  select * into c from public.rastreio_config where id = 1;
  if pl = 'meta' and not c.meta_armado and c.meta_test_event_code is null then
    return jsonb_build_object('itens', '[]'::jsonb, 'motivo', 'meta_desarmada_sem_codigo_de_teste');
  end if;
  if pl = 'meta' and c.meta_dataset_id is null then
    return jsonb_build_object('itens', '[]'::jsonb, 'motivo', 'sem_dataset_da_meta');
  end if;
  if pl = 'google' and c.google_conta is null then
    return jsonb_build_object('itens', '[]'::jsonb, 'motivo', 'sem_conta_do_google');
  end if;

  with alvo as (
    select id from public.rastreio_eventos ev
     where ev.plataforma = pl
       and ((ev.estado in ('pendente', 'erro') and ev.tentativas < 5)
            or (ev.estado = 'enviando' and ev.tentado_em < now() - interval '30 minutes'))
     order by ev.id limit greatest(limite, 1)
  ), marcados as (
    update public.rastreio_eventos ev set estado = 'enviando', tentativas = ev.tentativas + 1, tentado_em = now()
      from alvo where ev.id = alvo.id
    returning ev.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'event_id', event_id, 'evento', evento, 'destino', destino,
    'ocorrido_em', ocorrido_em, 'valor', valor, 'moeda', moeda, 'action_source', action_source,
    'identificadores', identificadores) order by id), '[]'::jsonb)
  into itens from marcados;

  return jsonb_build_object('itens', itens,
    'armado', case when pl = 'google' then c.google_armado else c.meta_armado end,
    'google_conta', c.google_conta, 'google_conta_login', c.google_conta_login,
    'google_fonte_evento', c.google_fonte_evento, 'google_consentimento', c.google_consentimento,
    'meta_dataset_id', c.meta_dataset_id, 'meta_waba_id', c.meta_waba_id, 'meta_versao', c.meta_versao,
    'meta_test_event_code', case when c.meta_armado then null else c.meta_test_event_code end);
end $$;

create or replace function public.rastreio_resultado(p jsonb) returns jsonb
language plpgsql as $$
declare est text := p->>'estado'; n int;
begin
  if est not in ('enviado', 'ensaio_ok', 'recusado', 'erro') then
    raise exception 'rastreio: estado de resultado invalido (%)', est;
  end if;
  update public.rastreio_eventos set
    estado = est, resposta = p->'resposta', motivo = left(p->>'motivo', 300),
    enviado_em = case when est = 'enviado' then now() else enviado_em end
  where id in (select (jsonb_array_elements_text(p->'ids'))::bigint) and estado = 'enviando';
  get diagnostics n = row_count;
  return jsonb_build_object('atualizados', n);
end $$;

-- Depois de armar a plataforma: o que passou no ensaio volta para a fila e sai de verdade.
create or replace function public.rastreio_rearmar(plataforma text) returns jsonb
language plpgsql as $$
declare n int;
begin
  update public.rastreio_eventos ev set estado = 'pendente', tentativas = 0, resposta = null
   where ev.plataforma = rastreio_rearmar.plataforma and ev.estado = 'ensaio_ok';
  get diagnostics n = row_count;
  return jsonb_build_object('voltaram', n);
end $$;

create or replace function public.rastreio_saude() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'sessoes_24h',           (select count(*) from public.rastreio_sessoes where criado_em > now() - interval '24 hours' and not ensaio),
    'cliques_whatsapp_24h',  (select count(*) from public.rastreio_sessoes where clicou_whatsapp_em > now() - interval '24 hours' and not ensaio),
    'evidencias_24h',        (select count(*) from public.rastreio_evidencias where criado_em > now() - interval '24 hours'),
    'casadas_24h',           (select count(*) from public.rastreio_evidencias where casado_em > now() - interval '24 hours'),
    'sem_lead_24h',          (select count(*) from public.rastreio_evidencias where estado = 'sem_lead' and criado_em > now() - interval '24 hours'),
    'fila_parada',           (select count(*) from public.rastreio_eventos where estado in ('pendente', 'erro', 'enviando') and criado_em < now() - interval '6 hours'),
    'recusados_24h',         (select count(*) from public.rastreio_eventos where estado = 'recusado' and coalesce(tentado_em, criado_em) > now() - interval '24 hours'),
    'valor_suspeito_24h',    (select count(*) from public.rastreio_eventos where motivo = 'valor_suspeito' and criado_em > now() - interval '24 hours'),
    'enviados_24h',          (select count(*) from public.rastreio_eventos where estado = 'enviado' and enviado_em > now() - interval '24 hours'),
    'google_armado',         (select google_armado from public.rastreio_config where id = 1),
    'meta_armado',           (select meta_armado from public.rastreio_config where id = 1))
$$;

-- ---------------------------------------------------------------- permissões

do $$
declare f text;
begin
  foreach f in array array[
    'rastreio_tel_digitos(text)', 'rastreio_tel_variantes(text)', 'rastreio_tel_chave(text)', 'rastreio_sha256(text)',
    'rastreio_sessao_gravar(jsonb)', 'rastreio_evidencia_gravar(jsonb)',
    'rastreio_origem_da_evidencia(public.rastreio_evidencias)', 'rastreio_a_casar(int)', 'rastreio_casado(jsonb)',
    'rastreio_etapa(jsonb)', 'rastreio_lote(text, int)', 'rastreio_resultado(jsonb)', 'rastreio_rearmar(text)',
    'rastreio_saude()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

grant select, insert, update on public.rastreio_config, public.rastreio_mapa, public.rastreio_sessoes,
  public.rastreio_evidencias, public.rastreio_leads, public.rastreio_eventos to service_role;
