// === 1. CREDENCIAIS DA API (SUPABASE) ===
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let cardapio = [];
let carrinho = [];
let produtoSendoVisto = null;
let receitasGlobais = []; 

let configLoja = { 
    chave_pix: "", nome_recebedor: "", cidade_recebedor: "Arapoti",
    dias_trabalho: "0,1,2,3,4,5,6", horario_abertura: "00:00", horario_fechar: "23:59", numero_whatsapp: ""
};
let lojaAberta = true;
let mensagemFechado = "";
let lojaAtual = null; // { id, subdominio, nome, ativo }

// Guarda o valor que foi copiado no botão "Copiar Código PIX" — só libera
// enviar o pedido no Pix se isso bater com o total atual do carrinho (se o
// carrinho mudar depois de copiar, o código copiado ficaria com valor errado).
let pixValorCopiado = null;

function obterSlugDaLoja() {
    const params = new URLSearchParams(window.location.search);
    const slugParam = params.get("loja");
    if (slugParam) return slugParam.toLowerCase();
    return window.location.hostname.split(".")[0].toLowerCase();
}

// Descobre qual loja este site está servindo, pelo subdomínio (ou ?loja=slug
// pra testar em localhost/preview). Precisa rodar antes de qualquer outra
// chamada ao banco, já que tudo depois é filtrado por loja_id.
async function resolverLoja() {
    const slug = obterSlugDaLoja();
    try {
        const resposta = await fetchSupabase(`/rest/v1/lojas?select=*&subdominio=eq.${encodeURIComponent(slug)}&limit=1`);
        const dados = await resposta.json();

        if (!dados || dados.length === 0) {
            mostrarTelaLojaIndisponivel("Loja não encontrada", "Não encontramos nenhuma hamburgueria neste endereço.");
            return false;
        }
        if (!dados[0].ativo) {
            mostrarTelaLojaIndisponivel("Loja indisponível", "Esta loja está temporariamente fora do ar. Entre em contato com o estabelecimento.");
            return false;
        }

        lojaAtual = dados[0];
        return true;
    } catch (erro) {
        mostrarTelaLojaIndisponivel("Erro de conexão", "Não foi possível conectar ao servidor. Tente novamente em instantes.");
        return false;
    }
}

function mostrarTelaLojaIndisponivel(titulo, mensagem) {
    document.body.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #121212; color: #fff; padding: 30px; text-align: center; font-family: 'Roboto', sans-serif;">
            <div>
                <i class="fa-solid fa-shop-slash" style="font-size: 40px; color: var(--laranja-fogo, #ff5e00); margin-bottom: 15px;"></i>
                <h2 style="margin-bottom: 10px;">${escaparHtml(titulo)}</h2>
                <p style="color: #aaa;">${escaparHtml(mensagem)}</p>
            </div>
        </div>
    `;
}

function chaveLocalStorage(sufixo) {
    return `loja_${lojaAtual.subdominio}_${sufixo}`;
}

// Evita XSS: qualquer texto vindo do banco (nome/descrição de produto ou ingrediente)
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

// O Supabase às vezes devolve o horário sem indicar o fuso (ex: "2026-08-21T09:48:00").
// Sem isso, o navegador interpreta como horário local e o horário exibido fica errado.
// Forçamos UTC quando a string não traz fuso, e sempre exibimos convertido pro horário de Brasília.
function formatarDataHoraBr(valorTimestamp, opcoes) {
    if (!valorTimestamp) return '-';
    const temFuso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(valorTimestamp);
    const data = new Date(temFuso ? valorTimestamp : valorTimestamp + 'Z');
    return data.toLocaleString('pt-BR', Object.assign({ timeZone: 'America/Sao_Paulo' }, opcoes));
}

// === FUNÇÃO DE AVISOS PERSONALIZADOS ===
function mostrarAviso(mensagem, titulo = "Ops!", tipo = "aviso") {
    let caixa = document.getElementById("caixa-aviso-custom");
    if (!caixa) {
        caixa = document.createElement("div");
        caixa.id = "caixa-aviso-custom";
        caixa.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; justify-content: center; align-items: center; padding: 20px; opacity: 0; transition: opacity 0.3s; pointer-events: none; backdrop-filter: blur(4px);";
        caixa.innerHTML = `
            <div id="caixa-aviso-card" style="background: #1a1a1a; border: 1px solid var(--laranja-fogo, #ff5e00); border-radius: 16px; padding: 30px 20px; max-width: 350px; width: 100%; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.8); transform: scale(0.8); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <div id="caixa-aviso-icon-bg" style="width: 70px; height: 70px; border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 20px auto;">
                    <i id="caixa-aviso-icon" class="fa-solid fa-triangle-exclamation" style="font-size: 35px;"></i>
                </div>
                <h3 id="caixa-aviso-titulo" style="color: #fff; margin-bottom: 12px; font-size: 22px;">Aviso</h3>
                <p id="caixa-aviso-msg" style="color: #bbb; font-size: 15px; margin-bottom: 25px; line-height: 1.5;"></p>
                <button id="caixa-aviso-btn" onclick="fecharAviso()" style="background: var(--laranja-fogo, #ff5e00); color: #fff; border: none; padding: 14px 25px; border-radius: 10px; font-weight: bold; font-size: 16px; cursor: pointer; width: 100%; transition: 0.2s;">Entendi</button>
            </div>
        `;
        document.body.appendChild(caixa);
    }

    const msgLimpa = mensagem.replace("⚠️", "").trim();
    document.getElementById("caixa-aviso-titulo").innerText = titulo;
    document.getElementById("caixa-aviso-msg").innerText = msgLimpa;

    const iconBg = document.getElementById("caixa-aviso-icon-bg");
    const icon = document.getElementById("caixa-aviso-icon");
    const card = document.getElementById("caixa-aviso-card");
    const btn = document.getElementById("caixa-aviso-btn");

    if (tipo === "sucesso") {
        const corVerde = "#2ed573";
        iconBg.style.background = "rgba(46, 213, 115, 0.15)";
        icon.className = "fa-solid fa-check";
        icon.style.color = corVerde;
        card.style.borderColor = "rgba(46, 213, 115, 0.3)";
        btn.style.background = corVerde;
        btn.style.color = "#000";
    } else {
        const corLaranja = "var(--laranja-fogo, #ff5e00)";
        iconBg.style.background = "rgba(255, 94, 0, 0.15)";
        icon.className = "fa-solid fa-triangle-exclamation";
        icon.style.color = corLaranja;
        card.style.borderColor = "rgba(255, 94, 0, 0.3)";
        btn.style.background = corLaranja;
        btn.style.color = "#fff";
    }

    caixa.style.pointerEvents = "auto";
    setTimeout(() => {
        caixa.style.opacity = "1";
        card.style.transform = "scale(1)";
    }, 10);
}

function fecharAviso() {
    const caixa = document.getElementById("caixa-aviso-custom");
    if (caixa) {
        caixa.style.opacity = "0";
        document.getElementById("caixa-aviso-card").style.transform = "scale(0.8)";
        caixa.style.pointerEvents = "none";
    }
}

// === FUNÇÃO MÁGICA ANTI-CACHE ===
async function fetchSupabase(endpoint, options = {}) {
    const configuracao = {
        ...options,
        method: options.method || 'GET',
        headers: { 
            'apikey': SUPABASE_KEY, 
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            ...(options.headers || {}) 
        },
        cache: 'no-store' 
    };
    return await fetch(`${SUPABASE_URL}${endpoint}`, configuracao);
}

function obterOuCriarClienteId() {
    const chave = chaveLocalStorage("cliente_id");
    let id = localStorage.getItem(chave);
    if (!id) {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        localStorage.setItem(chave, id);
    }
    return id;
}

// === NOVO: CALCULADORA UNIVERSAL DE CONSUMO (BASE + EXTRAS EM GRAMAS OU UNIDADES) ===
function calcularUsoIngredienteNoCarrinho(ingredienteId) {
    let usoTotal = 0;
    carrinho.forEach(itemCart => {
        // Consumo do lanche base
        const recCart = receitasGlobais.filter(r => r.produto_id == itemCart.produtoBase.id);
        const usoRec = recCart.find(r => r.ingrediente_id == ingredienteId);
        if (usoRec) usoTotal += Number(usoRec.quantidade);
        
        // Consumo real (em gramas/unidades) dos extras
        itemCart.adicionais.forEach(extra => {
            if (extra.id == ingredienteId) {
                usoTotal += Number(extra.consumo_real || extra.quantidade); 
            }
        });
    });
    return usoTotal;
}

// Mostra placeholders "pulsando" no lugar dos cards enquanto o cardápio
// ainda não chegou do banco — melhor que a tela ficar vazia/parada.
function mostrarSkeletonCardapio() {
    const lista = document.getElementById("lista-produtos");
    if (!lista) return;
    const cardSkeleton = `
        <div class="skeleton-card">
            <div class="skeleton-imagem"></div>
            <div class="skeleton-info">
                <div class="skeleton-linha curta"></div>
                <div class="skeleton-linha"></div>
                <div class="skeleton-linha curta"></div>
            </div>
        </div>
    `;
    lista.innerHTML = cardSkeleton.repeat(5);
}

// === 2. EXTRAÇÃO DE DADOS AO VIVO ===
async function carregarCardapioDoBanco() {
    mostrarSkeletonCardapio();
    try {
        const resposta = await fetchSupabase(`/rest/v1/cardapio_inteligente?select=*&ativo=eq.true&loja_id=eq.${lojaAtual.id}&order=ordem.asc,id.asc`);
        if (!resposta.ok) throw new Error(`Erro na API: HTTP ${resposta.status}`);
        const dados = await resposta.json();

        cardapio = dados.map(item => ({
            id: item.id,
            categoria: item.categoria,
            nome: item.nome,
            descricao: item.descricao,
            preco: parseFloat(item.preco),
            imagem: item.imagem,
            tem_estoque: item.tem_estoque, 
            estoque_maximo: item.estoque_maximo,
            adicionais: [] 
        }));// (Isso vai dentro da sua função que carrega os produtos no cliente, 
        // logo após receber o json do banco e antes de renderizar os lanches)
        
        // --- A MÁGICA DAS CATEGORIAS NO CLIENTE ---
            const menuCategorias = document.getElementById("menu-categorias-dinamico");
            if(menuCategorias) {
                // Pega as categorias únicas do banco
                const categoriasUnicas = [...new Set(dados.map(p => p.categoria).filter(c => c))];
                
                // Refaz o menu sempre com o botão "Todos" primeiro
                menuCategorias.innerHTML = `<button class="btn-categoria ativo" onclick="filtrarCategoria('Todos', this)">Todos</button>`;
                
                // Cria um botão para cada categoria que existir no banco
                categoriasUnicas.forEach(cat => {
                    menuCategorias.innerHTML += `<button class="btn-categoria" onclick="filtrarCategoria('${cat}', this)">${escaparHtml(cat)}</button>`;
                });
            }
            // ------------------------------------------
        const resRec = await fetchSupabase(`/rest/v1/receita_produto?select=*&loja_id=eq.${lojaAtual.id}`);
        receitasGlobais = await resRec.json();

        renderizarCardapio();
    } catch (erro) {
        console.error("Falha na extração dos dados:", erro);
        const lista = document.getElementById("lista-produtos");
        if (lista) lista.innerHTML = `<p style="color: #aaa; text-align: center; padding: 30px 10px; grid-column: 1 / -1;">Não foi possível carregar o cardápio agora. Tenta recarregar a página.</p>`;
    }
}

// === 3. RENDERIZAÇÃO DO LAYOUT ===
function renderizarCardapio(categoriaFiltro = "Todos") {
    const lista = document.getElementById("lista-produtos"); 
    if(!lista) return;
    let htmlAcumulado = ""; 

    cardapio.forEach(produto => {
        if (categoriaFiltro === "Todos" || produto.categoria === categoriaFiltro) {
            
            const qtdNoCarrinho = carrinho.filter(item => item.produtoBase.id == produto.id).length;
            const isEsgotado = (produto.tem_estoque === false) || (qtdNoCarrinho >= produto.estoque_maximo); 
            
            const classeCard = isEsgotado ? "produto-card esgotado" : "produto-card";
            const eventoClique = isEsgotado ? "" : `onclick="abrirModalProduto(${produto.id})"`;
            const badgeEsgotado = isEsgotado ? `<div class="selo-esgotado">Esgotado</div>` : "";

            const imgSegura = (produto.imagem && produto.imagem !== "null") ? `background-image: url('${produto.imagem}');` : `background-color: #2a2a2a;`;

            htmlAcumulado += `
                <div class="${classeCard}" ${eventoClique}>
                    <div class="produto-imagem" style="${imgSegura}">
                        ${badgeEsgotado}
                    </div>
                    <div class="produto-info">
                        <h3>${escaparHtml(produto.nome)}</h3>
                        <p>${escaparHtml(produto.descricao)}</p>
                        <span class="preco">R$ ${produto.preco.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
            `;
        }
    });

    lista.innerHTML = htmlAcumulado;
}

