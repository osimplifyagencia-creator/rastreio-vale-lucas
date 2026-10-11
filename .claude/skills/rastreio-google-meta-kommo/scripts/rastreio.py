# -*- coding: utf-8 -*-
"""Rastreio Google + Meta -> Kommo -> volta para as plataformas. Montador da skill rastreio-google-meta-kommo.

    python rastreio.py levantar <slug>                 # SÓ LEITURA: Kommo (campos, funis, webhooks) e n8n
    python rastreio.py montar   <slug>                 # local: gera os workflows e o SQL de config do cliente
    python rastreio.py criar    <slug> [--aplicar] [--sem-credencial] [--modulo 1]
    python rastreio.py ligar-meta <slug> [--aplicar]   # pendura o [RASTREIO 3] no gatilho do WhatsApp que já existe
    python rastreio.py plugar   <slug> [--aplicar] [--so kommo,supabase,google,meta]
                                                       # lê clientes/<slug>/rastreio.env, prova e cria as credenciais no n8n
    python rastreio.py banco    <slug> [--aplicar]     # aplica o 001 e o 002 no Supabase do cliente (API de gestão)
    python rastreio.py campo-origem <slug> [--aplicar] # cria no Kommo o campo de lista "Origem comprovada"
    python rastreio.py testar <slug> sessao|mensagem|etapa [--codigo X] [--lead N] [--etapa i]
                              [--sem-codigo] [--conta N] [--url-teste] [--enviar]

Sem --aplicar (ou --enviar), criar, ligar-meta, campo-origem e testar só mostram o que fariam. Com --aplicar escrevem na PRODUÇÃO do cliente:
só com o ok do Nilton. Os workflows nascem DESLIGADOS.

Fonte da verdade: o bloco `rastreio` do clientes/<slug>/config.json. IDs gerados (workflows, caminhos de
webhook) voltam para lá. Nenhum token entra em nó: credencial do n8n por id, chave de API só do .env.
"""
import io, json, os, re, secrets, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request, uuid

AQUI = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(AQUI)
REPO = os.path.abspath(os.path.join(SKILL, "..", "..", ".."))
JS = os.path.join(SKILL, "assets", "n8n", "js")

SETTINGS_ACEITOS = {"saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
                    "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone", "executionOrder"}
UA = "Mozilla/5.0 (osimplify-rastreio)"  # Cloudflare recusa POST/PUT sem User-Agent (403 error 1010)
DATA_MANAGER = "https://datamanager.googleapis.com/v1/events:ingest"


# ------------------------------------------------------------------ base

def sair(msg):
    raise SystemExit(msg)


def ler_env(caminho):
    """Lê .env tolerando aspas, CRLF e comentário no fim da linha. Nunca imprime valor."""
    env = {}
    if not os.path.exists(caminho):
        return env
    for l in io.open(caminho, encoding="utf-8-sig"):
        l = l.strip()
        if not l or l.startswith("#") or "=" not in l:
            continue
        k, v = l.split("=", 1)
        k = k.strip().replace("export ", "")
        v = v.strip()
        if v[:1] in "'\"" and v[:1] == v[-1:] and len(v) > 1:
            v = v[1:-1]
        else:
            v = v.split(" #")[0].strip()
        env[k] = v
    return env


def cfg_cliente(slug):
    p = os.path.join(REPO, "clientes", slug, "config.json")
    if not os.path.exists(p):
        sair("cliente sem config.json: " + p)
    return p, json.load(io.open(p, encoding="utf-8"))


def gravar_cfg(caminho, cfg):
    io.open(caminho, "w", encoding="utf-8", newline="\n").write(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")


def kommo_acesso(slug, cfg):
    k = cfg.get("kommo") or {}
    cands = [k.get("env_file"), "clientes/%s/kommo-crm/.env" % slug, "clientes/%s/.env" % slug]
    for c in [c for c in cands if c]:
        env = ler_env(os.path.join(REPO, c))
        tok = env.get("KOMMO_TOKEN") or env.get("KOMMO_ACCESS_TOKEN") or env.get("ACCESS_TOKEN")
        dom = env.get("KOMMO_DOMAIN") or env.get("DOMAIN") or k.get("domain")
        if tok and dom:
            dom = re.sub(r"^https?://", "", dom).strip("/")
            if "." not in dom:
                dom += ".kommo.com"
            return "https://%s/api/v4" % dom, tok
    sair("Kommo: token não achado nos .env do cliente (%s)" % ", ".join(c for c in cands if c))


def n8n_acesso(slug, cfg):
    env = ler_env(os.path.join(REPO, "clientes", slug, "n8n", ".env"))
    base = (env.get("N8N_BASE_URL") or (cfg.get("n8n") or {}).get("base_url") or "").rstrip("/")
    chave = env.get("N8N_API_KEY")
    if not base or not chave:
        sair("n8n: N8N_BASE_URL/N8N_API_KEY não achados em clientes/%s/n8n/.env" % slug)
    return base, chave


def http(metodo, url, cabecalhos, corpo=None):
    dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
    h = {"User-Agent": UA, "Accept": "application/json", **cabecalhos}
    if dados is not None:
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=dados, method=metodo, headers=h)
    try:
        resp = urllib.request.urlopen(r, timeout=60)
        txt = resp.read().decode("utf-8")
        return resp.status, (json.loads(txt) if txt.strip() else None)  # Kommo devolve 204 sem corpo
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def kommo_get(api, tok, caminho):
    st, b = http("GET", api + caminho, {"Authorization": "Bearer " + tok})
    if st in (401, 403):
        sair("Kommo recusou o token (HTTP %s)" % st)
    return b if st == 200 else None


def n8n(base, chave, metodo, caminho, corpo=None):
    st, b = http(metodo, base + "/api/v1" + caminho, {"X-N8N-API-KEY": chave}, corpo)
    if st >= 400:
        sair("n8n %s %s -> %s %s" % (metodo, caminho, st, b))
    return b


def n8n_todos(base, chave):
    out, cursor = [], None
    while True:
        q = "/workflows?limit=100" + ("&cursor=" + urllib.parse.quote(cursor) if cursor else "")
        b = n8n(base, chave, "GET", q)
        out += b.get("data", [])
        cursor = b.get("nextCursor")
        if not cursor:
            return out


def mascara(url):
    """Destino de webhook pode carregar segredo no caminho: mostra host e o começo do caminho."""
    u = urllib.parse.urlparse(url or "")
    partes = [p if len(p) < 16 else p[:4] + "…" for p in u.path.split("/") if p]
    return "%s/%s%s" % (u.netloc, "/".join(partes[:4]), "?…" if u.query else "")


# ------------------------------------------------------------------ levantar (só leitura)

CODIGOS_TRACKING = ["UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM", "UTM_REFERRER",
                    "REFERRER", "GCLID", "FBCLID", "GCLIENTID"]


