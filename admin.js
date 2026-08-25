// ==========================================
// 1. CREDENCIAIS DO SUPABASE
// ==========================================
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let listaDeIngredientesGlobal = []; // Essa já existe
let listaDeProdutosGlobal = []; // GUARDA OS LANCHES PARA A EDIÇÃO
let produtoEdicaoId = null; // CONTROLA SE ESTAMOS CRIANDO (null) OU EDITANDO (id);
let lojaAtual = null; // { id, subdominio, nome, ativo }

// ==========================================
// MÓDULO -2: RESOLUÇÃO DA LOJA PELO SUBDOMÍNIO
// ==========================================
function obterSlugDaLoja() {
    const params = new URLSearchParams(window.location.search);
    const slugParam = params.get("loja");
    if (slugParam) return slugParam.toLowerCase();
    return window.location.hostname.split(".")[0].toLowerCase();
}

async function resolverLoja() {
    const slug = obterSlugDaLoja();
    try {
        // Sempre com a chave pública (nunca o token de sessão): isso roda antes
        // do login, e um token velho/expirado sobrando no navegador não pode
        // derrubar essa consulta que deveria ser sempre pública.
        const res = await fetch(`${SUPABASE_URL}/rest/v1/lojas?select=*&subdominio=eq.${encodeURIComponent(slug)}&limit=1`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await res.json();

        if (!dados || dados.length === 0) {
            mostrarTelaLojaIndisponivel("Loja não encontrada", "Não encontramos nenhuma hamburgueria neste endereço.");
            return false;
        }
        if (!dados[0].ativo) {
            mostrarTelaLojaIndisponivel("Loja inativa", "Esta loja está desativada no momento. Fale com o suporte da plataforma.");
            return false;
        }

        lojaAtual = dados[0];

        document.title = `Painel de Gestão - ${lojaAtual.nome}`;
        const elLogin = document.getElementById("login-nome-loja");
        const elTabs = document.getElementById("tabs-nome-loja");
        if (elLogin) elLogin.innerText = `${lojaAtual.nome} Admin`;
        if (elTabs) elTabs.innerText = `${lojaAtual.nome} Admin`;

        await aplicarIdentidadeVisualAdmin();

        return true;
    } catch (erro) {
        mostrarTelaLojaIndisponivel("Erro de conexão", "Não foi possível conectar ao servidor.");
        return false;
    }
}

// Mesma identidade visual (nome, logo, cor) que o painel do cliente já usa —
// aplicada aqui pra não ficar preso ao ícone/nome padrão em nenhuma loja.
// Roda antes do login (chave pública), então nenhuma loja fica sem sua cara.
async function aplicarIdentidadeVisualAdmin() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?loja_id=eq.${lojaAtual.id}&select=nome_loja,logo_url,cor_principal`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await res.json();
        if (!dados || dados.length === 0) return;
        const config = dados[0];

        const nomeExibicao = config.nome_loja || lojaAtual.nome;
        const elLogin = document.getElementById("login-nome-loja");
        const elTabs = document.getElementById("tabs-nome-loja");
        if (elLogin) elLogin.innerText = `${nomeExibicao} Admin`;
        if (elTabs) elTabs.innerText = `${nomeExibicao} Admin`;
        document.title = `Painel de Gestão - ${nomeExibicao}`;

        if (config.logo_url && config.logo_url.trim() !== "") {
            [["login-logo-img", "login-logo-icone"], ["sidebar-logo-img", "sidebar-logo-icone"]].forEach(([idImg, idIcone]) => {
                const img = document.getElementById(idImg);
                const icone = document.getElementById(idIcone);
                if (img && icone) {
                    img.src = config.logo_url;
                    img.style.display = "inline-block";
                    icone.style.display = "none";
                }
            });
        }

        if (config.cor_principal) {
            document.documentElement.style.setProperty('--laranja-fogo', config.cor_principal);
            try { localStorage.setItem('cor_principal_loja', config.cor_principal); } catch (e) {}
        } else {
            try { localStorage.removeItem('cor_principal_loja'); } catch (e) {}
        }
    } catch (erro) {
        console.error("Erro ao aplicar identidade visual:", erro);
    }
}

function mostrarTelaLojaIndisponivel(titulo, mensagem) {
    document.body.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #121212; color: #fff; padding: 30px; text-align: center; font-family: 'Roboto', sans-serif;">
            <div>
                <i class="fa-solid fa-shop-slash" style="font-size: 40px; color: #ff5e00; margin-bottom: 15px;"></i>
                <h2 style="margin-bottom: 10px;">${escaparHtml(titulo)}</h2>
                <p style="color: #aaa;">${escaparHtml(mensagem)}</p>
            </div>
        </div>
    `;
}

// Confere se o usuário que acabou de logar está vinculado a ESTA loja
// (evita que a conta de uma hamburgueria acesse o painel de outra).
async function verificarAcessoLoja(userId) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_lojas?select=loja_id,ativo&user_id=eq.${userId}`, {
            headers: headersAutenticados()
        });
        const dados = await res.json();
        return dados.length > 0 && dados[0].loja_id === lojaAtual.id && dados[0].ativo !== false;
    } catch (erro) {
        return false;
    }
}

// ==========================================
// MÓDULO -1: AUTENTICAÇÃO DO PAINEL (SUPABASE AUTH)
// ==========================================
const CHAVE_SESSAO_ADMIN = "hamburgueria_admin_sessao";

function salvarSessao(dadosToken) {
    const sessao = {
        access_token: dadosToken.access_token,
        refresh_token: dadosToken.refresh_token,
        expira_em: Math.floor(Date.now() / 1000) + dadosToken.expires_in
    };
    localStorage.setItem(CHAVE_SESSAO_ADMIN, JSON.stringify(sessao));
    return sessao;
}

function carregarSessao() {
    const bruto = localStorage.getItem(CHAVE_SESSAO_ADMIN);
    return bruto ? JSON.parse(bruto) : null;
}

function limparSessao() {
    localStorage.removeItem(CHAVE_SESSAO_ADMIN);
}

function sessaoExpirada(sessao) {
    if (!sessao) return true;
    return Math.floor(Date.now() / 1000) >= (sessao.expira_em - 90); // 90s de margem
}

// Monta os headers de toda chamada ao Supabase usando o token do admin logado
// (necessário pra passar nas políticas RLS que exigem usuário autenticado)
function headersAutenticados(contentType) {
    const sessao = carregarSessao();
    const token = (sessao && sessao.access_token) ? sessao.access_token : SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (contentType) headers['Content-Type'] = contentType;
    return headers;
}

async function fazerLoginAdmin(event) {
    if (event) event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const senha = document.getElementById("login-senha").value;
    const erroEl = document.getElementById("login-erro");
    const btn = document.getElementById("btn-login-admin");

    erroEl.style.display = "none";
    const textoOriginal = btn.innerText;
    btn.innerText = "Entrando...";
    btn.disabled = true;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: senha })
        });
        const dados = await res.json();

        if (!res.ok) {
            erroEl.innerText = "E-mail ou senha inválidos.";
            erroEl.style.display = "block";
            return;
        }

        salvarSessao(dados);

        const temAcesso = await verificarAcessoLoja(dados.user.id);
        if (!temAcesso) {
            limparSessao();
            erroEl.innerText = "Esta conta não tem acesso a esta loja.";
            erroEl.style.display = "block";
            return;
        }

        iniciarPainelAdmin();
    } catch (erro) {
        erroEl.innerText = "Erro de conexão. Tente novamente.";
        erroEl.style.display = "block";
        console.error(erro);
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

// ==========================================
// LOGIN COM GOOGLE
// ==========================================
function loginComGoogleAdmin() {
    const redirecionarPara = window.location.origin + window.location.pathname + window.location.search;
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirecionarPara)}`;
}

// Roda ao carregar a página: se voltamos do Google com um token no hash da
// URL, valida e faz login. Retorna true se conseguiu logar (pra não seguir
// o fluxo normal de "mostrar tela de login").
async function checarRetornoOAuthAdmin() {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=") || hash.includes("type=recovery")) return false;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresIn = params.get("expires_in");
    if (!accessToken) return false;

    try {
        const resUser = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${accessToken}` }
        });
        if (!resUser.ok) throw new Error("Token do Google rejeitado");
        const usuario = await resUser.json();

        salvarSessao({ access_token: accessToken, refresh_token: refreshToken, expires_in: parseInt(expiresIn) || 3600, user: usuario });

        window.location.hash = "";
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        const temAcesso = await verificarAcessoLoja(usuario.id);
        if (!temAcesso) {
            limparSessao();
            const erroEl = document.getElementById("login-erro");
            if (erroEl) {
                erroEl.innerText = "Sua conta Google não tem acesso a esta loja. Peça pro suporte vincular seu acesso.";
                erroEl.style.display = "block";
            }
            return false;
        }

        iniciarPainelAdmin();
        return true;
    } catch (erro) {
        console.error("Erro no login com Google:", erro);
        window.location.hash = "";
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        return false;
    }
}

// ==========================================
// RECUPERAÇÃO DE SENHA
// ==========================================
let tokenRecuperacaoSenha = null;

function mostrarPainelLoginNormal() {
    document.getElementById("painel-login-normal").style.display = "block";
    document.getElementById("painel-recuperar-senha").style.display = "none";
    document.getElementById("painel-nova-senha").style.display = "none";
}

function mostrarPainelRecuperarSenha() {
    document.getElementById("painel-login-normal").style.display = "none";
    document.getElementById("painel-recuperar-senha").style.display = "block";
    document.getElementById("painel-nova-senha").style.display = "none";
}

function mostrarPainelNovaSenha() {
    document.getElementById("painel-login-normal").style.display = "none";
    document.getElementById("painel-recuperar-senha").style.display = "none";
    document.getElementById("painel-nova-senha").style.display = "block";
}

// Se voltamos do link do e-mail de recuperação, o Supabase manda um token
// temporário no hash da URL com type=recovery. Guarda ele pra usar depois
// em salvarNovaSenha() e mostra o formulário de nova senha.
function tratarRetornoRecuperacaoSenha() {
    const hash = window.location.hash;
    if (!hash || !hash.includes("type=recovery")) return false;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    if (!accessToken) return false;

    tokenRecuperacaoSenha = accessToken;

    window.location.hash = "";
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

    mostrarPainelNovaSenha();
    return true;
}

async function enviarRecuperacaoSenha() {
    const email = document.getElementById("recuperar-email").value.trim();
    const erroEl = document.getElementById("recuperar-erro");
    const sucessoEl = document.getElementById("recuperar-sucesso");
    const btn = document.getElementById("btn-recuperar-senha");
    erroEl.style.display = "none";
    sucessoEl.style.display = "none";

    if (!email) {
        erroEl.innerText = "Digite seu e-mail.";
        erroEl.style.display = "block";
        return;
    }

    const textoOriginal = btn.innerText;
    btn.innerText = "Enviando...";
    btn.disabled = true;

    try {
        const redirecionarPara = window.location.origin + window.location.pathname + window.location.search;
        await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, options: { redirect_to: redirecionarPara } })
        });
        // O Supabase sempre responde OK aqui por segurança, mesmo se o e-mail
        // não existir na base — não dá pra saber, então a mensagem é genérica.
        sucessoEl.innerText = "Se esse e-mail estiver cadastrado, você vai receber um link de recuperação em instantes.";
        sucessoEl.style.display = "block";
    } catch (erro) {
        erroEl.innerText = "Erro de conexão. Tente novamente.";
        erroEl.style.display = "block";
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

async function salvarNovaSenha() {
    const novaSenha = document.getElementById("nova-senha-input").value;
    const erroEl = document.getElementById("nova-senha-erro");
    const btn = document.getElementById("btn-salvar-nova-senha");
    erroEl.style.display = "none";

    if (!novaSenha || novaSenha.length < 6) {
        erroEl.innerText = "A senha precisa ter pelo menos 6 caracteres.";
        erroEl.style.display = "block";
        return;
    }
    if (!tokenRecuperacaoSenha) {
        erroEl.innerText = "Link de recuperação inválido ou expirado. Solicite um novo.";
        erroEl.style.display = "block";
        return;
    }

    const textoOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${tokenRecuperacaoSenha}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: novaSenha })
        });
        if (!res.ok) throw new Error("Falha ao atualizar senha");

        tokenRecuperacaoSenha = null;
        alert("Senha atualizada com sucesso! Faça login com sua nova senha.");
        mostrarPainelLoginNormal();
    } catch (erro) {
        erroEl.innerText = "Não foi possível atualizar a senha. O link pode ter expirado — solicite um novo.";
        erroEl.style.display = "block";
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

function sairAdmin() {
    limparSessao();
    location.reload();
}

async function renovarSessaoSeNecessario() {
    const sessao = carregarSessao();
    if (!sessao) return false;
    if (!sessaoExpirada(sessao)) return true;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: sessao.refresh_token })
        });
        if (!res.ok) { limparSessao(); return false; }
        salvarSessao(await res.json());
        return true;
    } catch (erro) {
        limparSessao();
        return false;
    }
}

let intervaloPedidosAdmin = null;
let intervaloProdutosEstoqueAdmin = null;
let intervaloRenovarSessaoAdmin = null;

function pararIntervalosAdmin() {
    if (intervaloPedidosAdmin) clearInterval(intervaloPedidosAdmin);
    if (intervaloProdutosEstoqueAdmin) clearInterval(intervaloProdutosEstoqueAdmin);
    if (intervaloRenovarSessaoAdmin) clearInterval(intervaloRenovarSessaoAdmin);
}

// Roda antes de toda chamada periódica: renova o token se estiver perto de
// expirar. Se a sessão já morreu de vez (ex: aba ficou muito tempo em segundo
// plano e o timer de renovação não disparou a tempo), para o polling e volta
// pra tela de login em vez de ficar repetindo erro 401 silenciosamente.
async function garantirSessaoOuRelogar() {
    const ok = await renovarSessaoSeNecessario();
    if (!ok) {
        pararIntervalosAdmin();
        limparSessao();
        document.getElementById("app-admin-container").style.display = "none";
        document.getElementById("tela-login-admin").style.display = "flex";
        const erroEl = document.getElementById("login-erro");
        if (erroEl) {
            erroEl.innerText = "Sua sessão expirou. Faça login novamente.";
            erroEl.style.display = "block";
        }
    }
    return ok;
}

async function iniciarPainelAdmin() {
    document.getElementById("tela-login-admin").style.display = "none";
    document.getElementById("app-admin-container").style.display = "block";

    // Destrava o autoplay do som de novo pedido: como isso acontece logo
    // depois de um clique real (o login), o navegador libera esse elemento
    // de áudio pra tocar sozinho mais tarde, sem precisar de outro clique.
    const somNovoPedido = document.getElementById("som-novo-pedido");
    if (somNovoPedido) {
        somNovoPedido.volume = 0;
        somNovoPedido.play().then(() => {
            somNovoPedido.pause();
            somNovoPedido.currentTime = 0;
            somNovoPedido.volume = 1;
        }).catch(() => {});
    }

    carregarProdutos();
    carregarEstoque();
    carregarPedidosAdmin();
    carregarConfiguracoesAdmin();
    // Espera a lista de entregadores carregar antes do relatório de entregas —
    // senão o relatório pode calcular os nomes antes de saber quem é quem
    // e cair no "Entregador" genérico de fallback.
    await carregarEntregadores();
    definirPeriodoPadrao('entregas-data-inicio', 'entregas-data-fim');
    carregarRelatorioEntregas();
    definirPeriodoPadrao('financeiro-data-inicio', 'financeiro-data-fim');
    carregarRelatorioFinanceiro();
    definirPeriodoPadrao('dash-data-inicio', 'dash-data-fim');
    carregarDashboard();
    carregarClientes();
    carregarCupons();

    intervaloPedidosAdmin = setInterval(carregarPedidosAdmin, 3000);
    intervaloProdutosEstoqueAdmin = setInterval(() => { carregarProdutos(); carregarEstoque(); }, 5000);
    intervaloRenovarSessaoAdmin = setInterval(renovarSessaoSeNecessario, 60 * 1000);
}

// ==========================================
// MÓDULO 6: CONTROLE DE ENTREGAS
// ==========================================
function definirPeriodoPadrao(idInicio, idFim) {
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const paraISO = (d) => d.toISOString().substring(0, 10);

    const elInicio = document.getElementById(idInicio);
    const elFim = document.getElementById(idFim);
    if (elInicio && !elInicio.value) elInicio.value = paraISO(primeiroDiaMes);
    if (elFim && !elFim.value) elFim.value = paraISO(hoje);
}

let entregasDetalhesCache = {};

async function carregarRelatorioEntregas() {
    if (!(await garantirSessaoOuRelogar())) return;

    const dataInicio = document.getElementById("entregas-data-inicio").value;
    const dataFim = document.getElementById("entregas-data-fim").value;
    const tbody = document.getElementById("tabela-entregas");
    if (!dataInicio || !dataFim || !tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?select=id,numero_pedido,nome_cliente,data_pedido,saiu_em,entregue_em,valor_repasse_entregador,entregador_id` +
            `&loja_id=eq.${lojaAtual.id}&tipo_entrega=eq.entrega` +
            `&data_pedido=gte.${dataInicio}T00:00:00-03:00&data_pedido=lte.${dataFim}T23:59:59-03:00&order=data_pedido.desc`,
            { headers: headersAutenticados() }
        );
        const pedidos = await res.json();

        let totalRepasse = 0;
        let html = "";
        const porEntregador = {};
        entregasDetalhesCache = {};

        pedidos.forEach(p => {
            const repasse = Number(p.valor_repasse_entregador) || 0;
            totalRepasse += repasse;

            const nomeEnt = p.entregador_id ? nomeEntregadorPorId(p.entregador_id) : "Sem entregador";
            if (!porEntregador[nomeEnt]) porEntregador[nomeEnt] = { qtd: 0, total: 0 };
            porEntregador[nomeEnt].qtd++;
            porEntregador[nomeEnt].total += repasse;

            const tempoTotal = duracaoEntre(p.data_pedido, p.entregue_em);
            entregasDetalhesCache[p.id] = { ...p, nomeEnt, repasse };
            html += `
                <tr>
                    <td>#${p.numero_pedido || p.id}</td>
                    <td>${escaparHtml(p.nome_cliente)}</td>
                    <td>${escaparHtml(nomeEnt)}</td>
                    <td>${tempoTotal}</td>
                    <td>R$ ${repasse.toFixed(2).replace('.', ',')}</td>
                    <td><button class="btn-detalhes-entrega" onclick="abrirDetalhesEntrega(${p.id})">Mais detalhes</button></td>
                </tr>
            `;
        });

        tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;">Nenhuma entrega nesse período.</td></tr>';
        document.getElementById("entregas-total-qtd").innerText = pedidos.length;
        document.getElementById("entregas-total-repasse").innerText = `R$ ${totalRepasse.toFixed(2).replace('.', ',')}`;

        const tbodyResumo = document.getElementById("tabela-repasse-entregador");
        const linhasResumo = Object.keys(porEntregador).map(nome => {
            const dados = porEntregador[nome];
            return `<tr><td>${escaparHtml(nome)}</td><td>${dados.qtd}</td><td>R$ ${dados.total.toFixed(2).replace('.', ',')}</td></tr>`;
        }).join('');
        tbodyResumo.innerHTML = linhasResumo || '<tr><td colspan="3" style="text-align:center;">Nenhuma entrega nesse período.</td></tr>';
    } catch (erro) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--vermelho);">Erro ao carregar entregas.</td></tr>';
        console.error(erro);
    }
}

