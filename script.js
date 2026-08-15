// === 1. CREDENCIAIS DA API (SUPABASE) ===
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let cardapio = [];
let carrinho = [];
let produtoSendoVisto = null;

// === 2. EXTRAÇÃO DE DADOS (API DO SUPABASE) ===
async function carregarCardapioDoBanco() {
    try {
        // 1. Apontamos a extração para a nossa VIEW inteligente
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/cardapio_inteligente?select=*&ativo=eq.true`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!resposta.ok) {
            throw new Error(`Erro na API: HTTP ${resposta.status}`);
        }

        const dados = await resposta.json();

        // 2. Mapeamos os dados trazendo a nova coluna de estoque
        cardapio = dados.map(item => ({
            id: item.id,
            categoria: item.categoria,
            nome: item.nome,
            descricao: item.descricao,
            preco: parseFloat(item.preco),
            imagem: item.imagem,
            tem_estoque: item.tem_estoque, // <-- O SEGREDO ESTÁ AQUI
            adicionais: [] 
        }));

        // Chama a função para desenhar na tela
        renderizarCardapio();

    } catch (erro) {
        console.error("Falha na extração dos dados:", erro);
        alert("Erro ao conectar com o cardápio digital. Verifique o Console (F12).");
    }
}

// === 3. RENDERIZAÇÃO DO LAYOUT MODERNO ===
function renderizarCardapio(categoriaFiltro = "Todos") {
    // Pegando o ID correto do nosso index.html
    const lista = document.getElementById("lista-produtos"); 
    lista.innerHTML = "";

    cardapio.forEach(produto => {
        if (categoriaFiltro === "Todos" || produto.categoria === categoriaFiltro) {
            
            // REGRA DE ESTOQUE: Verifica se o lanche tem ingredientes suficientes
            const isEsgotado = produto.tem_estoque === false; 
            
            // Monta as classes e o evento dependendo da situação
            const classeCard = isEsgotado ? "produto-card esgotado" : "produto-card";
            const eventoClique = isEsgotado ? "" : `onclick="abrirModalProduto(${produto.id})"`;
            const badgeEsgotado = isEsgotado ? `<div class="selo-esgotado">Ingredientes Esgotados</div>` : "";

            lista.innerHTML += `
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
}

function filtrarCategoria(categoria, elementoBotao) {
    document.querySelectorAll('.btn-categoria').forEach(btn => btn.classList.remove('ativo'));
    elementoBotao.classList.add('ativo');
    renderizarCardapio(categoria);
}

// === 4. LÓGICA DO MODAL (ADICIONAIS DO BANCO) ===
async function abrirModalProduto(id) {
    produtoSendoVisto = cardapio.find(p => p.id === id);
    const modal = document.getElementById("modal-produto");
    const detalhes = document.getElementById("detalhes-produto-modal");

    detalhes.innerHTML = `<p style="text-align: center; padding: 20px; color: #fff;">Carregando opções...</p>`;
    modal.classList.remove("escondido");

    try {
        const resExtras = await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?select=id,nome,preco_adicional&preco_adicional=gt.0&estoque=gt.0`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const adicionaisDoBanco = await resExtras.json();

        let htmlAdicionais = "";
        
        if (adicionaisDoBanco.length > 0 && produtoSendoVisto.categoria !== "Bebidas") {
            htmlAdicionais += `<div class="adicionais-lista" style="margin-top:15px; border-top: 1px solid #333; padding-top: 15px;">
                <h4 style="margin-bottom: 10px; color: #fff;">Turbine seu lanche:</h4>`;
            
            adicionaisDoBanco.forEach(add => {
                htmlAdicionais += `
                    <div class="adicional-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 12px; background: #222; border-radius: 8px; border: 1px solid #333;">
                        <span style="color: #fff; font-weight: 500;">${add.nome} <br><small style="color: #aaa;">+ R$ ${add.preco_adicional.toFixed(2).replace('.', ',')}</small></span>
                        
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <button type="button" onclick="alterarQtdAdicional('${add.id}', -1)" style="width: 32px; height: 32px; border-radius: 6px; background: #444; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: 0.2s;">-</button>
                            
                            <span class="qtd-adicional-span" id="qtd-add-${add.id}" data-id="${add.id}" data-nome="${add.nome}" data-preco="${add.preco_adicional}" style="font-weight: bold; color: #fff; width: 15px; text-align: center; font-size: 16px;">0</span>
                            
                            <button type="button" onclick="alterarQtdAdicional('${add.id}', 1)" style="width: 32px; height: 32px; border-radius: 6px; background: #ff5e00; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: 0.2s;">+</button>
                        </div>
                    </div>
                `;
            });
            htmlAdicionais += `</div>`;
        }

        detalhes.innerHTML = `
            <div class="produto-imagem" style="background-image: url('${produtoSendoVisto.imagem}'); height: 200px; background-size: cover; background-position: center; border-radius: 10px; margin-bottom: 15px;"></div>
            <h2 style="color: #fff;">${produtoSendoVisto.nome}</h2>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 10px;">${produtoSendoVisto.descricao}</p>
            <h3 style="color: #ff5e00; font-size: 22px;">R$ ${produtoSendoVisto.preco.toFixed(2).replace('.', ',')}</h3>
            ${htmlAdicionais}
            <button class="btn-add-carrinho" onclick="confirmarAdicao()" style="width: 100%; padding: 15px; background: #2ed573; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 15px; cursor: pointer;">
                Adicionar ao Pedido
            </button>
        `;

    } catch (erro) {
        console.error("Erro ao buscar adicionais:", erro);
        detalhes.innerHTML = `<p style="color: red;">Erro ao carregar. Tente novamente.</p>`;
    }
}

// === FUNÇÃO NOVA: FAZ OS BOTÕES + E - FUNCIONAREM ===
function alterarQtdAdicional(id, delta) {
    const span = document.getElementById(`qtd-add-${id}`);
    let qtd = parseInt(span.innerText) + delta;
    if (qtd < 0) qtd = 0;
    if (qtd > 10) qtd = 10; // Trava de segurança (máximo 10 extras iguais)
    span.innerText = qtd;
}

// === FUNÇÃO: JOGA O LANCHE E OS EXTRAS NO CARRINHO ===
function confirmarAdicao() {
    const adicionaisEscolhidos = [];
    let totalAdicionais = 0;

    // Busca todos os números do novo contador de adicionais
    const spansQtd = document.querySelectorAll(".qtd-adicional-span");
    
    spansQtd.forEach(span => {
        const qtd = parseInt(span.innerText);
        if (qtd > 0) { // Só entra no carrinho se o cliente colocou 1 ou mais
            const idAdd = span.getAttribute("data-id");
            const nomeAdd = span.getAttribute("data-nome");
            const precoAdd = parseFloat(span.getAttribute("data-preco"));

            adicionaisEscolhidos.push({
                id: idAdd, 
                nome: nomeAdd,
                preco: precoAdd,
                quantidade: qtd
            });
            totalAdicionais += (precoAdd * qtd);
        }
    });

    const itemParaCarrinho = {
        produtoBase: produtoSendoVisto,
        adicionais: adicionaisEscolhidos,
        precoTotalItem: produtoSendoVisto.preco + totalAdicionais
    };

    carrinho.push(itemParaCarrinho);
    
    atualizarContadorCart();
    document.getElementById("modal-produto").classList.add("escondido");
    
}


// === 5. LÓGICA DO CARRINHO E CHECKOUT ===
function atualizarContadorCart() {
    document.getElementById("contador-carrinho").innerText = carrinho.length;
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
                    <strong>1x ${item.produtoBase.nome}</strong>
                    ${listaAddsHtml}
                    <div style="color: var(--laranja-fogo); margin-top: 5px;">R$ ${item.precoTotalItem.toFixed(2).replace('.', ',')}</div>
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

    // Calcula o total
    const totalCalculado = carrinho.reduce((acc, item) => acc + item.precoTotalItem, 0);

    // Captura o botão de forma segura pela ação de clique dele
    const btnFinalizar = document.querySelector("button[onclick='enviarParaWhatsApp()']");
    let textoOriginalBotao = "Enviar Pedido";

    if (btnFinalizar) {
        textoOriginalBotao = btnFinalizar.innerText;
        btnFinalizar.innerText = "Processando Pedido...";
        btnFinalizar.disabled = true;
    }

    try {
        // PASSO 1: Salvar o Pedido no Banco de Dados
        const resPedido = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation' 
            },
            body: JSON.stringify({
                nome_cliente: nome,
                forma_pagamento: pagamento,
                total: totalCalculado
            })
        });

        if (!resPedido.ok) throw new Error("Erro ao gerar pedido no banco.");
        const pedidoSalvo = await resPedido.json();
        const idDoPedido = pedidoSalvo[0].id; 

        // =======================================================
        // PASSO 2: SALVAR OS ITENS E OS ADICIONAIS
        // =======================================================
        for (const item of carrinho) {
            
            // 2.1: Salva o Lanche
            const resItem = await fetch(`${SUPABASE_URL}/rest/v1/itens_pedido`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation' 
                },
                body: JSON.stringify({
                    pedido_id: idDoPedido,
                    produto_id: item.produtoBase.id,
                    quantidade: 1, 
                    preco_unitario: item.precoTotalItem
                })
            });

            if (!resItem.ok) throw new Error("Erro ao salvar lanche.");
            const itemSalvo = await resItem.json();
            const idDoItemSalvo = itemSalvo[0].id; 

            // 2.2: Salva Adicionais com a Quantidade Correta!
            for (const extra of item.adicionais) {
                await fetch(`${SUPABASE_URL}/rest/v1/itens_pedido_adicionais`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        item_pedido_id: idDoItemSalvo,
                        ingrediente_id: parseInt(extra.id),
                        quantidade: extra.quantidade,  // <-- Agora envia ex: 2, 3...
                        preco_unitario: extra.preco
                    })
                });
            }
        }
        // =======================================================

        // PASSO 3: Montar a mensagem do WhatsApp
        let textoPedido = `🔥 *NOVO PEDIDO #${idDoPedido} - FIRE BURGER* 🔥\n\n`;
        textoPedido += `👤 *Cliente:* ${nome}\n`;
        textoPedido += `📍 *Endereço:* ${endereco}\n`;
        
        if (pagamento === "Dinheiro") {
            const troco = document.getElementById("troco-dinheiro").value;
            textoPedido += `💳 *Pagamento:* Dinheiro (Troco para R$ ${troco})\n\n`;
        } else {
            textoPedido += `💳 *Pagamento:* ${pagamento}\n\n`;
        }

        textoPedido += "🛒 *ITENS DO PEDIDO:*\n";
        carrinho.forEach(item => {
            textoPedido += `\n*1x ${item.produtoBase.nome}* (R$ ${item.produtoBase.preco.toFixed(2).replace('.', ',')})\n`;
            
            // Coloca a quantidade e o subtotal do adicional na mensagem
            item.adicionais.forEach(add => {
                const subtotalExtra = add.preco * add.quantidade;
                textoPedido += `   + ${add.quantidade}x ${add.nome} (R$ ${subtotalExtra.toFixed(2).replace('.', ',')})\n`;
            });
            
            textoPedido += `   *Subtotal do item: R$ ${item.precoTotalItem.toFixed(2).replace('.', ',')}*\n`;
        });

        textoPedido += `\n💰 *TOTAL DO PEDIDO: R$ ${totalCalculado.toFixed(2).replace('.', ',')}*`;

        // Restaura o botão e limpa os dados da tela
        if (btnFinalizar) {
            btnFinalizar.innerText = textoOriginalBotao;
            btnFinalizar.disabled = false;
        }
        
        carrinho = [];
        atualizarContadorCart();
        fecharCheckout();
        
        document.getElementById("nome-cliente").value = "";
        document.getElementById("endereco-cliente").value = "";

        // Abre o WhatsApp
        const telefone = "5543996150221"; 
        const mensagemCodificada = encodeURIComponent(textoPedido);
        window.open(`https://wa.me/${telefone}?text=${mensagemCodificada}`, '_blank');

    } catch (erro) {
        console.error("Erro no checkout:", erro);
        alert("Houve um erro de conexão ao processar o pedido. Verifique seu console F12.");
        
        if (btnFinalizar) {
            btnFinalizar.innerText = textoOriginalBotao;
            btnFinalizar.disabled = false;
        }
    }
}// === 7. FUNÇÕES DE FECHAR A JANELA (GARANTIA) ===

// Cobre o nome 1
function fecharModalProduto() {
    document.getElementById("modal-produto").classList.add("escondido");
}

// Cobre o nome 2 (caso esteja assim no seu HTML)
function fecharModal() {
    document.getElementById("modal-produto").classList.add("escondido");
}

// BÔNUS VIP: Fecha a janela se o cliente clicar no fundo escuro fora do lanche
window.addEventListener('click', function(event) {
    const modal = document.getElementById("modal-produto");
    if (event.target === modal) {
        modal.classList.add("escondido");
    }
});

// === INICIA O SISTEMA AO ABRIR O SITE ===
carregarCardapioDoBanco();