def levantar(slug):
    _, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio") or {}
    api, tok = kommo_acesso(slug, cfg)
    print("== Kommo", api.split("/api")[0])
    conta = kommo_get(api, tok, "/account") or {}
    print("conta", conta.get("id"), "| config diz", (cfg.get("kommo") or {}).get("account_id"))

    campos, pag = [], 1
    while True:
        b = kommo_get(api, tok, "/leads/custom_fields?limit=250&page=%d" % pag)
        if not b:
            break
        campos += b["_embedded"]["custom_fields"]
        if "next" not in (b.get("_links") or {}):
            break
        pag += 1
    por_codigo = {c.get("code"): c for c in campos if c.get("code")}
    print("\ncampos de rastreio (código -> id):")
    for cod in CODIGOS_TRACKING:
        c = por_codigo.get(cod)
        print("  %-13s %s" % (cod, c["id"] if c else "FALTA (ligar o rastreio de UTM do Kommo)"))
    print("\ncampos de lista com cara de ORIGEM:")
    for c in campos:
        if c.get("type") in ("select", "multiselect") and re.search(r"origem|fonte|canal|source", c.get("name", ""), re.I):
            print("  %s %r" % (c["id"], c["name"]))
            for e in c.get("enums") or []:
                print("      %s %s" % (e["id"], e["value"]))

    print("\nfunis e etapas:")
    b = kommo_get(api, tok, "/leads/pipelines") or {"_embedded": {"pipelines": []}}
    for p in b["_embedded"]["pipelines"]:
        print("  %s %s%s" % (p["id"], p["name"], "  (principal)" if p.get("is_main") else ""))
        for s in p["_embedded"]["statuses"]:
            print("      %s %s" % (s["id"], s["name"]))

    print("\nwebhooks do Kommo (quem mais recebe evento):")
    host_n8n = urllib.parse.urlparse((cfg.get("n8n") or {}).get("base_url") or "").netloc.replace("n8n.", "")
    b = kommo_get(api, tok, "/webhooks") or {"_embedded": {"webhooks": []}}
    for w in b["_embedded"]["webhooks"]:
        dest = w.get("destination", "")
        terceiro = host_n8n and host_n8n not in dest
        aviso = "  <== TERCEIRO" if terceiro else ""
        if terceiro and "status_lead" in (w.get("settings") or []):
            aviso += ": recebe mudança de etapa, pode JÁ estar mandando conversão (dois remetentes)"
        print("  %s %s %s%s" % (w.get("id"), mascara(dest), ",".join(w.get("settings") or []), aviso))

    try:
        base, chave = n8n_acesso(slug, cfg)
    except SystemExit as e:
        print("\n== n8n: pulado (%s)" % e)
        return
    print("\n== n8n", base)
    wfs = n8n_todos(base, chave)
    origem_id = str(r.get("campo_origem_id") or "")
    creds = {}
    for w in wfs:
        full = n8n(base, chave, "GET", "/workflows/" + w["id"])
        txt = json.dumps(full)
        tipos = [n["type"] for n in full["nodes"]]
        marca = []
        if any(t.endswith("whatsAppTrigger") for t in tipos):
            marca.append("GATILHO WHATSAPP (callback da Meta: não duplicar)")
        if origem_id and origem_id in txt:
            marca.append("escreve/lê o campo de origem %s" % origem_id)
        if re.search(r"gclid|fbclid|utm_", txt, re.I):
            marca.append("mexe com rastreio")
        if re.search(r"EAA[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{30,}", txt):
            marca.append("TOKEN DENTRO DO NÓ")
        for n in full["nodes"]:
            for tipo, c in (n.get("credentials") or {}).items():
                creds.setdefault(tipo, {})[c.get("id")] = c.get("name")
        if marca:
            print("  %s %s %s: %s" % (w["id"], "ON " if w.get("active") else "off", w["name"], "; ".join(marca)))
    print("\ncredenciais em uso (tipo -> id nome), para o bloco rastreio.credenciais:")
    for tipo in ("supabaseApi", "httpHeaderAuth", "oAuth2Api", "googleOAuth2Api", "facebookGraphApi"):
        for i, nome in (creds.get(tipo) or {}).items():
            print("  %-16s %s %s" % (tipo, i, nome))

    falta = [k for k in OBRIGATORIOS + ("error_workflow", "webhook_base") if not r.get(k)]
    print("\nconfig.rastreio: " + ("completo para montar" if not falta else "falta " + ", ".join(falta)))
    if not r.get("campo_origem_id"):
        print("sem campo_origem_id: o módulo 1 grava só UTM e GCLID. `campo-origem %s` cria o 'Origem comprovada'." % slug)


# ------------------------------------------------------------------ montar (local)

def node_base(nome, tipo, versao, pos, params, **extra):
    n = {"id": str(uuid.uuid4()), "name": nome, "type": tipo, "typeVersion": versao, "position": pos, "parameters": params}
    n.update(extra)
    return n


def code(nome, arquivo_ou_js, pos):
    js = arquivo_ou_js if "\n" in arquivo_ou_js else io.open(os.path.join(JS, arquivo_ou_js), encoding="utf-8").read()
    return node_base(nome, "n8n-nodes-base.code", 2, pos, {"jsCode": js})


def cred(r, chave, tipo):
    c = (r.get("credenciais") or {}).get(chave)
    return {tipo: {"id": c["id"], "name": c["name"]}} if c else {}


def rpc(r, nome, funcao, corpo_expr, pos):
    """Chamada de função do banco do cliente. URL do projeto não é segredo; a chave vem da credencial Supabase."""
    n = node_base(nome, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "POST", "url": "%s/rest/v1/rpc/%s" % (r["supabase_url"].rstrip("/"), funcao),
        "authentication": "predefinedCredentialType", "nodeCredentialType": "supabaseApi",
        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify(%s) }}" % corpo_expr,
        "options": {"response": {"response": {"responseFormat": "json"}}},
    }, retryOnFail=True, maxTries=3, waitBetweenTries=2000)
    c = cred(r, "supabase", "supabaseApi")
    if c:
        n["credentials"] = c
    return n


def kommo_http(r, nome, metodo, url_expr, pos, corpo_expr=None):
    """Kommo: 204 sem corpo, por isso texto + resposta inteira + nunca erro; quem lê é um Code que estoura no 401."""
    p = {"method": metodo, "url": url_expr, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
         "options": {"response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": "text"}},
                     "batching": {"batch": {"batchSize": 5, "batchInterval": 1000}}}}
    if corpo_expr:
        p.update({"sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify(%s) }}" % corpo_expr})
    n = node_base(nome, "n8n-nodes-base.httpRequest", 4.2, pos, p, retryOnFail=True, maxTries=4,
                  waitBetweenTries=3000, onError="continueRegularOutput")
    c = cred(r, "kommo", "httpHeaderAuth")
    if c:
        n["credentials"] = c
    return n


def se(nome, expr, tipo, pos):
    op = {"type": "boolean", "operation": "true", "singleValue": True} if tipo == "bool" else \
         {"type": "number", "operation": "exists", "singleValue": True}
    return node_base(nome, "n8n-nodes-base.if", 2.2, pos, {
        "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                       "conditions": [{"id": str(uuid.uuid4()), "leftValue": expr, "rightValue": "", "operator": op}],
                       "combinator": "and"},
        "looseTypeValidation": True, "options": {}})


def webhook(caminho, pos):
    return node_base("gatilho", "n8n-nodes-base.webhook", 2, pos,
                     {"httpMethod": "POST", "path": caminho, "responseMode": "onReceived", "options": {}},
                     webhookId=str(uuid.uuid4()))


def relogio(pos, minutos=None, hora=None):
    iv = {"field": "minutes", "minutesInterval": minutos} if minutos else {"field": "days", "daysInterval": 1, "triggerAtHour": hora}
    return node_base("gatilho", "n8n-nodes-base.scheduleTrigger", 1.2, pos, {"rule": {"interval": [iv]}})


def ligar(*cadeia, saida=0):
    """ligar(a, b, c) -> conexões a->b->c pela saída `saida` do primeiro (IF: 0 = verdadeiro, 1 = falso)."""
    con = {}
    for i, (a, b) in enumerate(zip(cadeia, cadeia[1:])):
        s = saida if i == 0 else 0
        lst = con.setdefault(a["name"], {"main": []})["main"]
        while len(lst) <= s:
            lst.append([])
        lst[s].append({"node": b["name"], "type": "main", "index": 0})
    return con


def juntar(*cons):
    out = {}
    for c in cons:
        for nome, v in c.items():
            dst = out.setdefault(nome, {"main": []})["main"]
            for s, alvos in enumerate(v["main"]):
                while len(dst) <= s:
                    dst.append([])
                dst[s] += alvos
    return out


def configuracoes_js(slug, r):
    """O que os nós precisam saber do cliente. Só ids e regras: nada de token."""
    # campo_origem_id vazio = ainda sem o campo "Origem comprovada": grava só UTM e GCLID (comando campo-origem cria)
    c = {"cliente": slug, "kommo_api": r["kommo_api"], "kommo_conta": r.get("kommo_conta"),
         "pipelines": r["pipelines"], "campos_tracking": r["campos_tracking"], "campo_origem_id": r.get("campo_origem_id"),
         "origem_enums": r.get("origem_enums") or {},
         "etapas_mapeadas": ["%s:%s" % (e["pipeline_id"], e["status_id"]) for e in (r.get("etapas") or [])],
         "espera_sessoes": r.get("espera_sessoes", True), "lead_max_horas_antes": r.get("lead_max_horas_antes", 48),
         "teto_sem_lead": r.get("teto_sem_lead", 10)}
    return ("// [RASTREIO] Configuração do cliente %s. GERADO por rastreio.py montar a partir do config.json:\n"
            "// mudou algo? edite o config.json e monte de novo, não edite aqui.\n"
            "return [{ json: %s }];\n" % (slug, json.dumps(c, ensure_ascii=False, indent=2)))