function filtrarCategoria(categoria, elementoBotao) {
    document.querySelectorAll('.btn-categoria').forEach(btn => btn.classList.remove('ativo'));
    elementoBotao.classList.add('ativo');
    renderizarCardapio(categoria);
}

// === 4. LÓGICA DO MODAL (ESTOQUE TRAVADO DESDE A ABERTURA) ===
async function abrirModalProduto(id) {
    document.body.classList.add("modal-aberto"); 
    produtoSendoVisto = cardapio.find(p => p.id == id);
    const modal = document.getElementById("modal-produto");
    const detalhes = document.getElementById("detalhes-produto-modal");

    detalhes.innerHTML = `<p style="text-align: center; padding: 20px; color: #fff;"><i class="fa-solid fa-spinner fa-spin"></i> Checando ingredientes na cozinha...</p>`;
    modal.classList.remove("escondido");

    try {
        const resExtras = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,preco_adicional,estoque&preco_adicional=gt.0&estoque=gt.0&loja_id=eq.${lojaAtual.id}`);
        const adicionaisDoBanco = await resExtras.json();

        const resRec = await fetchSupabase(`/rest/v1/receita_produto?select=*&loja_id=eq.${lojaAtual.id}`);
        receitasGlobais = await resRec.json();

        const resIngTodos = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,estoque&loja_id=eq.${lojaAtual.id}`);
        const todosIngredientes = await resIngTodos.json();

        const receitaDesteLanche = receitasGlobais.filter(r => r.produto_id == produtoSendoVisto.id);

        let podeMontarBase = true;
        let ingredienteFaltanteBase = "";

        // 1. DÁ PRA MONTAR O LANCHE BASE?
        for (let itemRec of receitaDesteLanche) {
            const ingDb = todosIngredientes.find(i => i.id == itemRec.ingrediente_id);
            if (ingDb) {
                const presa = calcularUsoIngredienteNoCarrinho(ingDb.id);
                const livre = Number(ingDb.estoque) - presa;
                if (Number(itemRec.quantidade) > livre) {
                    podeMontarBase = false;
                    ingredienteFaltanteBase = ingDb.nome;
                    break;
                }
            }
        }

        // 2. MONTAGEM DOS ADICIONAIS
        let htmlAdicionais = "";
        if (podeMontarBase && adicionaisDoBanco.length > 0 && produtoSendoVisto.categoria !== "Bebidas" && lojaAberta) {
            htmlAdicionais += `<div class="adicionais-lista" style="margin-top:15px; border-top: 1px solid #333; padding-top: 15px;">
                <h4 style="margin-bottom: 10px; color: #fff;">Turbine seu lanche:</h4>`;
            
            adicionaisDoBanco.forEach(add => {
                const qtdPresaNoCarrinho = calcularUsoIngredienteNoCarrinho(add.id);
                
                let consumoBaseDoIngrediente = 1;
                let consumidoPelaBaseAtual = 0;
                
                // Se o extra faz parte da receita (ex: Bacon), sabemos exatamente o peso dele
                const usoNeste = receitaDesteLanche.find(r => r.ingrediente_id == add.id);
                if (usoNeste) {
                    consumoBaseDoIngrediente = Number(usoNeste.quantidade);
                    consumidoPelaBaseAtual = Number(usoNeste.quantidade);
                }

                const estoqueRealDisponivel = Number(add.estoque) - qtdPresaNoCarrinho - consumidoPelaBaseAtual;
                
                // Só mostra se der para servir pelo menos 1 porção real desse extra
                if(estoqueRealDisponivel >= consumoBaseDoIngrediente) { 
                    htmlAdicionais += `
                        <div class="adicional-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 12px; background: #222; border-radius: 8px; border: 1px solid #333;">
                            <span style="color: #fff; font-weight: 500;">${escaparHtml(add.nome)} <br><small style="color: #aaa;">+ R$ ${Number(add.preco_adicional).toFixed(2).replace('.', ',')}</small></span>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <button type="button" onclick="alterarQtdAdicional('${add.id}', -1)" style="width: 32px; height: 32px; border-radius: 6px; background: #444; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px;">-</button>
                                <span class="qtd-adicional-span" id="qtd-add-${add.id}" data-id="${add.id}" data-nome="${escaparHtml(add.nome)}" data-preco="${add.preco_adicional}" style="font-weight: bold; color: #fff; width: 15px; text-align: center; font-size: 16px;">0</span>
                                <button type="button" onclick="alterarQtdAdicional('${add.id}', 1)" style="width: 32px; height: 32px; border-radius: 6px; background: var(--laranja-fogo, #ff5e00); color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px;">+</button>
                            </div>
                        </div>
                    `;
                }
            });
            htmlAdicionais += `</div>`;
        }

        let controleQtdHtml = "";
        let btnAdicionarHtml = "";
        let observacaoHtml = "";

        if (!lojaAberta) {
            btnAdicionarHtml = `
                <div style="background: #333; color: #aaa; text-align: center; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #444;">
                    <i class="fa-solid fa-lock" style="font-size: 20px; margin-bottom: 5px; color: #ff4757;"></i><br>
                    <strong>Loja Fechada no Momento</strong><br><span style="font-size: 13px;">${mensagemFechado}</span>
                </div>
            `;
        } else if (!podeMontarBase) {
            btnAdicionarHtml = `
                <div style="background: #333; color: #ff4757; text-align: center; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #444;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 20px; margin-bottom: 5px;"></i><br>
                    <strong>Estoque Insuficiente</strong><br><span style="font-size: 13px;">Falta ${escaparHtml(ingredienteFaltanteBase)} para finalizar a montagem.</span>
                </div>
            `;
        } else {
            observacaoHtml = `
                <div style="margin-top: 15px;">
                    <label style="color: #fff; font-weight: bold; font-size: 14px; display: block; margin-bottom: 8px;">Alguma observação?</label>
                    <textarea id="observacao-item" placeholder="Ex: sem cebola, sem tomate, caprichar no molho..." maxlength="200" style="width: 100%; min-height: 60px; padding: 12px; background: #222; border: 1px solid #333; border-radius: 8px; color: #fff; font-family: inherit; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
                </div>
            `;
            controleQtdHtml = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding: 15px; background: #222; border-radius: 8px;">
                    <span style="color: #fff; font-weight: bold; font-size: 16px;">Quantidade:</span>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <button type="button" onclick="alterarQtdBase(-1)" style="width: 40px; height: 40px; border-radius: 8px; background: #444; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 20px;">-</button>
                        <span id="qtd-produto-base" style="font-weight: bold; color: #fff; font-size: 18px;">1</span>
                        <button type="button" onclick="alterarQtdBase(1)" style="width: 40px; height: 40px; border-radius: 8px; background: var(--laranja-fogo, #ff5e00); color: white; border: none; font-weight: bold; cursor: pointer; font-size: 20px;">+</button>
                    </div>
                </div>
            `;
            btnAdicionarHtml = `<button class="btn-add-carrinho" onclick="confirmarAdicao()" style="width: 100%; padding: 15px; background: #2ed573; color: #000; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 15px; cursor: pointer;"><i class="fa-solid fa-plus"></i> Adicionar ao Pedido</button>`;
        }

        const imgModalSegura = (produtoSendoVisto.imagem && produtoSendoVisto.imagem !== "null") ? `background-image: url('${produtoSendoVisto.imagem}');` : `background-color: #2a2a2a;`;

        detalhes.innerHTML = `
            <div class="produto-imagem" style="${imgModalSegura} height: 200px; background-size: cover; background-position: center; border-radius: 10px; margin-bottom: 15px; width: 100%;"></div>
            <h2 style="color: #fff; font-size: 22px;">${escaparHtml(produtoSendoVisto.nome)}</h2>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 10px;">${escaparHtml(produtoSendoVisto.descricao)}</p>
            <h3 style="color: var(--laranja-fogo, #ff5e00); font-size: 22px;">R$ ${produtoSendoVisto.preco.toFixed(2).replace('.', ',')}</h3>
            ${htmlAdicionais}
            ${observacaoHtml}
            ${controleQtdHtml}
            ${btnAdicionarHtml}
        `;

    } catch (erro) {
        detalhes.innerHTML = `<p style="color: red;">Erro ao carregar os dados. Tente novamente.</p>`;
    }
}

