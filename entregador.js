// ==========================================
// CREDENCIAIS DO SUPABASE (mesmo projeto, chave anon)
// ==========================================
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let lojaAtual = null; // { id, subdominio, nome, ativo }
let entregadorAtual = null; // { user_id, nome }

function escaparHtml(texto) {
    if (texto === null || texto === undefined) return "";
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ==========================================
// RESOLUÇÃO DA LOJA PELO SUBDOMÍNIO
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
        const res = await fetch(`${SUPABASE_URL}/rest/v1/lojas?select=*&subdominio=eq.${encodeURIComponent(slug)}&limit=1`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await res.json();

        if (!dados || dados.length === 0) {
            mostrarTelaIndisponivel("Loja não encontrada", "Não encontramos nenhuma hamburgueria neste endereço.");
            return false;
        }
        if (!dados[0].ativo) {
            mostrarTelaIndisponivel("Loja inativa", "Esta loja está desativada no momento.");
            return false;
        }

        lojaAtual = dados[0];
        const elLogin = document.getElementById("login-nome-loja-entregador");
        if (elLogin) elLogin.innerText = `Entregas — ${lojaAtual.nome}`;
        document.title = `Entregador - ${lojaAtual.nome}`;
        return true;
    } catch (erro) {
        mostrarTelaIndisponivel("Erro de conexão", "Não foi possível conectar ao servidor.");
        return false;
    }
}

function mostrarTelaIndisponivel(titulo, mensagem) {
    document.body.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #121212; color: #fff; padding: 30px; text-align: center; font-family: 'Inter', sans-serif;">
            <div>
                <i class="fa-solid fa-motorcycle" style="font-size: 40px; color: #ff5e00; margin-bottom: 15px;"></i>
                <h2 style="margin-bottom: 10px;">${escaparHtml(titulo)}</h2>
                <p style="color: #aaa;">${escaparHtml(mensagem)}</p>
            </div>
        </div>
    `;
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================
const CHAVE_SESSAO_ENTREGADOR = "hamburgueria_entregador_sessao";

function salvarSessao(dadosToken) {
    const sessaoAnterior = carregarSessao();
    const sessao = {
        access_token: dadosToken.access_token,
        refresh_token: dadosToken.refresh_token,
        expira_em: Math.floor(Date.now() / 1000) + dadosToken.expires_in,
        user_id: (dadosToken.user && dadosToken.user.id) ? dadosToken.user.id : (sessaoAnterior ? sessaoAnterior.user_id : null)
    };
    localStorage.setItem(CHAVE_SESSAO_ENTREGADOR, JSON.stringify(sessao));
    return sessao;
}

function carregarSessao() {
    const bruto = localStorage.getItem(CHAVE_SESSAO_ENTREGADOR);
    return bruto ? JSON.parse(bruto) : null;
}

function limparSessao() {
    localStorage.removeItem(CHAVE_SESSAO_ENTREGADOR);
}

function sessaoExpirada(sessao) {
    if (!sessao) return true;
    return Math.floor(Date.now() / 1000) >= (sessao.expira_em - 90);
}

function headersAutenticados(contentType) {
    const sessao = carregarSessao();
    const token = (sessao && sessao.access_token) ? sessao.access_token : SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (contentType) headers['Content-Type'] = contentType;
    return headers;
}

async function verificarAcessoEntregador(userId) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/entregadores?select=user_id,nome,loja_id,ativo&user_id=eq.${userId}`, {
            headers: headersAutenticados()
        });
        const dados = await res.json();
        if (dados.length > 0 && dados[0].loja_id === lojaAtual.id && dados[0].ativo !== false) {
            entregadorAtual = dados[0];
            return true;
        }
        return false;
    } catch (erro) {
        return false;
    }
}

