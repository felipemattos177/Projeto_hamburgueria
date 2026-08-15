// === 1. CREDENCIAIS DA API (SUPABASE) ===
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let cardapio = [];
let carrinho = [];
let produtoSendoVisto = null;

// === 2. EXTRAÇÃO DE DADOS (API DO SUPABASE) ===
async function carregarCardapioDoBanco() {
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=*&ativo=eq.true`, {
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

        // Transforma o retorno do banco no formato que a tela espera
        cardapio = dados.map(item => ({
            id: item.id,
            categoria: item.categoria,
            nome: item.nome,
            descricao: item.descricao,
            preco: parseFloat(item.preco),
            imagem: item.imagem,
            adicionais: [] // Depois podemos criar a tabela de adicionais no banco
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
            lista.innerHTML += `
                <div class="produto-card" onclick="abrirModalProduto(${produto.id})">
                    <div class="produto-imagem" style="background-image: url('${produto.imagem}');"></div>
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

// === 4. LÓGICA DO MODAL (ADICIONAIS) ===
function abrirModalProduto(id) {
    produtoSendoVisto = cardapio.find(p => p.id === id);
    const modal = document.getElementById("modal-produto");
    const detalhes = document.getElementById("detalhes-produto-modal");

    let htmlAdicionais = "";
    if (produtoSendoVisto.adicionais.length > 0) {
        htmlAdicionais += `<div class="adicionais-lista"><h4>Turbine seu lanche:</h4>`;
        produtoSendoVisto.adicionais.forEach(add => {
            htmlAdicionais += `
                <label class="adicional-item">
                    <span>${add.nome} (+ R$ ${add.preco.toFixed(2).replace('.', ',')})</span>
                    <input type="checkbox" class="check-adicional" data-nome="${add.nome}" data-preco="${add.preco}">
                </label>
            `;
        });
        htmlAdicionais += `</div>`;
    }

    detalhes.innerHTML = `
        <img src="${produtoSendoVisto.imagem}" class="img-destaque-modal">
        <h2>${produtoSendoVisto.nome}</h2>
        <p style="color: var(--texto-cinza); font-size: 14px; margin-bottom: 10px;">${produtoSendoVisto.descricao}</p>
        <h3 style="color: var(--laranja-fogo);">R$ ${produtoSendoVisto.preco.toFixed(2).replace('.', ',')}</h3>
        ${htmlAdicionais}
        <button class="btn-add-carrinho" onclick="confirmarAdicao()">Adicionar ao Pedido</button>
    `;

    modal.classList.remove("escondido");
}

function fecharModal() {
    document.getElementById("modal-produto").classList.add("escondido");
    produtoSendoVisto = null;
}

function confirmarAdicao() {
    let adicionaisEscolhidos = [];
    let valorAdicionais = 0;

    const checkboxes = document.querySelectorAll(".check-adicional:checked");
    checkboxes.forEach(chk => {
        const nome = chk.getAttribute("data-nome");
        const preco = parseFloat(chk.getAttribute("data-preco"));
        adicionaisEscolhidos.push({ nome, preco });
        valorAdicionais += preco;
    });

    const itemCarrinho = {
        produtoBase: produtoSendoVisto,
        adicionais: adicionaisEscolhidos,
        precoTotalItem: produtoSendoVisto.preco + valorAdicionais
    };

    carrinho.push(itemCarrinho);
    atualizarContadorCart();
    fecharModal();
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
                listaAddsHtml += `<li>+ ${add.nome} (R$ ${add.preco.toFixed(2).replace('.', ',')})</li>`;
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

        // PASSO 2: Salvar os Itens (AQUI SEU TRIGGER DO SUPABASE É ACIONADO)
        for (const item of carrinho) {
            await fetch(`${SUPABASE_URL}/rest/v1/itens_pedido`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pedido_id: idDoPedido,
                    produto_id: item.produtoBase.id,
                    quantidade: 1, 
                    preco_unitario: item.precoTotalItem
                })
            });
        }

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
            item.adicionais.forEach(add => {
                textoPedido += `   + ${add.nome} (R$ ${add.preco.toFixed(2).replace('.', ',')})\n`;
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
        const telefone = "5543999999999"; // <-- Lembre-se de colocar o seu número real aqui depois!
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
}

// === INICIA O SISTEMA AO ABRIR O SITE ===
carregarCardapioDoBanco();