// === VERIFICAÇÃO EM MILISSEGUNDOS AO CLICAR NO "+" DO LANCHE ===
async function alterarQtdBase(delta) {
    if(!lojaAberta) return;
    const span = document.getElementById("qtd-produto-base");
    let qtdAtual = parseInt(span.innerText);

    if (delta < 0) {
        if (qtdAtual > 1) span.innerText = qtdAtual - 1;
        return;
    }

    const btn = span.nextElementSibling;
    const textoBotaoOrig = btn.innerHTML;
    btn.innerHTML = "...";
    btn.disabled = true;

    try {
        const resIng = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,estoque&loja_id=eq.${lojaAtual.id}`);
        const ingredientesLive = await resIng.json();
        const receitaDesteLanche = receitasGlobais.filter(r => r.produto_id == produtoSendoVisto.id);

        let temEstoqueSuficiente = true;
        let limitePossivel = Infinity;

        // 1. Checa todos os ingredientes da BASE do lanche
        for (let itemReceita of receitaDesteLanche) {
            const ingDb = ingredientesLive.find(i => i.id == itemReceita.ingrediente_id);
            if (ingDb) {
                const estoqueTotalDB = Number(ingDb.estoque);
                const qtdPresa = calcularUsoIngredienteNoCarrinho(ingDb.id);

                let extraNesteModalCliques = 0; 
                const spanAdicional = document.getElementById(`qtd-add-${ingDb.id}`);
                if (spanAdicional) extraNesteModalCliques = parseInt(spanAdicional.innerText);

                const consumoBaseIngrediente = Number(itemReceita.quantidade);
                
                // Ex: Se o lanche usa 500g, e o cara marcou +2 Extras, ele consome 500 + 1000 = 1500g POR lanche
                const consumoTotalPorLanche = consumoBaseIngrediente + (extraNesteModalCliques * consumoBaseIngrediente);

                const estoqueLivre = estoqueTotalDB - qtdPresa;
                const consumoFuturoTotal = consumoTotalPorLanche * (qtdAtual + 1);

                if (consumoFuturoTotal > estoqueLivre) {
                    temEstoqueSuficiente = false;
                    const maxDesteIngrediente = Math.floor(estoqueLivre / consumoTotalPorLanche);
                    if(maxDesteIngrediente < limitePossivel) {
                        limitePossivel = maxDesteIngrediente;
                    }
                }
            }
        }

        // 2. Checa EXTRAS marcados que não fazem parte da receita base (Ex: Abacaxi num lanche normal)
        const spansQtd = document.querySelectorAll(".qtd-adicional-span");
        for (const spanAdd of spansQtd) {
            const qtdCliques = parseInt(spanAdd.innerText);
            if (qtdCliques > 0) {
                const idAdd = spanAdd.getAttribute("data-id");
                
                if (!receitaDesteLanche.find(r => r.ingrediente_id == idAdd)) {
                    const ingDb = ingredientesLive.find(i => i.id == idAdd);
                    if(ingDb) {
                        const estoqueLivre = Number(ingDb.estoque) - calcularUsoIngredienteNoCarrinho(idAdd);
                        const consumoBaseIngrediente = 1; // Extra fora da receita conta como 1 unidade/grama
                        const consumoTotalPorLanche = qtdCliques * consumoBaseIngrediente;
                        
                        const consumoFuturoTotal = consumoTotalPorLanche * (qtdAtual + 1);

                        if (consumoFuturoTotal > estoqueLivre) {
                            temEstoqueSuficiente = false;
                            const maxDesteIngrediente = Math.floor(estoqueLivre / consumoTotalPorLanche);
                            if(maxDesteIngrediente < limitePossivel) {
                                limitePossivel = maxDesteIngrediente;
                            }
                        }
                    }
                }
            }
        }

        if (!temEstoqueSuficiente) {
            mostrarAviso(`Temos apenas ${limitePossivel} lanche(s) disponível(is) com essa configuração atual.`, "Limite Atingido!");
        } else {
            span.innerText = qtdAtual + 1;
        }

    } catch(e) {
        console.error("Erro live:", e);
    } finally {
        btn.innerHTML = textoBotaoOrig;
        btn.disabled = false;
    }
}

// === VERIFICAÇÃO EM MILISSEGUNDOS AO CLICAR NO "+" DO ADICIONAL ===
async function alterarQtdAdicional(id, delta) {
    if(!lojaAberta) return;
    const span = document.getElementById(`qtd-add-${id}`);
    let qtdAtual = parseInt(span.innerText);

    if (delta < 0) {
        if (qtdAtual > 0) span.innerText = qtdAtual - 1;
        return;
    }

    const btn = span.nextElementSibling;
    const textoBotaoOrig = btn.innerHTML;
    btn.innerHTML = "...";
    btn.disabled = true;

    try {
        const resIng = await fetchSupabase(`/rest/v1/ingredientes?select=nome,estoque&id=eq.${id}&loja_id=eq.${lojaAtual.id}`);
        const dadosIng = await resIng.json();

        if (dadosIng && dadosIng.length > 0) {
            const estoqueLive = Number(dadosIng[0].estoque);

            let consumoDaPorcaoExtra = 1;
            let consumidoPelaBaseAtualUnitaria = 0;
            const usoNeste = receitasGlobais.find(r => r.produto_id == produtoSendoVisto.id && r.ingrediente_id == id);
            
            // O Segredo: O peso do extra é o mesmo peso da receita!
            if (usoNeste) {
                consumoDaPorcaoExtra = Number(usoNeste.quantidade);
                consumidoPelaBaseAtualUnitaria = Number(usoNeste.quantidade);
            }

            const spanQtdBase = document.getElementById("qtd-produto-base");
            const qtdBase = spanQtdBase ? parseInt(spanQtdBase.innerText) : 1;
            const qtdPresaCarrinho = calcularUsoIngredienteNoCarrinho(id);

            const consumoBaseNaTela = consumidoPelaBaseAtualUnitaria * qtdBase;
            const estoqueLivreTotal = estoqueLive - qtdPresaCarrinho - consumoBaseNaTela;
            
            const consumoExtraJaSelecionado = qtdAtual * consumoDaPorcaoExtra * qtdBase;
            const quantidadeParaAdicionarNesteClique = 1 * consumoDaPorcaoExtra * qtdBase; 
            
            const estoqueLivreParaClique = estoqueLivreTotal - consumoExtraJaSelecionado;

            if (quantidadeParaAdicionarNesteClique > estoqueLivreParaClique) {
                const porcoesDisponiveis = Math.floor(estoqueLivreTotal / (consumoDaPorcaoExtra * qtdBase));
                mostrarAviso(`Temos apenas ${porcoesDisponiveis} porção(ões) de ${dadosIng[0].nome} disponível(is) para adicionar.`, "Limite Atingido!");
            } else {
                span.innerText = qtdAtual + 1;
            }
        }
    } catch (e) {
        console.error("Falha ao consultar adicional:", e);
    } finally {
        btn.innerHTML = textoBotaoOrig;
        btn.disabled = false;
    }
}

// === CONFIRMAÇÃO E ENVIO PRO CARRINHO (O VERDADEIRO DUPLO-CHECK) ===
async function confirmarAdicao() {
    const spanQtdBase = document.getElementById("qtd-produto-base");
    const qtdBaseEscolhida = spanQtdBase ? parseInt(spanQtdBase.innerText) : 1;

    const btnConfirmar = document.querySelector(".btn-add-carrinho");
    if(btnConfirmar) {
        btnConfirmar.innerHTML = "Validando Estoque...";
        btnConfirmar.disabled = true;
    }

    try {
        const resIng = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,estoque&loja_id=eq.${lojaAtual.id}`);
        const ingredientesLive = await resIng.json();

        const receitaDesteLanche = receitasGlobais.filter(r => r.produto_id == produtoSendoVisto.id);
        let necessitaIngredientes = {};
        
        // 1. Soma consumos da Base
        receitaDesteLanche.forEach(r => {
            if(!necessitaIngredientes[r.ingrediente_id]) necessitaIngredientes[r.ingrediente_id] = 0;
            necessitaIngredientes[r.ingrediente_id] += Number(r.quantidade) * qtdBaseEscolhida;
        });

        // 2. Soma consumos PESADOS dos extras
        const adicionaisEscolhidos = [];
        let totalAdicionais = 0;
        const spansQtd = document.querySelectorAll(".qtd-adicional-span");
        
        for (const span of spansQtd) {
            const qtdCliques = parseInt(span.innerText);
            if (qtdCliques > 0) { 
                const idAdd = span.getAttribute("data-id");
                const nomeAdd = span.getAttribute("data-nome");
                const precoAdd = parseFloat(span.getAttribute("data-preco"));

                let pesoDaPorcao = 1;
                const rBase = receitaDesteLanche.find(r => r.ingrediente_id == idAdd);
                if(rBase) pesoDaPorcao = Number(rBase.quantidade);

                // O consumo real considera os gramas (pesoDaPorcao) e não apenas o "clique"
                const consumoRealExtraPorLanche = qtdCliques * pesoDaPorcao;

                if(!necessitaIngredientes[idAdd]) necessitaIngredientes[idAdd] = 0;
                necessitaIngredientes[idAdd] += consumoRealExtraPorLanche * qtdBaseEscolhida;

                adicionaisEscolhidos.push({ 
                    id: idAdd, 
                    nome: nomeAdd, 
                    preco: precoAdd, 
                    quantidade: qtdCliques, // Fica guardado pro WhatsApp mostrar bonito
                    consumo_real: consumoRealExtraPorLanche // Fica guardado pro banco de dados descontar o grama
                });
                totalAdicionais += (precoAdd * qtdCliques);
            }
        }

        // 3. Checagem final cruzada com o Carrinho real
        for (let ingId in necessitaIngredientes) {
            const ingDb = ingredientesLive.find(i => i.id == ingId);
            if (ingDb) {
                const qtdPresa = calcularUsoIngredienteNoCarrinho(ingId);
                const estoqueLivre = Number(ingDb.estoque) - qtdPresa;
                
                if (necessitaIngredientes[ingId] > estoqueLivre) {
                    mostrarAviso(`Alguém acabou de pedir e faltou "${ingDb.nome}" na cozinha.`, "Estoque Esgotado");
                    if(btnConfirmar) { btnConfirmar.innerHTML = `<i class="fa-solid fa-plus"></i> Adicionar ao Pedido`; btnConfirmar.disabled = false; }
                    return; 
                }
            }
        }

        // TUDO CERTO! Envia pro carrinho
        const campoObservacao = document.getElementById("observacao-item");
        const observacao = campoObservacao ? campoObservacao.value.trim().substring(0, 200) : "";

        for (let i = 0; i < qtdBaseEscolhida; i++) {
            const itemParaCarrinho = {
                produtoBase: produtoSendoVisto,
                adicionais: JSON.parse(JSON.stringify(adicionaisEscolhidos)),
                precoTotalItem: produtoSendoVisto.preco + totalAdicionais,
                observacao: observacao
            };
            carrinho.push(itemParaCarrinho);
        }

        atualizarContadorCart();
        renderizarCardapio(); 
        fecharModal();
        
    } catch(e) {
        console.error("Erro na verificação dupla", e);
    } finally {
        if(btnConfirmar) { btnConfirmar.innerHTML = `<i class="fa-solid fa-plus"></i> Adicionar ao Pedido`; btnConfirmar.disabled = false; }
    }
}

// === LÓGICA DO CARRINHO, CHECKOUT E WHATSAPP ===
function atualizarContadorCart() {
    const qtdItens = carrinho.length;
    const barraSacola = document.getElementById("barra-sacola");
    const telaCheckout = document.getElementById("tela-checkout");
    
    const estaNoCheckout = telaCheckout && !telaCheckout.classList.contains("escondido");
    
    if (qtdItens > 0 && !estaNoCheckout) {
        barraSacola.classList.remove("escondido");
        document.getElementById("contador-sacola").innerText = qtdItens;
        const somaTotal = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
        document.getElementById("total-sacola").innerText = `R$ ${somaTotal.toFixed(2).replace('.', ',')}`;
    } else {
        barraSacola.classList.add("escondido");
    }
}

let tipoEntregaSelecionado = "entrega";
let cupomAplicado = null; // { codigo, valorDesconto } ou null — validado no servidor, nunca calculado só no cliente

function obterDescontoCupomAtual() {
    return cupomAplicado ? cupomAplicado.valorDesconto : 0;
}

// Usado em todo lugar que precisa do total (checkout, PIX, WhatsApp) pra
// nunca esquecer de somar a taxa de entrega em algum deles.
function obterTaxaEntregaAtual() {
    return (tipoEntregaSelecionado === "entrega") ? (Number(configLoja.taxa_entrega) || 0) : 0;
}

function selecionarTipoEntrega(tipo) {
    tipoEntregaSelecionado = tipo;
    const btnEntrega = document.getElementById("btn-tipo-entrega");
    const btnRetirada = document.getElementById("btn-tipo-retirada");
    const camposEndereco = document.getElementById("campos-endereco-entrega");
    if (!btnEntrega || !btnRetirada || !camposEndereco) return;

    if (tipo === "entrega") {
        btnEntrega.style.background = "var(--laranja-fogo, #ff5e00)";
        btnEntrega.style.borderColor = "var(--laranja-fogo, #ff5e00)";
        btnRetirada.style.background = "transparent";
        btnRetirada.style.borderColor = "#333";
        camposEndereco.style.display = "block";
    } else {
        btnRetirada.style.background = "var(--laranja-fogo, #ff5e00)";
        btnRetirada.style.borderColor = "var(--laranja-fogo, #ff5e00)";
        btnEntrega.style.background = "transparent";
        btnEntrega.style.borderColor = "#333";
        camposEndereco.style.display = "none";
    }
    atualizarPrevisaoCliente();
    renderizarCheckout();
}

let previsaoClienteAtualizacao = 0;

async function obterPrevisaoCliente(tipo) {
    const ehRetirada = tipo === "retirada";
    const campoModo = ehRetirada ? "tempo_retirada_modo" : "tempo_entrega_modo";
    const campoFixo = ehRetirada ? "tempo_retirada_fixo" : "tempo_entrega_fixo";
    const tempoFixo = Number(configLoja[campoFixo]) || (ehRetirada ? 30 : 50);

    if (configLoja[campoModo] !== "dinamico") return `Em ate ${tempoFixo} minutos`;

    try {
        const resposta = await fetchSupabase(`/rest/v1/rpc/obter_previsao_pedido`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_loja_id: lojaAtual.id, p_tipo_entrega: tipo })
        });
        if (resposta.ok) {
            const previsao = await resposta.json();
            if (typeof previsao === "string" && previsao.trim()) return previsao;
        }
    } catch (erro) {
        console.warn("Previsao dinamica indisponivel; usando tempo fixo.");
    }
    return `Em ate ${tempoFixo} minutos`;
}

async function atualizarPrevisaoCliente() {
    const elemento = document.getElementById("previsao-cliente");
    if (!elemento || !lojaAtual) return;
    const atualizacao = ++previsaoClienteAtualizacao;
    elemento.style.display = "inline-flex";
    elemento.innerHTML = '<i class="fa-solid fa-clock"></i><span>Calculando...</span>';
    const previsao = await obterPrevisaoCliente(tipoEntregaSelecionado);
    if (atualizacao !== previsaoClienteAtualizacao) return;
    elemento.innerHTML = `<i class="fa-solid fa-clock"></i><span>Tempo estimado <strong>${escaparHtml(previsao)}</strong></span>`;
}

function abrirCheckout() {
    if (carrinho.length === 0) { mostrarAviso("Adicione algo delicioso antes de finalizar.", "Carrinho Vazio"); return; }
    navegarPara('checkout');
    selecionarTipoEntrega('entrega');
    carregarPerfilNaTela();
    preencherCheckoutComPerfil();
    verificarTroco();
}