def montar_workflows(slug, r):
    cfgjs = configuracoes_js(slug, r)
    wh = r["webhooks"]
    W = {}

    # 1 sessão: a etiqueta da página manda o clique; grava e devolve 200 na hora
    g, v = webhook(wh["sessao"], [0, 0]), code("valida", "sessao_valida.js", [220, 0])
    gr = rpc(r, "grava sessao", "rastreio_sessao_gravar", "{ p: $json.p }", [440, 0])
    W["sessao"] = ("[RASTREIO 1] Sessão do site", [g, v, gr], ligar(g, v, gr))

    # 2 entrada Kommo: mensagem recebida com o código [XXXXX]
    g, c = webhook(wh["kommo_msg"], [0, 0]), code("configuracoes", cfgjs, [220, 0])
    e = code("extrai", "kommo_msg_extrai.js", [440, 0])
    gr = rpc(r, "grava evidencia", "rastreio_evidencia_gravar", "{ p: $json.p }", [660, 0])
    W["kommo_msg"] = ("[RASTREIO 2] Entrada Kommo (código)", [g, c, e, gr], ligar(g, c, e, gr))

    # 3 Meta referral: SUB-workflow chamado pelo gatilho do WhatsApp que já existe (nunca um 2º gatilho)
    g = node_base("gatilho", "n8n-nodes-base.executeWorkflowTrigger", 1.1, [0, 0], {"inputSource": "passthrough"})
    e = code("extrai", "meta_referral_extrai.js", [220, 0])
    gr = rpc(r, "grava evidencia", "rastreio_evidencia_gravar", "{ p: $json.p }", [440, 0])
    W["meta"] = ("[RASTREIO 3] Meta referral (sub)", [g, e, gr], ligar(g, e, gr))

    # 4 casamento: liga a evidência ao lead e grava UTM/origem só no campo VAZIO
    g, c = relogio([0, 0], minutos=5), code("configuracoes", cfgjs, [220, 0])
    ac = rpc(r, "a casar", "rastreio_a_casar", "{ limite: 50 }", [440, 0])
    ex = code("explode", "casamento_explode.js", [660, 0])
    bu = kommo_http(r, "busca", "GET", "={{ $json.busca_url }}", [880, 0])
    rs = code("resolve", "casamento_resolve.js", [1100, 0])
    ach = se("achou lead?", "={{ $json.lead_id }}", "num", [1320, 0])
    le = kommo_http(r, "le lead", "GET", "={{ $json.lead_url }}", [1540, -100])
    de = code("decide", "casamento_decide.js", [1760, -100])
    tp = se("tem patch?", "={{ $json.tem_patch }}", "bool", [1980, -100])
    pa = kommo_http(r, "grava no lead", "PATCH", "={{ $json.patch_url }}", [2200, -200], corpo_expr="$json.patch")
    cf = code("confere patch", "casamento_patch_confere.js", [2420, -200])
    m1 = rpc(r, "marca casado", "rastreio_casado", "{ p: $json }", [2640, -200])
    m2 = rpc(r, "marca sem patch", "rastreio_casado", "{ p: $json }", [2200, 0])
    m3 = rpc(r, "marca sem lead", "rastreio_casado", "{ p: $json }", [1540, 150])
    W["casamento"] = ("[RASTREIO 4] Casamento com o lead", [g, c, ac, ex, bu, rs, ach, le, de, tp, pa, cf, m1, m2, m3],
                      juntar(ligar(g, c, ac, ex, bu, rs, ach), ligar(ach, le, de, tp), ligar(ach, m3, saida=1),
                             ligar(tp, pa, cf, m1), ligar(tp, m2, saida=1)))

    # 5 etapa: lead mudou para etapa do mapa -> fila de conversão (hash no banco)
    g, c = webhook(wh["etapa"], [0, 0]), code("configuracoes", cfgjs, [220, 0])
    e = code("extrai", "etapa_extrai.js", [440, 0])
    le = kommo_http(r, "le lead", "GET", "={{ $json.lead_url }}", [660, 0])
    ct = code("contato", "etapa_contato.js", [880, 0])
    lc = kommo_http(r, "le contato", "GET", "={{ $json.contato_url }}", [1100, 0])
    mo = code("monta", "etapa_monta.js", [1320, 0])
    gr = rpc(r, "enfileira", "rastreio_etapa", "{ p: $json.p }", [1540, 0])
    W["etapa"] = ("[RASTREIO 5] Etapa do Kommo vira conversão", [g, c, e, le, ct, lc, mo, gr], ligar(g, c, e, le, ct, lc, mo, gr))

    # 6 e 7 envio: lote da fila -> plataforma -> resultado. Desarmado = ensaio (validateOnly / test_event_code)
    for chave, titulo, plataforma, arquivo in (("google", "[RASTREIO 6] Envio Google (Data Manager)", "google", "google_monta.js"),
                                               ("meta_envio", "[RASTREIO 7] Envio Meta (Conversions API)", "meta", "meta_monta.js")):
        g = relogio([0, 0], minutos=15)
        lo = rpc(r, "lote", "rastreio_lote", "{ plataforma: '%s', limite: 200 }" % plataforma, [220, 0])
        mo = code("monta", arquivo, [440, 0])
        if plataforma == "google":
            p = {"method": "POST", "url": DATA_MANAGER, "authentication": "genericCredentialType", "genericAuthType": "oAuth2Api"}
            cr = cred(r, "google", "oAuth2Api")
        else:
            p = {"method": "POST", "url": "={{ $json.url }}", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"}
            cr = cred(r, "meta", "httpHeaderAuth")
        p.update({"sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}",
                  "options": {"response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": "json"}}}})
        en = node_base("envia", "n8n-nodes-base.httpRequest", 4.2, [660, 0], p, onError="continueRegularOutput")
        if cr:
            en["credentials"] = cr
        rs = code("resultado", "envio_resultado.js", [880, 0])
        gr = rpc(r, "grava resultado", "rastreio_resultado", "{ p: $json.p }", [1100, 0])
        W[chave] = (titulo, [g, lo, mo, en, rs, gr], ligar(g, lo, mo, en, rs, gr))

    # 8 saúde: uma vez por dia, estoura de propósito se algo saiu da faixa (o errorWorkflow avisa)
    g, c = relogio([0, 0], hora=8), code("configuracoes", cfgjs, [220, 0])
    sa = rpc(r, "saude", "rastreio_saude", "{}", [440, 0])
    av = code("avalia", "saude_avalia.js", [660, 0])
    al = se("tem alerta?", "={{ $json.tem_alerta }}", "bool", [880, 0])
    pa = node_base("avisa", "n8n-nodes-base.stopAndError", 1, [1100, 0],
                   {"errorMessage": "={{ 'Rastreio %s: ' + $json.alertas.join(' | ') }}" % slug})
    W["saude"] = ("[RASTREIO 8] Saúde diária", [g, c, sa, av, al, pa], ligar(g, c, sa, av, al, pa))

    settings = {"executionOrder": "v1", "timezone": "America/Sao_Paulo"}
    if r.get("error_workflow"):
        settings["errorWorkflow"] = r["error_workflow"]
    return {k: {"name": "%s | %s" % (t, slug), "nodes": n, "connections": con, "settings": dict(settings)}
            for k, (t, n, con) in W.items()}


def conferir_workflow(wf):
    """Prova estrutural: toda conexão e todo $('Nó') apontam para nó que existe; nenhum token; JS compila."""
    erros = []
    nomes = {n["name"] for n in wf["nodes"]}
    if len(nomes) != len(wf["nodes"]):
        erros.append("nome de nó repetido")
    for a, v in wf["connections"].items():
        if a not in nomes:
            erros.append("conexão sai de nó inexistente: " + a)
        for alvos in v["main"]:
            erros += ["conexão para nó inexistente: " + x["node"] for x in alvos if x["node"] not in nomes]
    txt = json.dumps(wf, ensure_ascii=False)
    if re.search(r"EAA[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{20,}|ya29\.", txt):
        erros.append("TOKEN dentro do workflow")
    for n in wf["nodes"]:
        js = n["parameters"].get("jsCode")
        exprs = js or json.dumps(n["parameters"])
        for ref in re.findall(r"\$\('([^']+)'\)", exprs):
            if ref not in nomes:
                erros.append("%s cita $('%s'), que não existe neste workflow" % (n["name"], ref))
        if js:
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
                f.write("async function no($input, $) {\n" + js + "\n}\n")
            p = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
            os.unlink(f.name)
            if p.returncode:
                linha = [l for l in (p.stderr or "").splitlines() if "Error" in l][:1] or ["(sem detalhe)"]
                erros.append("%s não compila: %s" % (n["name"], linha[0].strip()))
    return erros