function abrirDetalhesEntrega(pedidoId) {
    const p = entregasDetalhesCache[pedidoId];
    if (!p) return;

    document.getElementById("detalhes-entrega-numero").innerText = `#${p.numero_pedido || p.id}`;

    const passos = [
        { titulo: "Pedido feito", hora: p.data_pedido, anterior: null },
        { titulo: "Saiu para entrega", hora: p.saiu_em, anterior: p.data_pedido },
        { titulo: "Entregue", hora: p.entregue_em, anterior: p.saiu_em }
    ];

    const html = passos.map(passo => {
        const feito = !!passo.hora;
        const hora = feito ? formatarDataHoraBr(passo.hora, { hour: '2-digit', minute: '2-digit' }) : "Ainda não aconteceu";
        const duracao = (feito && passo.anterior) ? `+ ${duracaoEntre(passo.anterior, passo.hora)}` : "";
        return `
            <li class="timeline-passo${feito ? '' : ' pendente'}">
                <div class="titulo">${passo.titulo}</div>
                <div class="hora">${hora}</div>
                ${duracao ? `<div class="duracao">${duracao}</div>` : ""}
            </li>
        `;
    }).join('');

    document.getElementById("detalhes-entrega-timeline").innerHTML = html;
    document.getElementById("modal-detalhes-entrega").style.display = "flex";
}

function fecharModalDetalhesEntrega() {
    document.getElementById("modal-detalhes-entrega").style.display = "none";
}

// ==========================================
// MÓDULO 7: PAINEL FINANCEIRO
// ==========================================
async function carregarRelatorioFinanceiro() {
    if (!(await garantirSessaoOuRelogar())) return;

    const dataInicio = document.getElementById("financeiro-data-inicio").value;
    const dataFim = document.getElementById("financeiro-data-fim").value;
    const tbody = document.getElementById("tabela-financeiro");
    if (!dataInicio || !dataFim || !tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?select=id,numero_pedido,nome_cliente,data_pedido,forma_pagamento,tipo_entrega,total` +
            `&loja_id=eq.${lojaAtual.id}` +
            `&data_pedido=gte.${dataInicio}T00:00:00-03:00&data_pedido=lte.${dataFim}T23:59:59-03:00&order=data_pedido.desc`,
            { headers: headersAutenticados() }
        );
        const pedidos = await res.json();

        let totalVendido = 0;
        const porPagamento = {};
        const porTipo = { entrega: { qtd: 0, total: 0 }, retirada: { qtd: 0, total: 0 } };
        let html = "";

        pedidos.forEach(p => {
            const valor = Number(p.total) || 0;
            totalVendido += valor;

            const pagamento = p.forma_pagamento || "Não informado";
            if (!porPagamento[pagamento]) porPagamento[pagamento] = { qtd: 0, total: 0 };
            porPagamento[pagamento].qtd++;
            porPagamento[pagamento].total += valor;

            const tipo = (p.tipo_entrega === "retirada") ? "retirada" : "entrega";
            porTipo[tipo].qtd++;
            porTipo[tipo].total += valor;

            const dataFormatada = p.data_pedido ? formatarDataHoraBr(p.data_pedido) : '-';
            html += `
                <tr>
                    <td>#${p.numero_pedido || p.id}</td>
                    <td>${escaparHtml(p.nome_cliente)}</td>
                    <td>${dataFormatada}</td>
                    <td>${escaparHtml(pagamento)}</td>
                    <td>${tipo === 'retirada' ? 'Retirada' : 'Entrega'}</td>
                    <td>R$ ${valor.toFixed(2).replace('.', ',')}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;">Nenhuma venda nesse período.</td></tr>';

        document.getElementById("financeiro-total-vendido").innerText = `R$ ${totalVendido.toFixed(2).replace('.', ',')}`;
        document.getElementById("financeiro-total-vendas").innerText = pedidos.length;
        const ticketMedio = pedidos.length > 0 ? totalVendido / pedidos.length : 0;
        document.getElementById("financeiro-ticket-medio").innerText = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;

        const elPagamentos = document.getElementById("financeiro-formas-pagamento");
        let htmlPag = "";
        Object.keys(porPagamento).forEach(forma => {
            const dados = porPagamento[forma];
            htmlPag += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--borda); font-size: 14px;">
                    <span>${escaparHtml(forma)} <span style="color: var(--texto-claro); font-size: 12px;">(${dados.qtd})</span></span>
                    <strong>R$ ${dados.total.toFixed(2).replace('.', ',')}</strong>
                </div>
            `;
        });
        elPagamentos.innerHTML = htmlPag || '<p style="color: var(--texto-claro); font-size: 13px; margin: 0;">Sem dados no período.</p>';

        const elTipos = document.getElementById("financeiro-tipos-entrega");
        elTipos.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--borda); font-size: 14px;">
                <span><i class="fa-solid fa-motorcycle"></i> Entrega <span style="color: var(--texto-claro); font-size: 12px;">(${porTipo.entrega.qtd})</span></span>
                <strong>R$ ${porTipo.entrega.total.toFixed(2).replace('.', ',')}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 0; font-size: 14px;">
                <span><i class="fa-solid fa-store"></i> Retirada <span style="color: var(--texto-claro); font-size: 12px;">(${porTipo.retirada.qtd})</span></span>
                <strong>R$ ${porTipo.retirada.total.toFixed(2).replace('.', ',')}</strong>
            </div>
        `;
    } catch (erro) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--vermelho);">Erro ao carregar dados financeiros.</td></tr>';
        console.error(erro);
    }
}

// ==========================================
// MÓDULO 8: DASHBOARD ANALÍTICO
// ==========================================
let graficoFaturamento = null;
let graficoPicos = null;
let dashGranularidade = 'dia';
let dashCacheDados = null;

