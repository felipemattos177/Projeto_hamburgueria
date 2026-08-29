// ==========================================
// CREDENCIAIS DO SUPABASE (mesmo projeto, chave anon)
// ==========================================
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

const HEADERS_ANON = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

let lojaAtual = null; // { id, subdominio, nome, ativo }
let entregadorAtual = null; // { entregador_id, nome, token }
let nomeLojaExibicao = null; // nome_loja configurado pelo admin, se houver — senão cai no lojas.nome

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
// texto na tela isso ajuda o entregador, mas mandar pro Maps faz a busca dar
// errado — então pra montar o link tiramos só essa parte entre parênteses.
function enderecoParaMaps(endereco) {
    // Formato salvo: "Rua, Número - Bairro (complemento)". O bairro às vezes
    // confunde o geocoding do Maps (nome ambíguo, bairro repetido em cidade
    // vizinha etc.) — pra busca, fica só "Rua, Número".
    let limpo = String(endereco || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const idx = limpo.lastIndexOf(' - ');
    if (idx !== -1) limpo = limpo.substring(0, idx).trim();
    return limpo;
}

function formatarMoeda(v) {
    return `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
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
            headers: HEADERS_ANON
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

        await aplicarIdentidadeVisualEntregador();

        return true;
    } catch (erro) {
        mostrarTelaIndisponivel("Erro de conexão", "Não foi possível conectar ao servidor.");
        return false;
    }
}

// Mesma identidade visual (nome, logo, cor) que o painel do cliente e o admin já usam.
async function aplicarIdentidadeVisualEntregador() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?loja_id=eq.${lojaAtual.id}&select=nome_loja,logo_url,cor_principal`, {
            headers: HEADERS_ANON
        });
        const dados = await res.json();
        if (!dados || dados.length === 0) return;
        const config = dados[0];

        nomeLojaExibicao = config.nome_loja || lojaAtual.nome;
        const elLogin = document.getElementById("login-nome-loja-entregador");
        if (elLogin) elLogin.innerText = `Entregas — ${nomeLojaExibicao}`;
        document.title = `Entregador - ${nomeLojaExibicao}`;

        if (config.logo_url && config.logo_url.trim() !== "") {
            [["login-logo-img", "login-logo-icone"], ["topo-logo-img", "topo-logo-icone"]].forEach(([idImg, idIcone]) => {
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
// "LOGIN" POR TOKEN (sem conta no Supabase Auth)
// ==========================================
const CHAVE_SESSAO_ENTREGADOR = "hamburgueria_entregador_sessao";

function salvarSessaoLocal(dados) {
    localStorage.setItem(CHAVE_SESSAO_ENTREGADOR, JSON.stringify(dados));
}

function carregarSessaoLocal() {
    const bruto = localStorage.getItem(CHAVE_SESSAO_ENTREGADOR);
    return bruto ? JSON.parse(bruto) : null;
}

function limparSessaoLocal() {
    localStorage.removeItem(CHAVE_SESSAO_ENTREGADOR);
}

async function chamarRpcEntregador(nomeFuncao, parametrosExtras) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nomeFuncao}`, {
        method: 'POST',
        headers: HEADERS_ANON,
        body: JSON.stringify({
            p_loja_id: lojaAtual.id,
            p_token: entregadorAtual ? entregadorAtual.token : undefined,
            ...parametrosExtras
        })
    });
    return res;
}

async function fazerLoginEntregador(event) {
    if (event) event.preventDefault();
    const token = document.getElementById("login-token-entregador").value.trim();
    const erroEl = document.getElementById("login-erro-entregador");
    const btn = document.getElementById("btn-login-entregador");

    erroEl.style.display = "none";
    if (!token) return;

    const textoOriginal = btn.innerText;
    btn.innerText = "Entrando...";
    btn.disabled = true;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/entregador_login`, {
            method: 'POST',
            headers: HEADERS_ANON,
            body: JSON.stringify({ p_loja_id: lojaAtual.id, p_token: token })
        });
        const dados = await res.json();

        if (!res.ok || !dados || dados.length === 0) {
            erroEl.innerText = "Código inválido. Confira com a loja e tente de novo.";
            erroEl.style.display = "block";
            return;
        }

        entregadorAtual = { entregador_id: dados[0].entregador_id, nome: dados[0].nome, token };
        salvarSessaoLocal(entregadorAtual);
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
    limparSessaoLocal();
    location.reload();
}

let intervaloDadosEntregador = null;

function iniciarPainelEntregador() {
    document.getElementById("tela-login-entregador").style.display = "none";
    document.getElementById("app-entregador-container").style.display = "block";

    document.getElementById("nome-entregador-topo").innerText = entregadorAtual.nome || "Entregador";
    document.getElementById("nome-loja-topo").innerText = nomeLojaExibicao || lojaAtual.nome;

    carregarDadosEntregador();
    intervaloDadosEntregador = setInterval(carregarDadosEntregador, 4000);
}

// ==========================================
// DADOS E AÇÕES
// ==========================================
async function carregarDadosEntregador() {
    try {
        const [resMinhas, resEntreguesHoje, pedidosPreparo] = await Promise.all([
            chamarRpcEntregador('entregador_minhas_entregas'),
            chamarRpcEntregador('entregador_entregues_hoje'),
            carregarPedidosDisponiveisEntrega()
        ]);

        if (!resMinhas.ok || !resEntreguesHoje.ok) {
            // Token foi desativado enquanto o entregador estava com a tela aberta
            if (intervaloDadosEntregador) clearInterval(intervaloDadosEntregador);
            limparSessaoLocal();
            document.getElementById("app-entregador-container").style.display = "none";
            document.getElementById("tela-login-entregador").style.display = "flex";
            const erroEl = document.getElementById("login-erro-entregador");
            if (erroEl) {
                erroEl.innerText = "Seu acesso foi desativado. Fale com a loja.";
                erroEl.style.display = "block";
            }
            return;
        }

        const minhasEntregas = await resMinhas.json();
        const entreguesHoje = await resEntreguesHoje.json();
        const entreguesHojeDetalhados = await carregarEntregasFinalizadasHoje();

        document.getElementById("resumo-entregues").innerText = entreguesHoje;
        document.getElementById("resumo-andamento").innerText = minhasEntregas.length;
        document.getElementById("resumo-aguardando").innerText = pedidosPreparo.length;

        renderizarEmPreparo(pedidosPreparo);
        renderizarMinhasEntregas(minhasEntregas);
        renderizarEntreguesHoje(entreguesHojeDetalhados);
        reaplicarItensAbertos();
    } catch (erro) {
        console.error("Erro ao carregar dados do entregador:", erro);
    }
}

async function carregarPedidosDisponiveisEntrega() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/pedidos?select=id,numero_pedido,nome_cliente,telefone_cliente,endereco_entrega,total,forma_pagamento,status,tipo_entrega,entregador_id&loja_id=eq.${lojaAtual.id}&tipo_entrega=eq.entrega&status=in.(Pendente,Em%20Preparo)&order=data_pedido.desc`;
        const res = await fetch(url, { headers: HEADERS_ANON });
        if (!res.ok) {
            throw new Error(`Erro ao buscar pedidos disponíveis: ${res.status}`);
        }
        const dados = await res.json();
        return Array.isArray(dados) ? dados : [];
    } catch (erro) {
        console.error("Erro ao carregar pedidos disponíveis para entrega:", erro);
        return [];
    }
}

async function carregarEntregasFinalizadasHoje() {
    try {
        const hojeInicio = new Date();
        hojeInicio.setHours(0, 0, 0, 0);

        const url = `${SUPABASE_URL}/rest/v1/pedidos?select=id,numero_pedido,nome_cliente,telefone_cliente,endereco_entrega,total,forma_pagamento,entregue_em,valor_entrega&loja_id=eq.${lojaAtual.id}&entregador_id=eq.${entregadorAtual.entregador_id}&status=eq.Entregue&entregue_em=gte.${hojeInicio.toISOString()}`;
        const res = await fetch(url, { headers: HEADERS_ANON });
        if (!res.ok) return [];
        const dados = await res.json();
        return Array.isArray(dados) ? dados : [];
    } catch (erro) {
        console.error("Erro ao carregar entregas finalizadas hoje:", erro);
        return [];
    }
}

function renderizarEmPreparo(pedidos) {
    const container = document.getElementById("lista-em-preparo");
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="vazio">Nenhum pedido de entrega pendente no momento.</div>';
        return;
    }

    container.innerHTML = pedidos.map(ped => {
        const totalNum = parseFloat(ped.total) || 0;
        const statusTexto = String(ped.status || '').trim();
        const tipoTexto = ped.tipo_entrega === 'retirada' ? 'Retirada na loja' : 'Entrega';
        const tagStatus = statusTexto === 'Pendente' ? 'Pendente' : 'Em preparo';
        return `
            <div class="card-pedido-entregador">
                <div class="cabecalho">
                    <span class="pedido-id">#${ped.numero_pedido || ped.id}</span>
                    <span class="pedido-hora">${tipoTexto} · ${tagStatus}</span>
                </div>
                <div class="info">
                    <strong>${escaparHtml(ped.nome_cliente) || 'Cliente'}</strong><br>
                    ${ped.endereco_entrega ? escaparHtml(ped.endereco_entrega) + '<br>' : ''}
                    <span class="total">${formatarMoeda(totalNum)}</span>
                </div>
                <button type="button" class="btn-ver-itens" onclick="alternarItensPedido(${ped.id}, this)"><i class="fa-solid fa-list"></i> Ver itens do pedido</button>
                <div id="itens-pedido-${ped.id}" class="itens-pedido-expandido" style="display:none;"></div>
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
            ? `<a class="btn-acao-entregador btn-maps" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoParaMaps(ped.endereco_entrega))}" target="_blank" rel="noopener"><i class="fa-solid fa-location-dot"></i> Abrir no Maps</a>`
            : '';
        return `
            <div class="card-pedido-entregador">
                <div class="cabecalho">
                    <span class="pedido-id">#${ped.numero_pedido || ped.id}</span>
                    <span class="pedido-hora">Pgto: ${escaparHtml(ped.forma_pagamento) || '-'}</span>
                </div>
                <div class="info">
                    <strong>${escaparHtml(ped.nome_cliente) || 'Cliente'}</strong><br>
                    ${ped.telefone_cliente ? escaparHtml(ped.telefone_cliente) + '<br>' : ''}
                    ${ped.endereco_entrega ? escaparHtml(ped.endereco_entrega) + '<br>' : ''}
                    <span class="total">${formatarMoeda(totalNum)}</span>
                </div>
                <button type="button" class="btn-ver-itens" onclick="alternarItensPedido(${ped.id}, this)"><i class="fa-solid fa-list"></i> Ver itens do pedido</button>
                <div id="itens-pedido-${ped.id}" class="itens-pedido-expandido" style="display:none;"></div>
                ${linkMaps}
                <button class="btn-acao-entregador btn-entregue" onclick="marcarComoEntregue(${ped.id})"><i class="fa-solid fa-check-double"></i> Marcar como entregue</button>
            </div>
        `;
    }).join('');
}