def sql_config(slug, r):
    q = lambda v: "null" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"
    g, m = r.get("google") or {}, r.get("meta") or {}
    linhas = ["-- Config do rastreio de %s. GERADO por rastreio.py montar a partir do config.json." % slug,
              "-- Roda DEPOIS do 001_rastreio.sql da skill. Idempotente. NÃO arma nada: armar é decisão à parte",
              "-- (update rastreio_config set google_armado = true / meta_armado = true), com o ok do Nilton.",
              "begin;",
              "update public.rastreio_config set",
              "  google_conta = %s, google_conta_login = %s, google_consentimento = %s," % (
                  q(re.sub(r"\D", "", g.get("conta") or "") or None), q(re.sub(r"\D", "", g.get("conta_login") or "") or None),
                  q(g.get("consentimento"))),
              "  meta_dataset_id = %s, meta_waba_id = %s, meta_test_event_code = %s," % (
                  q(m.get("dataset_id")), q(m.get("waba_id")), q(m.get("test_event_code"))),
              "  meta_so_origem_meta = %s, valor_max = %s, janela_casamento_min = %d, atualizado_em = now()" % (
                  "true" if m.get("so_origem_meta") else "false", q(r.get("valor_max")).strip("'") if r.get("valor_max") else "null",
                  int(r.get("janela_casamento_min", 30))),
              "where id = 1;",
              "delete from public.rastreio_mapa;"]
    for e in r.get("etapas") or []:
        if not re.fullmatch(r"[a-z_]{3,30}", e["evento"]):
            sair("evento inválido no mapa: %r" % e["evento"])
        linhas.append("insert into public.rastreio_mapa (pipeline_id, status_id, evento, google_acao_id, meta_evento, com_valor) "
                      "values (%d, %d, %s, %s, %s, %s);" % (int(e["pipeline_id"]), int(e["status_id"]), q(e["evento"]),
                                                             q(e.get("google_acao_id")), q(e.get("meta_evento")),
                                                             "true" if e.get("com_valor") else "false"))
    linhas.append("commit;")
    return "\n".join(linhas) + "\n"


def url_webhook(r, k):
    base = (r.get("webhook_base") or "").rstrip("/")
    return "%s/%s" % (base or "https://<n8n-do-cliente>/webhook", r["webhooks"][k])


def leia_me(slug, r, wfs):
    """Roteiro de plugar e testar, gerado junto dos JSON: o que importar, qual credencial em qual nó, as URLs."""
    TIPO = {"supabaseApi": "Supabase (credencial `Supabase API` do projeto %s)" % r["supabase_url"],
            "httpHeaderAuth": "Header Auth `Authorization: Bearer <token>`",
            "oAuth2Api": "OAuth2 do Google, escopo `https://www.googleapis.com/auth/datamanager`"}
    ARQ = {k: "%d-%s.json" % (i + 1, k) for i, k in enumerate(ORDEM)}
    l = ["# Rastreio de %s: plugar e testar" % slug, "",
         "GERADO por `rastreio.py montar %s` a partir do bloco `rastreio` do `config.json`. Mudou algo? Edite o config" % slug,
         "e monte de novo; não edite os JSON à mão. Modelo: `biblioteca/integrations/rastreio-google-meta-kommo/MODELO-ORIGEM-NO-KOMMO.md`.",
         "", "Os 8 workflows nascem DESLIGADOS e sem credencial. **Módulo 1 (origem no Kommo): 1, 2, 3, 4 e 8.**",
         "Módulo 2 (venda de volta ao Google e à Meta): 5, 6 e 7.", "",
         "## 0. Antes de importar", "",
         "1. Banco do cliente: aplicar `.claude/skills/rastreio-google-meta-kommo/assets/banco/001_rastreio.sql` e depois",
         "   `clientes/%s/supabase/rastreio_002_config.sql`. Prova: `select public.rastreio_saude();` responde." % slug,
         "2. Credenciais no n8n do cliente, cada uma provada por uma chamada real que deu 200 (portão da casa):", ""]
    l += ["   | chave no config | tipo no n8n | serve para |", "   |---|---|---|",
          "   | `supabase` | %s | todos os nós de banco |" % TIPO["supabaseApi"],
          "   | `kommo` | %s, token de longa duração do Kommo | buscar e gravar no lead |" % TIPO["httpHeaderAuth"],
          "   | `google` | %s | [6], só módulo 2 |" % TIPO["oAuth2Api"],
          "   | `meta` | %s, token de usuário do sistema | [7], só módulo 2 |" % TIPO["httpHeaderAuth"], "",
          "   Anote `{id, name}` de cada uma em `rastreio.credenciais` e rode `montar` de novo: os JSON saem com a",
          "   credencial já anexada. Se preferir anexar no editor, siga a tabela da seção 1.", ""]
    if not r.get("campo_origem_id"):
        l += ["3. **Campo \"Origem comprovada\" ainda não existe no config.** Sem ele, o [4] grava só UTM e GCLID.",
              "   `python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py campo-origem %s` (seco) e depois" % slug,
              "   `--aplicar` com o ok. Ele cria o campo de lista no Kommo, grava os ids no config; rode `montar` de novo.", ""]
    l += ["## 1. Importar, nesta ordem", "",
          "No editor do n8n: Workflows, Import from File, um por vez. Depois de importar, anote o id (o que aparece na URL)",
          "em `rastreio.workflows.<chave>` do config. Ou, com as credenciais no config e o ok do Nilton:",
          "`rastreio.py criar %s --aplicar` cria todos desligados e grava os ids sozinho (`--modulo 1` cria só o módulo 1" % slug,
          "e pede só as credenciais Supabase e Kommo).", "",
          "| arquivo | workflow | módulo | nós que pedem credencial |", "|---|---|---|---|"]
    for k in ORDEM:
        wf = wfs[k]
        precisa = []
        for n in wf["nodes"]:
            p = n["parameters"]
            if not n["type"].endswith("httpRequest"):
                continue
            tipo = p.get("nodeCredentialType") or p.get("genericAuthType")
            tem = " (anexada)" if n.get("credentials") else ""
            precisa.append("`%s`: %s%s" % (n["name"], {"supabaseApi": "Supabase", "httpHeaderAuth": "Kommo" if k not in ("meta_envio",) else "Meta",
                                                      "oAuth2Api": "Google"}.get(tipo, tipo), tem))
        l.append("| `%s` | %s | %s | %s |" % (ARQ[k], wf["name"].split(" | ")[0], "2" if k in ("etapa", "google", "meta_envio") else "1",
                                             "<br>".join(precisa) or "nenhum"))
    l += ["", "## 2. Ligar as pontas", "",
          "| ponta | onde | URL |", "|---|---|---|",
          "| etiqueta da página | `<head>` do site, `data-endpoint` | `%s` |" % url_webhook(r, "sessao"),
          "| Kommo `add_message` | webhook do Kommo -> [2] | `%s` |" % url_webhook(r, "kommo_msg"),
          "| Kommo `status_lead` (módulo 2) | webhook do Kommo -> [5] | `%s` |" % url_webhook(r, "etapa"), "",
          "O caminho de cada URL é o segredo do webhook: não colar em grupo nem em chat público.", "",
          "- **Etiqueta:** `<script src=\".../rastreio-osimplify.js\" data-endpoint=\"%s\" data-ensaio=\"1\" defer></script>`." % url_webhook(r, "sessao"),
          "  Ela mantém o texto que o botão do WhatsApp já tem e acrescenta ` [XXXXX]` no fim. A regra do Kommo que lê a frase",
          "  tem de estar em \"contém\", não em \"igual a\".",
          "- **Webhook do Kommo:** Configurações, Integrações, Webhooks, ou `POST /api/v4/webhooks` com `{destination, settings: [\"add_message\"]}`.",
          "  O Kommo desliga o webhook depois de 100 respostas ruins em 2 horas: ligue o workflow ANTES de cadastrar.",
          "- **Meta [3]:** é sub-workflow, sem gatilho próprio. Nunca crie um 2º gatilho do WhatsApp (rouba o callback do app).",
          "  `rastreio.py ligar-meta %s` (seco) e depois `--aplicar`: pendura o [3] no gatilho de `%s` (credencial `%s`)," % (
              slug, r.get("meta_whatsapp_workflow") or "<workflow do gatilho>", r.get("meta_whatsapp_credencial") or "<nome>"),
          "  em paralelo ao que já roda. À mão: nó Execute Workflow saindo do gatilho, workflow = id do [3], sem esperar o fim.", "",
          "## 3. Testar, ponta por ponta", "",
          "Cada teste é seco por padrão (mostra o que mandaria). `--enviar` manda de verdade para o webhook de PRODUÇÃO",
          "(workflow ligado); `--url-teste` usa o `/webhook-test/` (editor aberto em \"Listen for test event\").", "",
          "| # | comando | prova no banco ou no Kommo |", "|---|---|---|",
          "| 1 | `rastreio.py testar %s sessao --enviar` | `select codigo, gclid, utm_source from rastreio_sessoes order by criado_em desc limit 1;` mostra o código e `TESTE-QA-...` |" % slug,
          "| 2 | `rastreio.py testar %s mensagem --codigo <o do teste 1> --lead <id de um lead [QA]> --enviar` | `select fonte, codigo, lead_id, estado from rastreio_evidencias order by criado_em desc limit 1;` com `kommo_codigo` e o lead |" % slug,
          "| 3 | esperar o [4] (5 min) ou rodar no editor | o lead `[QA]` ganhou GCLID e UTM no Kommo; `estado = 'casado'` na evidência; `select origem, gclid from rastreio_leads where lead_id = <id>;` |",
          "| 4 | mensagem SEM código (sentido contrário) | `testar ... mensagem --sem-codigo`: nenhuma linha nova em `rastreio_evidencias` |",
          "| 5 | conta errada (sentido contrário) | `testar ... mensagem --conta 1`: nenhuma linha nova |",
          "| 6 | módulo 2: `rastreio.py testar %s etapa --lead <id [QA]> --enviar` | linhas novas em `rastreio_eventos` (uma por plataforma com destino); [6] e [7] fazem só ensaio enquanto desarmados |" % slug,
          "", "Lead de teste nasce com `[QA]` no nome e sai do funil no fim. Saúde: `select public.rastreio_saude();`.", "",
          "## 4. Com as chaves em mãos: a sequência inteira", "",
          "As chaves que vêm de fora entram em `clientes/%s/rastreio.env` (fora do git; modelo comentado em" % slug,
          "`.claude/skills/rastreio-google-meta-kommo/assets/rastreio.env.modelo`). Cada comando é seco sem `--aplicar` e",
          "só escreve na produção com o ok do Nilton. `R` = `python .claude/skills/rastreio-google-meta-kommo/scripts/rastreio.py`.", "",
          "| # | comando | o que faz | pronto quando |", "|---|---|---|---|",
          "| 1 | `R plugar %s --aplicar` | prova cada chave numa chamada real, cria as credenciais no n8n, grava os ids no config | `módulo 1: credenciais prontas` |" % slug,
          "| 2 | `R banco %s --aplicar` | passa o SQL na prova local e aplica o 001 e o 002 no Supabase do cliente | saúde responde e `armado: False` |" % slug,
          "| 3 | `R campo-origem %s --aplicar` | cria o campo \"Origem comprovada\" no Kommo | ids no config |" % slug,
          "| 4 | `R montar %s` | regenera os JSON com credencial e campo | `MONTAGEM workflows=8 erros=0`, nenhum \"sem credencial\" no módulo 1 |" % slug,
          "| 5 | `R criar %s --modulo 1 --aplicar` | cria 1, 2, 3, 4 e 8 desligados | ids em `rastreio.workflows` |" % slug,
          "| 6 | ligar 1, 2, 4 e 8 no editor; webhook `add_message` no Kommo; `R ligar-meta %s --aplicar` | pontas ligadas | seção 2 |" % slug,
          "| 7 | testes da seção 3 com um lead `[QA]` | prova nos dois sentidos | lead com GCLID e origem; os contrários não gravam |", ""]
    return "\n".join(l)


