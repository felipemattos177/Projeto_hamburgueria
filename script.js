// === 1. CREDENCIAIS DA API (SUPABASE) ===
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let cardapio = [];
let carrinho = [];
let produtoSendoVisto = null;

// === 2. EXTRAÇÃO DE DADOS (API DO SUPABASE) ===
async function carregarCardapioDoBanco() {
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/cardapio_inteligente?select=*&ativo=eq.true`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });

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
        }));

        renderizarCardapio();

    } catch (erro) {
        console.error("Falha na extração dos dados:", erro);
        alert("Erro ao conectar com o cardápio digital. Verifique o Console (F12).");
    }
}

// === 3. RENDERIZAÇÃO DO LAYOUT MODERNO (OTIMIZADO) ===
function renderizarCardapio(categoriaFiltro = "Todos") {
    const lista = document.getElementById("lista-produtos"); 
    let htmlAcumulado = ""; 

    cardapio.forEach(produto => {
        if (categoriaFiltro === "Todos" || produto.categoria === categoriaFiltro) {
            
            const qtdNoCarrinho = carrinho.filter(item => item.produtoBase.id == produto.id).length;
            const isEsgotado = (produto.tem_estoque === false) || (qtdNoCarrinho >= produto.estoque_maximo); 
            
            const classeCard = isEsgotado ? "produto-card esgotado" : "produto-card";
            const eventoClique = isEsgotado ? "" : `onclick="abrirModalProduto(${produto.id})"`;
            const badgeEsgotado = isEsgotado ? `<div class="selo-esgotado">Esgotado</div>` : "";

            htmlAcumulado += `
                <div class="${classeCard}" ${eventoClique}>
                    <div class="produto-imagem" style="background-image: url('${produto.imagem}'); position: relative;">
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

// === 4. LÓGICA DO MODAL E CÁLCULO CIRÚRGICO DE ESTOQUE ===
async function abrirModalProduto(id) {
    document.body.classList.add("modal-aberto");
    produtoSendoVisto = cardapio.find(p => p.id == id);
    const modal = document.getElementById("modal-produto");
    const detalhes = document.getElementById("detalhes-produto-modal");

    detalhes.innerHTML = `<p style="text-align: center; padding: 20px; color: #fff;">Carregando opções...</p>`;
    modal.classList.remove("escondido");

    try {
        // 1. Busca adicionais
        const resExtras = await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?select=id,nome,preco_adicional,estoque&preco_adicional=gt.0&estoque=gt.0`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const adicionaisDoBanco = await resExtras.json();

        // 2. Busca Fichas Técnicas em Tempo Real
        const resRec = await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?select=*`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const receitasAtualizadas = await resRec.json();

        const receitaDesteLanche = receitasAtualizadas.filter(r => r.produto_id == produtoSendoVisto.id);

        let htmlAdicionais = "";
        
        if (adicionaisDoBanco.length > 0 && produtoSendoVisto.categoria !== "Bebidas") {
            htmlAdicionais += `<div class="adicionais-lista" style="margin-top:15px; border-top: 1px solid #333; padding-top: 15px;">
                <h4 style="margin-bottom: 10px; color: #fff;">Turbine seu lanche:</h4>`;
            
            adicionaisDoBanco.forEach(add => {
                
                let qtdPresaNoCarrinho = 0;
                carrinho.forEach(itemCart => {
                    const recCart = receitasAtualizadas.filter(r => r.produto_id == itemCart.produtoBase.id);
                    const usoReceita = recCart.find(r => r.ingrediente_id == add.id);
                    if (usoReceita) qtdPresaNoCarrinho += Number(usoReceita.quantidade);

                    itemCart.adicionais.forEach(extra => {
                        if (extra.id == add.id) qtdPresaNoCarrinho += Number(extra.quantidade);
                    });
                });
                
                let qtdGastaNesteLanche = 0;
                const usoNeste = receitaDesteLanche.find(r => r.ingrediente_id == add.id);
                if (usoNeste) qtdGastaNesteLanche = Number(usoNeste.quantidade);

                const estoqueRealDisponivel = Number(add.estoque) - qtdPresaNoCarrinho - qtdGastaNesteLanche;
                
                if(estoqueRealDisponivel > 0) {
                    htmlAdicionais += `
                        <div class="adicional-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 12px; background: #222; border-radius: 8px; border: 1px solid #333;">
                            <span style="color: #fff; font-weight: 500;">${add.nome} <br><small style="color: #aaa;">+ R$ ${Number(add.preco_adicional).toFixed(2).replace('.', ',')}</small></span>
                            
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <button type="button" onclick="alterarQtdAdicional('${add.id}', -1)" style="width: 32px; height: 32px; border-radius: 6px; background: #444; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px;">-</button>
                                
                                <span class="qtd-adicional-span" id="qtd-add-${add.id}" data-id="${add.id}" data-nome="${add.nome}" data-preco="${add.preco_adicional}" data-estoquereal="${estoqueRealDisponivel}" style="font-weight: bold; color: #fff; width: 15px; text-align: center; font-size: 16px;">0</span>
                                
                                <button type="button" onclick="alterarQtdAdicional('${add.id}', 1)" style="width: 32px; height: 32px; border-radius: 6px; background: #ff5e00; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px;">+</button>
                            </div>
                        </div>
                    `;
                }
            });
            htmlAdicionais += `</div>`;
        }

        // --- CAIXA DE QUANTIDADE DO LANCHE INSERIDA AQUI ---
        detalhes.innerHTML = `
            <div class="produto-imagem" style="background-image: url('${produtoSendoVisto.imagem}'); height: 200px; background-size: cover; background-position: center; border-radius: 10px; margin-bottom: 15px;"></div>
            <h2 style="color: #fff;">${produtoSendoVisto.nome}</h2>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 10px;">${produtoSendoVisto.descricao}</p>
            <h3 style="color: #ff5e00; font-size: 22px;">R$ ${produtoSendoVisto.preco.toFixed(2).replace('.', ',')}</h3>
            
            ${htmlAdicionais}
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding: 15px; background: #222; border-radius: 8px;">
                <span style="color: #fff; font-weight: bold; font-size: 16px;">Quantidade:</span>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button type="button" onclick="alterarQtdBase(-1)" style="width: 40px; height: 40px; border-radius: 8px; background: #444; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 20px;">-</button>
                    <span id="qtd-produto-base" style="font-weight: bold; color: #fff; font-size: 18px;">1</span>
                    <button type="button" onclick="alterarQtdBase(1)" style="width: 40px; height: 40px; border-radius: 8px; background: #ff5e00; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 20px;">+</button>
                </div>
            </div>

            <button class="btn-add-carrinho" onclick="confirmarAdicao()" style="width: 100%; padding: 15px; background: #2ed573; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 15px; cursor: pointer;">
                Adicionar ao Pedido
            </button>
        `;

    } catch (erro) {
        console.error("Erro ao buscar adicionais:", erro);
        detalhes.innerHTML = `<p style="color: red;">Erro ao carregar. Tente novamente.</p>`;
    }
}

// === FUNÇÕES NOVAS: CONTROLE DE QUANTIDADE DO LANCHE ===
function alterarQtdBase(delta) {
    const span = document.getElementById("qtd-produto-base");
    let qtd = parseInt(span.innerText) + delta;
    if (qtd < 1) qtd = 1; // Não deixa pedir menos de 1 lanche
    span.innerText = qtd;
}

// === FUNÇÕES DE ADICIONAIS E CONFIRMAÇÃO ===
function alterarQtdAdicional(id, delta) {
    const span = document.getElementById(`qtd-add-${id}`);
    const estoqueReal = parseInt(span.getAttribute("data-estoquereal")); 
    
    let qtd = parseInt(span.innerText) + delta;
    if (qtd < 0) qtd = 0;
    
    if (qtd > estoqueReal) {
        qtd = estoqueReal;
        alert(`Você atingiu o limite! Temos apenas ${estoqueReal} porção(ões) disponível(is) para uso extra.`);
    }
    
    span.innerText = qtd;
}

function confirmarAdicao() {
    const spanQtdBase = document.getElementById("qtd-produto-base");
    const qtdBaseEscolhida = spanQtdBase ? parseInt(spanQtdBase.innerText) : 1;

    // BLINDAGEM 1: Tem lanche suficiente pro pedido inteiro?
    const qtdJaNoCarrinho = carrinho.filter(item => item.produtoBase.id == produtoSendoVisto.id).length;
    if (qtdJaNoCarrinho + qtdBaseEscolhida > produtoSendoVisto.estoque_maximo) {
        alert(`Estoque atingido! O nosso estoque permite adicionar no máximo mais ${produtoSendoVisto.estoque_maximo - qtdJaNoCarrinho} unidade(s).`);
        return; 
    }

    const adicionaisEscolhidos = [];
    let totalAdicionais = 0;

    // BLINDAGEM 2: Multiplica os adicionais pelo número de lanches
    const spansQtd = document.querySelectorAll(".qtd-adicional-span");
    for (const span of spansQtd) {
        const qtdPorLanche = parseInt(span.innerText);
        if (qtdPorLanche > 0) { 
            const estoqueReal = parseInt(span.getAttribute("data-estoquereal"));
            const totalRequerido = qtdPorLanche * qtdBaseEscolhida; // Ex: Pede 2 lanches com 2 bacons = Precisa de 4 bacons

            if (totalRequerido > estoqueReal) {
                alert(`Estoque insuficiente de ${span.getAttribute("data-nome")}! Você pediu ${qtdPorLanche} porção(ões) para cada um dos ${qtdBaseEscolhida} lanches, necessitando de ${totalRequerido}, mas temos apenas ${estoqueReal}.`);
                return; // Trava a função!
            }

            const idAdd = span.getAttribute("data-id");
            const nomeAdd = span.getAttribute("data-nome");
            const precoAdd = parseFloat(span.getAttribute("data-preco"));

            adicionaisEscolhidos.push({ id: idAdd, nome: nomeAdd, preco: precoAdd, quantidade: qtdPorLanche });
            totalAdicionais += (precoAdd * qtdPorLanche);
        }
    }

    // ADIÇÃO MULTIPLA: Coloca no carrinho como linhas separadas (Melhor UX)
    for (let i = 0; i < qtdBaseEscolhida; i++) {
        const itemParaCarrinho = {
            produtoBase: produtoSendoVisto,
            adicionais: JSON.parse(JSON.stringify(adicionaisEscolhidos)), // Clona o array com segurança
            precoTotalItem: produtoSendoVisto.preco + totalAdicionais
        };
        carrinho.push(itemParaCarrinho);
    }

    atualizarContadorCart();
    renderizarCardapio(); 
    fecharModalProduto();
}

// === 5. LÓGICA DO CARRINHO E CHECKOUT ===
function atualizarContadorCart() {
    const qtdItens = carrinho.length;
    const barraSacola = document.getElementById("barra-sacola");
    
    if (qtdItens > 0) {
        // Mostra a barra flutuante
        barraSacola.classList.remove("escondido");
        
        // Atualiza a bolinha branca com a quantidade
        document.getElementById("contador-sacola").innerText = qtdItens;
        
        // Calcula a soma total em Reais do carrinho em tempo real
        const somaTotal = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
        
        // Atualiza o valor na barra
        document.getElementById("total-sacola").innerText = `R$ ${somaTotal.toFixed(2).replace('.', ',')}`;
    } else {
        // Se esvaziou o carrinho, esconde a barra
        barraSacola.classList.add("escondido");
    }
}

function abrirCheckout() {
    if (carrinho.length === 0) {
        alert("Seu carrinho está vazio!");
        return;
    }
    document.getElementById("tela-catalogo").classList.add("escondido");
    document.getElementById("tela-checkout").classList.remove("escondido");
    window.scrollTo(0, 0); 
    renderizarCheckout();
}

function fecharCheckout() {
    document.getElementById("tela-checkout").classList.add("escondido");
    document.getElementById("tela-catalogo").classList.remove("escondido");
}

function renderizarCheckout() {
    const divItens = document.getElementById("itens-checkout");
    divItens.innerHTML = "";
    let somaTotal = 0;

    carrinho.forEach((item, index) => {
        somaTotal += item.precoTotalItem;
        
        let listaAddsHtml = "";
        if (item.adicionais.length > 0) {
            listaAddsHtml = "<ul>";
            item.adicionais.forEach(add => {
                const subtotalAdd = add.preco * add.quantidade;
                listaAddsHtml += `<li>+ ${add.quantidade}x ${add.nome} (R$ ${subtotalAdd.toFixed(2).replace('.', ',')})</li>`;
            });
            listaAddsHtml += "</ul>";
        }

        divItens.innerHTML += `
            <div class="item-checkout-card">
                <div class="item-checkout-info">
                    <!-- === AQUI ESTÁ A MUDANÇA: Preço base ao lado do nome === -->
                    <strong>1x ${item.produtoBase.nome} <span style="color: #aaa; font-size: 13px;">(R$ ${item.produtoBase.preco.toFixed(2).replace('.', ',')})</span></strong>
                    
                    ${listaAddsHtml}
                    
                    <div style="color: var(--laranja-fogo); margin-top: 5px; font-weight: bold; font-size: 15px;">
                        Subtotal: R$ ${item.precoTotalItem.toFixed(2).replace('.', ',')}
                    </div>
                </div>
                <button class="btn-remover" onclick="removerDoCarrinho(${index})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    });

    document.getElementById("valor-total").innerText = `R$ ${somaTotal.toFixed(2).replace('.', ',')}`;
}

function removerDoCarrinho(index) {
    carrinho.splice(index, 1);
    atualizarContadorCart();
    renderizarCardapio();
    
    if (carrinho.length === 0) {
        fecharCheckout();
    } else {
        renderizarCheckout();
    }
}
// === 6. FINALIZAÇÃO, BANCO DE DADOS E WHATSAPP ===
function verificarTroco() {
    const formaPagamento = document.getElementById("forma-pagamento").value;
    const campoTroco = document.getElementById("troco-dinheiro");
    campoTroco.style.display = (formaPagamento === "Dinheiro") ? "block" : "none";
}

async function enviarParaWhatsApp() {
    const nome = document.getElementById("nome-cliente").value;
    const endereco = document.getElementById("endereco-cliente").value;
    const pagamento = document.getElementById("forma-pagamento").value;

    if (nome === "" || endereco === "") {
        alert("Preencha seu Nome e Endereço para a entrega!");
        return;
    }

    const totalCalculado = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);
    const btnFinalizar = document.querySelector("button[onclick='enviarParaWhatsApp()']");
    let textoOriginalBotao = "Enviar Pedido";

    if (btnFinalizar) {
        textoOriginalBotao = btnFinalizar.innerText;
        btnFinalizar.innerText = "Processando Pedido...";
        btnFinalizar.disabled = true;
    }

    try {
        const resPedido = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json', 'Prefer': 'return=representation' 
            },
            body: JSON.stringify({ nome_cliente: nome, forma_pagamento: pagamento, total: totalCalculado })
        });

        if (!resPedido.ok) throw new Error("Erro ao gerar pedido no banco.");
        const pedidoSalvo = await resPedido.json();
        const idDoPedido = pedidoSalvo[0].id; 

        for (const item of carrinho) {
            const resItem = await fetch(`${SUPABASE_URL}/rest/v1/itens_pedido`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json', 'Prefer': 'return=representation' 
                },
                body: JSON.stringify({
                    pedido_id: idDoPedido, produto_id: item.produtoBase.id,
                    quantidade: 1, preco_unitario: item.precoTotalItem
                })
            });

            if (!resItem.ok) throw new Error("Erro ao salvar lanche.");
            const itemSalvo = await resItem.json();
            const idDoItemSalvo = itemSalvo[0].id; 

            for (const extra of item.adicionais) {
                await fetch(`${SUPABASE_URL}/rest/v1/itens_pedido_adicionais`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        item_pedido_id: idDoItemSalvo, ingrediente_id: parseInt(extra.id),
                        quantidade: extra.quantidade, preco_unitario: extra.preco
                    })
                });
            }
        }

        let textoPedido = `🔥 *NOVO PEDIDO #${idDoPedido} - FIRE BURGER* 🔥\n\n`;
        textoPedido += `👤 *Cliente:* ${nome}\n📍 *Endereço:* ${endereco}\n`;
        
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
        
        carrinho = [];
        atualizarContadorCart();
        fecharCheckout();
        document.getElementById("nome-cliente").value = "";
        document.getElementById("endereco-cliente").value = "";

        const telefone = "5543996150221"; 
        window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(textoPedido)}`, '_blank');

    } catch (erro) {
        console.error("Erro no checkout:", erro);
        alert("Ops! Um ou mais itens do seu pedido esgotaram do nosso estoque neste momento. Por favor, revise o carrinho.");
        if (btnFinalizar) { btnFinalizar.innerText = textoOriginalBotao; btnFinalizar.disabled = false; }
    }
}

// === 7. FUNÇÕES DE FECHAR A JANELA ===
function fecharModalProduto() { document.getElementById("modal-produto").classList.add("escondido"); }
function fecharModal() { document.getElementById("modal-produto").classList.add("escondido"); }

window.addEventListener('click', function(event) {
    const modal = document.getElementById("modal-produto");
    if (event.target === modal) modal.classList.add("escondido");
});

// === INICIA O SISTEMA AO ABRIR O SITE ===
carregarCardapioDoBanco();

// === 8. RODAPÉ DO DESENVOLVEDOR (BRANDING MATHS LABS) ===
function renderizarRodape() {
    const dataAtual = new Date();
    const ano = dataAtual.getFullYear(); // Pega o ano automaticamente (2026, 2027...)
    
    // Cria uma "Versão Automática" baseada no ano e mês para parecer sempre atualizado
    // Exemplo do formato: v1.2026.08
    const mes = String(dataAtual.getMonth() + 1).padStart(2, '0');
    const versaoApp = `v1.${ano}.${mes}`; 

    const footer = document.createElement("footer");
    // Estilo dark moderno, combinando com o app
    footer.style.cssText = "text-align: center; padding: 30px 15px; background: #111; color: #777; font-size: 13px; margin-top: 50px; border-top: 1px solid #222; width: 100%;";
    
    footer.innerHTML = `
        <div style="margin-bottom: 8px;">&copy; ${ano} Fire Burger. Todos os direitos reservados.</div>
        <div style="margin-bottom: 8px;">
            Desenvolvido por <a href="https://mathshub.com.br" target="_blank" style="color: #ff5e00; text-decoration: none; font-weight: bold;">Maths Labs</a> 🚀
        </div>
        <div style="font-size: 11px; color: #444; margin-top: 10px;">Versão do Sistema ${versaoApp}</div>
    `;

    document.body.appendChild(footer);
}

// Executa a função para o rodapé aparecer sozinho
renderizarRodape();