function formatarMoeda(v) {
    return `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
}

function aplicarPeriodoRapido(dias) {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - (dias - 1));
    const paraISO = (d) => d.toISOString().substring(0, 10);
    document.getElementById("dash-data-inicio").value = paraISO(inicio);
    document.getElementById("dash-data-fim").value = paraISO(fim);
    carregarDashboard();
}

function aplicarPeriodoRapidoMes() {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const paraISO = (d) => d.toISOString().substring(0, 10);
    document.getElementById("dash-data-inicio").value = paraISO(inicio);
    document.getElementById("dash-data-fim").value = paraISO(hoje);
    carregarDashboard();
}

function aplicarPeriodoRapidoAno() {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), 0, 1);
    const paraISO = (d) => d.toISOString().substring(0, 10);
    document.getElementById("dash-data-inicio").value = paraISO(inicio);
    document.getElementById("dash-data-fim").value = paraISO(hoje);
    carregarDashboard();
}

function mudarGranularidade(gran) {
    dashGranularidade = gran;
    document.getElementById("btn-gran-dia").classList.toggle("ativo", gran === "dia");
    document.getElementById("btn-gran-mes").classList.toggle("ativo", gran === "mes");
    if (dashCacheDados) renderizarGraficoFaturamento(dashCacheDados.pedidos);
}

async function carregarDashboard() {
    if (!(await garantirSessaoOuRelogar())) return;

    const dataInicio = document.getElementById("dash-data-inicio").value;
    const dataFim = document.getElementById("dash-data-fim").value;
    if (!dataInicio || !dataFim) return;

    try {
        const resPedidos = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?select=id,nome_cliente,telefone_cliente,cliente_id,data_pedido,total,forma_pagamento,tipo_entrega` +
            `&loja_id=eq.${lojaAtual.id}` +
            `&data_pedido=gte.${dataInicio}T00:00:00-03:00&data_pedido=lte.${dataFim}T23:59:59-03:00&order=data_pedido.asc`,
            { headers: headersAutenticados() }
        );
        const pedidos = await resPedidos.json();
        dashCacheDados = { pedidos };

        // Período anterior (mesma duração, imediatamente antes) — só pra comparação
        const msPorDia = 24 * 60 * 60 * 1000;
        const inicioDate = new Date(dataInicio + "T00:00:00");
        const fimDate = new Date(dataFim + "T00:00:00");
        const duracaoDias = Math.round((fimDate - inicioDate) / msPorDia) + 1;
        const inicioAnteriorDate = new Date(inicioDate.getTime() - duracaoDias * msPorDia);
        const fimAnteriorDate = new Date(inicioDate.getTime() - msPorDia);
        const paraISO = (d) => d.toISOString().substring(0, 10);

        const resAnterior = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?select=total` +
            `&loja_id=eq.${lojaAtual.id}` +
            `&data_pedido=gte.${paraISO(inicioAnteriorDate)}T00:00:00-03:00&data_pedido=lte.${paraISO(fimAnteriorDate)}T23:59:59-03:00`,
            { headers: headersAutenticados() }
        );
        const pedidosAnterior = await resAnterior.json();
        const totalAnterior = pedidosAnterior.reduce((acc, p) => acc + (Number(p.total) || 0), 0);

        // Itens dos pedidos do período (pra faturamento por produto)
        let itens = [];
        if (pedidos.length > 0) {
            const idsPedidos = pedidos.map(p => p.id).join(',');
            const resItens = await fetch(
                `${SUPABASE_URL}/rest/v1/itens_pedido?select=pedido_id,produto_id,quantidade,preco_unitario` +
                `&loja_id=eq.${lojaAtual.id}&pedido_id=in.(${idsPedidos})`,
                { headers: headersAutenticados() }
            );
            itens = await resItens.json();
        }

        const resProdutos = await fetch(
            `${SUPABASE_URL}/rest/v1/produtos?select=id,nome&loja_id=eq.${lojaAtual.id}`,
            { headers: headersAutenticados() }
        );
        const produtosLoja = await resProdutos.json();
        const nomeProdutoPorId = {};
        produtosLoja.forEach(p => { nomeProdutoPorId[p.id] = p.nome; });

        // ===== CÁLCULOS =====
        const totalFaturado = pedidos.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
        const qtdPedidos = pedidos.length;
        const ticketMedio = qtdPedidos > 0 ? totalFaturado / qtdPedidos : 0;

        const horasPico = new Array(24).fill(0);
        pedidos.forEach(p => {
            if (p.data_pedido) horasPico[horaBr(p.data_pedido)]++;
        });

        const porProduto = {};
        itens.forEach(item => {
            const id = item.produto_id;
            if (!porProduto[id]) porProduto[id] = { nome: nomeProdutoPorId[id] || `Produto #${id}`, qtd: 0, faturamento: 0 };
            porProduto[id].qtd += Number(item.quantidade) || 0;
            porProduto[id].faturamento += (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);
        });
        const produtosOrdenados = Object.values(porProduto).sort((a, b) => b.faturamento - a.faturamento);

        const porCliente = {};
        pedidos.forEach(p => {
            const chave = p.cliente_id || p.telefone_cliente || p.nome_cliente;
            if (!chave) return;
            if (!porCliente[chave]) porCliente[chave] = { nome: p.nome_cliente || "Cliente", qtd: 0, total: 0 };
            porCliente[chave].qtd++;
            porCliente[chave].total += Number(p.total) || 0;
            porCliente[chave].nome = p.nome_cliente || porCliente[chave].nome;
        });
        const clientesOrdenados = Object.values(porCliente).sort((a, b) => b.qtd - a.qtd || b.total - a.total);

        const porPagamento = {};
        const porTipo = { entrega: 0, retirada: 0 };
        pedidos.forEach(p => {
            const forma = p.forma_pagamento || "Não informado";
            porPagamento[forma] = (porPagamento[forma] || 0) + 1;
            porTipo[p.tipo_entrega === "retirada" ? "retirada" : "entrega"]++;
        });

        // ===== RENDERIZAÇÃO =====
        document.getElementById("dash-faturamento").innerText = formatarMoeda(totalFaturado);
        document.getElementById("dash-pedidos-qtd").innerText = qtdPedidos;
        document.getElementById("dash-ticket-medio").innerText = formatarMoeda(ticketMedio);

        const elDelta = document.getElementById("dash-faturamento-delta");
        if (totalAnterior > 0) {
            const deltaPercent = ((totalFaturado - totalAnterior) / totalAnterior) * 100;
            elDelta.className = deltaPercent >= 0 ? "delta-positivo" : "delta-negativo";
            elDelta.innerText = `${deltaPercent >= 0 ? '▲' : '▼'} ${Math.abs(deltaPercent).toFixed(0)}% vs período anterior`;
        } else {
            elDelta.innerText = "";
        }

        const elClienteFiel = document.getElementById("dash-cliente-fiel");
        elClienteFiel.innerText = clientesOrdenados.length > 0 ? `${clientesOrdenados[0].nome} (${clientesOrdenados[0].qtd}x)` : "-";

        const tbodyProdutos = document.getElementById("dash-tabela-produtos");
        let htmlProdutos = "";
        produtosOrdenados.slice(0, 10).forEach(p => {
            htmlProdutos += `<tr><td>${escaparHtml(p.nome)}</td><td>${p.qtd}</td><td>${formatarMoeda(p.faturamento)}</td></tr>`;
        });
        tbodyProdutos.innerHTML = htmlProdutos || '<tr><td colspan="3" style="text-align:center;">Sem vendas no período.</td></tr>';

        const tbodyClientes = document.getElementById("dash-tabela-clientes");
        let htmlClientes = "";
        clientesOrdenados.slice(0, 10).forEach(c => {
            htmlClientes += `<tr><td>${escaparHtml(c.nome)}</td><td>${c.qtd}</td><td>${formatarMoeda(c.total)}</td></tr>`;
        });
        tbodyClientes.innerHTML = htmlClientes || '<tr><td colspan="3" style="text-align:center;">Sem clientes no período.</td></tr>';

        renderizarGraficoFaturamento(pedidos);
        renderizarGraficoPicos(horasPico);

        // ===== INSIGHTS =====
        const insights = [];
        if (qtdPedidos === 0) {
            insights.push("Nenhum pedido nesse período.");
        } else {
            const picoMax = Math.max(...horasPico);
            if (picoMax > 0) {
                const horaPico = horasPico.indexOf(picoMax);
                insights.push(`Horário de pico: das ${horaPico}h às ${(horaPico + 1) % 24}h, com ${picoMax} pedido(s) — bom momento pra reforçar a equipe.`);
            }
            if (produtosOrdenados.length > 0) {
                const top = produtosOrdenados[0];
                const pctProduto = totalFaturado > 0 ? ((top.faturamento / totalFaturado) * 100).toFixed(0) : 0;
                insights.push(`"${escaparHtml(top.nome)}" é o produto que mais fatura, respondendo por ${pctProduto}% do total do período.`);
            }
            const formaTop = Object.keys(porPagamento).sort((a, b) => porPagamento[b] - porPagamento[a])[0];
            if (formaTop) {
                const pctForma = ((porPagamento[formaTop] / qtdPedidos) * 100).toFixed(0);
                insights.push(`${pctForma}% dos pedidos são pagos via ${escaparHtml(formaTop)}.`);
            }
            if (porTipo.entrega + porTipo.retirada > 0) {
                const pctEntrega = ((porTipo.entrega / qtdPedidos) * 100).toFixed(0);
                insights.push(`${pctEntrega}% dos pedidos são de entrega, ${100 - pctEntrega}% de retirada.`);
            }
            if (clientesOrdenados.length > 0 && clientesOrdenados[0].qtd >= 2) {
                insights.push(`${escaparHtml(clientesOrdenados[0].nome)} é o cliente mais fiel do período, com ${clientesOrdenados[0].qtd} pedidos.`);
            }
            if (totalAnterior > 0) {
                const deltaPercent = ((totalFaturado - totalAnterior) / totalAnterior) * 100;
                if (Math.abs(deltaPercent) >= 5) {
                    insights.push(deltaPercent > 0
                        ? `Faturamento ${deltaPercent.toFixed(0)}% maior que o período anterior de mesma duração.`
                        : `Faturamento ${Math.abs(deltaPercent).toFixed(0)}% menor que o período anterior — vale investigar o motivo.`);
                }
            }
        }
        document.getElementById("dash-insights").innerHTML = insights.map(i => `<li>${i}</li>`).join('') || '<li>Sem dados suficientes pra gerar insights.</li>';

    } catch (erro) {
        console.error("Erro ao carregar dashboard:", erro);
    }
}

function renderizarGraficoFaturamento(pedidos) {
    const canvas = document.getElementById("grafico-faturamento");
    if (!canvas || typeof Chart === 'undefined') return;

    const buckets = {};
    pedidos.forEach(p => {
        if (!p.data_pedido) return;
        const d = partesDataBr(p.data_pedido);
        const chave = dashGranularidade === 'mes'
            ? `${d.ano}-${d.mes}`
            : `${d.ano}-${d.mes}-${d.dia}`;
        buckets[chave] = (buckets[chave] || 0) + (Number(p.total) || 0);
    });

    const chaves = Object.keys(buckets).sort();
    const labels = chaves.map(c => {
        const partes = c.split('-');
        return dashGranularidade === 'mes' ? `${partes[1]}/${partes[0]}` : `${partes[2]}/${partes[1]}`;
    });
    const dados = chaves.map(c => buckets[c]);

    if (graficoFaturamento) graficoFaturamento.destroy();
    graficoFaturamento = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: dados,
                backgroundColor: '#ff5e00',
                borderRadius: 4,
                categoryPercentage: 0.6,
                barPercentage: 0.9,
                maxBarThickness: 24
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => formatarMoeda(ctx.parsed.y) } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#898781', font: { size: 11 } } },
                y: {
                    beginAtZero: true,
                    grid: { color: '#e1e0d9' },
                    ticks: { color: '#898781', font: { size: 11 }, callback: (v) => `R$ ${v}` }
                }
            }
        }
    });
}

function renderizarGraficoPicos(horasPico) {
    const canvas = document.getElementById("grafico-picos");
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = horasPico.map((_, h) => `${h}h`);

    if (graficoPicos) graficoPicos.destroy();
    graficoPicos = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: horasPico,
                backgroundColor: '#2563eb',
                borderRadius: 4,
                categoryPercentage: 0.7,
                barPercentage: 0.9,
                maxBarThickness: 18
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} pedido(s)` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#898781', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
                y: { beginAtZero: true, grid: { color: '#e1e0d9' }, ticks: { color: '#898781', font: { size: 11 }, precision: 0 } }
            }
        }
    });
}

async function verificarSessaoAoAbrir() {
    const sessao = carregarSessao();
    if (sessao && await renovarSessaoSeNecessario()) {
        iniciarPainelAdmin();
    }
}

// ==========================================
// MÓDULO 0: NAVEGAÇÃO DE ABAS ADMIN
// ==========================================
function mudarAbaAdmin(idAba, botaoClicado) {
    // Esconde todas as abas
    document.querySelectorAll('.view-section').forEach(aba => aba.classList.remove('ativa'));
    // Tira o foco de todos os botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativa'));

    // Mostra a aba clicada e foca o botão
    document.getElementById(idAba).classList.add('ativa');
    if(botaoClicado) botaoClicado.classList.add('ativa');

    atualizarDadosDaAba(idAba);
}

// Toda vez que troca de aba, busca os dados de novo no banco — evita ficar
// vendo informação desatualizada de quando o painel foi aberto pela última vez.
function atualizarDadosDaAba(idAba) {
    if (idAba === 'view-estoque') {
        carregarProdutos();
        carregarEstoque();
    } else if (idAba === 'view-pedidos') {
        carregarPedidosAdmin();
    } else if (idAba === 'view-dashboard') {
        carregarDashboard();
    } else if (idAba === 'view-entregas') {
        carregarEntregadores().then(carregarRelatorioEntregas); // nomes primeiro, senão cai no genérico
    } else if (idAba === 'view-financeiro') {
        carregarRelatorioFinanceiro();
    } else if (idAba === 'view-clientes') {
        carregarClientes();
    } else if (idAba === 'view-cupons') {
        carregarCupons();
    } else if (idAba === 'view-entregadores') {
        carregarEntregadores();
    } else if (idAba === 'view-config') {
        carregarConfiguracoesAdmin();
    }
}

// Evita XSS: qualquer texto vindo do banco (nome de cliente, produto, ingrediente)
// passa por aqui antes de entrar num innerHTML.
function escaparHtml(texto) {
    if (texto === null || texto === undefined) return "";
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// O endereço é salvo como "Rua, Número - Bairro (ponto de referência)". Pro
// texto na tela isso ajuda quem entrega, mas mandar pro Maps faz a busca dar
// errado — então pra montar o link tiramos só essa parte entre parênteses.
function enderecoParaMaps(endereco) {
    return String(endereco || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// O Supabase às vezes devolve o horário sem indicar o fuso (ex: "2026-08-21T09:48:00").
// Sem isso, o navegador interpreta como horário local e o horário exibido fica errado.
// Forçamos UTC quando a string não traz fuso, e sempre exibimos convertido pro horário de Brasília.
function formatarDataHoraBr(valorTimestamp, opcoes) {
    if (!valorTimestamp) return '-';
    const temFuso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(valorTimestamp);
    const data = new Date(temFuso ? valorTimestamp : valorTimestamp + 'Z');
    return data.toLocaleString('pt-BR', Object.assign({ timeZone: 'America/Sao_Paulo' }, opcoes));
}

// Hora (0-23) de um timestamp do banco, sempre no fuso de Brasília — usado pro cálculo de horário de pico.
function horaBr(valorTimestamp) {
    if (!valorTimestamp) return 0;
    const temFuso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(valorTimestamp);
    const data = new Date(temFuso ? valorTimestamp : valorTimestamp + 'Z');
    return parseInt(data.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }), 10) % 24;
}

// Ano/mês/dia de um timestamp do banco, sempre no fuso de Brasília — usado pra agrupar o gráfico por dia/mês.
function partesDataBr(valorTimestamp) {
    const temFuso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(valorTimestamp);
    const data = new Date(temFuso ? valorTimestamp : valorTimestamp + 'Z');
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(data);
    const obj = {};
    partes.forEach(p => obj[p.type] = p.value);
    return { ano: obj.year, mes: obj.month, dia: obj.day };
}

// Minutos entre dois timestamps do banco (null se faltar algum ou vier negativo).
function minutosEntre(inicioStr, fimStr) {
    if (!inicioStr || !fimStr) return null;
    const temFusoI = /[Zz]|[+-]\d{2}:?\d{2}$/.test(inicioStr);
    const temFusoF = /[Zz]|[+-]\d{2}:?\d{2}$/.test(fimStr);
    const inicio = new Date(temFusoI ? inicioStr : inicioStr + 'Z');
    const fim = new Date(temFusoF ? fimStr : fimStr + 'Z');
    const minutosTotais = (fim - inicio) / 60000;
    return minutosTotais >= 0 ? minutosTotais : null;
}

// "Xh Ymin" ou "Ymin" a partir de um total em minutos.
function formatarMinutos(min) {
    if (min === null || min === undefined || isNaN(min)) return '-';
    const minutosTotais = Math.round(min);
    const horas = Math.floor(minutosTotais / 60);
    const minutos = minutosTotais % 60;
    return horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`;
}

