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
    let id = localStorage.getItem("vilelaburgers_cliente_id");
    if (!id) {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        localStorage.setItem("vilelaburgers_cliente_id", id);
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

// === 2. EXTRAÇÃO DE DADOS AO VIVO ===
async function carregarCardapioDoBanco() {
    try {
        const resposta = await fetchSupabase(`/rest/v1/cardapio_inteligente?select=*&ativo=eq.true`);
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
                    menuCategorias.innerHTML += `<button class="btn-categoria" onclick="filtrarCategoria('${cat}', this)">${cat}</button>`;
                });
            }
            // ------------------------------------------
        const resRec = await fetchSupabase(`/rest/v1/receita_produto?select=*`);
        receitasGlobais = await resRec.json();

        renderizarCardapio();
    } catch (erro) {
        console.error("Falha na extração dos dados:", erro);
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
                        <h3>${produto.nome}</h3>
                        <p>${produto.descricao}</p>
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
        const resExtras = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,preco_adicional,estoque&preco_adicional=gt.0&estoque=gt.0`);
        const adicionaisDoBanco = await resExtras.json();

        const resRec = await fetchSupabase(`/rest/v1/receita_produto?select=*`);
        receitasGlobais = await resRec.json();

        const resIngTodos = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,estoque`);
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
                            <span style="color: #fff; font-weight: 500;">${add.nome} <br><small style="color: #aaa;">+ R$ ${Number(add.preco_adicional).toFixed(2).replace('.', ',')}</small></span>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <button type="button" onclick="alterarQtdAdicional('${add.id}', -1)" style="width: 32px; height: 32px; border-radius: 6px; background: #444; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px;">-</button>
                                <span class="qtd-adicional-span" id="qtd-add-${add.id}" data-id="${add.id}" data-nome="${add.nome}" data-preco="${add.preco_adicional}" style="font-weight: bold; color: #fff; width: 15px; text-align: center; font-size: 16px;">0</span>
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
                    <strong>Estoque Insuficiente</strong><br><span style="font-size: 13px;">Falta ${ingredienteFaltanteBase} para finalizar a montagem.</span>
                </div>
            `;
        } else {
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
            <h2 style="color: #fff; font-size: 22px;">${produtoSendoVisto.nome}</h2>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 10px;">${produtoSendoVisto.descricao}</p>
            <h3 style="color: var(--laranja-fogo, #ff5e00); font-size: 22px;">R$ ${produtoSendoVisto.preco.toFixed(2).replace('.', ',')}</h3>
            ${htmlAdicionais}
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
        const resIng = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,estoque`);
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
        const resIng = await fetchSupabase(`/rest/v1/ingredientes?select=nome,estoque&id=eq.${id}`);
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
        const resIng = await fetchSupabase(`/rest/v1/ingredientes?select=id,nome,estoque`);
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
        for (let i = 0; i < qtdBaseEscolhida; i++) {
            const itemParaCarrinho = {
                produtoBase: produtoSendoVisto,
                adicionais: JSON.parse(JSON.stringify(adicionaisEscolhidos)), 
                precoTotalItem: produtoSendoVisto.preco + totalAdicionais
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

function abrirCheckout() {
    if (carrinho.length === 0) { mostrarAviso("Adicione algo delicioso antes de finalizar.", "Carrinho Vazio"); return; }
    navegarPara('checkout');
    renderizarCheckout();
    carregarPerfilNaTela(); 
    preencherCheckoutComPerfil();
    verificarTroco(); 
}

function renderizarCheckout() {
    const divItens = document.getElementById("itens-checkout");
    divItens.innerHTML = "";
    let somaTotal = 0;

    carrinho.forEach((item, index) => {
        somaTotal += item.precoTotalItem;
        
        let listaAddsHtml = "";
        if (item.adicionais.length > 0) {
            listaAddsHtml = "<ul style='color: #aaa; font-size: 13px; margin-top: 5px; list-style: none;'>";
            item.adicionais.forEach(add => {
                const subtotalAdd = add.preco * add.quantidade;
                listaAddsHtml += `<li>+ ${add.quantidade}x ${add.nome} (R$ ${subtotalAdd.toFixed(2).replace('.', ',')})</li>`;
            });
            listaAddsHtml += "</ul>";
        }

        divItens.innerHTML += `
            <div style="background: #222; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #333;">
                <div>
                    <strong>1x ${item.produtoBase.nome} <span style="color: #aaa; font-size: 13px;">(R$ ${item.produtoBase.preco.toFixed(2).replace('.', ',')})</span></strong>
                    ${listaAddsHtml}
                    <div style="color: var(--laranja-fogo, #ff5e00); margin-top: 5px; font-weight: bold; font-size: 15px;">
                        Subtotal: R$ ${item.precoTotalItem.toFixed(2).replace('.', ',')}
                    </div>
                </div>
                <button onclick="removerDoCarrinho(${index})" style="background: transparent; color: #ff4757; border: none; font-size: 18px; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    });

    divItens.innerHTML += `
        <button onclick="navegarPara('inicio')" style="width: 100%; background: transparent; color: var(--laranja-fogo, #ff5e00); border: 2px dashed var(--laranja-fogo, #ff5e00); padding: 15px; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; cursor: pointer; transition: 0.3s;">
            <i class="fa-solid fa-plus"></i> Adicionar mais lanches
        </button>
    `;

    document.getElementById("valor-total").innerText = `R$ ${somaTotal.toFixed(2).replace('.', ',')}`;
    verificarTroco(); 
}

function removerDoCarrinho(index) {
    carrinho.splice(index, 1);
    atualizarContadorCart();
    renderizarCardapio();
    
    if (carrinho.length === 0) navegarPara('inicio');
    else renderizarCheckout();
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

        const totalCalculado = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
        
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
    const totalCalculado = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
    const codigoPix = gerarPixCopiaECola(totalCalculado);

    navigator.clipboard.writeText(codigoPix).then(() => {
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

    if (nome === "" || rua === "" || numero === "" || bairro === "") {
        mostrarAviso("Por favor, preencha seu Nome, Rua, Número e Bairro para a entrega!", "Dados Incompletos");
        return;
    }

    const enderecoFormatado = `${rua}, ${numero} - ${bairro} ${complemento ? '(' + complemento + ')' : ''}`;
    const totalCalculado = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
    
    const btnFinalizar = document.querySelector(".btn-whatsapp");
    let textoOriginalBotao = "Enviar Pedido";

    if (btnFinalizar) {
        textoOriginalBotao = btnFinalizar.innerText;
        btnFinalizar.innerText = "Salvando pedido...";
        btnFinalizar.disabled = true;
    }

    try {
        const perfilSalvo = JSON.parse(localStorage.getItem("vilelaburgers_perfil") || "{}");
        const telefoneCliente = perfilSalvo.telefone ? String(perfilSalvo.telefone).replace(/\D/g, '') : "";
        const clienteId = obterOuCriarClienteId();

        const dadosPedidoCompleto = {
            p_nome_cliente: nome,
            p_forma_pagamento: pagamento,
            p_total: totalCalculado,
            p_cliente_id: clienteId,
            p_telefone_cliente: telefoneCliente,
            p_status: "Pendente",
            p_previsao_entrega: "Em até 50 minutos",
            p_carrinho: carrinho 
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
            let textoPedido = `🔥 *NOVO PEDIDO - VILELA BURGERS* 🔥\n\n`;
            textoPedido += `👤 *Cliente:* ${nome}\n📍 *Endereço:* ${enderecoFormatado}\n`;
            
            if (pagamento === "Dinheiro") {
                const troco = document.getElementById("troco-dinheiro").value;
                textoPedido += `💳 *Pagamento:* Dinheiro (Troco para R$ ${troco})\n\n`;
            } else {
                textoPedido += `💳 *Pagamento:* ${pagamento}\n\n`;
            }

            textoPedido += "🛒 *ITENS DO PEDIDO:*\n";
            carrinho.forEach(item => {
                textoPedido += `\n*1x ${item.produtoBase.nome}* (R$ ${item.produtoBase.preco.toFixed(2).replace('.', ',')})\n`;
                item.adicionais.forEach(add => {
                    const subtotalExtra = add.preco * add.quantidade;
                    textoPedido += `   + ${add.quantidade}x ${add.nome} (R$ ${subtotalExtra.toFixed(2).replace('.', ',')})\n`;
                });
                textoPedido += `   *Subtotal do item: R$ ${item.precoTotalItem.toFixed(2).replace('.', ',')}*\n`;
            });

            textoPedido += `\n💰 *TOTAL DO PEDIDO: R$ ${totalCalculado.toFixed(2).replace('.', ',')}*`;

            if (btnFinalizar) { btnFinalizar.innerText = textoOriginalBotao; btnFinalizar.disabled = false; }
            
            // Limpa os dados do carrinho local e atualiza as telas de fundo
            carrinho = [];
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
            
            let numeroLimpo = configLoja.numero_whatsapp ? String(configLoja.numero_whatsapp).replace(/\D/g, '') : "5543996150221";
            if(numeroLimpo === "") numeroLimpo = "5543996150221";
            
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
    const perfilSalvo = JSON.parse(localStorage.getItem("vilelaburgers_perfil") || "{}");
    const telefoneCliente = perfilSalvo.telefone ? String(perfilSalvo.telefone).replace(/\D/g, '') : "";

    container.innerHTML = `<p style="color: #aaa; text-align: center; padding: 20px;">Carregando seus pedidos...</p>`;

    try {
        let queryUrl = `/rest/v1/pedidos?select=*&or=(cliente_id.eq.${clienteId}`;
        if (telefoneCliente) queryUrl += `,telefone_cliente.eq.${telefoneCliente}`;
        queryUrl += `)&order=data_pedido.desc`;

        const resposta = await fetchSupabase(queryUrl);
        if (!resposta.ok) throw new Error("Erro histórico");
        const pedidos = await resposta.json();

        if (pedidos.length === 0) {
            container.innerHTML = `<p style="color: #aaa; text-align: center; padding: 20px;">Você ainda não possui pedidos registrados.</p>`;
            return;
        }

        let html = "";
        pedidos.forEach(p => {
            const dataFormatada = new Date(p.data_pedido).toLocaleString('pt-BR');
            html += `
                <div style="background: #222; border-radius: 8px; padding: 15px; margin-bottom: 12px; border: 1px solid #333;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong style="color: var(--laranja-fogo, #ff5e00);">Pedido #${p.id}</strong>
                        <span style="color: #aaa; font-size: 12px;">${dataFormatada}</span>
                    </div>
                    <div style="color: #fff; font-size: 14px; margin-bottom: 5px;">Status: <strong>${p.status || 'Pendente'}</strong></div>
                    <div style="color: #fff; font-size: 14px; margin-bottom: 5px;">Pagamento: ${p.forma_pagamento}</div>
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
window.addEventListener('click', function(event) { const modal = document.getElementById("modal-produto"); if (event.target === modal) { fecharModal(); }});

function navegarPara(aba) {
    const telas = ["tela-catalogo", "tela-checkout", "tela-perfil", "tela-pedidos"];
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
    }
    atualizarContadorCart();
}

function salvarPerfil() {
    const perfil = { nome: document.getElementById("perfil-nome").value, telefone: document.getElementById("perfil-telefone").value, rua: document.getElementById("perfil-rua").value, numero: document.getElementById("perfil-numero").value, bairro: document.getElementById("perfil-bairro").value, complemento: document.getElementById("perfil-complemento").value };
    localStorage.setItem("vilelaburgers_perfil", JSON.stringify(perfil)); 
    mostrarAviso("Seus dados de entrega foram salvos com sucesso!", "Tudo Certo!", "sucesso"); 
    navegarPara('inicio'); 
}

function carregarPerfilNaTela() {
    const salvo = localStorage.getItem("vilelaburgers_perfil");
    if (salvo) { const perfil = JSON.parse(salvo); document.getElementById("perfil-nome").value = perfil.nome || ""; document.getElementById("perfil-telefone").value = perfil.telefone || ""; document.getElementById("perfil-rua").value = perfil.rua || ""; document.getElementById("perfil-numero").value = perfil.numero || ""; document.getElementById("perfil-bairro").value = perfil.bairro || ""; document.getElementById("perfil-complemento").value = perfil.complemento || ""; }
}

function preencherCheckoutComPerfil() {
    const salvo = localStorage.getItem("vilelaburgers_perfil");
    if (salvo) { const perfil = JSON.parse(salvo); document.getElementById("nome-cliente").value = perfil.nome || ""; document.getElementById("rua-cliente").value = perfil.rua || ""; document.getElementById("numero-cliente").value = perfil.numero || ""; document.getElementById("bairro-cliente").value = perfil.bairro || ""; document.getElementById("complemento-cliente").value = perfil.complemento || ""; }
}

async function renderizarRodape() {
    const dataAtual = new Date(); const ano = dataAtual.getFullYear(); 
    const footer = document.createElement("footer"); 
    footer.style.cssText = "text-align: center; padding: 30px 15px; background: transparent; color: #777; font-size: 13px; margin-top: 40px; width: 100%; padding-bottom: 100px;"; 
    footer.innerHTML = `
        <div style="margin-bottom: 8px;">&copy; ${ano} Vilela Burgers. Identidade e conteúdo reservados.</div>
        <div style="margin-bottom: 8px;">Tecnologia por <a href="https://mathshub.com.br" target="_blank" style="color: var(--laranja-fogo, #ff5e00); text-decoration: none; font-weight: bold;">Maths Labs</a> 🚀</div>
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
        const res = await fetchSupabase(`/rest/v1/configuracoes?select=*&limit=1`);
        const dados = await res.json();
        if (dados && dados.length > 0) configLoja = dados[0];
    } catch (erro) {
        console.error("Erro ao puxar configurações da loja.", erro);
    } finally {
        verificarHorarioLoja();
        setInterval(verificarHorarioLoja, 60000); 
    }
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
        const detalhes = document.getElementById("detalhes-produto-modal");
        if (detalhes && !detalhes.innerHTML.includes("Loja Fechada no Momento") && produtoSendoVisto) { abrirModalProduto(produtoSendoVisto.id); }
    } else {
        if (bannerHtml) bannerHtml.style.display = "none";
    }
}

// ==========================================
// RASTREADOR DE ENTREGAS AO VIVO (NOTIFICAÇÃO)
// ==========================================
let memoriaStatusPedidos = {}; 

async function rastrearPedidosEmAndamento() {
    const clienteId = obterOuCriarClienteId();
    if (!clienteId) return;

    try {
        // Puxamos os pedidos recentes do cliente. Removemos o filtro de status da URL 
        // para garantir que o Supabase não barre a resposta por erro de sintaxe.
        const res = await fetchSupabase(`/rest/v1/pedidos?select=id,status&cliente_id=eq.${clienteId}&order=data_pedido.desc&limit=5`);
        
        if (!res.ok) return;
        const pedidosAoVivo = await res.json();

        pedidosAoVivo.forEach(pedidoDb => {
            // Se o pedido não tem status ou já foi finalizado/entregue antes, pula
            if (!pedidoDb.status) return;

            const statusAntigo = memoriaStatusPedidos[pedidoDb.id];
            
            // Transformamos o status do banco em minúsculo e removemos espaços extras
            const statusNovoLimpo = String(pedidoDb.status).toLowerCase().trim();
            
            // CHECAGEM BLINDADA: Se o status antigo existia, mudou, e o novo contém a palavra "entrega"
            if (statusAntigo && statusAntigo !== pedidoDb.status && statusNovoLimpo.includes("entrega")) {
                
                // 1. Toca o som da entrega
                const somEntrega = document.getElementById("som-entrega");
                if (somEntrega) {
                    somEntrega.volume = 1;
                    somEntrega.currentTime = 0;
                    somEntrega.play().catch(e => console.log("Navegador barrou o som automático:", e));
                }

                // 2. Dispara o Alerta Visual na Tela do Cliente
                mostrarAviso(`Seu pedido #${pedidoDb.id} acabou de sair para entrega! 🛵 Prepare-se para receber.`, "Saiu para Entrega!", "sucesso");
                
                // 3. Atualiza o histórico do cliente na tela
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
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?id=eq.1&select=*`, {
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
        // O Supabase cuida de criar o link de autenticação e avisa para onde o cliente deve voltar
        // Usamos o window.location.origin para ele voltar exatamente para o link atual do seu site
        const redirecionarPara = window.location.origin;

        window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirecionarPara)}`;
    } catch (erro) {
        console.error("Erro ao iniciar login com Google:", erro);
        mostrarAviso("Não foi possível conectar com o Google no momento.", "Erro de Login");
    }
}

// 2. Checa se o cliente acabou de voltar do login do Google e captura os dados dele
function checarRetornoLoginGoogle() {
    // Quando o Supabase faz o login, ele devolve os dados escondidos na URL (atrás de um #access_token)
    const hash = window.location.hash;
    
    if (hash && hash.includes("access_token=")) {
        // Limpa a URL para o cliente não ver aquele link gigante cheio de códigos
        window.location.hash = "";

        // Fazemos uma chamada rápida para ler o token que o Supabase injetou e descobrir quem é o cliente
        setTimeout(async () => {
            try {
                const resUser = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                    method: 'GET',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${hash.split("access_token=")[1].split("&")[0]}`
                    }
                });

                if (resUser.ok) {
                    const usuarioGoogle = await resUser.json();
                    
                    // Pegamos o nome completo que está cadastrado na conta do Google dele
                    const nomeGoogle = usuarioGoogle.user_metadata.full_name || usuarioGoogle.user_metadata.name || "";

                    // Puxamos o perfil atual do localStorage se já existir algo guardado
                    let perfilExistente = JSON.parse(localStorage.getItem("vilelaburgers_perfil") || "{}");

                    // Atualizamos o perfil local com o Nome vindo diretamente do Google!
                    perfilExistente.nome = nomeGoogle;

                    // Salvamos de volta no localStorage do navegador dele
                    localStorage.setItem("vilelaburgers_perfil", JSON.stringify(perfilExistente));

                    // Atualiza os campos na tela do cliente imediatamente
                    carregarPerfilNaTela();
                    preencherCheckoutComPerfil();

                    mostrarAviso(`Olá, ${nomeGoogle}! Seu nome foi importado do Google com sucesso.`, "Login Concluído!", "sucesso");
                    navegarPara('perfil');
                }
            } catch (e) {
                console.error("Erro ao processar dados do usuário Google:", e);
            }
        }, 500);
    }
}

// Executa o detector de retorno toda vez que a página inicia
// 2. Checa se o cliente acabou de voltar do login do Google e captura os dados dele
function checarRetornoLoginGoogle() {
    // Pegamos a URL inteira para extrair o token, mesmo que o navegador mude o hash de lugar
    const urlAtual = window.location.href;
    
    if (urlAtual.includes("access_token=")) {
        try {
            // Extrai o token de acesso direto da URL gigante
            const tokenCompleto = urlAtual.split("access_token=")[1].split("&")[0];

            // Limpa a URL imediatamente removendo os códigos gigantes para o link ficar limpo (localhost:3000)
            window.history.replaceState({}, document.title, window.location.pathname);

            // Aguardamos 1 segundo para garantir que o resto do sistema (cardápio/configurações) já iniciou
            setTimeout(async () => {
                try {
                    const resUser = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                        method: 'GET',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${tokenCompleto}`
                        }
                    });

                    if (resUser.ok) {
                        const usuarioGoogle = await resUser.json();
                        
                        // Captura o nome completo vindo do Google
                        const nomeGoogle = usuarioGoogle.user_metadata.full_name || usuarioGoogle.user_metadata.name || "Cliente Google";

                        // Puxa o perfil atual se houver, ou cria um novo
                        let perfilExistente = JSON.parse(localStorage.getItem("vilelaburgers_perfil") || "{}");

                        // Salva o nome importado do Google
                        perfilExistente.nome = nomeGoogle;

                        // Guarda de volta no localStorage do navegador do cliente
                        localStorage.setItem("vilelaburgers_perfil", JSON.stringify(perfilExistente));

                        // Força a atualização dos inputs na tela
                        carregarPerfilNaTela();
                        preencherCheckoutComPerfil();

                        // Dispara o aviso verde de sucesso e joga o cliente para a aba de Perfil!
                        mostrarAviso(`Olá, ${nomeGoogle}! Seu perfil foi conectado com o Google com sucesso.`, "Login Concluído!", "sucesso");
                        navegarPara('perfil');
                    }
                } catch (erroInterno) {
                    console.error("Erro ao consultar dados do usuário no Supabase:", erroInterno);
                }
            }, 1000); // 1 segundo de folga para o sistema carregar redondo

        } catch (e) {
            console.error("Erro ao processar URL de retorno do Google:", e);
        }
    }
}

// Roda a função assim que o cliente abre o site
carregarIdentidadeVisual();

// === INICIALIZAÇÃO DO SISTEMA ===
carregarConfiguracoes(); 
carregarCardapioDoBanco(); 
renderizarRodape();