async function fazerLoginEntregador(event) {
    if (event) event.preventDefault();
    const email = document.getElementById("login-email-entregador").value.trim();
    const senha = document.getElementById("login-senha-entregador").value;
    const erroEl = document.getElementById("login-erro-entregador");
    const btn = document.getElementById("btn-login-entregador");

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

        const temAcesso = await verificarAcessoEntregador(dados.user.id);
        if (!temAcesso) {
            limparSessao();
            erroEl.innerText = "Esta conta não tem acesso a esta loja.";
            erroEl.style.display = "block";
            return;
        }

        iniciarPainelEntregador();
    } catch (erro) {
        erroEl.innerText = "Erro de conexão. Tente novamente.";
        erroEl.style.display = "block";
        console.error(erro);
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

function sairEntregador() {
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

let intervaloDadosEntregador = null;
let intervaloRenovarSessaoEntregador = null;

function pararIntervalosEntregador() {
    if (intervaloDadosEntregador) clearInterval(intervaloDadosEntregador);
    if (intervaloRenovarSessaoEntregador) clearInterval(intervaloRenovarSessaoEntregador);
}

async function garantirSessaoOuRelogar() {
    const ok = await renovarSessaoSeNecessario();
    if (!ok) {
        pararIntervalosEntregador();
        limparSessao();
        document.getElementById("app-entregador-container").style.display = "none";
        document.getElementById("tela-login-entregador").style.display = "flex";
        const erroEl = document.getElementById("login-erro-entregador");
        if (erroEl) {
            erroEl.innerText = "Sua sessão expirou. Faça login novamente.";
            erroEl.style.display = "block";
        }
    }
    return ok;
}

function iniciarPainelEntregador() {
    document.getElementById("tela-login-entregador").style.display = "none";
    document.getElementById("app-entregador-container").style.display = "block";

    document.getElementById("nome-entregador-topo").innerText = entregadorAtual.nome || "Entregador";
    document.getElementById("nome-loja-topo").innerText = lojaAtual.nome;

    carregarDadosEntregador();

    intervaloDadosEntregador = setInterval(carregarDadosEntregador, 4000);
    intervaloRenovarSessaoEntregador = setInterval(renovarSessaoSeNecessario, 60 * 1000);
}

async function verificarSessaoAoAbrir() {
    const sessao = carregarSessao();
    if (sessao && await renovarSessaoSeNecessario()) {
        const sessaoAtual = carregarSessao();
        const temAcesso = sessaoAtual.user_id ? await verificarAcessoEntregador(sessaoAtual.user_id) : false;
        if (temAcesso) {
            iniciarPainelEntregador();
        } else {
            limparSessao();
        }
    }
}

// ==========================================
// DADOS E AÇÕES
// ==========================================
function formatarMoeda(v) {
    return `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
}

async function carregarDadosEntregador() {
    if (!(await garantirSessaoOuRelogar())) return;

    try {
        const hojeInicio = new Date();
        hojeInicio.setHours(0, 0, 0, 0);
        const hojeISO = hojeInicio.toISOString();

        const [resPreparo, resMinhas, resEntreguesHoje] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=*&loja_id=eq.${lojaAtual.id}&status=eq.${encodeURIComponent('Em Preparo')}&order=id.asc`, { headers: headersAutenticados() }),
            fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=*&loja_id=eq.${lojaAtual.id}&entregador_id=eq.${entregadorAtual.user_id}&status=eq.${encodeURIComponent('Saiu para Entrega')}&order=id.asc`, { headers: headersAutenticados() }),
            fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=id&loja_id=eq.${lojaAtual.id}&entregador_id=eq.${entregadorAtual.user_id}&status=eq.Entregue&entregue_em=gte.${hojeISO}`, { headers: headersAutenticados() })
        ]);

        const pedidosPreparo = await resPreparo.json();
        const minhasEntregas = await resMinhas.json();
        const entreguesHoje = await resEntreguesHoje.json();

        document.getElementById("resumo-entregues").innerText = entreguesHoje.length;
        document.getElementById("resumo-andamento").innerText = minhasEntregas.length;
        document.getElementById("resumo-aguardando").innerText = pedidosPreparo.length;

        renderizarEmPreparo(pedidosPreparo);
        renderizarMinhasEntregas(minhasEntregas);
    } catch (erro) {
        console.error("Erro ao carregar dados do entregador:", erro);
    }
}