// Diferença entre dois timestamps do banco, formatada como "Xh Ymin" ou "Ymin".
function duracaoEntre(inicioStr, fimStr) {
    const min = minutosEntre(inicioStr, fimStr);
    return min === null ? '-' : formatarMinutos(min);
}

// Data de hoje (YYYY-MM-DD) no fuso de Brasília, pra comparar com timestamps do banco.
function hojeBrString() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// ==========================================
// MÓDULO 1: GESTÃO DE PRODUTOS
// ==========================================
async function carregarProdutos() {
    if (!(await garantirSessaoOuRelogar())) return;
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=*&loja_id=eq.${lojaAtual.id}&order=ordem.asc,id.asc`, {
            method: 'GET',
            headers: headersAutenticados()
        });
        const dados = await resposta.json();
        listaDeProdutosGlobal = dados; 
        renderizarTabelaProdutos(dados);

        // --- MÁGICA DAS CATEGORIAS DINÂMICAS ---
        // Extrai apenas as categorias únicas que existem no banco
        // --- MÁGICA DAS CATEGORIAS (COM DROP DOWN) ---
        const categoriasUnicas = [...new Set(dados.map(p => p.categoria).filter(c => c))];
        const selectCat = document.getElementById("novo-categoria");
        if(selectCat) {
            selectCat.innerHTML = ""; // Limpa as antigas
            categoriasUnicas.forEach(cat => {
                selectCat.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            // Adiciona a opção de Nova Categoria no final da lista
            selectCat.innerHTML += `<option value="nova_cat">➕ Criar Nova Categoria...</option>`;
        }
        // --------------------------------------
        // --------------------------------------

    } catch (erro) { console.error(erro); }
}

function renderizarTabelaProdutos(produtos) {
    const tbody = document.getElementById("tabela-produtos");
    if(!tbody) return; 
    tbody.innerHTML = "";
    produtos.forEach(produto => {
        const badgeClass = produto.ativo ? "status-ativo" : "status-inativo";
        const badgeTexto = produto.ativo ? "Disponível" : "Esgotado";
        const botaoTexto = produto.ativo ? "Pausar" : "Ativar";

        tbody.innerHTML += `
            <tr draggable="true" data-produto-id="${produto.id}"
                ondragstart="dragStartProduto(event, ${produto.id})"
                ondragover="dragOverProduto(event)"
                ondrop="dropProduto(event, ${produto.id})"
                ondragend="dragEndProduto(event)">
                <td class="drag-handle-cell" title="Arraste pra reordenar"><i class="fa-solid fa-grip-vertical"></i></td>
                <td>#${produto.id}</td>
                <td><strong>${escaparHtml(produto.nome)}</strong></td>
                <td>${escaparHtml(produto.categoria)}</td>
                <td>R$ ${produto.preco.toFixed(2).replace('.', ',')}</td>
                <td><span class="status-badge ${badgeClass}">${badgeTexto}</span></td>
                <td>
                    <button class="btn-acao btn-toggle" onclick="mudarStatusProduto(${produto.id}, ${!produto.ativo})">
                        ${botaoTexto}
                    </button>
                    <button class="btn-acao btn-receita" onclick="abrirModalReceita(${produto.id}, '${produto.nome}')">
                        📋 Ficha
                    </button>
                    <button class="btn-acao" style="background-color: #3498db; color: white; margin-left: 5px;" onclick="editarProduto(${produto.id})">
                        ✏️ Editar
                    </button>
                    <button class="btn-acao btn-excluir" style="margin-left: 5px;" onclick="excluirProduto(${produto.id})">
                        🗑️ Excluir
                    </button>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// ARRASTAR E SOLTAR PRA REORDENAR OS PRODUTOS
// ==========================================
let produtoArrastadoId = null;

function dragStartProduto(event, id) {
    produtoArrastadoId = id;
    event.dataTransfer.effectAllowed = 'move';
    event.currentTarget.classList.add('arrastando');
}

function dragOverProduto(event) {
    event.preventDefault(); // sem isso o navegador não deixa soltar aqui
}

function dragEndProduto(event) {
    event.currentTarget.classList.remove('arrastando');
}

async function dropProduto(event, idAlvo) {
    event.preventDefault();
    if (produtoArrastadoId === null || produtoArrastadoId === idAlvo) return;

    const lista = [...listaDeProdutosGlobal];
    const idxOrigem = lista.findIndex(p => p.id === produtoArrastadoId);
    const idxAlvo = lista.findIndex(p => p.id === idAlvo);
    if (idxOrigem === -1 || idxAlvo === -1) return;

    const [movido] = lista.splice(idxOrigem, 1);
    lista.splice(idxAlvo, 0, movido);
    lista.forEach((p, i) => { p.ordem = i; });

    listaDeProdutosGlobal = lista;
    renderizarTabelaProdutos(lista); // já mostra a nova ordem na hora, sem esperar o banco

    try {
        const respostas = await Promise.all(lista.map(p =>
            fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${p.id}`, {
                method: 'PATCH',
                headers: headersAutenticados('application/json'),
                body: JSON.stringify({ ordem: p.ordem })
            })
        ));
        if (respostas.some(r => !r.ok)) throw new Error("Falha ao salvar a nova ordem.");
    } catch (erro) {
        console.error(erro);
        alert("Não deu pra salvar a nova ordem. Recarregando a lista original.");
        carregarProdutos();
    }

    produtoArrastadoId = null;
}

async function mudarStatusProduto(id, novoStatus) {
    await fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${id}`, {
        method: 'PATCH',
        headers: headersAutenticados('application/json'),
        body: JSON.stringify({ ativo: novoStatus })
    });
    carregarProdutos();
}

/// === ABRIR MODAL VAZIO (NOVO PRODUTO) ===
function abrirModalAdmin() { 
    produtoEdicaoId = null; // Avisa o sistema que é um cadastro novo
    document.querySelector("#modal-novo-produto h2").innerText = "Cadastrar Lanche";
    
    // Limpa textos e preços
    document.getElementById("novo-nome").value = "";
    document.getElementById("novo-descricao").value = "";
    document.getElementById("novo-preco").value = "";

    // Começa depois de tudo que já existe, pra não pular a fila sem querer
    const maiorOrdem = listaDeProdutosGlobal.reduce((max, p) => Math.max(max, Number(p.ordem) || 0), 0);
    document.getElementById("novo-ordem").value = maiorOrdem + 1;

    // Volta o select de categoria pro padrão e ESCONDE a caixa de criar nova
    const selectCat = document.getElementById("novo-categoria");
    if(selectCat && selectCat.options.length > 0) selectCat.selectedIndex = 0;
    
    const novaCatTexto = document.getElementById("nova-categoria-texto");
    if(novaCatTexto) {
        novaCatTexto.value = "";
        novaCatTexto.style.display = "none";
    }

    // Limpa as imagens
    document.getElementById("novo-imagem").value = "";
    document.getElementById("novo-file-imagem").value = "";
    
    document.getElementById("modal-novo-produto").style.display = "flex"; 
}

// === ABRIR MODAL PREENCHIDO (EDITAR PRODUTO) ===
function editarProduto(id) {
    const produto = listaDeProdutosGlobal.find(p => p.id === id);
    if(!produto) return;

    produtoEdicaoId = id; // Avisa o sistema que estamos EDITANDO este ID
    document.querySelector("#modal-novo-produto h2").innerText = "✏️ Editar Lanche";
    
    // Preenche os campos com os dados do banco
    document.getElementById("novo-nome").value = produto.nome || "";
    document.getElementById("novo-descricao").value = produto.descricao || "";
    document.getElementById("novo-preco").value = produto.preco || "";
    document.getElementById("novo-categoria").value = produto.categoria || "";
    document.getElementById("novo-ordem").value = produto.ordem ?? 0;

    // ESCONDE O CAMPO TEXTO (limpando a sujeira de ações anteriores)
    const novaCatTexto = document.getElementById("nova-categoria-texto");
    if(novaCatTexto) {
        novaCatTexto.value = "";
        novaCatTexto.style.display = "none";
    }
    
    // Limpa imagens
    document.getElementById("novo-imagem").value = produto.imagem || "";
    document.getElementById("novo-file-imagem").value = ""; 

    document.getElementById("modal-novo-produto").style.display = "flex";
}

// === MOSTRAR/ESCONDER CAMPO DE NOVA CATEGORIA ===
function verificarNovaCategoria() {
    const select = document.getElementById("novo-categoria");
    const inputTexto = document.getElementById("nova-categoria-texto");
    
    if (select.value === "nova_cat") {
        inputTexto.style.display = "block";
        inputTexto.focus();
    } else {
        // Se ele desistir e voltar o select pra Artesanal, a gente apaga o texto intruso
        inputTexto.style.display = "none";
        inputTexto.value = ""; 
    }
}

// === SALVAR (CRIA OU ATUALIZA) ===
async function salvarNovoProduto() {
    const nome = document.getElementById("novo-nome").value;
    const descricao = document.getElementById("novo-descricao").value;
    const preco = parseFloat(document.getElementById("novo-preco").value);
    
    // --- LÓGICA BLINDADA DA CATEGORIA ---
    let categoria = document.getElementById("novo-categoria").value;
    const inputNovaCat = document.getElementById("nova-categoria-texto");
    
    // Se a caixinha de texto estiver aparecendo e com algo escrito, ela MANDA na regra!
    if (categoria === "nova_cat" || (inputNovaCat && inputNovaCat.style.display !== "none" && inputNovaCat.value.trim() !== "")) {
        categoria = inputNovaCat.value.trim();
        
        if (categoria === "") {
            alert("Por favor, digite o nome da nova categoria!");
            inputNovaCat.focus();
            return;
        }
    }
    // ------------------------------------
    
    if(!nome || isNaN(preco)) {
        alert("Preencha ao menos o Nome e um Preço válido!");
        return;
    }

    // Pega o botão para mostrar que está carregando
    const btnSalvar = document.querySelector(".btn-novo") || document.getElementById("btn-salvar-produto");
    const textoOriginal = btnSalvar ? btnSalvar.innerHTML : "Salvar";
    if(btnSalvar) {
        btnSalvar.innerHTML = "⏳ Salvando...";
        btnSalvar.disabled = true;
    }

    // Lida com a imagem
    let urlDaImagem = document.getElementById("novo-imagem").value; 
    const inputArquivo = document.getElementById("novo-file-imagem");

    try {
        if (inputArquivo && inputArquivo.files.length > 0) {
            const arquivo = inputArquivo.files[0];
            const nomeUnico = `${lojaAtual.subdominio}/produto-${Date.now()}-${arquivo.name.replace(/\s+/g, '-')}`;

            const resUpload = await fetch(`${SUPABASE_URL}/storage/v1/object/imagens/${nomeUnico}`, {
                method: 'POST',
                headers: headersAutenticados(arquivo.type),
                body: arquivo
            });

            if (!resUpload.ok) throw new Error("Falha ao subir a imagem do lanche.");
            urlDaImagem = `${SUPABASE_URL}/storage/v1/object/public/imagens/${nomeUnico}`;
        }

        const ordem = parseInt(document.getElementById("novo-ordem").value, 10) || 0;
        const payload = { nome, descricao, preco, categoria, ordem, imagem: urlDaImagem, loja_id: lojaAtual.id };
        
        let url = `${SUPABASE_URL}/rest/v1/produtos`;
        let metodo = 'POST'; 

        if (produtoEdicaoId !== null) {
            url = `${url}?id=eq.${produtoEdicaoId}`;
            metodo = 'PATCH'; 
        }

        const res = await fetch(url, {
            method: metodo,
            headers: headersAutenticados('application/json'),
            body: JSON.stringify(payload)
        });

        if(!res.ok) throw new Error("Erro do Supabase ao salvar.");
        
        // Limpa a tela para a próxima
        if(inputArquivo) inputArquivo.value = "";
        if(inputNovaCat) {
            inputNovaCat.value = "";
            inputNovaCat.style.display = "none";
        }
        
        fecharModalAdmin();
        carregarProdutos(); 
        
    } catch(erro) {
        alert("Erro ao salvar produto. Verifique o console.");
        console.error(erro);
    } finally {
        if(btnSalvar) {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    }
}
// === FECHAR MODAL DO LANCHE ===
function fecharModalAdmin() { 
    document.getElementById("modal-novo-produto").style.display = "none"; 
}

// === EXCLUIR PRODUTO (COM PROTEÇÃO DE DADOS) ===
async function excluirProduto(id) {
    if(!confirm("⚠️ Tem certeza que deseja excluir este produto do cardápio?")) return;
    
    try {
        // Passo 1: Excluir a receita amarrada ao lanche primeiro (para não dar erro de Chave Estrangeira)
        await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?produto_id=eq.${id}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });

        // Passo 2: Deletar o Produto
        const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${id}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });

        if(!res.ok) {
            const erroDb = await res.json();
            // Trava de segurança crucial para sistemas estruturados:
            if(erroDb.code === "23503") {
                alert("❌ ERRO: Este lanche já possui um histórico de vendas (está amarrado a pedidos antigos). Para não corromper o banco de dados, você não pode excluí-lo. O correto é apenas clicar em PAUSAR.");
                return;
            }
            throw new Error(erroDb.message);
        }
        
        carregarProdutos();
    } catch(erro) {
        alert("Erro ao tentar excluir produto.");
        console.error(erro);
    }
}
// ==========================================
// MÓDULO 2: CONTROLE DE ESTOQUE E INGREDIENTES
// ==========================================
let ingredienteEdicaoId = null; // Memória para saber se estamos editando um ingrediente