ORDEM = ("sessao", "kommo_msg", "meta", "casamento", "etapa", "google", "meta_envio", "saude")
OBRIGATORIOS = ("kommo_api", "pipelines", "campos_tracking", "supabase_url")


def montar(slug):
    caminho, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio")
    if not r:
        sair("config.json de %s sem o bloco `rastreio`: rode levantar e preencha (modelo em assets/ficha-config.json)" % slug)
    falta = [k for k in OBRIGATORIOS if not r.get(k)]
    if falta:
        sair("bloco rastreio incompleto: falta " + ", ".join(falta))
    if not r.get("campo_origem_id"):
        print("aviso: sem campo_origem_id, o [4] grava só UTM e GCLID (crie com `campo-origem %s`)" % slug)
    if not r.get("etapas"):
        print("aviso: sem etapas, o módulo 2 (5, 6 e 7) não tem o que enviar")
    if not r.get("webhook_base"):
        print("aviso: sem webhook_base, o LEIA-ME sai com a URL incompleta")
    r.setdefault("webhooks", {})
    novos = []
    for k in ("sessao", "kommo_msg", "etapa"):
        if not r["webhooks"].get(k):
            # o caminho é o segredo do webhook: sorteado uma vez e guardado no config
            r["webhooks"][k] = "rastreio-%s-%s-%s" % (k.replace("_", "-"), slug, secrets.token_hex(6))
            novos.append(k)
    if novos:
        gravar_cfg(caminho, cfg)
        print("caminhos de webhook sorteados e gravados no config.json:", ", ".join(novos))

    destino = os.path.join(REPO, "clientes", slug, "n8n", "rastreio")
    os.makedirs(destino, exist_ok=True)
    # só apaga o que o próprio montar gera (com ou sem o número na frente); o resto da pasta fica
    for arq in os.listdir(destino):
        if arq.endswith(".json") and re.sub(r"^\d+-", "", arq[:-5]) in ORDEM:
            os.unlink(os.path.join(destino, arq))
    wfs = montar_workflows(slug, r)
    ruins = 0
    for i, k in enumerate(ORDEM):
        wf = wfs[k]
        erros = conferir_workflow(wf)
        ruins += len(erros)
        nome = "%d-%s.json" % (i + 1, k)
        io.open(os.path.join(destino, nome), "w", encoding="utf-8", newline="\n").write(json.dumps(wf, ensure_ascii=False, indent=2) + "\n")
        sem_cred = [n["name"] for n in wf["nodes"] if n["type"].endswith("httpRequest") and not n.get("credentials")]
        print("%-16s %2d nós  %s%s" % (nome, len(wf["nodes"]), "OK" if not erros else "ERRO: " + "; ".join(erros),
                                       ("  (sem credencial: %s)" % ", ".join(sem_cred)) if sem_cred else ""))
    io.open(os.path.join(destino, "LEIA-ME.md"), "w", encoding="utf-8", newline="\n").write(leia_me(slug, r, wfs))
    print("roteiro: clientes/%s/n8n/rastreio/LEIA-ME.md" % slug)
    sup = os.path.join(REPO, "clientes", slug, "supabase")
    os.makedirs(sup, exist_ok=True)
    io.open(os.path.join(sup, "rastreio_002_config.sql"), "w", encoding="utf-8", newline="\n").write(sql_config(slug, r))
    print("SQL de config: clientes/%s/supabase/rastreio_002_config.sql" % slug)
    print("MONTAGEM workflows=%d erros=%d" % (len(wfs), ruins))
    if ruins:
        sys.exit(1)


# ------------------------------------------------------------------ criar (produção, só com ok)

MODULO_1 = ("sessao", "kommo_msg", "meta", "casamento", "saude")


def criar(slug, aplicar, sem_credencial, so_modulo_1=False):
    caminho, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio") or sair("sem bloco rastreio")
    destino = os.path.join(REPO, "clientes", slug, "n8n", "rastreio")
    if not os.path.isdir(destino):
        sair("rode `montar %s` antes" % slug)
    precisa = ("supabase", "kommo") if so_modulo_1 else ("supabase", "kommo", "google", "meta")
    falta_cred = [k for k in precisa if not (r.get("credenciais") or {}).get(k)]
    if falta_cred and not sem_credencial:
        sair("credencial do n8n faltando no config (%s). Portão de credencial: crie e PROVE pelo uso antes; "
             "ou passe --sem-credencial para criar desligado e anexar no editor." % ", ".join(falta_cred))
    base, chave = n8n_acesso(slug, cfg)
    existentes = {w["name"]: w["id"] for w in n8n_todos(base, chave)}
    r.setdefault("workflows", {})
    for arq in sorted(os.listdir(destino)):
        if not arq.endswith(".json"):
            continue
        k = re.sub(r"^\d+-", "", arq[:-5])  # "4-casamento.json" -> casamento
        if k not in ORDEM or (so_modulo_1 and k not in MODULO_1):
            continue
        wf = json.load(io.open(os.path.join(destino, arq), encoding="utf-8"))
        erros = conferir_workflow(wf)
        if erros:
            sair("%s não passa na conferência: %s" % (arq, "; ".join(erros)))
        if r["workflows"].get(k):
            print("%-11s já criado: %s (pulo)" % (k, r["workflows"][k]))
            continue
        if wf["name"] in existentes:
            sair("já existe workflow com o nome %r (%s): não duplico. Grave o id em rastreio.workflows.%s" % (
                wf["name"], existentes[wf["name"]], k))
        if not aplicar:
            print("%-11s criaria DESLIGADO: %s (%d nós)" % (k, wf["name"], len(wf["nodes"])))
            continue
        corpo = {"name": wf["name"], "nodes": wf["nodes"], "connections": wf["connections"],
                 "settings": {kk: vv for kk, vv in wf["settings"].items() if kk in SETTINGS_ACEITOS}}
        novo = n8n(base, chave, "POST", "/workflows", corpo)
        lido = n8n(base, chave, "GET", "/workflows/" + novo["id"])  # o retorno do POST não prova o que ficou gravado
        if len(lido["nodes"]) != len(wf["nodes"]) or lido.get("active"):
            sair("%s criado (%s) mas a releitura não bate: nós %d x %d, ativo=%s" % (
                k, novo["id"], len(lido["nodes"]), len(wf["nodes"]), lido.get("active")))
        r["workflows"][k] = novo["id"]
        gravar_cfg(caminho, cfg)
        print("%-11s criado DESLIGADO: %s" % (k, novo["id"]))
    if not aplicar:
        print("\nnada escrito. Com o ok do Nilton: criar %s --aplicar" % slug)