function renderizarCheckout() {
    const divItens = document.getElementById("itens-checkout");
    divItens.innerHTML = "";
    let somaTotal = 0;

    // Agrupa itens IDÊNTICOS (mesmo produto, mesmos adicionais, mesma
    // observação) numa linha só com quantidade — "1x Coca" + "1x Coca" vira
    // "2x Coca". Item com observação diferente (ex: "sem tomate") não se
    // mistura com um igual sem observação, fica em linhas separadas.
    const grupos = [];
    carrinho.forEach((item, index) => {
        const chave = JSON.stringify({
            id: item.produtoBase.id,
            adicionais: item.adicionais.map(a => ({ id: a.id, quantidade: a.quantidade })),
            observacao: item.observacao || ''
        });
        const existente = grupos.find(g => g.chave === chave);
        if (existente) {
            existente.indices.push(index);
        } else {
            grupos.push({ chave, item, indices: [index] });
        }
    });

    grupos.forEach(grupo => {
        const item = grupo.item;
        const qtd = grupo.indices.length;
        const primeiroIndice = grupo.indices[0];
        somaTotal += item.precoTotalItem * qtd;

        let listaAddsHtml = "";
        if (item.adicionais.length > 0) {
            listaAddsHtml = "<ul style='color: #aaa; font-size: 13px; margin-top: 5px; list-style: none;'>";
            item.adicionais.forEach(add => {
                const subtotalAdd = add.preco * add.quantidade;
                listaAddsHtml += `<li>+ ${add.quantidade}x ${escaparHtml(add.nome)} (R$ ${subtotalAdd.toFixed(2).replace('.', ',')})</li>`;
            });
            listaAddsHtml += "</ul>";
        }

        let obsHtml = "";
        if (item.observacao) {
            obsHtml = `<div style="color: #ffa502; font-size: 13px; margin-top: 6px;"><i class="fa-solid fa-pen"></i> Obs: ${escaparHtml(item.observacao)}</div>`;
        }

        divItens.innerHTML += `
            <div style="background: #222; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #333;">
                <div>
                    <strong>${qtd}x ${escaparHtml(item.produtoBase.nome)} <span style="color: #aaa; font-size: 13px;">(R$ ${item.produtoBase.preco.toFixed(2).replace('.', ',')})</span></strong>
                    ${listaAddsHtml}
                    ${obsHtml}
                    <div style="color: var(--laranja-fogo, #ff5e00); margin-top: 5px; font-weight: bold; font-size: 15px;">
                        Subtotal: R$ ${(item.precoTotalItem * qtd).toFixed(2).replace('.', ',')}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <button onclick="removerDoCarrinho(${primeiroIndice})" style="background: transparent; color: #ff4757; border: none; font-size: 16px; cursor: pointer; padding: 4px;"><i class="fa-solid fa-minus"></i></button>
                    <span style="color:#fff; font-weight:bold; min-width:14px; text-align:center;">${qtd}</span>
                    <button onclick="duplicarItemCarrinho(${primeiroIndice})" style="background: transparent; color: #2ed573; border: none; font-size: 16px; cursor: pointer; padding: 4px;"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>
        `;
    });

    divItens.innerHTML += `
        <button onclick="navegarPara('inicio')" style="width: 100%; background: transparent; color: var(--laranja-fogo, #ff5e00); border: 2px dashed var(--laranja-fogo, #ff5e00); padding: 15px; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; cursor: pointer; transition: 0.3s;">
            <i class="fa-solid fa-plus"></i> Adicionar mais lanches
        </button>
    `;

    atualizarAvisoProgressoCupom(somaTotal);

    const descontoAtual = obterDescontoCupomAtual();
    if (descontoAtual > 0) {
        somaTotal -= descontoAtual;
        divItens.innerHTML += `
            <div style="display: flex; justify-content: space-between; color: #2ed573; font-size: 14px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #333;">
                <span><i class="fa-solid fa-tag"></i> Cupom ${escaparHtml(cupomAplicado.codigo)}</span>
                <span>-R$ ${descontoAtual.toFixed(2).replace('.', ',')}</span>
            </div>
        `;
    }

    const taxaEntregaCheckout = obterTaxaEntregaAtual();
    if (taxaEntregaCheckout > 0) {
        somaTotal += taxaEntregaCheckout;
        divItens.innerHTML += `
            <div style="display: flex; justify-content: space-between; color: #aaa; font-size: 14px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #333;">
                <span><i class="fa-solid fa-motorcycle"></i> Taxa de entrega</span>
                <span>R$ ${taxaEntregaCheckout.toFixed(2).replace('.', ',')}</span>
            </div>
        `;
    }

    document.getElementById("valor-total").innerText = `R$ ${somaTotal.toFixed(2).replace('.', ',')}`;

    // "De R$X por R$Y" — deixa visível o quanto o cupom realmente economizou.
    const elOriginal = document.getElementById("total-original-riscado");
    const elEconomia = document.getElementById("linha-economia");
    if (descontoAtual > 0) {
        elOriginal.innerText = `R$ ${(somaTotal + descontoAtual).toFixed(2).replace('.', ',')}`;
        elOriginal.style.display = "block";
        elEconomia.innerHTML = `<i class="fa-solid fa-circle-check"></i> Você economizou R$ ${descontoAtual.toFixed(2).replace('.', ',')}`;
        elEconomia.style.display = "block";
    } else {
        elOriginal.style.display = "none";
        elEconomia.style.display = "none";
    }

    verificarTroco();
}

function removerDoCarrinho(index) {
    carrinho.splice(index, 1);
    atualizarContadorCart();
    renderizarCardapio();

    // O carrinho mudou, então o desconto calculado antes pode não valer mais
    // (um cupom de % muda de valor com o subtotal) — pede pra reaplicar.
    removerCupom();

    if (carrinho.length === 0) navegarPara('inicio');
    else renderizarCheckout();
}

// Adiciona mais uma unidade idêntica a um item já no carrinho (mesmos
// adicionais e observação) — usado pelo "+" da linha agrupada no checkout.
function duplicarItemCarrinho(index) {
    const original = carrinho[index];
    if (!original) return;

    carrinho.push(JSON.parse(JSON.stringify(original)));
    atualizarContadorCart();
    renderizarCardapio();
    removerCupom();
    renderizarCheckout();
}

async function aplicarCupom() {
    const input = document.getElementById("cupom-codigo-cliente");
    const codigo = input.value.trim();
    const erroEl = document.getElementById("cupom-feedback-erro");
    const btn = document.getElementById("btn-aplicar-cupom");
    erroEl.style.display = "none";

    if (!codigo) return;

    const subtotal = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
    if (subtotal <= 0) return;

    const textoOriginal = btn.innerText;
    btn.innerText = "...";
    btn.disabled = true;

    try {
        const resposta = await fetchSupabase(`/rest/v1/rpc/validar_cupom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_loja_id: lojaAtual.id, p_codigo: codigo, p_subtotal: subtotal, p_cliente_id: obterOuCriarClienteId() })
        });
        const resultado = await resposta.json();
        const dados = Array.isArray(resultado) ? resultado[0] : resultado;

        if (!dados || !dados.valido) {
            erroEl.innerText = (dados && dados.motivo) ? dados.motivo : "Não foi possível validar o cupom.";
            erroEl.style.display = "block";
            cupomAplicado = null;
            return;
        }

        cupomAplicado = { codigo: codigo.toUpperCase(), valorDesconto: Number(dados.valor_desconto) };
        document.getElementById("texto-codigo-cupom-aplicado").innerText = cupomAplicado.codigo;
        document.getElementById("texto-desconto-cupom-aplicado").innerText = `-R$ ${cupomAplicado.valorDesconto.toFixed(2).replace('.', ',')} aplicado`;
        document.getElementById("linha-cupom-aplicado").style.display = "flex";
        document.getElementById("linha-cupom-input").style.display = "none";
        renderizarCheckout();
    } catch (erro) {
        erroEl.innerText = "Erro ao validar o cupom. Tenta de novo.";
        erroEl.style.display = "block";
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
    atualizarPrevisaoCliente();
}

function removerCupom() {
    cupomAplicado = null;
    const elAplicado = document.getElementById("linha-cupom-aplicado");
    const elInput = document.getElementById("linha-cupom-input");
    const elErro = document.getElementById("cupom-feedback-erro");
    if (elAplicado) elAplicado.style.display = "none";
    if (elInput) elInput.style.display = "flex";
    if (elErro) elErro.style.display = "none";

    // Sem isso, o total (e o Pix já copiado) continuava mostrando o valor
    // com desconto mesmo depois de remover o cupom.
    if (document.getElementById("valor-total")) renderizarCheckout();
}

// ==========================================
// VITRINE DE PROMOÇÕES (cupons marcados como públicos pela loja)
// ==========================================
let cuponsPublicosCache = [];

async function carregarCuponsPublicos() {
    try {
        const resposta = await fetchSupabase(`/rest/v1/rpc/listar_cupons_publicos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_loja_id: lojaAtual.id, p_cliente_id: obterOuCriarClienteId() })
        });
        cuponsPublicosCache = resposta.ok ? await resposta.json() : [];
    } catch (erro) {
        cuponsPublicosCache = [];
    }

    const link = document.getElementById("link-ver-promocoes");
    if (link) link.style.display = cuponsPublicosCache.length > 0 ? "block" : "none";

    // Badge no menu inferior — chama atenção pra quantos cupons dá pra usar agora.
    const badge = document.getElementById("badge-cupons-disponiveis");
    if (badge) {
        if (cuponsPublicosCache.length > 0) {
            badge.innerText = cuponsPublicosCache.length;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    }
}

// Tela "Meus Cupons" (aba do menu inferior) — mostra os cupons que esse
// cliente pode usar agora, e embaixo o histórico dos que ele já usou.
async function carregarTelaCupons() {
    document.getElementById("cupons-total-disponiveis").innerText = cuponsPublicosCache.length;

    const listaDisponiveis = document.getElementById("lista-cupons-disponiveis");
    if (cuponsPublicosCache.length === 0) {
        listaDisponiveis.innerHTML = `<p style="color:#aaa; text-align:center; padding:16px;">Nenhum cupom disponível pra você no momento.</p>`;
    } else {
        listaDisponiveis.innerHTML = cuponsPublicosCache.map(c => {
            let descricao = c.tipo_desconto === 'percentual'
                ? `${Number(c.valor_desconto)}% de desconto${c.desconto_maximo_por_pedido ? ` (até R$ ${Number(c.desconto_maximo_por_pedido).toFixed(2).replace('.', ',')})` : ''}`
                : `R$ ${Number(c.valor_desconto).toFixed(2).replace('.', ',')} de desconto`;
            if (c.valor_minimo_pedido) {
                descricao += ` · a partir de R$ ${Number(c.valor_minimo_pedido).toFixed(2).replace('.', ',')}`;
            }
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#1e1e1e; border:1px solid #333; border-radius:10px; padding:14px; margin-bottom:10px;">
                    <div>
                        <strong style="font-family: monospace; color: #fff; font-size:15px;">${escaparHtml(c.codigo)}</strong>
                        <div style="color:#aaa; font-size:12.5px; margin-top:2px;">${descricao}</div>
                    </div>
                    <button type="button" onclick="usarCupomDaTelaCupons('${escaparHtml(c.codigo)}')" style="background: var(--laranja-fogo, #ff5e00); color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer; flex-shrink:0;">Usar</button>
                </div>
            `;
        }).join('');
    }

    const listaUsados = document.getElementById("lista-cupons-usados");
    listaUsados.innerHTML = `<p style="color:#666; text-align:center; padding:10px; font-size:13px;">Carregando...</p>`;
    try {
        const resposta = await fetchSupabase(`/rest/v1/rpc/listar_meus_cupons_usados`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_loja_id: lojaAtual.id, p_cliente_id: obterOuCriarClienteId() })
        });
        const usados = resposta.ok ? await resposta.json() : [];

        if (usados.length === 0) {
            listaUsados.innerHTML = `<p style="color:#666; text-align:center; padding:10px; font-size:13px;">Você ainda não usou nenhum cupom.</p>`;
        } else {
            listaUsados.innerHTML = usados.map(c => {
                const descricao = c.tipo_desconto === 'percentual'
                    ? `${Number(c.valor_desconto)}% de desconto`
                    : `R$ ${Number(c.valor_desconto).toFixed(2).replace('.', ',')} de desconto`;
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:10px; padding:12px 14px; margin-bottom:8px; opacity:.65;">
                        <div>
                            <strong style="font-family: monospace; color: #ccc; font-size:14px;">${escaparHtml(c.codigo)}</strong>
                            <div style="color:#777; font-size:12px; margin-top:2px;">${descricao}</div>
                        </div>
                        <div style="color:#666; font-size:11.5px;">${formatarDataHoraBr(c.usado_em, { day: '2-digit', month: '2-digit' })}</div>
                    </div>
                `;
            }).join('');
        }
    } catch (erro) {
        listaUsados.innerHTML = `<p style="color:#ff4757; text-align:center; padding:10px; font-size:13px;">Erro ao carregar cupons usados.</p>`;
    }
}

function usarCupomDaTelaCupons(codigo) {
    if (carrinho.length === 0) {
        mostrarAviso("Adiciona alguns itens ao carrinho primeiro pra usar esse cupom.", "Carrinho Vazio");
        navegarPara('inicio');
        return;
    }
    navegarPara('checkout');
    setTimeout(() => {
        const input = document.getElementById("cupom-codigo-cliente");
        if (input) input.value = codigo;
        aplicarCupom();
    }, 50);
}