async function carregarEstoque() {
    if (!(await garantirSessaoOuRelogar())) return;
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?select=*&loja_id=eq.${lojaAtual.id}&order=id.asc`, {
            method: 'GET',
            headers: headersAutenticados()
        });
        const dados = await resposta.json();
        listaDeIngredientesGlobal = dados; 
        renderizarTabelaEstoque(dados);
    } catch (erro) { console.error(erro); }
}

function renderizarTabelaEstoque(ingredientes) {
    const tbody = document.getElementById("tabela-estoque");
    if(!tbody) return;
    tbody.innerHTML = "";
    ingredientes.forEach(ing => {
        let classeAlerta = ing.estoque <= 10 ? "estoque-baixo" : "";
        tbody.innerHTML += `
            <tr>
                <td>#${ing.id}</td>
                <td>
                    <strong>${escaparHtml(ing.nome)}</strong><br>
                    <small style="color:#aaa;">Extra: R$ ${Number(ing.preco_adicional).toFixed(2).replace('.', ',')}</small>
                </td>
                <td>${ing.unidade}</td>
                <td class="${classeAlerta}">${ing.estoque}</td>
                <td>
                    <button class="btn-acao btn-toggle" onclick="ajustarSaldo(${ing.id}, '${ing.nome}', ${ing.estoque})">
                        🔄 Saldo
                    </button>
                    <button class="btn-acao" style="background-color: #3498db; color: white; margin-left: 5px;" onclick="editarIngrediente(${ing.id})">
                        ✏️ Editar
                    </button>
                    <button class="btn-acao btn-excluir" style="margin-left: 5px;" onclick="excluirIngrediente(${ing.id})">
                        🗑️ Excluir
                    </button>
                </td>
            </tr>
        `;
    });
}

// === SALDO RÁPIDO (MANTIDO DO ORIGINAL) ===
async function ajustarSaldo(id, nome, saldoAtual) {
    const novoValorTexto = prompt(`Atualizar saldo de: ${nome}\nSaldo atual: ${saldoAtual}\n\nDigite o NOVO SALDO TOTAL:`, saldoAtual);
    if (novoValorTexto === null || novoValorTexto === "") return;
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?id=eq.${id}`, {
            method: 'PATCH',
            headers: headersAutenticados('application/json'),
            body: JSON.stringify({ estoque: parseFloat(novoValorTexto) })
        });
        carregarEstoque();
    } catch (erro) { console.error(erro); }
}

// === ABRIR MODAL VAZIO (NOVO INGREDIENTE) ===
function abrirModalIngrediente() {
    ingredienteEdicaoId = null;
    document.getElementById("titulo-modal-ingrediente").innerText = "Cadastrar Matéria-Prima";
    document.getElementById("ingred-nome").value = "";
    document.getElementById("ingred-unidade").value = "unidade";
    document.getElementById("ingred-estoque").value = "";
    document.getElementById("ingred-preco-add").value = "0.00";
    document.getElementById("modal-novo-ingrediente").style.display = "flex";
}

function fecharModalIngrediente() {
    document.getElementById("modal-novo-ingrediente").style.display = "none";
}

// === ABRIR MODAL PREENCHIDO (EDITAR INGREDIENTE) ===
function editarIngrediente(id) {
    const ingrediente = listaDeIngredientesGlobal.find(i => i.id === id);
    if(!ingrediente) return;

    ingredienteEdicaoId = id;
    document.getElementById("titulo-modal-ingrediente").innerText = "✏️ Editar Matéria-Prima";
    document.getElementById("ingred-nome").value = ingrediente.nome || "";
    document.getElementById("ingred-unidade").value = ingrediente.unidade || "unidade";
    document.getElementById("ingred-estoque").value = ingrediente.estoque || 0;
    document.getElementById("ingred-preco-add").value = ingrediente.preco_adicional || 0;

    document.getElementById("modal-novo-ingrediente").style.display = "flex";
}

// === SALVAR (CRIA OU ATUALIZA) ===
async function salvarNovoIngrediente() {
    const nome = document.getElementById("ingred-nome").value;
    const unidade = document.getElementById("ingred-unidade").value;
    const estoque = parseFloat(document.getElementById("ingred-estoque").value);
    const preco_adicional = parseFloat(document.getElementById("ingred-preco-add").value);

    if(!nome || isNaN(estoque)) {
        alert("Preencha o Nome e o Estoque Inicial!");
        return;
    }

    const payload = { nome, unidade, estoque, preco_adicional, loja_id: lojaAtual.id };
    let url = `${SUPABASE_URL}/rest/v1/ingredientes`;
    let metodo = 'POST';

    if (ingredienteEdicaoId !== null) {
        url = `${url}?id=eq.${ingredienteEdicaoId}`;
        metodo = 'PATCH';
    }

    try {
        const res = await fetch(url, {
            method: metodo,
            headers: headersAutenticados('application/json'),
            body: JSON.stringify(payload)
        });

        if(!res.ok) throw new Error("Erro do Supabase ao salvar ingrediente.");
        
        fecharModalIngrediente();
        carregarEstoque(); 
    } catch(erro) {
        alert("Erro ao salvar matéria-prima. Verifique o console.");
        console.error(erro);
    }
}

// === EXCLUIR INGREDIENTE (COM PROTEÇÃO) ===
async function excluirIngrediente(id) {
    if(!confirm("⚠️ Tem certeza que deseja excluir esta matéria-prima?")) return;
    
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?id=eq.${id}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });

        if(!res.ok) {
            const erroDb = await res.json();
            if(erroDb.code === "23503") {
                alert("❌ ERRO: Este ingrediente está sendo usado na Ficha Técnica de algum lanche ou em um pedido antigo! Remova ele das receitas antes de tentar excluir, ou apenas zere o estoque usando o botão Saldo.");
                return;
            }
            throw new Error(erroDb.message);
        }
        
        carregarEstoque();
    } catch(erro) {
        alert("Erro ao tentar excluir matéria-prima.");
        console.error(erro);
    }
}
// ==========================================
// MÓDULO 3: GESTÃO DE FICHAS TÉCNICAS
// ==========================================
async function abrirModalReceita(produtoId, produtoNome) {
    produtoAtualParaReceita = produtoId;
    document.getElementById("titulo-modal-receita").innerText = `Ficha Técnica: ${produtoNome}`;
    document.getElementById("modal-receita").style.display = "flex";

    const select = document.getElementById("select-ingrediente");
    select.innerHTML = '<option value="">Escolha a matéria-prima...</option>';
    
    listaDeIngredientesGlobal.forEach(ing => {
        select.innerHTML += `<option value="${ing.id}" data-unidade="${ing.unidade}">${ing.nome}</option>`;
    });

    select.onchange = function() {
        const opcaoSelecionada = select.options[select.selectedIndex];
        document.getElementById("label-unidade").innerText = opcaoSelecionada ? opcaoSelecionada.getAttribute('data-unidade') : "";
    };

    buscarIngredientesDesteLanche(produtoId);
}

function fecharModalReceita() {
    document.getElementById("modal-receita").style.display = "none";
}

async function buscarIngredientesDesteLanche(produtoId) {
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?produto_id=eq.${produtoId}&loja_id=eq.${lojaAtual.id}`, {
            method: 'GET',
            headers: headersAutenticados()
        });
        const receitaDoBanco = await resposta.json();
        
        const tbody = document.getElementById("tabela-receita");
        tbody.innerHTML = "";

        if(receitaDoBanco.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: #888;">Nenhum ingrediente cadastrado neste lanche ainda.</td></tr>';
            return;
        }

        receitaDoBanco.forEach(itemDaReceita => {
            const detalhesDoIngrediente = listaDeIngredientesGlobal.find(i => i.id === itemDaReceita.ingrediente_id);
            const nome = detalhesDoIngrediente ? detalhesDoIngrediente.nome : "Ingrediente Excluído";
            const unidade = detalhesDoIngrediente ? detalhesDoIngrediente.unidade : "";

            tbody.innerHTML += `
                <tr>
                    <td><strong>${escaparHtml(nome)}</strong></td>
                    <td>${itemDaReceita.quantidade} ${escaparHtml(unidade)}</td>
                    <td>
                        <button class="btn-acao btn-excluir" onclick="removerDaReceita(${itemDaReceita.id})">Remover</button>
                    </td>
                </tr>
            `;
        });
    } catch (erro) { console.error("Erro ao buscar receita:", erro); }
}

async function salvarIngredienteNaReceita() {
    const ingredienteId = document.getElementById("select-ingrediente").value;
    const quantidade = document.getElementById("input-qtd-ingrediente").value;

    if(ingredienteId === "" || quantidade === "") {
        alert("Por favor, selecione um ingrediente e digite a quantidade!");
        return;
    }

    const btn = document.querySelector(".box-add-ingrediente .btn-novo");
    const textoOriginal = btn.innerText;
    btn.innerText = "Salvando...";

    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/receita_produto`, {
            method: 'POST',
            headers: { ...headersAutenticados('application/json'), 'Prefer': 'return=representation' },
            body: JSON.stringify({
                produto_id: produtoAtualParaReceita,
                ingrediente_id: parseInt(ingredienteId),
                quantidade: parseFloat(quantidade),
                loja_id: lojaAtual.id
            })
        });

        if (!resposta.ok) {
            const erroBanco = await resposta.json();
            alert(`🚨 Erro do Banco de Dados: ${erroBanco.message || erroBanco.error}`);
            btn.innerText = textoOriginal;
            return;
        }

        document.getElementById("select-ingrediente").value = "";
        document.getElementById("input-qtd-ingrediente").value = "";
        document.getElementById("label-unidade").innerText = "";

        buscarIngredientesDesteLanche(produtoAtualParaReceita);
        btn.innerText = textoOriginal;

    } catch (erro) { 
        alert("🚨 Erro de conexão. Verifique o console F12.");
        btn.innerText = textoOriginal;
    }
}

async function removerDaReceita(idDaReceita) {
    if(!confirm("Remover este item da ficha técnica do lanche?")) return;
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?id=eq.${idDaReceita}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });
        buscarIngredientesDesteLanche(produtoAtualParaReceita);
    } catch (erro) { console.error("Erro ao remover:", erro); }
}


// ==========================================
// MÓDULO 4: GESTÃO DE PEDIDOS (KANBAN)
// ==========================================
async function carregarPedidosAdmin() {
    if (!(await garantirSessaoOuRelogar())) return;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=*&loja_id=eq.${lojaAtual.id}&order=id.asc`, {
            method: 'GET',
            headers: headersAutenticados()
        });

        if (!res.ok) {
            const erroSupabase = await res.json();
            document.getElementById("col-pendentes").innerHTML = `<p style="color:#ff4757; text-align:center; margin-top:20px;"><b>Erro do Banco:</b> ${erroSupabase.message}</p>`;
            return;
        }

        const pedidos = await res.json();
        await processarPedidosNovos(pedidos);
        renderizarKanban(pedidos);
        renderizarKpisPedidos(pedidos);
    } catch (erro) {
        document.getElementById("col-pendentes").innerHTML = `<p style="color:#ff4757; text-align:center; margin-top:20px;"><b>Erro no Script:</b> ${erro.message}</p>`;
    }
}

// null = ainda não sabemos quais pedidos pendentes já existiam antes de a
// página carregar; evita disparar som/impressão de tudo de uma vez ao abrir o painel.
let idsPedidosVistosAutoImpressao = null;

async function processarPedidosNovos(pedidos) {
    const idsPendentesAtuais = pedidos
        .filter(p => String(p.status || 'Pendente').trim().toLowerCase() === 'pendente')
        .map(p => p.id);

    if (idsPedidosVistosAutoImpressao === null) {
        idsPedidosVistosAutoImpressao = new Set(idsPendentesAtuais);
        return;
    }

    const idsNovos = idsPendentesAtuais.filter(id => !idsPedidosVistosAutoImpressao.has(id));
    if (idsNovos.length === 0) return;

    idsNovos.forEach(id => idsPedidosVistosAutoImpressao.add(id));

    // Alerta sonoro toca sempre que chega pedido novo, independente da
    // impressão automática estar ligada ou não.
    tocarSomNovoPedido();

    const toggleImpressao = document.getElementById("admin-impressao-automatica");
    if (toggleImpressao && toggleImpressao.checked) {
        for (const id of idsNovos) {
            await atualizarStatusPedido(id, 'Em Preparo');
            await imprimirPedido(id);
        }
    }
}

// Mesmo som usado no site do cliente quando o pedido sai para entrega.
function tocarSomNovoPedido() {
    const som = document.getElementById("som-novo-pedido");
    if (!som) return;
    som.volume = 1;
    som.currentTime = 0;
    som.play().catch(erro => console.log("Navegador bloqueou o áudio automático:", erro));
}

function renderizarKanban(pedidos) {
    const colPendentes = document.getElementById("col-pendentes");
    const colPreparo = document.getElementById("col-preparo");
    const colEntrega = document.getElementById("col-entrega");

    if (!colPendentes || !colPreparo || !colEntrega) return;

    if (!pedidos || pedidos.length === 0) {
        colPendentes.innerHTML = "<p style='text-align: center; color: #fff; font-weight: bold; margin-top: 20px;'>Nenhum pedido na fila.</p>";
        colPreparo.innerHTML = "";
        colEntrega.innerHTML = "";
        return;
    }

    let htmlPendentes = "";
    let htmlPreparo = "";
    let htmlEntrega = "";

    pedidos.forEach(ped => {
        if (ped.status === "Entregue") return;

        let statusBanco = ped.status ? String(ped.status).trim().toLowerCase() : "pendente";
        let statusFormatado = "Pendente"; 
        
        if (statusBanco === 'em preparo') statusFormatado = "Em Preparo";
        else if (statusBanco === 'saiu para entrega') statusFormatado = "Saiu para Entrega";

        const dataFormatada = ped.created_at
            ? formatarDataHoraBr(ped.created_at, { hour: '2-digit', minute: '2-digit' })
            : "--:--";

        const totalNum = parseFloat(ped.total) || 0;

        let obsHtml = "";
        if (ped.observacoes && String(ped.observacoes).trim() !== "") {
            obsHtml = `<div style="background: #332a00; color: #ffc107; padding: 8px 10px; border-radius: 6px; margin-top: 8px; font-size: 13px; white-space: pre-line;"><i class="fa-solid fa-pen"></i> ${escaparHtml(ped.observacoes)}</div>`;
        }

        // encodeURIComponent já escapa tudo com segurança pra ir dentro do href,
        // então é seguro mesmo o endereço sendo texto livre digitado pelo cliente.
        let linkMapsHtml = "";
        if (ped.tipo_entrega !== 'retirada' && ped.endereco_entrega) {
            const urlMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoParaMaps(ped.endereco_entrega))}`;
            linkMapsHtml = `<a class="btn-imprimir-pedido" style="display:block; text-align:center; text-decoration:none; box-sizing:border-box;" href="${urlMaps}" target="_blank" rel="noopener"><i class="fa-solid fa-location-dot"></i> Abrir no Maps</a>`;
        }

        const cardHtml = `
            <div class="card-pedido ${statusFormatado.toLowerCase().replace(/ /g, '-')}">
                <div class="card-header">
                    <span class="pedido-id">#${ped.numero_pedido || ped.id}</span>
                    <span class="pedido-tempo"><i class="fa-regular fa-clock"></i> ${dataFormatada}</span>
                </div>
                <div class="info-cliente">
                    <strong>${escaparHtml(ped.nome_cliente) || 'Cliente não informado'}</strong><br>
                    ${ped.tipo_entrega === 'retirada'
                        ? '<i class="fa-solid fa-store"></i> Retirada na loja<br>'
                        : (ped.endereco_entrega ? `<i class="fa-solid fa-location-dot"></i> ${escaparHtml(ped.endereco_entrega)}<br>` : '')}
                    Pgto: ${escaparHtml(ped.forma_pagamento) || '-'}<br>
                    ${ped.entregador_id ? `<i class="fa-solid fa-motorcycle"></i> ${escaparHtml(nomeEntregadorPorId(ped.entregador_id))}<br>` : ''}
                    <span style="color: #2ed573; font-weight: bold;">R$ ${totalNum.toFixed(2).replace('.', ',')}</span>
                </div>
                ${obsHtml}
                ${botoesAcaoKanban(ped.id, statusFormatado)}
                ${linkMapsHtml}
                <button class="btn-imprimir-pedido" onclick="imprimirPedido(${ped.id})"><i class="fa-solid fa-print"></i> Imprimir cupom</button>
            </div>
        `;

        if (statusFormatado === "Pendente") htmlPendentes += cardHtml;
        else if (statusFormatado === "Em Preparo") htmlPreparo += cardHtml;
        else if (statusFormatado === "Saiu para Entrega") htmlEntrega += cardHtml;
    });

    colPendentes.innerHTML = htmlPendentes || "<p style='text-align:center; color:#555; margin-top:20px;'>Vazio</p>";
    colPreparo.innerHTML = htmlPreparo || "<p style='text-align:center; color:#555; margin-top:20px;'>Vazio</p>";
    colEntrega.innerHTML = htmlEntrega || "<p style='text-align:center; color:#555; margin-top:20px;'>Vazio</p>";
}