def ligar_meta(slug, aplicar):
    """Pendura o sub-workflow [RASTREIO 3] no gatilho do WhatsApp que já existe. Um 2º gatilho do WhatsApp
    re-inscreveria o callback do app e roubaria a entrada do outro: por isso nunca se cria um gatilho novo."""
    caminho, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio") or {}
    alvo, sub = r.get("meta_whatsapp_workflow"), (r.get("workflows") or {}).get("meta")
    if not alvo:
        sair("rastreio.meta_whatsapp_workflow vazio: qual workflow tem o gatilho do WhatsApp? (levantar mostra)")
    if not sub:
        sair("o [RASTREIO 3] ainda não foi criado (criar --aplicar)")
    base, chave = n8n_acesso(slug, cfg)
    wf = n8n(base, chave, "GET", "/workflows/" + alvo)
    gat = [n for n in wf["nodes"] if n["type"].endswith("whatsAppTrigger")]
    # um workflow pode ter gatilhos de VÁRIOS números (medido no piloto: dois gatilhos no mesmo workflow):
    # escolhe pelo nome da credencial do app, nunca pelo primeiro que aparecer
    nome_cred = r.get("meta_whatsapp_credencial")
    if nome_cred:
        gat = [n for n in gat if (n.get("credentials") or {}).get("whatsAppTriggerApi", {}).get("name") == nome_cred]
    if len(gat) != 1:
        achados = ["%r (credencial %r)" % (n["name"], (n.get("credentials") or {}).get("whatsAppTriggerApi", {}).get("name"))
                   for n in wf["nodes"] if n["type"].endswith("whatsAppTrigger")]
        sair("esperava 1 gatilho do WhatsApp em %s%s, achei %d. Gatilhos: %s. Defina rastreio.meta_whatsapp_credencial." % (
            alvo, " com a credencial %r" % nome_cred if nome_cred else "", len(gat), "; ".join(achados)))
    if any(n["name"] == "rastreio (sub)" for n in wf["nodes"]):
        print("já ligado")
        return
    g = gat[0]
    no = node_base("rastreio (sub)", "n8n-nodes-base.executeWorkflow", 1.2, [g["position"][0] + 220, g["position"][1] + 300],
                   {"workflowId": {"__rl": True, "value": sub, "mode": "id"}, "options": {"waitForSubWorkflow": False}},
                   onError="continueRegularOutput")
    if not aplicar:
        print("ligaria: %s -> nó 'rastreio (sub)' -> workflow %s, em paralelo ao que já sai do gatilho %r" % (alvo, sub, g["name"]))
        print("nada escrito. Feche a aba desse workflow no editor antes do --aplicar (o editor salva por cima).")
        return
    bk = os.path.join(REPO, "clientes", slug, "n8n", "backup")
    os.makedirs(bk, exist_ok=True)
    io.open(os.path.join(bk, "%s-antes-do-rastreio-%s.json" % (alvo, time.strftime("%Y%m%d-%H%M%S"))), "w",
            encoding="utf-8").write(json.dumps(wf, ensure_ascii=False, indent=2))
    wf["nodes"].append(no)
    lst = wf["connections"].setdefault(g["name"], {"main": [[]]})["main"]
    if not lst:
        lst.append([])
    lst[0].append({"node": no["name"], "type": "main", "index": 0})
    nos = [{k: v for k, v in n.items() if k != "rewireOutputLogTo"} for n in wf["nodes"]]
    corpo = {"name": wf["name"], "nodes": nos, "connections": wf["connections"],
             "settings": {k: v for k, v in (wf.get("settings") or {}).items() if k in SETTINGS_ACEITOS}}
    n8n(base, chave, "PUT", "/workflows/" + alvo, corpo)
    lido = n8n(base, chave, "GET", "/workflows/" + alvo)
    ok = any(n["name"] == "rastreio (sub)" for n in lido["nodes"])
    print("ligado e conferido por releitura" if ok else "PUT voltou mas o nó NÃO está lá: conferir")
    if lido.get("versionId") != lido.get("activeVersionId") and lido.get("activeVersionId"):
        print("ATENÇÃO: rascunho diferente do publicado. Publicar no editor (o gatilho roda a versão publicada).")


# ------------------------------------------------------------------ campo-origem (Kommo, só com ok)

NOME_CAMPO_ORIGEM = "Origem comprovada"
OPCOES_ORIGEM = ("Google Ads", "Meta Ads", "Site")  # os valores que o banco devolve em rastreio_a_casar


def kommo_campos(api, tok):
    out, pag = [], 1
    while True:
        b = kommo_get(api, tok, "/leads/custom_fields?limit=250&page=%d" % pag)
        lst = ((b or {}).get("_embedded") or {}).get("custom_fields") or []
        out += lst
        if len(lst) < 250:
            return out
        pag += 1


def campo_origem(slug, aplicar):
    """Cria no Kommo o campo de lista "Origem comprovada", que só o rastreio escreve. O campo de origem que o
    cliente já tem costuma ser preenchido por robô na criação do lead, sem prova, e o rastreio só grava em vazio."""
    caminho, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio") or sair("sem bloco rastreio")
    api, tok = kommo_acesso(slug, cfg)

    def gravar(campo):
        enums = {e["value"]: e["id"] for e in campo.get("enums") or []}
        falta = [o for o in OPCOES_ORIGEM if o not in enums]
        if falta:
            sair("campo %s (%s) existe mas sem as opções %s: acerte no Kommo à mão" % (campo["id"], campo["name"], ", ".join(falta)))
        r["campo_origem_id"] = campo["id"]
        r["origem_enums"] = {o: enums[o] for o in OPCOES_ORIGEM}
        gravar_cfg(caminho, cfg)
        print("config.json: campo_origem_id=%s origem_enums=%s" % (campo["id"], json.dumps(r["origem_enums"], ensure_ascii=False)))
        print("rode `montar %s` de novo para os JSON saírem com o campo" % slug)

    achado = [c for c in kommo_campos(api, tok) if (c.get("name") or "").strip().lower() == NOME_CAMPO_ORIGEM.lower()]
    if len(achado) > 1:
        sair("%d campos com o nome %r: %s. Escolha um e apague o outro no Kommo." % (
            len(achado), NOME_CAMPO_ORIGEM, ", ".join(str(c["id"]) for c in achado)))
    if achado:
        print("campo já existe no Kommo: %s" % achado[0]["id"])
        return gravar(achado[0])
    corpo = [{"name": NOME_CAMPO_ORIGEM, "type": "select", "sort": 510,
              "enums": [{"value": o, "sort": (i + 1) * 10} for i, o in enumerate(OPCOES_ORIGEM)]}]
    if not aplicar:
        print("criaria no Kommo (%s): %s" % (api.split("/api/")[0], json.dumps(corpo, ensure_ascii=False)))
        print("nada escrito. Com o ok do Nilton: campo-origem %s --aplicar" % slug)
        return
    st, b = http("POST", api + "/leads/custom_fields", {"Authorization": "Bearer " + tok}, corpo)
    if st not in (200, 201):
        sair("Kommo recusou a criação (HTTP %s): %s" % (st, b))
    novo = b["_embedded"]["custom_fields"][0]
    lido = kommo_get(api, tok, "/leads/custom_fields/%s" % novo["id"])  # a resposta do POST não prova o que ficou
    if not lido or lido.get("type") != "select":
        sair("criado (%s) mas a releitura não bate: %s" % (novo["id"], lido))
    print("criado e conferido por releitura: %s" % novo["id"])
    gravar(lido)


# ------------------------------------------------------------------ testar (seco por padrão)

ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # o mesmo da etiqueta: sem 0, O, 1 e I