function abrirVitrinePromocoes() {
    const container = document.getElementById("vitrine-promocoes");
    if (!container) return;

    if (container.style.display === "block") {
        container.style.display = "none";
        return;
    }

    if (cuponsPublicosCache.length === 0) {
        container.innerHTML = `<p style="color:#aaa; font-size:13px; margin:0;">Nenhuma promoção disponível no momento.</p>`;
    } else {
        container.innerHTML = cuponsPublicosCache.map(c => {
            let descricao = c.tipo_desconto === 'percentual'
                ? `${Number(c.valor_desconto)}% de desconto${c.desconto_maximo_por_pedido ? ` (até R$ ${Number(c.desconto_maximo_por_pedido).toFixed(2).replace('.', ',')})` : ''}`
                : `R$ ${Number(c.valor_desconto).toFixed(2).replace('.', ',')} de desconto`;
            if (c.valor_minimo_pedido) {
                descricao += ` · a partir de R$ ${Number(c.valor_minimo_pedido).toFixed(2).replace('.', ',')}`;
            }
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid #2a2a2a;">
                    <div>
                        <strong style="font-family: monospace; color: #fff;">${escaparHtml(c.codigo)}</strong>
                        <div style="color:#aaa; font-size:12.5px;">${descricao}</div>
                    </div>
                    <button type="button" onclick="usarCupomDaVitrine('${escaparHtml(c.codigo)}')" style="background: var(--laranja-fogo, #ff5e00); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">Usar</button>
                </div>
            `;
        }).join('');
    }
    container.style.display = "block";
}

// Mostra "falta R$X pra desbloquear o cupom Y" olhando sempre pro PRÓXIMO
// patamar ainda não alcançado — se o cliente já bateu o mínimo de um cupom
// menor, pula automaticamente pra sugerir o de cima (se houver).
function atualizarAvisoProgressoCupom(subtotalAtual) {
    const container = document.getElementById("aviso-progresso-cupom");
    const textoEl = document.getElementById("texto-aviso-progresso-cupom");
    if (!container || !textoEl) return;

    const candidatos = cuponsPublicosCache.filter(c =>
        c.valor_minimo_pedido && (!cupomAplicado || c.codigo !== cupomAplicado.codigo)
    );

    if (candidatos.length === 0) {
        container.style.display = "none";
        return;
    }

    const descricaoDesconto = (c) => c.tipo_desconto === 'percentual'
        ? `${Number(c.valor_desconto)}% de desconto`
        : `R$ ${Number(c.valor_desconto).toFixed(2).replace('.', ',')} de desconto`;

    const proximo = candidatos
        .filter(c => Number(c.valor_minimo_pedido) > subtotalAtual)
        .sort((a, b) => Number(a.valor_minimo_pedido) - Number(b.valor_minimo_pedido))[0];

    if (proximo) {
        const faltante = Number(proximo.valor_minimo_pedido) - subtotalAtual;
        textoEl.innerHTML = `<i class="fa-solid fa-gift"></i> Falta <strong>R$ ${faltante.toFixed(2).replace('.', ',')}</strong> pra desbloquear o cupom <strong>${escaparHtml(proximo.codigo)}</strong> (${descricaoDesconto(proximo)})!`;
        container.style.display = "block";
        return;
    }

    const melhorDisponivel = candidatos
        .filter(c => Number(c.valor_minimo_pedido) <= subtotalAtual)
        .sort((a, b) => Number(b.valor_minimo_pedido) - Number(a.valor_minimo_pedido))[0];

    if (melhorDisponivel) {
        textoEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Você já pode usar o cupom <strong>${escaparHtml(melhorDisponivel.codigo)}</strong> (${descricaoDesconto(melhorDisponivel)})!`;
        container.style.display = "block";
        return;
    }

    container.style.display = "none";
}

// ==========================================
// "TURBINAR PEDIDO" — carrossel horizontal de adição rápida, aberto pelo
// "+" no aviso de progresso do cupom.
// ==========================================
function alternarCarrosselTurbinar() {
    const carrossel = document.getElementById("carrossel-turbinar");
    if (!carrossel) return;

    if (carrossel.style.display === "block") {
        fecharCarrosselTurbinar();
        return;
    }
    renderizarCarrosselTurbinar();
    carrossel.style.display = "block";
}

function fecharCarrosselTurbinar() {
    const carrossel = document.getElementById("carrossel-turbinar");
    if (carrossel) carrossel.style.display = "none";
}

function renderizarCarrosselTurbinar() {
    const lista = document.getElementById("carrossel-turbinar-itens");
    if (!lista) return;

    const disponiveis = cardapio.filter(p => p.tem_estoque !== false).sort((a, b) => a.preco - b.preco);

    if (disponiveis.length === 0) {
        lista.innerHTML = `<p style="color:#aaa; font-size:13px; margin:0;">Nenhum item disponível agora.</p>`;
        return;
    }

    lista.innerHTML = disponiveis.map(p => `
        <div style="flex: 0 0 auto; width: 108px; background:#1a1a1a; border:1px solid #333; border-radius:10px; padding:8px; text-align:center;">
            <div style="width:100%; height:58px; border-radius:6px; background-size:cover; background-position:center; background-color:#222; ${p.imagem ? `background-image:url('${p.imagem}');` : ''} margin-bottom:6px;"></div>
            <div style="font-size:11.5px; color:#fff; font-weight:600; line-height:1.25; height:28px; overflow:hidden;">${escaparHtml(p.nome)}</div>
            <div style="font-size:12px; color:#2ed573; font-weight:700; margin:4px 0;">R$ ${p.preco.toFixed(2).replace('.', ',')}</div>
            <button type="button" onclick="adicionarProdutoRapido(${p.id})" style="width:100%; background: var(--laranja-fogo, #ff5e00); color:#fff; border:none; border-radius:6px; padding:6px; font-size:12px; font-weight:bold; cursor:pointer;">+ Add</button>
        </div>
    `).join('');
}

function adicionarProdutoRapido(produtoId) {
    const produto = cardapio.find(p => p.id === produtoId);
    if (!produto) return;

    carrinho.push({
        produtoBase: produto,
        adicionais: [],
        precoTotalItem: produto.preco,
        observacao: ""
    });

    atualizarContadorCart();
    renderizarCheckout();
}

function usarCupomDaVitrine(codigo) {
    document.getElementById("cupom-codigo-cliente").value = codigo;
    document.getElementById("vitrine-promocoes").style.display = "none";
    aplicarCupom();
}

function verificarTroco() {
    const selectPagamento = document.getElementById("forma-pagamento");
    if (!selectPagamento) return;

    const formaPagamento = selectPagamento.value;
    const campoTroco = document.getElementById("troco-dinheiro");
    
    if (campoTroco) campoTroco.style.display = (formaPagamento === "Dinheiro") ? "block" : "none";

    let areaPix = document.getElementById("area-pix-dinamica");
    
    if (formaPagamento.toUpperCase() === "PIX") {
        if (!configLoja.chave_pix || configLoja.chave_pix.trim() === "") {
            if (!areaPix) {
                areaPix = document.createElement("div");
                areaPix.id = "area-pix-dinamica";
                const elementoReferencia = campoTroco || selectPagamento;
                elementoReferencia.parentNode.insertBefore(areaPix, elementoReferencia.nextSibling);
            }
            areaPix.style.cssText = "background: #333; padding: 15px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #ffa502; text-align: center; color: #ffa502; font-weight: bold;";
            areaPix.style.display = "block";
            areaPix.innerHTML = `<p style="margin: 0; font-size: 14px;">Chave PIX indisponível. Solicite via WhatsApp ao finalizar.</p>`;
            return; 
        }

        const totalCalculado = Math.max(0, carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0) - obterDescontoCupomAtual()) + obterTaxaEntregaAtual();

        if (!areaPix) {
            areaPix = document.createElement("div");
            areaPix.id = "area-pix-dinamica";
            const elementoReferencia = campoTroco || selectPagamento;
            elementoReferencia.parentNode.insertBefore(areaPix, elementoReferencia.nextSibling);
        }

        areaPix.style.cssText = "background: #111; padding: 15px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #2ed573; text-align: center; border: 1px solid #333;";
        areaPix.style.display = "block";
        areaPix.innerHTML = `
            <p style="color: #fff; margin-bottom: 10px; font-size: 15px;"><strong>Total do PIX:</strong> <span style="color: #2ed573; font-size: 18px;">R$ ${totalCalculado.toFixed(2).replace('.', ',')}</span></p>
            <button type="button" id="btn-copiar-pix" onclick="copiarPixParaAreaDeTransferencia()" style="background: #2ed573; color: #000; border: none; padding: 12px 15px; border-radius: 5px; font-weight: bold; cursor: pointer; width: 100%; margin-bottom: 10px; font-size: 16px;"><i class="fa-regular fa-copy"></i> Copiar Código PIX</button>
            <p style="color: #aaa; font-size: 13px; margin: 0; line-height: 1.4;">Pague no app do seu banco, depois clique em Enviar Pedido.</p>
        `;
    } else {
        if (areaPix) areaPix.style.display = "none";
    }
}

function gerarPixCopiaECola(valorPix) {
    const formatarTamanho = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;
    const chaveLimpa = (configLoja.chave_pix || "").trim();
    let payload = "000201" + formatarTamanho("26", formatarTamanho("00", "br.gov.bcb.pix") + formatarTamanho("01", chaveLimpa)) + "520400005303986" + formatarTamanho("54", valorPix.toFixed(2)) + "5802BR" + formatarTamanho("59", (configLoja.nome_recebedor || "Hamburgueria").normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25)) + formatarTamanho("60", (configLoja.cidade_recebedor || "Arapoti").normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 15)) + formatarTamanho("62", formatarTamanho("05", "***")) + "6304";
    let polynomial = 0x1021; let result = 0xFFFF;
    for (let i = 0; i < payload.length; i++) { result ^= payload.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) { if ((result & 0x8000) !== 0) result = (result << 1) ^ polynomial; else result <<= 1; result &= 0xFFFF; } }
    return payload + result.toString(16).toUpperCase().padStart(4, '0');
}