function renderizarEntreguesHoje(pedidos) {
    const container = document.getElementById("lista-entregues-hoje");
    if (!container) return;

    if (!pedidos || pedidos.length === 0) {
        container.innerHTML = '<div class="vazio">Nenhuma entrega concluída hoje.</div>';
        return;
    }

    container.innerHTML = pedidos.map(ped => {
        const totalNum = parseFloat(ped.total) || 0;
        const hora = ped.entregue_em ? new Date(ped.entregue_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
        return `
            <div class="card-pedido-entregador">
                <div class="cabecalho">
                    <span class="pedido-id">#${ped.numero_pedido || ped.id}</span>
                    <span class="pedido-hora">${hora}</span>
                </div>
                <div class="info">
                    <strong>${escaparHtml(ped.nome_cliente) || 'Cliente'}</strong><br>
                    ${ped.endereco_entrega ? escaparHtml(ped.endereco_entrega) + '<br>' : ''}
                    ${ped.forma_pagamento ? `Pgto: ${escaparHtml(ped.forma_pagamento)}<br>` : ''}
                    <span class="total">${formatarMoeda(totalNum)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Guarda o HTML já montado por pedido, pra não rebuscar toda vez que
// abre/fecha o mesmo card. E lembra quais estão abertos, porque a lista
// inteira é redesenhada a cada 4s (senão o card fechava sozinho no meio
// do entregador lendo).
const cacheItensPedido = {};
const pedidosComItensAbertos = new Set();

// Chamada depois de todo redesenho da lista — reabre quem estava aberto.
function reaplicarItensAbertos() {
    pedidosComItensAbertos.forEach(pedidoId => {
        const container = document.getElementById(`itens-pedido-${pedidoId}`);
        if (!container || !cacheItensPedido[pedidoId]) {
            pedidosComItensAbertos.delete(pedidoId); // pedido saiu da lista (ex: já foi entregue)
            return;
        }
        container.innerHTML = cacheItensPedido[pedidoId];
        container.style.display = "block";
        const botao = container.previousElementSibling;
        if (botao && botao.classList.contains('btn-ver-itens')) {
            botao.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Ocultar itens`;
        }
    });
}