def opcao(a, nome, padrao=None):
    return a[a.index(nome) + 1] if nome in a and a.index(nome) + 1 < len(a) else padrao


def testar(slug, qual, a):
    """Manda para o webhook do cliente o mesmo formato que a etiqueta e o Kommo mandam. Seco por padrão."""
    _, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio") or sair("sem bloco rastreio")
    if not r.get("webhook_base"):
        sair("rastreio.webhook_base vazio (ex.: https://n8n-webhook.cliente.com/webhook)")
    chave = {"sessao": "sessao", "mensagem": "kommo_msg", "etapa": "etapa"}.get(qual) or sair("testar: sessao, mensagem ou etapa")
    url = url_webhook(r, chave)
    if "--url-teste" in a:
        url = re.sub(r"/webhook/", "/webhook-test/", url, count=1)
    agora = int(time.time())
    codigo = (opcao(a, "--codigo") or "".join(secrets.choice(ALFABETO) for _ in range(5))).upper()
    lead = opcao(a, "--lead")
    conta = opcao(a, "--conta", r.get("kommo_conta"))
    prova = ""

    if qual == "sessao":
        tipo = "text/plain;charset=UTF-8"  # a etiqueta manda assim (no-cors); o [1] aceita corpo em texto
        corpo = json.dumps({"codigo": codigo, "gclid": "TESTE-QA-%d" % agora, "utm_source": "google", "utm_medium": "cpc",
                            "utm_campaign": "QA rastreio", "utm_term": "teste", "evento": "whatsapp_click",
                            "pagina": "https://qa.osimplify.invalid/teste", "ensaio": True})
        prova = "select codigo, gclid, clicou_whatsapp_em from rastreio_sessoes where codigo = '%s';" % codigo
    elif qual == "mensagem":
        if not lead:
            sair("mensagem precisa de --lead <id de um lead [QA]>: sem lead, contato e telefone a evidência entra ignorada")
        texto = "Olá, vim pelo teste do rastreio" + ("" if "--sem-codigo" in a else " [%s]" % codigo)
        mid = "qa-" + secrets.token_hex(6)
        p = "message[add][0][%s]"
        campos = [("account[id]", conta), (p % "id", mid), (p % "chat_id", "qa-chat"), (p % "talk_id", "0"),
                  (p % "text", texto), (p % "created_at", agora), (p % "type", "incoming"),
                  (p % "element_type", "2"), (p % "element_id", lead), (p % "entity_type", "lead"), (p % "entity_id", lead)]
        corpo = urllib.parse.urlencode([(k, str(v)) for k, v in campos])
        tipo = "application/x-www-form-urlencoded"
        prova = "select fonte, codigo, lead_id, estado from rastreio_evidencias where chave_unica = 'kommo:%s';" % mid
        if "--sem-codigo" in a or str(conta) != str(r.get("kommo_conta")):
            prova += "  -- sentido contrário: tem de voltar VAZIO"
    else:
        etapas = r.get("etapas") or sair("sem etapas no config: módulo 2 não montado")
        if not lead:
            sair("etapa precisa de --lead <id de um lead [QA]>")
        e = etapas[int(opcao(a, "--etapa", "0"))]
        p = "leads[status][0][%s]"
        campos = [("account[id]", conta), (p % "id", lead), (p % "status_id", e["status_id"]),
                  (p % "pipeline_id", e["pipeline_id"]), (p % "old_status_id", "0"), (p % "last_modified", agora)]
        corpo = urllib.parse.urlencode([(k, str(v)) for k, v in campos])
        tipo = "application/x-www-form-urlencoded"
        prova = "select plataforma, evento, destino, estado, motivo from rastreio_eventos where lead_id = %s order by id desc;" % lead

    print("POST %s" % mascara(url))
    print("Content-Type: %s" % tipo)
    print(corpo if len(corpo) < 1500 else corpo[:1500] + "…")
    print("prova: " + prova)
    if "--enviar" not in a:
        print("nada enviado. Com o workflow ligado: acrescente --enviar (ou --url-teste com o editor ouvindo)")
        return
    req = urllib.request.Request(url, data=corpo.encode("utf-8"), method="POST",
                                 headers={"User-Agent": UA, "Content-Type": tipo})
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        print("resposta: HTTP %s %s" % (resp.status, resp.read().decode("utf-8", "replace")[:200]))
    except urllib.error.HTTPError as e:
        print("resposta: HTTP %s %s" % (e.code, e.read().decode("utf-8", "replace")[:200]))
        if e.code == 404:
            print("404 = workflow desligado ou caminho errado (no /webhook-test/, o editor tem de estar ouvindo)")
        sys.exit(1)
    if qual == "sessao":
        print("código do teste: %s  (use em: testar %s mensagem --codigo %s --lead <id> --enviar)" % (codigo, slug, codigo))


# ------------------------------------------------------------------ plugar (o que vem de fora: credenciais e ids)

MODELO_ENV = os.path.join(SKILL, "assets", "rastreio.env.modelo")
GRAPH = "https://graph.facebook.com/v21.0"


def env_rastreio(slug, criar_se_faltar=False):
    arq = os.path.join(REPO, "clientes", slug, "rastreio.env")
    if not os.path.exists(arq) and criar_se_faltar:
        shutil.copyfile(MODELO_ENV, arq)
        print("criado clientes/%s/rastreio.env (fora do git): preencha e rode de novo" % slug)
    return {k: v for k, v in ler_env(arq).items() if v}


def n8n_credenciais(base, chave):
    out, cursor = [], None
    while True:
        b = n8n(base, chave, "GET", "/credentials?limit=100" + ("&cursor=" + urllib.parse.quote(cursor) if cursor else ""))
        out += b.get("data", [])
        cursor = b.get("nextCursor")
        if not cursor:
            return out