function copiarPixParaAreaDeTransferencia() {
    const totalCalculado = Math.max(0, carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0) - obterDescontoCupomAtual()) + obterTaxaEntregaAtual();
    const codigoPix = gerarPixCopiaECola(totalCalculado);

    navigator.clipboard.writeText(codigoPix).then(() => {
        pixValorCopiado = totalCalculado;
        const btn = document.getElementById("btn-copiar-pix");
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Copiado! Abra seu app do banco`;
        btn.style.background = "#ffa502"; btn.style.color = "#fff";
        setTimeout(() => {
            btn.innerHTML = `<i class="fa-regular fa-copy"></i> Copiar Código PIX`;
            btn.style.background = "#2ed573"; btn.style.color = "#000";
        }, 5000);
    }).catch(err => mostrarAviso("Ocorreu um erro ao tentar copiar o código PIX.", "Erro"));
}

async function enviarParaWhatsApp() {
    if(!lojaAberta) {
        mostrarAviso("Puxa vida, a loja acabou de fechar! " + mensagemFechado, "Loja Fechada");
        return;
    }

    // ==========================================================
    // TRUQUE: DESBLOQUEIA O ÁUDIO PARA O CELULAR (Permissão Imediata)
    // ==========================================================
    const somFogo = document.getElementById("som-fogo");
    if (somFogo) {
        somFogo.volume = 0; // Coloca no mudo
        somFogo.play().then(() => {
            somFogo.pause(); // Pausa imediatamente na mesma hora
            somFogo.volume = 1; // Volta o volume ao normal
            somFogo.currentTime = 0;
        }).catch(e => console.log("Aguardando liberação de áudio..."));
    }
    // ==========================================================

    const nome = document.getElementById("nome-cliente").value;
    const rua = document.getElementById("rua-cliente").value;
    const numero = document.getElementById("numero-cliente").value;
    const bairro = document.getElementById("bairro-cliente").value;
    const complemento = document.getElementById("complemento-cliente").value;
    const pagamento = document.getElementById("forma-pagamento").value;
    const ehEntrega = tipoEntregaSelecionado === "entrega";

    if (nome === "") {
        mostrarAviso("Por favor, preencha seu nome.", "Dados Incompletos");
        return;
    }
    if (ehEntrega && (rua === "" || numero === "" || bairro === "")) {
        mostrarAviso("Por favor, preencha Rua, Número e Bairro para a entrega!", "Dados Incompletos");
        return;
    }

    // Revalida o cupom bem na hora de enviar — no tempo entre aplicar e
    // finalizar, ele pode ter esgotado ou deixado de valer.
    if (cupomAplicado) {
        const subtotalAtual = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
        try {
            const respostaCupom = await fetchSupabase(`/rest/v1/rpc/validar_cupom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ p_loja_id: lojaAtual.id, p_codigo: cupomAplicado.codigo, p_subtotal: subtotalAtual, p_cliente_id: obterOuCriarClienteId() })
            });
            const resultadoCupom = await respostaCupom.json();
            const dadosCupom = Array.isArray(resultadoCupom) ? resultadoCupom[0] : resultadoCupom;

            if (!dadosCupom || !dadosCupom.valido) {
                removerCupom();
                mostrarAviso((dadosCupom && dadosCupom.motivo) ? dadosCupom.motivo : "Esse cupom não é mais válido.", "Cupom Inválido");
                return;
            }
            cupomAplicado.valorDesconto = Number(dadosCupom.valor_desconto);
        } catch (erro) {
            removerCupom();
            mostrarAviso("Não foi possível confirmar o cupom agora. Tenta enviar de novo.", "Erro no Cupom");
            return;
        }
    }

    const enderecoFormatado = ehEntrega ? `${rua}, ${numero} - ${bairro} ${complemento ? '(' + complemento + ')' : ''}` : "";
    const taxaEntrega = obterTaxaEntregaAtual();
    const totalCalculado = Math.max(0, carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0) - obterDescontoCupomAtual()) + taxaEntrega;

    if (pagamento.toUpperCase() === "PIX" && configLoja.chave_pix && configLoja.chave_pix.trim() !== "") {
        const pixAindaValido = pixValorCopiado !== null && Math.abs(pixValorCopiado - totalCalculado) < 0.01;
        if (!pixAindaValido) {
            mostrarAviso("Copia o código PIX antes de enviar — é só clicar em \"Copiar Código PIX\" logo acima do botão de enviar.", "Falta copiar o PIX");
            return;
        }
    }

    const btnFinalizar = document.querySelector(".btn-whatsapp");
    let textoOriginalBotao = "Enviar Pedido";

    if (btnFinalizar) {
        textoOriginalBotao = btnFinalizar.innerText;
        btnFinalizar.innerText = "Salvando pedido...";
        btnFinalizar.disabled = true;
    }

    try {
        const perfilSalvo = JSON.parse(localStorage.getItem(chaveLocalStorage("perfil")) || "{}");
        const telefoneCliente = perfilSalvo.telefone ? String(perfilSalvo.telefone).replace(/\D/g, '') : "";
        const clienteId = obterOuCriarClienteId();

        const dadosPedidoCompleto = {
            p_nome_cliente: nome,
            p_forma_pagamento: pagamento,
            p_total: totalCalculado,
            p_cliente_id: clienteId,
            p_telefone_cliente: telefoneCliente,
            p_status: "Pendente",
            p_previsao_entrega: await obterPrevisaoCliente(tipoEntregaSelecionado),
            p_carrinho: carrinho,
            p_loja_id: lojaAtual.id,
            p_tipo_entrega: tipoEntregaSelecionado,
            p_endereco_entrega: ehEntrega ? enderecoFormatado : null,
            p_codigo_cupom: cupomAplicado ? cupomAplicado.codigo : null
        };

        const resSupabase = await fetchSupabase(`/rest/v1/rpc/registrar_pedido_completo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosPedidoCompleto)
        });

        if (!resSupabase.ok) {
            const erroDB = await resSupabase.json();
            if (erroDB.code === "23514" || (erroDB.message && erroDB.message.includes("trava_estoque_positivo"))) {
                let itemFalho = "algum ingrediente";
                if (erroDB.details) { const partes = erroDB.details.split(','); if (partes.length > 1) itemFalho = partes[1].trim(); }
                mostrarAviso(`O estoque de "${itemFalho}" esgotou agora mesmo! Volte e ajuste a quantidade no carrinho.`, "Estoque Esgotado");
            } else if (erroDB.message && erroDB.message.includes("CUPOM_JA_USADO")) {
                removerCupom();
                renderizarCheckout();
                mostrarAviso("Esse cupom já foi usado por você antes e só vale uma vez. Remove pra continuar sem ele.", "Cupom Já Usado");
            } else if (erroDB.message && erroDB.message.includes("CUPOM_VALOR_MINIMO_NAO_ATINGIDO")) {
                removerCupom();
                renderizarCheckout();
                mostrarAviso("O carrinho ficou abaixo do valor mínimo exigido por esse cupom. Remove ou adiciona mais itens pra continuar.", "Valor Mínimo Não Atingido");
            } else if (erroDB.message && erroDB.message.includes("CUPOM_RESTRITO_A_NOVOS_CLIENTES")) {
                removerCupom();
                renderizarCheckout();
                mostrarAviso("Esse cupom é exclusivo pra quem está começando a pedir aqui. Remove pra continuar sem ele.", "Cupom Restrito");
            } else if (erroDB.message && (erroDB.message.includes("CUPOM_INVALIDO") || erroDB.message.includes("CUPOM_ESGOTADO"))) {
                removerCupom();
                renderizarCheckout();
                mostrarAviso("Esse cupom não é mais válido (pode ter esgotado agora mesmo). Remove ou tenta outro pra continuar.", "Cupom Inválido");
            } else {
                mostrarAviso("Ocorreu um erro ao registrar seu pedido no nosso system.", "Erro na Finalização");
            }
            if (btnFinalizar) { btnFinalizar.innerText = textoOriginalBotao; btnFinalizar.disabled = false; }
            return; 
        }

        // =========================================================
        // EFEITOS VISUAIS E SONOROS (Pedido salvo com sucesso!)
        // =========================================================
        const fogoOverlay = document.getElementById("fogo-overlay");

        if (fogoOverlay) {
            fogoOverlay.style.display = "flex";
        }

        if (somFogo) {
            somFogo.currentTime = 0;
            somFogo.play().catch(erroAudio => console.log("Navegador aguardando interação ou bloqueou áudio:", erroAudio));
        }

        // Aguarda 2,5 segundos com o fogo estralando antes de ir para o WhatsApp
        setTimeout(() => {
            const nomeLojaTexto = (configLoja.nome_loja || lojaAtual.nome || "").toUpperCase();
            let textoPedido = `🔥 *NOVO PEDIDO - ${nomeLojaTexto}* 🔥\n\n`;
            textoPedido += `👤 *Cliente:* ${nome}\n`;
            textoPedido += ehEntrega ? `📍 *Endereço:* ${enderecoFormatado}\n` : `🏪 *Retirada na loja*\n`;


            if (pagamento === "Dinheiro") {
                const troco = document.getElementById("troco-dinheiro").value;
                textoPedido += `💳 *Pagamento:* Dinheiro (Troco para R$ ${troco})\n\n`;
            } else if (pagamento.toUpperCase() === "PIX" && configLoja.chave_pix && configLoja.chave_pix.trim() !== "") {
                const codigoPixPedido = gerarPixCopiaECola(totalCalculado);
                textoPedido += `💳 *Pagamento:* Pix\n🔑 *Pix Copia e Cola:*\n${codigoPixPedido}\n\n`;
            } else {
                textoPedido += `💳 *Pagamento:* ${pagamento}\n\n`;
            }

            textoPedido += "🛒 *ITENS DO PEDIDO:*\n";
            let subtotalItens = 0;
            carrinho.forEach(item => {
                subtotalItens += item.precoTotalItem;
                textoPedido += `\n*1x ${item.produtoBase.nome}* (R$ ${item.produtoBase.preco.toFixed(2).replace('.', ',')})\n`;
                item.adicionais.forEach(add => {
                    const subtotalExtra = add.preco * add.quantidade;
                    textoPedido += `   + ${add.quantidade}x ${add.nome} (R$ ${subtotalExtra.toFixed(2).replace('.', ',')})\n`;
                });
                if (item.observacao) {
                    textoPedido += `   📝 Obs: ${item.observacao}\n`;
                }
                textoPedido += `   *Subtotal do item: R$ ${item.precoTotalItem.toFixed(2).replace('.', ',')}*\n`;
            });

            // Ordem proposital: subtotal -> desconto -> taxa de entrega -> total.
            // O cupom desconta só em cima do subtotal dos itens, nunca da taxa.
            textoPedido += `\n💵 *Subtotal: R$ ${subtotalItens.toFixed(2).replace('.', ',')}*\n`;

            if (cupomAplicado) {
                textoPedido += `🏷️ *Cupom ${cupomAplicado.codigo}: -R$ ${cupomAplicado.valorDesconto.toFixed(2).replace('.', ',')}*\n`;
            }

            if (taxaEntrega > 0) {
                textoPedido += `🛵 *Taxa de entrega: R$ ${taxaEntrega.toFixed(2).replace('.', ',')}*\n`;
            }

            textoPedido += `\n💰 *TOTAL DO PEDIDO: R$ ${totalCalculado.toFixed(2).replace('.', ',')}*`;

            if (btnFinalizar) { btnFinalizar.innerText = textoOriginalBotao; btnFinalizar.disabled = false; }
            
            // Limpa os dados do carrinho local e atualiza as telas de fundo
            carrinho = [];
            cupomAplicado = null;
            atualizarContadorCart();
            renderizarCardapio(); 
            navegarPara('inicio');
            
            // Remove o fogo e pausa o áudio
            if (fogoOverlay) {
                fogoOverlay.style.display = "none";
            }
            if (somFogo) {
                somFogo.pause();
            }

            const numeroLimpo = configLoja.numero_whatsapp ? String(configLoja.numero_whatsapp).replace(/\D/g, '') : "";
            if (numeroLimpo === "") {
                mostrarAviso("Pedido registrado, mas esta loja ainda não configurou um número de WhatsApp. Entre em contato diretamente com o estabelecimento.", "WhatsApp não configurado");
                return;
            }

            // =========================================================
            // LÓGICA INTELIGENTE PARA FORÇAR O APLICATIVO DO WHATSAPP
            // =========================================================
            const textoCodificado = encodeURIComponent(textoPedido);
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (isMobile) {
                // Se for celular, abre o link via protocolo direto (Garante abrir o App nativo)
                window.location.href = `whatsapp://send?phone=${numeroLimpo}&text=${textoCodificado}`;
            } else {
                // Se for computador, abre a nova guia para o WhatsApp Web
                window.open(`https://api.whatsapp.com/send?phone=${numeroLimpo}&text=${textoCodificado}`, '_blank');
            }

        }, 2500); // Fim do atraso de 2.5 segundos da animação

    } catch (erro) {
        mostrarAviso("Falha de comunicação ao tentar enviar seu pedido.", "Erro de Conexão");
        if (btnFinalizar) { btnFinalizar.innerText = textoOriginalBotao; btnFinalizar.disabled = false; }
        
        // Garante a limpeza da tela e do som caso ocorra falha crítica na conexão
        const fogoOverlay = document.getElementById("fogo-overlay");
        if (fogoOverlay) fogoOverlay.style.display = "none";
        if (somFogo) somFogo.pause();
    }
}