function renderizarEmPreparo(pedidos) {
    const container = document.getElementById("lista-em-preparo");
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="vazio">Nenhum pedido em preparo no momento.</div>';
        return;
    }

    container.innerHTML = pedidos.map(ped => {
        const totalNum = parseFloat(ped.total) || 0;
        const tipoTexto = ped.tipo_entrega === 'retirada' ? 'Retirada na loja' : 'Entrega';
        return `
            <div class="card-pedido-entregador">
                <div class="cabecalho">
                    <span class="pedido-id">#${ped.id}</span>
                    <span class="pedido-hora">${tipoTexto}</span>
                </div>
                <div class="info">
                    <strong>${escaparHtml(ped.nome_cliente) || 'Cliente'}</strong><br>
                    ${ped.endereco_entrega ? escaparHtml(ped.endereco_entrega) + '<br>' : ''}
                    <span class="total">${formatarMoeda(totalNum)}</span>
                </div>
                ${ped.tipo_entrega !== 'retirada' ? `<button class="btn-acao-entregador btn-pegar" onclick="pegarPedido(${ped.id})"><i class="fa-solid fa-motorcycle"></i> Peguei! Saiu pra entrega</button>` : ''}
            </div>
        `;
    }).join('');
}

function renderizarMinhasEntregas(pedidos) {
    const container = document.getElementById("lista-minhas-entregas");
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="vazio">Nenhuma entrega em andamento.</div>';
        return;
    }

    container.innerHTML = pedidos.map(ped => {
        const totalNum = parseFloat(ped.total) || 0;
        const linkMaps = ped.endereco_entrega
            ? `<a class="btn-acao-entregador btn-maps" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ped.endereco_entrega)}" target="_blank" rel="noopener"><i class="fa-solid fa-location-dot"></i> Abrir no Maps</a>`
            : '';
        return `
            <div class="card-pedido-entregador">
                <div class="cabecalho">
                    <span class="pedido-id">#${ped.id}</span>
                    <span class="pedido-hora">Pgto: ${escaparHtml(ped.forma_pagamento) || '-'}</span>
                </div>
                <div class="info">
                    <strong>${escaparHtml(ped.nome_cliente) || 'Cliente'}</strong><br>
                    ${ped.telefone_cliente ? escaparHtml(ped.telefone_cliente) + '<br>' : ''}
                    ${ped.endereco_entrega ? escaparHtml(ped.endereco_entrega) + '<br>' : ''}
                    <span class="total">${formatarMoeda(totalNum)}</span>
                </div>
                ${linkMaps}
                <button class="btn-acao-entregador btn-entregue" onclick="marcarComoEntregue(${ped.id})"><i class="fa-solid fa-check-double"></i> Marcar como entregue</button>
            </div>
        `;
    }).join('');
}

async function pegarPedido(pedidoId) {
    if (!(await garantirSessaoOuRelogar())) return;

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&entregador_id=is.null`,
            {
                method: 'PATCH',
                headers: { ...headersAutenticados('application/json'), 'Prefer': 'return=representation' },
                body: JSON.stringify({
                    entregador_id: entregadorAtual.user_id,
                    status: 'Saiu para Entrega',
                    saiu_em: new Date().toISOString()
                })
            }
        );

        const resultado = await res.json();
        if (!res.ok || !resultado || resultado.length === 0) {
            alert("Esse pedido já foi assumido por outro entregador.");
        }

        carregarDadosEntregador();
    } catch (erro) {
        alert("Erro ao assumir o pedido. Tente de novo.");
        console.error(erro);
    }
}

async function marcarComoEntregue(pedidoId) {
    if (!(await garantirSessaoOuRelogar())) return;

    try {
        await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&entregador_id=eq.${entregadorAtual.user_id}`,
            {
                method: 'PATCH',
                headers: headersAutenticados('application/json'),
                body: JSON.stringify({
                    status: 'Entregue',
                    entregue_em: new Date().toISOString()
                })
            }
        );
        carregarDadosEntregador();
    } catch (erro) {
        alert("Erro ao marcar como entregue. Tente de novo.");
        console.error(erro);
    }
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
async function iniciarEntregador() {
    const lojaOk = await resolverLoja();
    if (!lojaOk) return;
    await verificarSessaoAoAbrir();
}

iniciarEntregador();