// KPIs no topo da Gestão de Pedidos: pra bater o olho e já entender o
// movimento do dia, tipo um painel de TV.
function renderizarKpisPedidos(pedidos) {
    const hoje = hojeBrString();
    const dataEhHoje = (valor) => {
        if (!valor) return false;
        const d = partesDataBr(valor);
        return `${d.ano}-${d.mes}-${d.dia}` === hoje;
    };
    const statusLimpo = (p) => String(p.status || 'Pendente').trim().toLowerCase();

    const pedidosHoje = pedidos.filter(p => dataEhHoje(p.data_pedido));
    const entreguesHoje = pedidosHoje.filter(p => statusLimpo(p) === 'entregue');

    const elPedidosHoje = document.getElementById("kpi-pedidos-hoje");
    if (!elPedidosHoje) return; // usuário pode estar em outra aba sem esses elementos

    elPedidosHoje.innerText = pedidosHoje.length;
    document.getElementById("kpi-pendentes").innerText = pedidos.filter(p => statusLimpo(p) === 'pendente').length;
    document.getElementById("kpi-preparo").innerText = pedidos.filter(p => statusLimpo(p) === 'em preparo').length;
    document.getElementById("kpi-saiu").innerText = pedidos.filter(p => statusLimpo(p) === 'saiu para entrega').length;
    document.getElementById("kpi-entregues-hoje").innerText = entreguesHoje.length;

    const media = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const temposPreparo = pedidosHoje.map(p => minutosEntre(p.data_pedido, p.saiu_em)).filter(v => v !== null);
    const temposEntrega = pedidosHoje.map(p => minutosEntre(p.saiu_em, p.entregue_em)).filter(v => v !== null);
    const temposTotal = pedidosHoje.map(p => minutosEntre(p.data_pedido, p.entregue_em)).filter(v => v !== null);

    document.getElementById("kpi-tempo-preparo").innerText = formatarMinutos(media(temposPreparo));
    document.getElementById("kpi-tempo-entrega").innerText = formatarMinutos(media(temposEntrega));
    document.getElementById("kpi-tempo-total").innerText = formatarMinutos(media(temposTotal));
}

function botoesAcaoKanban(id, status) {
    const inputTempo = document.getElementById("input-tempo-preparo");
    const tempoFila = inputTempo ? inputTempo.value : "40";

    if (status === "Pendente") {
        return `<button class="btn-acao-kanban btn-aceitar" onclick="atualizarStatusPedido(${id}, 'Em Preparo', this)"><i class="fa-solid fa-fire"></i> Aceitar (~${tempoFila}m)</button>`;
    } else if (status === "Em Preparo") {
        return `<button class="btn-acao-kanban btn-despachar" onclick="atualizarStatusPedido(${id}, 'Saiu para Entrega', this)"><i class="fa-solid fa-motorcycle"></i> Despachar Moto</button>`;
    } else if (status === "Saiu para Entrega") {
        return `<button class="btn-acao-kanban btn-entregue" onclick="atualizarStatusPedido(${id}, 'Entregue', this)"><i class="fa-solid fa-check-double"></i> Concluir Pedido</button>`;
    }
    return "";
}

async function atualizarStatusPedido(id, novoStatus, botao) {
    if (botao) { botao.disabled = true; botao.classList.add("carregando"); }

    let previsao = null;

    if (novoStatus === 'Em Preparo') {
        const inputTempo = document.getElementById("input-tempo-preparo");
        const tempoFila = inputTempo ? inputTempo.value : "40";
        previsao = tempoFila + " min";
    }

    const corpo = { status: novoStatus };
    if (previsao) corpo.previsao_entrega = previsao;
    // Quando o admin move o pedido direto pelo Kanban (sem passar pelo app do
    // entregador), esses timestamps também precisam ser gravados — senão fica
    // sem registro de quando saiu/chegou pra calcular tempo de entrega depois.
    if (novoStatus === 'Saiu para Entrega') corpo.saiu_em = new Date().toISOString();
    if (novoStatus === 'Entregue') corpo.entregue_em = new Date().toISOString();

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...headersAutenticados('application/json'), 'Prefer': 'return=representation' },
            body: JSON.stringify(corpo)
        });
        
        carregarPedidosAdmin();
    } catch (erro) {
        alert("Erro ao atualizar status do pedido.");
        if (botao) { botao.disabled = false; botao.classList.remove("carregando"); }
    }
}

// ==========================================
// MÓDULO 9: IMPRESSÃO DE CUPOM
// ==========================================
async function imprimirPedido(pedidoId) {
    if (!(await garantirSessaoOuRelogar())) return;

    try {
        const resPedido = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?select=*&id=eq.${pedidoId}&loja_id=eq.${lojaAtual.id}`,
            { headers: headersAutenticados() }
        );
        const pedidos = await resPedido.json();
        if (!pedidos || pedidos.length === 0) return;
        const pedido = pedidos[0];

        const resItens = await fetch(
            `${SUPABASE_URL}/rest/v1/itens_pedido?select=id,produto_id,quantidade,preco_unitario,observacao&pedido_id=eq.${pedidoId}&loja_id=eq.${lojaAtual.id}`,
            { headers: headersAutenticados() }
        );
        const itens = await resItens.json();

        const idsProdutos = [...new Set(itens.map(i => i.produto_id))];
        const nomeProdutoPorId = {};
        if (idsProdutos.length > 0) {
            const resProdutos = await fetch(
                `${SUPABASE_URL}/rest/v1/produtos?select=id,nome&id=in.(${idsProdutos.join(',')})`,
                { headers: headersAutenticados() }
            );
            (await resProdutos.json()).forEach(p => { nomeProdutoPorId[p.id] = p.nome; });
        }

        const idsItens = itens.map(i => i.id);
        const adicionaisPorItem = {};
        if (idsItens.length > 0) {
            const resAdd = await fetch(
                `${SUPABASE_URL}/rest/v1/itens_pedido_adicionais?select=item_pedido_id,ingrediente_id,quantidade,preco_unitario&item_pedido_id=in.(${idsItens.join(',')})`,
                { headers: headersAutenticados() }
            );
            const adicionais = await resAdd.json();
            const idsIngred = [...new Set(adicionais.map(a => a.ingrediente_id))];
            const nomeIngredPorId = {};
            if (idsIngred.length > 0) {
                const resIngred = await fetch(
                    `${SUPABASE_URL}/rest/v1/ingredientes?select=id,nome&id=in.(${idsIngred.join(',')})`,
                    { headers: headersAutenticados() }
                );
                (await resIngred.json()).forEach(i => { nomeIngredPorId[i.id] = i.nome; });
            }
            adicionais.forEach(a => {
                if (!adicionaisPorItem[a.item_pedido_id]) adicionaisPorItem[a.item_pedido_id] = [];
                adicionaisPorItem[a.item_pedido_id].push({
                    nome: nomeIngredPorId[a.ingrediente_id] || 'Adicional',
                    quantidade: a.quantidade,
                    preco: a.preco_unitario
                });
            });
        }

        montarCupomImpressao(pedido, itens, nomeProdutoPorId, adicionaisPorItem);
        setTimeout(() => window.print(), 150);
    } catch (erro) {
        console.error("Erro ao preparar impressão:", erro);
        alert("Erro ao preparar a impressão do pedido.");
    }
}

function montarCupomImpressao(pedido, itens, nomeProdutoPorId, adicionaisPorItem) {
    const area = document.getElementById("area-impressao");
    if (!area) return;

    const dataFormatada = pedido.data_pedido ? formatarDataHoraBr(pedido.data_pedido) : '';
    const nomeLoja = (lojaAtual && lojaAtual.nome) || "Pedido";
    const tipoEntregaTexto = pedido.tipo_entrega === 'retirada' ? 'RETIRADA NA LOJA' : 'ENTREGA';
    const valorEntrega = Number(pedido.valor_entrega) || 0;

    let itensHtml = "";
    itens.forEach(item => {
        const nomeProd = nomeProdutoPorId[item.produto_id] || `Produto #${item.produto_id}`;
        itensHtml += `<div class="cupom-linha"><span class="cupom-item-nome">1x ${escaparHtml(nomeProd)}</span><span>R$ ${Number(item.preco_unitario).toFixed(2).replace('.', ',')}</span></div>`;
        (adicionaisPorItem[item.id] || []).forEach(add => {
            itensHtml += `<div class="cupom-add"><div class="cupom-linha" style="margin-bottom:0;"><span>+ ${add.quantidade}x ${escaparHtml(add.nome)}</span><span>R$ ${(Number(add.preco) * Number(add.quantidade)).toFixed(2).replace('.', ',')}</span></div></div>`;
        });
        if (item.observacao) {
            itensHtml += `<div class="cupom-obs">Obs: ${escaparHtml(item.observacao)}</div>`;
        }
    });

    area.innerHTML = `
        <div class="cupom-loja">${escaparHtml(nomeLoja)}</div>
        <div class="cupom-sub">Pedido #${pedido.numero_pedido || pedido.id}</div>
        <div class="cupom-sub">${dataFormatada}</div>
        <div class="cupom-sep"></div>

        <div class="cupom-secao-titulo">${tipoEntregaTexto}</div>
        <div class="cupom-linha"><span>Cliente</span><span>${escaparHtml(pedido.nome_cliente || '-')}</span></div>
        ${pedido.telefone_cliente ? `<div class="cupom-linha"><span>Telefone</span><span>${escaparHtml(pedido.telefone_cliente)}</span></div>` : ''}
        ${pedido.endereco_entrega ? `<div class="cupom-obs" style="margin-top: 1mm;">${escaparHtml(pedido.endereco_entrega)}</div>` : ''}
        <div class="cupom-sep"></div>

        <div class="cupom-secao-titulo">Itens do Pedido</div>
        ${itensHtml}
        <div class="cupom-sep"></div>

        ${valorEntrega > 0 ? `<div class="cupom-linha"><span>Taxa de entrega</span><span>R$ ${valorEntrega.toFixed(2).replace('.', ',')}</span></div>` : ''}
        ${Number(pedido.valor_desconto) > 0 ? `<div class="cupom-linha"><span>Cupom ${escaparHtml(pedido.cupom_codigo || '')}</span><span>-R$ ${Number(pedido.valor_desconto).toFixed(2).replace('.', ',')}</span></div>` : ''}
        <div class="cupom-linha grande"><span>TOTAL</span><span>R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}</span></div>
        <div class="cupom-sep"></div>

        <div class="cupom-linha"><span>Pagamento</span><span>${escaparHtml(pedido.forma_pagamento || '-')}</span></div>
        ${pedido.observacoes ? `<div class="cupom-sep"></div><div class="cupom-secao-titulo">Observações</div><div class="cupom-obs">${escaparHtml(pedido.observacoes).replace(/\n/g, '<br>')}</div>` : ''}

        <div class="cupom-sep"></div>
        <div class="cupom-footer">Obrigado pela preferência! 🔥</div>
    `;
}

// ==========================================
// MÓDULO 9: MEUS CLIENTES
// ==========================================
let clientesCache = [];