// === HISTÓRICO E EXTRAS ===
async function carregarHistoricoPedidos() {
    const container = document.getElementById("lista-historico-pedidos");
    if (!container) return;

    const clienteId = obterOuCriarClienteId();
    const perfilSalvo = JSON.parse(localStorage.getItem(chaveLocalStorage("perfil")) || "{}");
    const telefoneCliente = perfilSalvo.telefone ? String(perfilSalvo.telefone).replace(/\D/g, '') : "";

    container.innerHTML = `<p style="color: #aaa; text-align: center; padding: 20px;">Carregando seus pedidos...</p>`;

    try {
        const resposta = await fetchSupabase(`/rest/v1/rpc/buscar_meus_pedidos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                p_loja_id: lojaAtual.id,
                p_cliente_id: clienteId,
                p_telefone: telefoneCliente || null
            })
        });
        if (!resposta.ok) throw new Error("Erro histórico");
        const pedidos = await resposta.json();

        if (pedidos.length === 0) {
            container.innerHTML = `<p style="color: #aaa; text-align: center; padding: 20px;">Você ainda não possui pedidos registrados.</p>`;
            return;
        }

        let html = "";
        pedidos.forEach(p => {
            const dataFormatada = formatarDataHoraBr(p.data_pedido);
            html += `
                <div style="background: #222; border-radius: 8px; padding: 15px; margin-bottom: 12px; border: 1px solid #333;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong style="color: var(--laranja-fogo, #ff5e00);">Pedido #${p.numero_pedido || p.id}</strong>
                        <span style="color: #aaa; font-size: 12px;">${dataFormatada}</span>
                    </div>
                    <div style="color: #fff; font-size: 14px; margin-bottom: 5px;">Status: <strong>${escaparHtml(p.status) || 'Pendente'}</strong></div>
                    <div style="color: #aaa; font-size: 13px; margin-bottom: 5px;"><i class="fa-solid fa-clock"></i> Previsao: ${escaparHtml(p.previsao_entrega || 'Nao informada')}</div>
                    <div style="color: #fff; font-size: 14px; margin-bottom: 5px;">Pagamento: ${escaparHtml(p.forma_pagamento)}</div>
                    <div style="color: #2ed573; font-weight: bold; font-size: 15px;">Total: R$ ${Number(p.total).toFixed(2).replace('.', ',')}</div>
                </div>
            `;
        });
        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = `<p style="color: #ff4757; text-align: center;">Erro ao carregar histórico de pedidos.</p>`;
    }
}

function fecharModal() { document.getElementById("modal-produto").classList.add("escondido"); document.body.classList.remove("modal-aberto"); }
window.addEventListener('click', function(event) {
    const modal = document.getElementById("modal-produto");
    if (event.target === modal) { fecharModal(); }
    const modalLoja = document.getElementById("modal-loja-info");
    if (event.target === modalLoja) { fecharModalLojaInfo(); }
});

// ==========================================
// MODAL "SOBRE A LOJA" (endereço, telefone, horário)
// ==========================================
function formatarDiasTrabalho(diasTrabalhoStr) {
    const nomesAbrev = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const dias = (diasTrabalhoStr || "0,1,2,3,4,5,6")
        .split(',')
        .map(d => parseInt(d.trim()))
        .filter(d => !isNaN(d) && d >= 0 && d <= 6)
        .sort((a, b) => a - b);

    if (dias.length === 0) return "Dias não informados";
    if (dias.length === 7) return "Todos os dias";

    const grupos = [];
    let inicio = dias[0];
    let anterior = dias[0];

    for (let i = 1; i <= dias.length; i++) {
        const atual = dias[i];
        if (atual !== anterior + 1) {
            grupos.push(inicio === anterior ? nomesAbrev[inicio] : `${nomesAbrev[inicio]} a ${nomesAbrev[anterior]}`);
            inicio = atual;
        }
        anterior = atual;
    }
    return grupos.join(', ');
}

function formatarTelefoneExibicao(numero) {
    const digitos = String(numero || "").replace(/\D/g, '');
    if (digitos.length === 13 && digitos.startsWith('55')) {
        return `(${digitos.substring(2, 4)}) ${digitos.substring(4, 9)}-${digitos.substring(9)}`;
    }
    if (digitos.length === 11) {
        return `(${digitos.substring(0, 2)}) ${digitos.substring(2, 7)}-${digitos.substring(7)}`;
    }
    return numero || "";
}

function abrirModalLojaInfo() {
    const modal = document.getElementById("modal-loja-info");
    const conteudo = document.getElementById("conteudo-loja-info");
    if (!modal || !conteudo) return;

    const nome = configLoja.nome_loja || (lojaAtual ? lojaAtual.nome : "");
    const logoHtml = (configLoja.logo_url && configLoja.logo_url.trim() !== "")
        ? `<img src="${configLoja.logo_url}" alt="" style="width: 84px; height: 84px; object-fit: contain; border-radius: 16px; background: #222; flex-shrink: 0;">`
        : `<div style="width: 84px; height: 84px; border-radius: 16px; background: #222; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class="fa-solid fa-fire-flame-curved" style="font-size: 34px; color: var(--laranja-fogo, #ff5e00);"></i></div>`;

    const horarioTexto = `${formatarDiasTrabalho(configLoja.dias_trabalho)} • ${configLoja.horario_abertura || '--:--'} às ${configLoja.horario_fechar || '--:--'}`;
    const telefoneTexto = formatarTelefoneExibicao(configLoja.numero_whatsapp);

    conteudo.innerHTML = `
        <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 22px;">
            ${logoHtml}
            <div>
                <h2 style="margin: 0 0 6px; color: #fff; font-size: 20px;">${escaparHtml(nome)}</h2>
                <span style="color: ${lojaAberta ? '#2ed573' : '#ff4757'}; font-size: 13px; font-weight: bold;">${lojaAberta ? '● Aberto agora' : '● Fechado no momento'}</span>
            </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 16px;">
            ${configLoja.endereco ? `
            <div style="display: flex; gap: 12px; align-items: flex-start;">
                <i class="fa-solid fa-location-dot" style="color: var(--laranja-fogo, #ff5e00); width: 18px; margin-top: 3px;"></i>
                <span style="color: #ddd; font-size: 14px; line-height: 1.4;">${escaparHtml(configLoja.endereco)}</span>
            </div>` : ''}
            ${telefoneTexto ? `
            <div style="display: flex; gap: 12px; align-items: center;">
                <i class="fa-solid fa-phone" style="color: var(--laranja-fogo, #ff5e00); width: 18px;"></i>
                <span style="color: #ddd; font-size: 14px;">${escaparHtml(telefoneTexto)}</span>
            </div>` : ''}
            <div style="display: flex; gap: 12px; align-items: center;">
                <i class="fa-solid fa-clock" style="color: var(--laranja-fogo, #ff5e00); width: 18px;"></i>
                <span style="color: #ddd; font-size: 14px;">${escaparHtml(horarioTexto)}</span>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                <i class="fa-solid fa-stopwatch" style="color: var(--laranja-fogo, #ff5e00); width: 18px;"></i>
                <span style="color: #ddd; font-size: 14px;">Entrega: ${escaparHtml(`Em ate ${Number(configLoja.tempo_entrega_fixo) || 50} minutos`)} · Retirada: ${escaparHtml(`Em ate ${Number(configLoja.tempo_retirada_fixo) || 30} minutos`)}</span>
            </div>
        </div>
    `;

    modal.classList.remove("escondido");
}

function fecharModalLojaInfo() {
    const modal = document.getElementById("modal-loja-info");
    if (modal) modal.classList.add("escondido");
}

function navegarPara(aba) {
    const telas = ["tela-catalogo", "tela-checkout", "tela-perfil", "tela-pedidos", "tela-cupons"];
    telas.forEach(id => { const elemento = document.getElementById(id); if (elemento) elemento.classList.add("escondido"); });
    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("ativo"));

    if (aba === 'inicio') {
        document.getElementById("tela-catalogo").classList.remove("escondido");
        const b = document.getElementById("btn-nav-inicio"); if(b) b.classList.add("ativo");
        window.scrollTo(0, 0);
    } else if (aba === 'checkout') {
        document.getElementById("tela-checkout").classList.remove("escondido");
        window.scrollTo(0, 0);
    } else if (aba === 'perfil') {
        document.getElementById("tela-perfil").classList.remove("escondido");
        const b = document.getElementById("btn-nav-perfil"); if(b) b.classList.add("ativo");
        carregarPerfilNaTela(); window.scrollTo(0, 0);
    } else if (aba === 'pedidos') {
        document.getElementById("tela-pedidos").classList.remove("escondido");
        const b = document.getElementById("btn-nav-pedidos"); if(b) b.classList.add("ativo");
        carregarHistoricoPedidos();
        window.scrollTo(0, 0);
    } else if (aba === 'cupons') {
        document.getElementById("tela-cupons").classList.remove("escondido");
        const b = document.getElementById("btn-nav-cupons"); if(b) b.classList.add("ativo");
        carregarTelaCupons();
        window.scrollTo(0, 0);
    }
    atualizarContadorCart();
}

function salvarPerfil() {
    const perfil = { nome: document.getElementById("perfil-nome").value, telefone: document.getElementById("perfil-telefone").value, rua: document.getElementById("perfil-rua").value, numero: document.getElementById("perfil-numero").value, bairro: document.getElementById("perfil-bairro").value, complemento: document.getElementById("perfil-complemento").value };
    localStorage.setItem(chaveLocalStorage("perfil"), JSON.stringify(perfil));
    mostrarAviso("Seus dados de entrega foram salvos com sucesso!", "Tudo Certo!", "sucesso");
    navegarPara('inicio');

    // Manda pro banco da loja também — assim quem só cadastra o perfil e
    // nunca chega a pedir também aparece pro admin, como "possível cliente".
    salvarClienteNoBanco(perfil);
}

async function salvarClienteNoBanco(perfil, email) {
    if (!perfil.nome && !perfil.telefone && !email) return; // nada de útil pra guardar
    try {
        const endereco = [perfil.rua, perfil.numero].filter(Boolean).join(', ')
            + (perfil.bairro ? ' - ' + perfil.bairro : '')
            + (perfil.complemento ? ' (' + perfil.complemento + ')' : '');

        await fetchSupabase(`/rest/v1/rpc/salvar_perfil_cliente`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                p_loja_id: lojaAtual.id,
                p_cliente_id: obterOuCriarClienteId(),
                p_nome: perfil.nome || null,
                p_telefone: perfil.telefone || null,
                p_endereco: endereco.trim() || null,
                p_email: email || null
            })
        });
    } catch (erro) {
        console.error("Erro ao salvar cliente no banco:", erro);
    }
}

function carregarPerfilNaTela() {
    const salvo = localStorage.getItem(chaveLocalStorage("perfil"));
    if (salvo) { const perfil = JSON.parse(salvo); document.getElementById("perfil-nome").value = perfil.nome || ""; document.getElementById("perfil-telefone").value = perfil.telefone || ""; document.getElementById("perfil-rua").value = perfil.rua || ""; document.getElementById("perfil-numero").value = perfil.numero || ""; document.getElementById("perfil-bairro").value = perfil.bairro || ""; document.getElementById("perfil-complemento").value = perfil.complemento || ""; }
}

function preencherCheckoutComPerfil() {
    const salvo = localStorage.getItem(chaveLocalStorage("perfil"));
    if (salvo) { const perfil = JSON.parse(salvo); document.getElementById("nome-cliente").value = perfil.nome || ""; document.getElementById("rua-cliente").value = perfil.rua || ""; document.getElementById("numero-cliente").value = perfil.numero || ""; document.getElementById("bairro-cliente").value = perfil.bairro || ""; document.getElementById("complemento-cliente").value = perfil.complemento || ""; }
}

async function renderizarRodape() {
    const dataAtual = new Date(); const ano = dataAtual.getFullYear(); 
    const footer = document.createElement("footer"); 
    footer.style.cssText = "text-align: center; padding: 30px 15px; background: transparent; color: #777; font-size: 13px; margin-top: 40px; width: 100%; padding-bottom: 100px;"; 
    footer.innerHTML = `
        <div style="margin-bottom: 8px;">&copy; ${ano} ${escaparHtml(configLoja.nome_loja || lojaAtual.nome)}. Identidade e conteúdo reservados.</div>
        <div style="margin-bottom: 8px;">Tecnologia por <a href="https://mathshub.com.br" target="_blank" style="color: var(--laranja-fogo, #ff5e00); text-decoration: none; font-weight: bold;">Maths Labs</a> 🚀</div>
        <div style="margin-bottom: 8px; font-size: 12px;">
            <a href="politica-de-privacidade.html" style="color: #888; text-decoration: none;">Política de Privacidade</a>
            &nbsp;·&nbsp;
            <a href="termos-de-uso.html" style="color: #888; text-decoration: none;">Termos de Uso</a>
            &nbsp;·&nbsp;
            <a href="politica-de-cookies.html" style="color: #888; text-decoration: none;">Cookies</a>
        </div>
        <div id="versao-app" style="font-size: 11px; color: #555; margin-top: 10px;">Sincronizando versão...</div>
    `;
    document.body.appendChild(footer);
    
    try {
        const resposta = await fetch(`https://api.github.com/repos/felipemattos177/Projeto_hamburgueria/commits/main`);
        const dados = await resposta.json(); const hashAtualizacao = dados.sha.substring(0, 7);
        const dataCommit = new Date(dados.commit.author.date); 
        const dia = String(dataCommit.getDate()).padStart(2, '0'); 
        const mes = String(dataCommit.getMonth() + 1).padStart(2, '0'); 
        const hora = String(dataCommit.getHours()).padStart(2, '0'); 
        const minuto = String(dataCommit.getMinutes()).padStart(2, '0');
        document.getElementById("versao-app").innerText = `Versão: ${hashAtualizacao} (${dia}/${mes} às ${hora}:${minuto})`;
    } catch (erro) { 
        document.getElementById("versao-app").innerText = `Versão do Sistema v1.${ano}`; 
    }
}

async function carregarConfiguracoes() {
    try {
        const res = await fetchSupabase(`/rest/v1/configuracoes?select=*&loja_id=eq.${lojaAtual.id}&limit=1`);
        const dados = await res.json();
        if (dados && dados.length > 0) configLoja = dados[0];
    } catch (erro) {
        console.error("Erro ao puxar configurações da loja.", erro);
    } finally {
        renderizarResumoLoja();
        atualizarPrevisaoCliente();
        verificarHorarioLoja();
        setInterval(verificarHorarioLoja, 60000); 
    }
}

async function renderizarResumoLoja() {
    const texto = document.getElementById("resumo-loja-texto");
    if (!texto) return;

    const previsaoEntrega = await obterPrevisaoCliente("entrega");
    texto.innerText = `Entrega: ${previsaoEntrega.replace(/^Em ate /, "")}`;
}