def plugar(slug, aplicar, so=None):
    """Lê clientes/<slug>/rastreio.env, prova cada chave numa chamada real, cria a credencial no n8n do cliente e
    grava os ids no config. Nunca imprime valor. Seco por padrão: sem --aplicar não cria nem grava nada."""
    caminho, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio") or sair("sem bloco rastreio")
    env = env_rastreio(slug, criar_se_faltar=True)
    base, chave = n8n_acesso(slug, cfg)
    existentes = n8n_credenciais(base, chave)
    por_id, por_nome = {c["id"]: c for c in existentes}, {c["name"]: c for c in existentes}
    r.setdefault("credenciais", {})
    falta = []
    quer = lambda k: not so or k in so

    def anexar(k, tipo, nome, id_pronto, fabrica):
        """fabrica() prova a chave pelo uso e devolve os dados da credencial, ou None se a chave não veio."""
        atual = r["credenciais"].get(k)
        if atual:
            print("  %-8s já no config: %s %r%s" % (k, atual["id"], atual["name"],
                                                    "" if atual["id"] in por_id else "  <== NÃO existe no n8n: apague do config"))
            return
        pronta = por_id.get(id_pronto) if id_pronto else por_nome.get(nome)
        if id_pronto and (not pronta or pronta["type"] != tipo):
            sair("%s: credencial %s não existe no n8n ou não é %s" % (k, id_pronto, tipo))
        if not pronta:
            dados = fabrica()
            if dados is None:
                falta.append(k)
                return
            if not aplicar:
                print("  %-8s chave provada; criaria a credencial %r (%s)" % (k, nome, tipo))
                return
            novo = n8n(base, chave, "POST", "/credentials", {"name": nome, "type": tipo, "data": dados})
            pronta = {c["id"]: c for c in n8n_credenciais(base, chave)}.get(novo.get("id"))  # o POST não prova o que ficou
            if not pronta or pronta["name"] != nome or pronta["type"] != tipo:
                sair("%s: credencial criada (%s) mas a releitura não bate" % (k, novo.get("id")))
            print("  %-8s credencial criada e relida: %s %r" % (k, pronta["id"], pronta["name"]))
        elif not aplicar:
            print("  %-8s usaria a credencial que já existe: %s %r" % (k, pronta["id"], pronta["name"]))
            return
        r["credenciais"][k] = {"id": pronta["id"], "name": pronta["name"]}
        gravar_cfg(caminho, cfg)
        print("  %-8s no config: %s %r" % (k, pronta["id"], pronta["name"]))

    def kommo():
        api, tok = kommo_acesso(slug, cfg)
        conta = kommo_get(api, tok, "/account") or sair("Kommo: /account não respondeu 200")
        if r.get("kommo_conta") and str(conta.get("id")) != str(r["kommo_conta"]):
            sair("Kommo: o token é da conta %s e o config diz %s" % (conta.get("id"), r["kommo_conta"]))
        return {"name": "Authorization", "value": "Bearer " + tok}

    def supabase():
        ch = env.get("SUPABASE_SERVICE_ROLE_KEY")
        if not ch:
            return None
        if ch.startswith("eyJ"):  # chave antiga é JWT: o papel está dentro. Função do rastreio só aceita service_role
            miolo = ch.split(".")[1]
            papel = json.loads(__import__("base64").urlsafe_b64decode(miolo + "=" * (-len(miolo) % 4))).get("role")
            if papel != "service_role":
                sair("Supabase: a chave é do papel %r, não service_role" % papel)
        st, _ = http("GET", r["supabase_url"].rstrip("/") + "/rest/v1/", {"apikey": ch, "Authorization": "Bearer " + ch})
        if st != 200:
            sair("Supabase: a chave não abriu %s (HTTP %s)" % (r["supabase_url"], st))
        return {"host": r["supabase_url"].rstrip("/"), "serviceRole": ch}

    def meta():
        tok, ds = env.get("META_SYSTEM_USER_TOKEN"), env.get("META_DATASET_ID") or (r.get("meta") or {}).get("dataset_id")
        if not tok or not ds:
            return None
        st, b = http("GET", "%s/%s?fields=id,name" % (GRAPH, ds), {"Authorization": "Bearer " + tok})
        if st != 200:
            sair("Meta: o token não leu o dataset %s (HTTP %s): %s" % (ds, st, str(b)[:200]))
        return {"name": "Authorization", "value": "Bearer " + tok}

    print("== credenciais no n8n (%s)" % base)
    if quer("kommo"):
        anexar("kommo", "httpHeaderAuth", "[RASTREIO] Kommo | %s" % slug, env.get("N8N_CRED_KOMMO_ID"), kommo)
    if quer("supabase"):
        anexar("supabase", "supabaseApi", "[RASTREIO] Supabase | %s" % slug, env.get("N8N_CRED_SUPABASE_ID"), supabase)
    if quer("meta"):
        anexar("meta", "httpHeaderAuth", "[RASTREIO] Meta CAPI | %s" % slug, env.get("N8N_CRED_META_ID"), meta)
    if quer("google"):
        anexar("google", "oAuth2Api", "", env.get("N8N_CRED_GOOGLE_ID"), lambda: None)

    # ids que não são segredo: vão do .env para o config (o montar e o SQL 002 leem de lá)
    novos = []
    g, m = r.setdefault("google", {}), r.setdefault("meta", {})
    for destino, campo, var, limpa in ((g, "conta", "GOOGLE_ADS_CONTA", True), (g, "conta_login", "GOOGLE_ADS_CONTA_LOGIN", True),
                                       (m, "dataset_id", "META_DATASET_ID", False), (m, "waba_id", "META_WABA_ID", False),
                                       (m, "test_event_code", "META_TEST_EVENT_CODE", False)):
        v = re.sub(r"\D", "", env[var]) if limpa and env.get(var) else env.get(var)
        if v and destino.get(campo) != v and quer("google" if destino is g else "meta"):
            if limpa and len(v) != 10:
                sair("%s tem de ter 10 dígitos, veio com %d" % (var, len(v)))
            novos.append((destino, campo, v, var))
    for e in r.get("etapas") or []:
        var = "GOOGLE_ACAO_" + e["evento"].upper()
        v = re.sub(r"\D", "", env.get(var) or "")
        if v and str(e.get("google_acao_id") or "") != v and quer("google"):
            novos.append((e, "google_acao_id", v, var))
    print("== ids para o config")
    for destino, campo, v, var in novos:
        print("  %-26s -> %s = %s%s" % (var, campo, v, "" if aplicar else "  (gravaria)"))
        if aplicar:
            destino[campo] = v
    if aplicar and novos:
        gravar_cfg(caminho, cfg)
    if not novos:
        print("  nada novo")

    m1 = [k for k in ("kommo", "supabase") if not r["credenciais"].get(k)]
    m2 = [k for k in ("google", "meta") if not r["credenciais"].get(k)]
    print("\nmódulo 1 (origem no Kommo): " + ("credenciais prontas" if not m1 else "falta " + ", ".join(m1)))
    print("módulo 2 (volta da venda):  " + ("credenciais prontas" if not m2 else "falta " + ", ".join(m2)))
    if falta:
        print("sem chave em clientes/%s/rastreio.env: %s" % (slug, ", ".join(falta)))
    if not aplicar:
        print("nada criado nem gravado. Com o ok do Nilton: plugar %s --aplicar" % slug)
    else:
        print("mudou credencial ou id? rode `montar %s` de novo: os JSON saem com a credencial anexada" % slug)


def banco(slug, aplicar):
    """Aplica o 001 da skill e o 002 do cliente no Supabase dele, pela API de gestão. Seco por padrão."""
    _, cfg = cfg_cliente(slug)
    r = cfg.get("rastreio") or sair("sem bloco rastreio")
    ref = re.search(r"https://([a-z0-9]+)\.supabase\.co", r.get("supabase_url") or "")
    ref = ref.group(1) if ref else sair("supabase_url fora do formato https://<ref>.supabase.co")
    arqs = [os.path.join(SKILL, "assets", "banco", "001_rastreio.sql"),
            os.path.join(REPO, "clientes", slug, "supabase", "rastreio_002_config.sql")]
    for a in arqs:
        if not os.path.exists(a):
            sair("não achei %s (rode `montar %s`)" % (os.path.relpath(a, REPO), slug))
    tok = env_rastreio(slug).get("SUPABASE_ACCESS_TOKEN")
    if not tok:
        sair("sem SUPABASE_ACCESS_TOKEN em clientes/%s/rastreio.env. Sem ele: colar no SQL Editor, nesta ordem: %s" % (
            slug, " e ".join(os.path.relpath(a, REPO).replace("\\", "/") for a in arqs)))

    def q(sql):
        return http("POST", "https://api.supabase.com/v1/projects/%s/database/query" % ref, {"Authorization": "Bearer " + tok}, {"query": sql})

    st, b = q("select to_regclass('public.rastreio_config') is not null as ja_existe")
    if st not in (200, 201):
        sair("Supabase recusou o token para o projeto %s (HTTP %s): %s" % (ref, st, str(b)[:200]))
    print("projeto %s: rastreio %s" % (ref, "JÁ aplicado (o 001 e o 002 são idempotentes)" if b and b[0].get("ja_existe") else "ainda não aplicado"))
    if not aplicar:
        print("aplicaria: " + " e depois ".join(os.path.relpath(a, REPO).replace("\\", "/") for a in arqs))
        print("nada escrito. Com o ok do Nilton: banco %s --aplicar" % slug)
        return
    p = subprocess.run(["node", os.path.join(SKILL, "assets", "banco", "prova.mjs"), arqs[1]], capture_output=True, text=True, encoding="utf-8")
    if p.returncode:  # o que vai para o cliente passa primeiro no Postgres descartável
        sair("a prova local do banco falhou, nada aplicado:\n" + (p.stdout or "")[-600:] + (p.stderr or "")[-300:])
    for a in arqs:
        st, b = q(io.open(a, encoding="utf-8").read())
        if st not in (200, 201):
            sair("%s falhou (HTTP %s): %s" % (os.path.basename(a), st, str(b)[:400]))
        print("aplicado: " + os.path.basename(a))
    st, b = q("select public.rastreio_saude() as saude, (select google_armado or meta_armado from public.rastreio_config where id = 1) as armado")
    if st not in (200, 201) or not b:
        sair("aplicou mas a saúde não respondeu (HTTP %s): %s" % (st, str(b)[:300]))
    print("saúde: %s" % json.dumps(b[0].get("saude"), ensure_ascii=False)[:400])
    print("armado: %s (tem de ser False: armar é decisão à parte)" % b[0].get("armado"))


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ("levantar", "montar", "criar", "ligar-meta", "campo-origem", "testar", "plugar", "banco"):
        sair(__doc__)
    cmd, slug = a[0], a[1]
    if cmd == "plugar":
        so = opcao(a, "--so")
        plugar(slug, "--aplicar" in a, set(so.split(",")) if so else None)
        sys.exit(0)
    if cmd == "banco":
        banco(slug, "--aplicar" in a)
        sys.exit(0)
    if cmd == "levantar":
        levantar(slug)
    elif cmd == "montar":
        montar(slug)
    elif cmd == "criar":
        criar(slug, "--aplicar" in a, "--sem-credencial" in a, opcao(a, "--modulo") == "1")
    elif cmd == "campo-origem":
        campo_origem(slug, "--aplicar" in a)
    elif cmd == "testar":
        testar(slug, a[2] if len(a) > 2 else "", a[3:])
    else:
        ligar_meta(slug, "--aplicar" in a)