async function carregarClientes() {
    if (!(await garantirSessaoOuRelogar())) return;
    const tbody = document.getElementById("tabela-clientes");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';

    try {
        const [resPedidos, resClientes] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=nome_cliente,telefone_cliente,cliente_id,total&loja_id=eq.${lojaAtual.id}&order=id.asc`, { headers: headersAutenticados() }),
            fetch(`${SUPABASE_URL}/rest/v1/clientes?select=cliente_id,nome,telefone,email&loja_id=eq.${lojaAtual.id}`, { headers: headersAutenticados() })
        ]);
        const pedidos = await resPedidos.json();
        const cadastrados = resClientes.ok ? await resClientes.json() : [];

        const porCliente = {};

        // Primeiro quem só cadastrou o perfil (ou logou com Google) sem nunca
        // pedir — "possível cliente". É daqui que sai o e-mail, quando tem.
        cadastrados.forEach(c => {
            if (!c.cliente_id) return;
            porCliente[c.cliente_id] = { nome: c.nome || "Cliente", telefone: c.telefone || "-", email: c.email || "-", qtd: 0, total: 0 };
        });

        // Depois os pedidos de verdade, que têm prioridade sobre o cadastro do perfil
        // pro nome/telefone (mas não mexem no e-mail, que só vem do cadastro).
        pedidos.forEach(p => {
            const chave = p.cliente_id || p.telefone_cliente || p.nome_cliente;
            if (!chave) return;
            if (!porCliente[chave]) porCliente[chave] = { nome: p.nome_cliente || "Cliente", telefone: p.telefone_cliente || "-", email: "-", qtd: 0, total: 0 };
            porCliente[chave].qtd++;
            porCliente[chave].total += Number(p.total) || 0;
            // Fica sempre com o nome/telefone do pedido mais recente (a busca já vem ordenada por id).
            if (p.nome_cliente) porCliente[chave].nome = p.nome_cliente;
            if (p.telefone_cliente) porCliente[chave].telefone = p.telefone_cliente;
        });

        clientesCache = Object.values(porCliente).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        const elTotal = document.getElementById("clientes-total-qtd");
        if (elTotal) elTotal.innerText = clientesCache.length;

        const buscaEl = document.getElementById("clientes-busca");
        if (buscaEl) buscaEl.value = "";

        renderizarTabelaClientes(clientesCache);
    } catch (erro) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--vermelho);">Erro ao carregar clientes.</td></tr>';
        console.error(erro);
    }
}

function renderizarTabelaClientes(clientes) {
    const tbody = document.getElementById("tabela-clientes");
    if (!tbody) return;

    if (clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum cliente encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = clientes.map(c => {
        const statusHtml = c.qtd > 0
            ? `<span class="status-badge status-ativo">Cliente</span>`
            : `<span class="status-badge" style="background: var(--laranja-suave); color: var(--laranja-fogo);">Possível cliente</span>`;
        return `
        <tr>
            <td>${escaparHtml(c.nome)}</td>
            <td>${escaparHtml(c.telefone)}</td>
            <td>${escaparHtml(c.email)}</td>
            <td>${statusHtml}</td>
            <td>${c.qtd}</td>
            <td>R$ ${c.total.toFixed(2).replace('.', ',')}</td>
        </tr>
    `;
    }).join('');
}

function filtrarTabelaClientes() {
    const termo = document.getElementById("clientes-busca").value.trim().toLowerCase();
    if (!termo) { renderizarTabelaClientes(clientesCache); return; }

    const filtrados = clientesCache.filter(c =>
        c.nome.toLowerCase().includes(termo)
        || String(c.telefone).toLowerCase().includes(termo)
        || String(c.email).toLowerCase().includes(termo)
    );
    renderizarTabelaClientes(filtrados);
}

// ==========================================
// MÓDULO 9.5: CUPONS DE DESCONTO
// ==========================================
let listaCuponsGlobal = [];

async function carregarCupons() {
    if (!(await garantirSessaoOuRelogar())) return;
    const tbody = document.getElementById("tabela-cupons");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/cupons?select=*&loja_id=eq.${lojaAtual.id}&order=criado_em.desc`, {
            headers: headersAutenticados()
        });
        listaCuponsGlobal = await res.json();
        renderizarTabelaCupons(listaCuponsGlobal);
    } catch (erro) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--vermelho);">Erro ao carregar cupons.</td></tr>';
        console.error(erro);
    }
}

function renderizarTabelaCupons(cupons) {
    const tbody = document.getElementById("tabela-cupons");
    if (!tbody) return;

    if (cupons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum cupom cadastrado ainda.</td></tr>';
        return;
    }

    tbody.innerHTML = cupons.map(c => {
        let descontoTexto = c.tipo_desconto === 'percentual'
            ? `${Number(c.valor_desconto)}%`
            : `R$ ${Number(c.valor_desconto).toFixed(2).replace('.', ',')}`;
        if (c.valor_minimo_pedido) {
            descontoTexto += `<div style="font-size:11px; color: var(--texto-claro); font-weight:400;">a partir de R$ ${Number(c.valor_minimo_pedido).toFixed(2).replace('.', ',')}</div>`;
        }
        const tetoTexto = c.desconto_maximo_por_pedido
            ? `R$ ${Number(c.desconto_maximo_por_pedido).toFixed(2).replace('.', ',')}`
            : '—';
        const usosTexto = c.limite_usos ? `${c.usos_atuais} / ${c.limite_usos}` : `${c.usos_atuais} / ilimitado`;
        const valorDescontadoTexto = c.limite_valor_total_desconto
            ? `R$ ${Number(c.valor_total_descontado).toFixed(2).replace('.', ',')} / R$ ${Number(c.limite_valor_total_desconto).toFixed(2).replace('.', ',')}`
            : `R$ ${Number(c.valor_total_descontado).toFixed(2).replace('.', ',')}`;

        const esgotado = (c.limite_usos && c.usos_atuais >= c.limite_usos) || (c.limite_valor_total_desconto && c.valor_total_descontado >= c.limite_valor_total_desconto);
        let statusHtml;
        if (!c.ativo) statusHtml = `<span class="status-badge status-inativo">Inativo</span>`;
        else if (esgotado) statusHtml = `<span class="status-badge status-inativo">Esgotado</span>`;
        else statusHtml = `<span class="status-badge status-ativo">Ativo</span>`;

        const botaoTexto = c.ativo ? "Desativar" : "Ativar";
        const selosHtml = `
            ${c.limite_por_cliente ? `<span title="Limitado a 1 uso por cliente" style="font-size:11px; color: var(--texto-suave);"><i class="fa-solid fa-user-check"></i></span>` : ''}
            ${c.publico ? `<span title="Aparece na vitrine de promoções" style="font-size:11px; color: var(--laranja-fogo); margin-left:4px;"><i class="fa-solid fa-store"></i></span>` : ''}
            ${c.maximo_pedidos_anteriores !== null && c.maximo_pedidos_anteriores !== undefined ? `<span title="Só pra cliente com até ${c.maximo_pedidos_anteriores} pedido(s) anterior(es)" style="font-size:11px; color: var(--verde); margin-left:4px;"><i class="fa-solid fa-seedling"></i></span>` : ''}
        `;

        return `
        <tr>
            <td><strong style="font-family: monospace;">${escaparHtml(c.codigo)}</strong> ${selosHtml}</td>
            <td>${descontoTexto}</td>
            <td>${tetoTexto}</td>
            <td>${usosTexto}</td>
            <td>${valorDescontadoTexto}</td>
            <td>${statusHtml}</td>
            <td><button class="btn-acao btn-toggle" onclick="alternarStatusCupom(${c.id}, ${!c.ativo})">${botaoTexto}</button></td>
        </tr>
        `;
    }).join('');
}

async function alternarStatusCupom(id, novoStatus) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/cupons?id=eq.${id}`, {
            method: 'PATCH',
            headers: headersAutenticados('application/json'),
            body: JSON.stringify({ ativo: novoStatus })
        });
        carregarCupons();
    } catch (erro) {
        alert("Erro ao atualizar o cupom.");
    }
}

function abrirModalCupom() {
    document.getElementById("cupom-codigo").value = "";
    document.getElementById("cupom-tipo").value = "percentual";
    document.getElementById("cupom-valor").value = "";
    document.getElementById("cupom-teto-pedido").value = "";
    document.getElementById("cupom-valor-minimo").value = "";
    document.getElementById("cupom-limite-usos").value = "";
    document.getElementById("cupom-limite-valor").value = "";
    document.getElementById("cupom-max-pedidos-anteriores").value = "";
    document.getElementById("cupom-limite-por-cliente").checked = false;
    document.getElementById("cupom-publico").checked = false;
    document.getElementById("cupom-erro").style.display = "none";
    alternarCampoTetoCupom();
    document.getElementById("modal-cupom").style.display = "flex";
}

function fecharModalCupom() {
    document.getElementById("modal-cupom").style.display = "none";
}

function alternarCampoTetoCupom() {
    const tipo = document.getElementById("cupom-tipo").value;
    document.getElementById("rotulo-cupom-valor").innerText = tipo === 'percentual' ? "Valor do Desconto (%)" : "Valor do Desconto (R$)";
    document.getElementById("bloco-teto-cupom").style.display = tipo === 'percentual' ? "block" : "none";
}

async function salvarCupom() {
    const codigo = document.getElementById("cupom-codigo").value.trim().toUpperCase();
    const tipo = document.getElementById("cupom-tipo").value;
    const valor = parseFloat(document.getElementById("cupom-valor").value);
    const tetoPedido = document.getElementById("cupom-teto-pedido").value;
    const limiteUsos = document.getElementById("cupom-limite-usos").value;
    const limiteValor = document.getElementById("cupom-limite-valor").value;
    const valorMinimo = document.getElementById("cupom-valor-minimo").value;
    const maxPedidosAnteriores = document.getElementById("cupom-max-pedidos-anteriores").value;
    const erroEl = document.getElementById("cupom-erro");
    erroEl.style.display = "none";

    if (!codigo || isNaN(valor) || valor <= 0) {
        erroEl.innerText = "Preencha o código e um valor de desconto válido.";
        erroEl.style.display = "block";
        return;
    }
    if (tipo === 'percentual' && valor > 100) {
        erroEl.innerText = "Desconto percentual não pode passar de 100%.";
        erroEl.style.display = "block";
        return;
    }

    const btn = document.getElementById("btn-salvar-cupom");
    const textoOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/cupons`, {
            method: 'POST',
            headers: headersAutenticados('application/json'),
            body: JSON.stringify({
                loja_id: lojaAtual.id,
                codigo,
                tipo_desconto: tipo,
                valor_desconto: valor,
                desconto_maximo_por_pedido: (tipo === 'percentual' && tetoPedido) ? parseFloat(tetoPedido) : null,
                limite_usos: limiteUsos ? parseInt(limiteUsos, 10) : null,
                limite_valor_total_desconto: limiteValor ? parseFloat(limiteValor) : null,
                valor_minimo_pedido: valorMinimo ? parseFloat(valorMinimo) : null,
                maximo_pedidos_anteriores: maxPedidosAnteriores !== "" ? parseInt(maxPedidosAnteriores, 10) : null,
                limite_por_cliente: document.getElementById("cupom-limite-por-cliente").checked,
                publico: document.getElementById("cupom-publico").checked
            })
        });

        if (!res.ok) {
            const erro = await res.json();
            erroEl.innerText = erro.code === '23505' ? "Já existe um cupom com esse código nessa loja." : (erro.message || "Erro ao criar o cupom.");
            erroEl.style.display = "block";
            return;
        }

        fecharModalCupom();
        carregarCupons();
    } catch (erro) {
        erroEl.innerText = "Erro de conexão ao criar o cupom.";
        erroEl.style.display = "block";
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

// ==========================================
// MÓDULO 10: ENTREGADORES (acesso por código, sem conta no Supabase Auth)
// ==========================================
let listaDeEntregadoresGlobal = [];

function nomeEntregadorPorId(entregadorId) {
    const encontrado = listaDeEntregadoresGlobal.find(e => e.id === entregadorId);
    return encontrado ? encontrado.nome : "Entregador";
}

function gerarTokenEntregador() {
    const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I pra evitar confusão na hora de digitar
    const valores = new Uint32Array(8);
    crypto.getRandomValues(valores);
    return Array.from(valores, v => caracteres[v % caracteres.length]).join('');
}

async function carregarEntregadores() {
    if (!(await garantirSessaoOuRelogar())) return;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/entregadores?select=*&loja_id=eq.${lojaAtual.id}&order=nome.asc`, {
            headers: headersAutenticados()
        });
        listaDeEntregadoresGlobal = await res.json();
        renderizarTabelaEntregadores(listaDeEntregadoresGlobal);
    } catch (erro) {
        console.error("Erro ao carregar entregadores:", erro);
    }
}

function renderizarTabelaEntregadores(entregadores) {
    const tbody = document.getElementById("tabela-entregadores");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (entregadores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum entregador cadastrado ainda.</td></tr>';
        return;
    }

    entregadores.forEach(ent => {
        const badgeClass = ent.ativo ? "status-ativo" : "status-inativo";
        const badgeTexto = ent.ativo ? "Ativo" : "Inativo";
        const botaoTexto = ent.ativo ? "Desativar" : "Ativar";

        tbody.innerHTML += `
            <tr>
                <td><strong>${escaparHtml(ent.nome)}</strong></td>
                <td style="font-family: monospace; letter-spacing: 1px;">${escaparHtml(ent.token)}</td>
                <td><span class="status-badge ${badgeClass}">${badgeTexto}</span></td>
                <td>
                    <button class="btn-acao btn-toggle" onclick="alternarStatusEntregador(${ent.id}, ${!ent.ativo})">${botaoTexto}</button>
                    ${ent.telefone ? `<button class="btn-acao" style="background:#25D366; color:#fff;" onclick="reenviarTokenPorWhatsapp(${ent.id})"><i class="fa-brands fa-whatsapp"></i></button>` : ''}
                </td>
            </tr>
        `;
    });
}

async function alternarStatusEntregador(id, novoStatus) {
    if (!(await garantirSessaoOuRelogar())) return;
    await fetch(`${SUPABASE_URL}/rest/v1/entregadores?id=eq.${id}`, {
        method: 'PATCH',
        headers: headersAutenticados('application/json'),
        body: JSON.stringify({ ativo: novoStatus })
    });
    carregarEntregadores();
}

function abrirModalEntregador() {
    document.getElementById("entregador-nome").value = "";
    document.getElementById("entregador-telefone").value = "";
    document.getElementById("entregador-erro").style.display = "none";
    document.getElementById("entregador-form").style.display = "block";
    document.getElementById("entregador-token-gerado").style.display = "none";
    document.getElementById("titulo-modal-entregador").innerText = "Cadastrar Entregador";
    document.getElementById("modal-entregador").style.display = "flex";
}

function fecharModalEntregador() {
    document.getElementById("modal-entregador").style.display = "none";
}

let ultimoEntregadorGerado = null; // { nome, telefone, token } — pra montar o link do WhatsApp

async function salvarEntregador() {
    const nome = document.getElementById("entregador-nome").value.trim();
    const telefone = document.getElementById("entregador-telefone").value.trim();
    const erroEl = document.getElementById("entregador-erro");
    const btn = document.getElementById("btn-salvar-entregador");
    erroEl.style.display = "none";

    if (!nome) {
        erroEl.innerText = "Preencha o nome do entregador.";
        erroEl.style.display = "block";
        return;
    }

    if (!(await garantirSessaoOuRelogar())) return;

    const textoOriginal = btn.innerText;
    btn.innerText = "Gerando...";
    btn.disabled = true;

    try {
        const token = gerarTokenEntregador();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/entregadores`, {
            method: 'POST',
            headers: headersAutenticados('application/json'),
            body: JSON.stringify({ loja_id: lojaAtual.id, nome, telefone: telefone || null, token, ativo: true })
        });

        if (!res.ok) {
            const erro = await res.json();
            erroEl.innerText = erro.message || "Erro ao gerar o código.";
            erroEl.style.display = "block";
            return;
        }

        carregarEntregadores();

        ultimoEntregadorGerado = { nome, telefone, token };

        document.getElementById("entregador-form").style.display = "none";
        document.getElementById("titulo-modal-entregador").innerText = "Entregador Cadastrado";
        document.getElementById("texto-token-gerado").innerText = token;
        document.getElementById("btn-enviar-token-whatsapp").style.display = telefone ? "flex" : "none";
        document.getElementById("entregador-token-gerado").style.display = "block";
    } catch (erro) {
        erroEl.innerText = "Erro de conexão ao gerar o código.";
        erroEl.style.display = "block";
        console.error(erro);
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

// Abre o WhatsApp (app no celular, Web no computador) já com o número e a
// mensagem prontos — mesmo truque usado no site do cliente pra mandar pedido.
function abrirWhatsappComTexto(telefone, mensagem) {
    const numeroLimpo = String(telefone || '').replace(/\D/g, '');
    if (!numeroLimpo) return;
    const textoCodificado = encodeURIComponent(mensagem);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        window.location.href = `whatsapp://send?phone=${numeroLimpo}&text=${textoCodificado}`;
    } else {
        window.open(`https://api.whatsapp.com/send?phone=${numeroLimpo}&text=${textoCodificado}`, '_blank');
    }
}