function verificarHorarioLoja() {
    const agora = new Date();
    const diaSemanaAtual = agora.getDay(); 
    const horaAtualMinutos = agora.getHours() * 60 + agora.getMinutes();
    const diasTrabalhoStr = configLoja.dias_trabalho || "0,1,2,3,4,5,6";
    const diasAbertosArray = diasTrabalhoStr.split(',').map(d => parseInt(d.trim()));

    const [hAbre, mAbre] = (configLoja.horario_abertura || "00:00").split(':').map(Number);
    const [hFecha, mFecha] = (configLoja.horario_fechar || "23:59").split(':').map(Number);
    const tempoAbreMinutos = hAbre * 60 + mAbre;
    const tempoFechaMinutos = hFecha * 60 + mFecha;
    
    const viraNoite = tempoFechaMinutos < tempoAbreMinutos;
    let noDiaCerto = false, naHoraCerta = false;

    if (viraNoite) {
        if (horaAtualMinutos >= tempoAbreMinutos) {
            naHoraCerta = diasAbertosArray.includes(diaSemanaAtual);
            noDiaCerto = naHoraCerta;
        } else if (horaAtualMinutos <= tempoFechaMinutos) {
            let ontem = diaSemanaAtual - 1; if (ontem < 0) ontem = 6;
            naHoraCerta = diasAbertosArray.includes(ontem); noDiaCerto = naHoraCerta; 
        }
    } else {
        noDiaCerto = diasAbertosArray.includes(diaSemanaAtual);
        naHoraCerta = (horaAtualMinutos >= tempoAbreMinutos && horaAtualMinutos <= tempoFechaMinutos);
    }

    lojaAberta = noDiaCerto && naHoraCerta;
    const bannerHtml = document.getElementById("aviso-loja-fechada");

    if (!lojaAberta) {
        const nomesDias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        let diasPraFrente = 0, diaEncontrado = -1;

        for (let i = 0; i <= 7; i++) {
            let diaAlvo = (diaSemanaAtual + i) % 7;
            if (diasAbertosArray.includes(diaAlvo)) {
                if (i === 0) { 
                    if (viraNoite) { if (horaAtualMinutos < tempoAbreMinutos && horaAtualMinutos > tempoFechaMinutos) { diasPraFrente = i; diaEncontrado = diaAlvo; break; } } 
                    else { if (horaAtualMinutos < tempoAbreMinutos) { diasPraFrente = i; diaEncontrado = diaAlvo; break; } }
                } else { diasPraFrente = i; diaEncontrado = diaAlvo; break; }
            }
        }

        let txtDia = (diaEncontrado === -1) ? "em breve" : (diasPraFrente === 0) ? "hoje" : (diasPraFrente === 1) ? "amanhã" : nomesDias[diaEncontrado];
        mensagemFechado = `Voltamos ${txtDia} às ${configLoja.horario_abertura}.`;
        
        if (bannerHtml) { bannerHtml.innerHTML = `⚠️ Loja Fechada no momento. ${mensagemFechado}`; bannerHtml.style.display = "block"; }
        // O aviso já empurra o cabeçalho pra baixo (margin-top próprio), então o
        // banner principal não precisa mais da margem que usa pra limpar o header sozinho.
        const heroEl = document.getElementById("banner-fundo");
        if (heroEl) heroEl.style.marginTop = "0";
        const detalhes = document.getElementById("detalhes-produto-modal");
        if (detalhes && !detalhes.innerHTML.includes("Loja Fechada no Momento") && produtoSendoVisto) { abrirModalProduto(produtoSendoVisto.id); }
    } else {
        if (bannerHtml) bannerHtml.style.display = "none";
        const heroEl = document.getElementById("banner-fundo");
        if (heroEl) heroEl.style.marginTop = "";
    }
}

// ==========================================
// RASTREADOR DE ENTREGAS AO VIVO (NOTIFICAÇÃO)
// ==========================================
let memoriaStatusPedidos = {}; 

async function rastrearPedidosEmAndamento() {
    if (!lojaAtual) return;
    const clienteId = obterOuCriarClienteId();
    if (!clienteId) return;

    try {
        const res = await fetchSupabase(`/rest/v1/rpc/buscar_meus_pedidos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_loja_id: lojaAtual.id, p_cliente_id: clienteId, p_telefone: null })
        });

        if (!res.ok) return;
        const pedidosAoVivo = (await res.json()).slice(0, 5);

        pedidosAoVivo.forEach(pedidoDb => {
            // Se o pedido não tem status ou já foi finalizado/entregue antes, pula
            if (!pedidoDb.status) return;

            const statusAntigo = memoriaStatusPedidos[pedidoDb.id];
            
            // Transformamos o status do banco em minúsculo e removemos espaços extras
            const statusNovoLimpo = String(pedidoDb.status).toLowerCase().trim();
            
            // CHECAGEM BLINDADA: Se o status antigo existia, mudou, e o novo contém a palavra "entrega"
            if (statusAntigo && statusAntigo !== pedidoDb.status && statusNovoLimpo.includes("entrega")) {
                
                // Dispara o Alerta Visual na Tela do Cliente (sem som)
                mostrarAviso(`Seu pedido #${pedidoDb.numero_pedido || pedidoDb.id} acabou de sair para entrega! 🛵 Prepare-se para receber.`, "Saiu para Entrega!", "sucesso");

                // Atualiza o histórico do cliente na tela
                carregarHistoricoPedidos();
            }

            // Guarda o status atual para comparar na próxima checagem daqui a 10 segundos
            memoriaStatusPedidos[pedidoDb.id] = pedidoDb.status;
        });

    } catch (erro) {
        console.error("Erro no radar de rastreamento:", erro);
    }
}

// Ativa o radar para rodar a cada 10 segundos
setInterval(rastrearPedidosEmAndamento, 10000);

// ==========================================
// IDENTIDADE VISUAL DINÂMICA (WHITE-LABEL)
// ==========================================
async function carregarIdentidadeVisual() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?loja_id=eq.${lojaAtual.id}&select=*`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await res.json();
        
        if (dados && dados.length > 0) {
            const config = dados[0];
            
            // 1. Trocando os Textos
            const elNomeLoja = document.getElementById("loja-nome");
            const elTituloBanner = document.getElementById("banner-titulo");
            const elSubtituloBanner = document.getElementById("banner-subtitulo");
            
            if(elNomeLoja && config.nome_loja) elNomeLoja.innerText = config.nome_loja;
            if(elTituloBanner && config.titulo_banner) elTituloBanner.innerText = config.titulo_banner;
            if(elSubtituloBanner && config.subtitulo_banner) elSubtituloBanner.innerText = config.subtitulo_banner;

            // Logo da loja (substitui o ícone de fogo padrão, se configurada)
            const elLogoImg = document.getElementById("loja-logo-img");
            const elLogoIcone = document.getElementById("loja-logo-icone");
            if (elLogoImg && elLogoIcone && config.logo_url && config.logo_url.trim() !== "") {
                elLogoImg.src = config.logo_url;
                elLogoImg.style.display = "inline-block";
                elLogoIcone.style.display = "none";
            }
            

           // 2. Trocando a Imagem de Fundo
            const bannerDiv = document.getElementById("banner-fundo");
            if(bannerDiv && config.imagem_banner && config.imagem_banner.trim() !== "") {
                // Colocamos um degradê escuro por cima da foto para o texto dar leitura, 
                // e forçamos a foto a cobrir e centralizar no espaço.
                bannerDiv.style.backgroundImage = `linear-gradient(to right, rgba(18, 18, 18, 0.9) 10%, rgba(18, 18, 18, 0.4) 100%), url('${config.imagem_banner}')`;
                bannerDiv.style.backgroundSize = "cover";
                bannerDiv.style.backgroundPosition = "center";
                bannerDiv.style.backgroundRepeat = "no-repeat";
            }
            
            // 3. Trocando a Cor Principal (A Mágica!)
            if(config.cor_principal) {
                document.documentElement.style.setProperty('--laranja-fogo', config.cor_principal);
                try { localStorage.setItem(chaveLocalStorage('cor_principal'), config.cor_principal); } catch (e) {}
            } else {
                try { localStorage.removeItem(chaveLocalStorage('cor_principal')); } catch (e) {}
            }

            // ==========================================================
            // 4. CARREGAR O ÁUDIO DO BANCO (NOVO)
            // ==========================================================
            if (config.audio_fogo && config.audio_fogo.trim() !== "") {
                const somFogo = document.getElementById("som-fogo");
                if (somFogo) {
                    somFogo.src = config.audio_fogo; // Puxa do Supabase
                    somFogo.load(); // Atualiza o áudio na memória
                }
            } else {
                // Se não tiver áudio no banco, tenta tocar um local de garantia
                const somFogo = document.getElementById("som-fogo");
                if (somFogo) {
                    somFogo.src = "fogo.mp3";
                    somFogo.load();
                }
            }
            // ==========================================================
        }
    } catch (erro) {
        console.error("Erro ao carregar a identidade visual da loja:", erro);
    }
}

// ==========================================
// AUTENTICAÇÃO COM GOOGLE (SUPABASE OAUTH)
// ==========================================

// 1. Redireciona o cliente para a tela de login do Google
async function loginComGoogle() {
    try {
        const redirecionarPara = window.location.origin;
        window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirecionarPara)}`;
    } catch (erro) {
        console.error("Erro ao iniciar login com Google:", erro);
        mostrarAviso("Não foi possível conectar com o Google no momento.", "Erro de Login");
    }
}

// 2. Checa se o cliente acabou de voltar do login do Google e captura os dados dele
function checarRetornoLoginGoogle() {
    // Pegamos exatamente o Hash (tudo que vem depois do # na URL)
    const hashAtual = window.location.hash;
    
    if (hashAtual && hashAtual.includes("access_token=")) {
        try {
            // 1. Extrai o token de forma perfeita e limpa usando a ferramenta nativa do navegador
            const parametros = new URLSearchParams(hashAtual.substring(1));
            const tokenCompleto = parametros.get("access_token");

            if (!tokenCompleto) return; // Se não achar o token, aborta a missão

            // 2. Faz o fetch na mesma hora usando o token, SEM limpar a URL da tela ainda
            fetch(`${SUPABASE_URL}/auth/v1/user`, {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${tokenCompleto}`
                }
            })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Token rejeitado pelo Supabase");
            })
            .then(usuarioGoogle => {
                // Captura o nome retornado pelas credenciais do Google
                const nomeGoogle = usuarioGoogle.user_metadata.full_name || usuarioGoogle.user_metadata.name || "Cliente Google";

                // Sincroniza o nome no LocalStorage do navegador
                let perfilExistente = JSON.parse(localStorage.getItem(chaveLocalStorage("perfil")) || "{}");
                perfilExistente.nome = nomeGoogle;
                localStorage.setItem(chaveLocalStorage("perfil"), JSON.stringify(perfilExistente));

                // Já registra a pessoa pro admin nesse instante — sem isso, quem faz
                // login com Google e não chega a clicar "Salvar" no perfil depois
                // ficava de fora do "Meus Clientes" (mesmo já tendo um e-mail real).
                salvarClienteNoBanco(perfilExistente, usuarioGoogle.email);

                // Atualiza as caixas de texto na tela do cliente
                carregarPerfilNaTela();
                preencherCheckoutComPerfil();

                // 3. SÓ AGORA (quando tudo deu certo) APAGAMOS A URL GIGANTE PARA LIMPAR A TELA!
                window.location.hash = "";
                window.history.replaceState({}, document.title, window.location.pathname);

                // Dispara o popup de sucesso verde e manda pra tela de perfil
                mostrarAviso(`Olá, ${nomeGoogle}! Seu perfil foi conectado com o Google com sucesso.`, "Login Concluído!", "sucesso");
                navegarPara('perfil');
            })
            .catch(err => {
                console.error("Erro na validação do login Google:", err);
                // Mesmo se der erro, limpamos a tela para o cliente não ficar travado
                window.location.hash = "";
                window.history.replaceState({}, document.title, window.location.pathname);
            });

        } catch (e) {
            console.error("Erro no processamento dos parâmetros OAuth:", e);
        }
    }
}

// ==========================================================
// GATILHOS DE INICIALIZAÇÃO AUTOMÁTICA DO SISTEMA
// ==========================================================
// Tudo abaixo só roda depois de descobrir qual loja este subdomínio é —
// sem isso não tem como filtrar cardápio, pedidos, nem configurações.
async function iniciarApp() {
    const lojaOk = await resolverLoja();

    if (!lojaOk) {
        // "loja não encontrada/inativa" já tomou conta da página nesse caso.
        const telaCarregando = document.getElementById("tela-carregando-inicial");
        if (telaCarregando) telaCarregando.style.display = "none";
        return;
    }

    // 1. Roda o verificador do Google imediatamente ao abrir o site
    checarRetornoLoginGoogle();

    // 2. Carrega a Identidade Visual Dinâmica — só tira o spinner depois
    // dela terminar, pra ninguém ver o nome/cor genéricos por um instante.
    await carregarIdentidadeVisual();
    const telaCarregando = document.getElementById("tela-carregando-inicial");
    if (telaCarregando) telaCarregando.style.display = "none";

    // 3. Inicializa as configurações e horários da hamburgueria
    carregarConfiguracoes();

    // 4. Puxa os produtos do cardápio do banco de dados
    carregarCardapioDoBanco();

    // 4.5. Verifica se a loja tem alguma promoção pública pra mostrar no checkout
    carregarCuponsPublicos();

    // 5. Insere e atualiza a versão no rodapé
    renderizarRodape();
}

iniciarApp();