async function alternarItensPedido(pedidoId, botao) {
    const container = document.getElementById(`itens-pedido-${pedidoId}`);
    if (!container) return;

    const estaAberto = container.style.display === "block";
    if (estaAberto) {
        container.style.display = "none";
        pedidosComItensAbertos.delete(pedidoId);
        botao.innerHTML = `<i class="fa-solid fa-list"></i> Ver itens do pedido`;
        return;
    }

    pedidosComItensAbertos.add(pedidoId);

    if (cacheItensPedido[pedidoId]) {
        container.innerHTML = cacheItensPedido[pedidoId];
        container.style.display = "block";
        botao.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Ocultar itens`;
        return;
    }

    const textoOriginal = botao.innerHTML;
    botao.innerHTML = "Carregando...";
    botao.disabled = true;

    try {
        const res = await chamarRpcEntregador('entregador_itens_pedido', { p_pedido_id: pedidoId });
        const itens = await res.json();

        let html;
        if (!res.ok || !Array.isArray(itens) || itens.length === 0) {
            console.error("entregador_itens_pedido falhou:", itens);
            html = `<div class="vazio" style="margin:0; padding:12px;">Não foi possível carregar os itens.</div>`;
        } else {
            html = itens.map(item => `
                <div class="item-detalhe-pedido">
                    <strong>${item.quantidade}x ${escaparHtml(item.produto_nome)}</strong>
                    ${item.adicionais ? `<div class="item-adicionais">+ ${escaparHtml(item.adicionais)}</div>` : ''}
                    ${item.observacao ? `<div class="item-obs"><i class="fa-solid fa-pen"></i> ${escaparHtml(item.observacao)}</div>` : ''}
                </div>
            `).join('');
            cacheItensPedido[pedidoId] = html;
        }

        container.innerHTML = html;
        container.style.display = "block";
        botao.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Ocultar itens`;
    } catch (erro) {
        container.innerHTML = `<div class="vazio" style="margin:0; padding:12px;">Erro ao carregar os itens.</div>`;
        container.style.display = "block";
        botao.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Ocultar itens`;
    } finally {
        botao.disabled = false;
    }
}

async function pegarPedido(pedidoId) {
    try {
        const res = await chamarRpcEntregador('entregador_pegar_pedido', { p_pedido_id: pedidoId });
        const conseguiu = await res.json();
        if (!res.ok || conseguiu !== true) {
            alert("Esse pedido já foi assumido por outro entregador.");
        }
        carregarDadosEntregador();
    } catch (erro) {
        alert("Erro ao assumir o pedido. Tente de novo.");
        console.error(erro);
    }
}

async function marcarComoEntregue(pedidoId) {
    try {
        await chamarRpcEntregador('entregador_marcar_entregue', { p_pedido_id: pedidoId });
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

    // Nome/logo/cor da loja já estão aplicados nesse ponto (ou a tela de
    // "loja não encontrada" já tomou conta da página) — pode tirar o spinner.
    const telaCarregando = document.getElementById("tela-carregando-inicial");
    if (telaCarregando) telaCarregando.style.display = "none";

    if (!lojaOk) return;

    const sessaoSalva = carregarSessaoLocal();
    if (sessaoSalva && sessaoSalva.token) {
        entregadorAtual = sessaoSalva;
        iniciarPainelEntregador();
    }
}

iniciarEntregador();