function mensagemConviteEntregador(nome, token) {
    const urlEntregador = `https://${lojaAtual.subdominio}.mathshub.com.br/entregador.html`;
    return `Oi, ${nome}! Você foi cadastrado(a) como entregador(a) da ${lojaAtual.nome}.\n\n` +
        `Acesse: ${urlEntregador}\n` +
        `Seu código de acesso: ${token}\n\n` +
        `É só colar esse código lá pra entrar.`;
}

// Manda o link de entregador.html + o código de acesso pronto no WhatsApp do
// entregador, pra ele não precisar copiar/colar nem o dono digitar na mão.
function enviarTokenPorWhatsapp() {
    if (!ultimoEntregadorGerado || !ultimoEntregadorGerado.telefone) return;
    abrirWhatsappComTexto(ultimoEntregadorGerado.telefone, mensagemConviteEntregador(ultimoEntregadorGerado.nome, ultimoEntregadorGerado.token));
}

// Mesma coisa, mas pra reenviar depois pra alguém que já está na tabela
// (perdeu o código, trocou de celular, etc.).
function reenviarTokenPorWhatsapp(entregadorId) {
    const ent = listaDeEntregadoresGlobal.find(e => e.id === entregadorId);
    if (!ent || !ent.telefone) return;
    abrirWhatsappComTexto(ent.telefone, mensagemConviteEntregador(ent.nome, ent.token));
}

// ==========================================
// MÓDULO 5: CONFIGURAÇÕES DA LOJA (O Cofre Mestre)
// ==========================================

async function carregarConfiguracoesAdmin() {
    const elWebhook = document.getElementById("whatsapp-webhook-url");
    if (elWebhook) elWebhook.innerText = `${window.location.origin}/api/whatsapp-webhook`;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?loja_id=eq.${lojaAtual.id}&select=*`, {
            method: 'GET',
            headers: headersAutenticados()
        });
        const dados = await res.json();

        if (dados && dados.length > 0) {
            const config = dados[0];

            // 1. Preenche os Dados da Loja (PIX, Horários, WhatsApp)
            document.getElementById("admin-chave-pix").value = config.chave_pix || "";
            document.getElementById("admin-nome-pix").value = config.nome_recebedor || "";
            document.getElementById("admin-cidade-pix").value = config.cidade_recebedor || "";
            document.getElementById("admin-dias-trabalho").value = config.dias_trabalho || "";
            document.getElementById("admin-hora-abre").value = config.horario_abertura || "";
            document.getElementById("admin-hora-fecha").value = config.horario_fechar || "";
            document.getElementById("admin-whatsapp").value = config.numero_whatsapp || "";
            document.getElementById("admin-endereco").value = config.endereco || "";
            document.getElementById("admin-impressao-automatica").checked = config.impressao_automatica === true;

            // Saudação automática no WhatsApp
            document.getElementById("admin-whatsapp-saudacao-ativa").checked = config.whatsapp_saudacao_ativa === true;
            document.getElementById("admin-whatsapp-mensagem").value = config.whatsapp_mensagem_saudacao || "";
            document.getElementById("admin-whatsapp-phone-id").value = config.whatsapp_phone_id || "";
            document.getElementById("admin-whatsapp-token").value = config.whatsapp_token || "";

            // Entrega
            document.getElementById("admin-taxa-entrega").value = config.taxa_entrega || 0;
            document.getElementById("admin-repasse-igual").checked = config.repasse_igual_taxa !== false;
            document.getElementById("admin-valor-repasse").value = config.valor_repasse_entregador || 0;
            alternarCampoRepasse();

            // 2. Preenche os Dados da Identidade Visual (White-Label)
            document.getElementById("admin-nome-loja").value = config.nome_loja || "";
            document.getElementById("admin-titulo-banner").value = config.titulo_banner || "";
            document.getElementById("admin-subtitulo-banner").value = config.subtitulo_banner || "";
            document.getElementById("admin-cor-principal").value = config.cor_principal || "#ff5e00";

            // Salva o link da imagem atual no campo invisível
            document.getElementById("admin-img-banner").value = config.imagem_banner || "";
            document.getElementById("admin-logo-loja").value = config.logo_url || "";
        }
    } catch (erro) {
        console.error("Erro ao puxar configurações no Admin:", erro);
    }
}

function alternarCampoRepasse() {
    const igual = document.getElementById("admin-repasse-igual").checked;
    document.getElementById("bloco-valor-repasse").style.display = igual ? "none" : "block";
}

async function salvarConfiguracoesLoja() {
    const btn = document.getElementById("btn-salvar-config");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = "⏳ Salvando Dados, Imagem e Áudio (Aguarde)...";
    btn.disabled = true;

    let urlDaImagem = document.getElementById("admin-img-banner").value;
    const inputArquivo = document.getElementById("admin-file-banner");

    let urlDoLogo = document.getElementById("admin-logo-loja").value;
    const inputLogo = document.getElementById("admin-file-logo");

    const inputAudio = document.getElementById("admin-file-audio-fogo");
    let urlDoAudio = null;

    try {
        // ==========================================================
        // 1. UPLOAD DA IMAGEM (Vai para o bucket 'imagens')
        // ==========================================================
        if (inputArquivo && inputArquivo.files.length > 0) {
            const arquivo = inputArquivo.files[0];
            const nomeUnico = `${lojaAtual.subdominio}/banner-${Date.now()}-${arquivo.name.replace(/\s+/g, '-')}`;

            const resUpload = await fetch(`${SUPABASE_URL}/storage/v1/object/imagens/${nomeUnico}`, {
                method: 'POST',
                headers: headersAutenticados(arquivo.type),
                body: arquivo
            });

            if (!resUpload.ok) throw new Error("Falha ao subir a imagem para a nuvem.");

            urlDaImagem = `${SUPABASE_URL}/storage/v1/object/public/imagens/${nomeUnico}`;
            document.getElementById("admin-img-banner").value = urlDaImagem;
        }

        // ==========================================================
        // 1.2. UPLOAD DA LOGO (mesmo bucket 'imagens')
        // ==========================================================
        if (inputLogo && inputLogo.files.length > 0) {
            const arquivoLogo = inputLogo.files[0];
            const nomeUnicoLogo = `${lojaAtual.subdominio}/logo-${Date.now()}-${arquivoLogo.name.replace(/\s+/g, '-')}`;

            const resUploadLogo = await fetch(`${SUPABASE_URL}/storage/v1/object/imagens/${nomeUnicoLogo}`, {
                method: 'POST',
                headers: headersAutenticados(arquivoLogo.type),
                body: arquivoLogo
            });

            if (!resUploadLogo.ok) throw new Error("Falha ao subir a logo para a nuvem.");

            urlDoLogo = `${SUPABASE_URL}/storage/v1/object/public/imagens/${nomeUnicoLogo}`;
            document.getElementById("admin-logo-loja").value = urlDoLogo;
        }

        // ==========================================================
        // 1.5. UPLOAD DO ÁUDIO (Vai para o bucket separado 'audios')
        // ==========================================================
        if (inputAudio && inputAudio.files.length > 0) {
            const arquivoAudio = inputAudio.files[0];
            const nomeUnicoAudio = `${lojaAtual.subdominio}/som_fogo-${Date.now()}.mp3`;

            // Agora envia corretamente para o bucket 'audios'
            const resUploadAudio = await fetch(`${SUPABASE_URL}/storage/v1/object/audios/${nomeUnicoAudio}`, {
                method: 'POST',
                headers: headersAutenticados(arquivoAudio.type),
                body: arquivoAudio
            });

            if (!resUploadAudio.ok) {
                const erroSupabase = await resUploadAudio.text();
                console.error("Erro no áudio:", erroSupabase);
                throw new Error("Falha ao subir o áudio. Verifique as Políticas do Storage (Passo 2).");
            }

            urlDoAudio = `${SUPABASE_URL}/storage/v1/object/public/audios/${nomeUnicoAudio}`;
        }

        // ==========================================================
        // 2. SALVANDO NA TABELA 'CONFIGURACOES'
        // ==========================================================
        const corpoDb = {
            chave_pix: document.getElementById("admin-chave-pix").value,
            nome_recebedor: document.getElementById("admin-nome-pix").value,
            cidade_recebedor: document.getElementById("admin-cidade-pix").value,
            dias_trabalho: document.getElementById("admin-dias-trabalho").value,
            horario_abertura: document.getElementById("admin-hora-abre").value,
            horario_fechar: document.getElementById("admin-hora-fecha").value,
            numero_whatsapp: document.getElementById("admin-whatsapp").value,
            endereco: document.getElementById("admin-endereco").value,
            impressao_automatica: document.getElementById("admin-impressao-automatica").checked,
            whatsapp_saudacao_ativa: document.getElementById("admin-whatsapp-saudacao-ativa").checked,
            whatsapp_mensagem_saudacao: document.getElementById("admin-whatsapp-mensagem").value,
            whatsapp_phone_id: document.getElementById("admin-whatsapp-phone-id").value,
            whatsapp_token: document.getElementById("admin-whatsapp-token").value,
            taxa_entrega: parseFloat(document.getElementById("admin-taxa-entrega").value) || 0,
            repasse_igual_taxa: document.getElementById("admin-repasse-igual").checked,
            valor_repasse_entregador: parseFloat(document.getElementById("admin-valor-repasse").value) || 0,

            nome_loja: document.getElementById("admin-nome-loja").value,
            titulo_banner: document.getElementById("admin-titulo-banner").value,
            subtitulo_banner: document.getElementById("admin-subtitulo-banner").value,
            cor_principal: document.getElementById("admin-cor-principal").value,
            imagem_banner: urlDaImagem,
            logo_url: urlDoLogo
        };

        if (urlDoAudio) {
            corpoDb.audio_fogo = urlDoAudio;
        }

        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?loja_id=eq.${lojaAtual.id}`, {
            method: 'PATCH',
            headers: headersAutenticados('application/json'),
            body: JSON.stringify(corpoDb)
        });

        if (!res.ok) throw new Error("Falha ao salvar no banco de dados.");

        aplicarIdentidadeVisualAdmin(); // reflete nome/logo/cor novos na hora, sem precisar relogar

        alert("✅ Configurações salvas com sucesso! Áudio e Imagem separados.");
        
        if(inputArquivo) inputArquivo.value = "";
        if(inputLogo) inputLogo.value = "";
        if(inputAudio) inputAudio.value = "";

    } catch (erro) {
        alert("Erro ao salvar: " + erro.message);
        console.error(erro);
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}


// ==========================================
// INICIALIZAÇÃO DO SISTEMA
// ==========================================
// Primeiro resolve qual loja este subdomínio é; só então mostra a tela de
// login (ou o painel, se já tiver sessão válida). Ver iniciarPainelAdmin.
async function iniciarAdmin() {
    const lojaOk = await resolverLoja();

    // Nome/logo/cor da loja já estão aplicados nesse ponto (ou a tela de
    // "loja não encontrada" já tomou conta da página) — pode tirar o spinner.
    const telaCarregando = document.getElementById("tela-carregando-inicial");
    if (telaCarregando) telaCarregando.style.display = "none";

    if (!lojaOk) return;

    if (tratarRetornoRecuperacaoSenha()) return;

    const logadoPorGoogle = await checarRetornoOAuthAdmin();
    if (logadoPorGoogle) return;

    await verificarSessaoAoAbrir();
}

iniciarAdmin();