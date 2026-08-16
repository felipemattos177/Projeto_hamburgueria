// === 1. CREDENCIAIS DA API (SUPABASE) ===
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let cardapio = [];
let carrinho = [];
let produtoSendoVisto = null;

// === COFRE DE CONFIGURAÇÕES E ESTADO DA LOJA ===
let configLoja = { 
    chave_pix: "", nome_recebedor: "", cidade_recebedor: "Arapoti",
    dias_trabalho: "0,1,2,3,4,5,6", horario_abertura: "00:00", horario_fechar: "23:59", numero_whatsapp: ""
};
let lojaAberta = true;
let mensagemFechado = "";

// === GERAÇÃO E PERSISTÊNCIA DO ID DO CLIENTE ===
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
    }
}

// === 3. RENDERIZAÇÃO DO LAYOUT MODERNO ===
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

            htmlAcumulado += `
                <div class="${classeCard}" ${eventoClique}>
                    <div class="produto-imagem" style="background-image: url('${produto.imagem}');">
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

// === 4. LÓGICA DO MODAL E ESTOQUE ===
async function abrirModalProduto(id) {
    document.body.classList.add("modal-aberto"); 
    produtoSendoVisto = cardapio.find(p => p.id == id);
    const modal = document.getElementById("modal-produto");
    const detalhes = document.getElementById("detalhes-produto-modal");

    detalhes.innerHTML = `<p style="text-align: center; padding: 20px; color: #fff;">Carregando opções...</p>`;
    modal.classList.remove("escondido");

    try {
        const resExtras = await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?select=id,nome,preco_adicional,estoque&preco_adicional=gt.0&estoque=gt.0`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const adicionaisDoBanco = await resExtras.json();

        const resRec = await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?select=*`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const receitasAtualizadas = await resRec.json();

        const receitaDesteLanche = receitasAtualizadas.filter(r => r.produto_id == produtoSendoVisto.id);

        let htmlAdicionais = "";
        
        if (adicionaisDoBanco.length > 0 && produtoSendoVisto.categoria !== "Bebidas" && lojaAberta) {
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
                                <button type="button" onclick="alterarQtdAdicional('${add.id}', 1)" style="width: 32px; height: 32px; border-radius: 6px; background: var(--laranja-fogo, #ff5e00); color: white; border: none; font-weight: bold; cursor: pointer; font-size: 18px;">+</button>
                            </div>
                        </div>
                    `;
                }
            });
            htmlAdicionais += `</div>`;
        }

        let btnAdicionarHtml = "";
        if (lojaAberta) {
            btnAdicionarHtml = `<button class="btn-add-carrinho" onclick="confirmarAdicao()" style="width: 100%; padding: 15px; background: #2ed573; color: #000; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 15px; cursor: pointer;"><i class="fa-solid fa-plus"></i> Adicionar ao Pedido</button>`;
        } else {
            btnAdicionarHtml = `
                <div style="background: #333; color: #aaa; text-align: center; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #444;">
                    <i class="fa-solid fa-lock" style="font-size: 20px; margin-bottom: 5px; color: #ff4757;"></i><br>
                    <strong>Loja Fechada no Momento</strong><br>
                    <span style="font-size: 13px;">${mensagemFechado}</span>
                </div>
            `;
        }

        detalhes.innerHTML = `
            <div class="produto-imagem" style="background-image: url('${produtoSendoVisto.imagem}'); height: 200px; background-size: cover; background-position: center; border-radius: 10px; margin-bottom: 15px; width: 100%;"></div>
            <h2 style="color: #fff; font-size: 22px;">${produtoSendoVisto.nome}</h2>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 10px;">${produtoSendoVisto.descricao}</p>
            <h3 style="color: var(--laranja-fogo, #ff5e00); font-size: 22px;">R$ ${produtoSendoVisto.preco.toFixed(2).replace('.', ',')}</h3>
            
            ${htmlAdicionais}
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding: 15px; background: #222; border-radius: 8px;">
                <span style="color: #fff; font-weight: bold; font-size: 16px;">Quantidade:</span>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button type="button" onclick="alterarQtdBase(-1)" style="width: 40px; height: 40px; border-radius: 8px; background: #444; color: white; border: none; font-weight: bold; cursor: pointer; font-size: 20px;">-</button>
                    <span id="qtd-produto-base" style="font-weight: bold; color: #fff; font-size: 18px;">1</span>
                    <button type="button" onclick="alterarQtdBase(1)" style="width: 40px; height: 40px; border-radius: 8px; background: var(--laranja-fogo, #ff5e00); color: white; border: none; font-weight: bold; cursor: pointer; font-size: 20px;">+</button>
                </div>
            </div>

            ${btnAdicionarHtml}
        `;

    } catch (erro) {
        detalhes.innerHTML = `<p style="color: red;">Erro ao carregar. Tente novamente.</p>`;
    }
}

function alterarQtdBase(delta) {
    if(!lojaAberta) return;
    const span = document.getElementById("qtd-produto-base");
    let qtd = parseInt(span.innerText) + delta;
    if (qtd < 1) qtd = 1; 
    span.innerText = qtd;
}

function alterarQtdAdicional(id, delta) {
    if(!lojaAberta) return;
    const span = document.getElementById(`qtd-add-${id}`);
    const estoqueReal = parseInt(span.getAttribute("data-estoquereal")); 
    
    let qtd = parseInt(span.innerText) + delta;
    if (qtd < 0) qtd = 0;
    if (qtd > estoqueReal) { qtd = estoqueReal; alert(`Limite! Temos apenas ${estoqueReal} disponível.`); }
    span.innerText = qtd;
}

function confirmarAdicao() {
    const spanQtdBase = document.getElementById("qtd-produto-base");
    const qtdBaseEscolhida = spanQtdBase ? parseInt(spanQtdBase.innerText) : 1;

    const qtdJaNoCarrinho = carrinho.filter(item => item.produtoBase.id == produtoSendoVisto.id).length;
    if (qtdJaNoCarrinho + qtdBaseEscolhida > produtoSendoVisto.estoque_maximo) {
        alert(`Estoque atingido! Podemos adicionar no máximo mais ${produtoSendoVisto.estoque_maximo - qtdJaNoCarrinho} unidade(s).`);
        return; 
    }

    const adicionaisEscolhidos = [];
    let totalAdicionais = 0;

    const spansQtd = document.querySelectorAll(".qtd-adicional-span");
    for (const span of spansQtd) {
        const qtdPorLanche = parseInt(span.innerText);
        if (qtdPorLanche > 0) { 
            const estoqueReal = parseInt(span.getAttribute("data-estoquereal"));
            const totalRequerido = qtdPorLanche * qtdBaseEscolhida; 

            if (totalRequerido > estoqueReal) {
                alert(`Estoque insuficiente de ${span.getAttribute("data-nome")}.`);
                return; 
            }
            const idAdd = span.getAttribute("data-id");
            const nomeAdd = span.getAttribute("data-nome");
            const precoAdd = parseFloat(span.getAttribute("data-preco"));

            adicionaisEscolhidos.push({ id: idAdd, nome: nomeAdd, preco: precoAdd, quantidade: qtdPorLanche });
            totalAdicionais += (precoAdd * qtdPorLanche);
        }
    }

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
}

// === 5. LÓGICA DO CARRINHO E CHECKOUT ===
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
    if (carrinho.length === 0) { alert("Seu carrinho está vazio!"); return; }
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

// === 6. FINALIZAÇÃO E WHATSAPP COM SALVAMENTO NO BANCO ===
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
            areaPix.innerHTML = `<p style="margin: 0; font-size: 14px;">⚠️ Chave PIX indisponível. Solicite via WhatsApp ao finalizar.</p>`;
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
    }).catch(err => alert("Erro ao copiar o PIX."));
}

async function enviarParaWhatsApp() {
    if(!lojaAberta) {
        alert("Puxa vida, a loja acabou de fechar! Não poderemos preparar seu pedido agora. " + mensagemFechado);
        return;
    }

    const nome = document.getElementById("nome-cliente").value;
    const rua = document.getElementById("rua-cliente").value;
    const numero = document.getElementById("numero-cliente").value;
    const bairro = document.getElementById("bairro-cliente").value;
    const complemento = document.getElementById("complemento-cliente").value;
    const pagamento = document.getElementById("forma-pagamento").value;

    if (nome === "" || rua === "" || numero === "" || bairro === "") {
        alert("Preencha seu Nome, Rua, Número e Bairro para a entrega!"); return;
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

// 1. SALVA NO SUPABASE (MANDANDO O CARRINHO COMPLETO)
        const dadosPedidoCompleto = {
            p_nome_cliente: nome,
            p_forma_pagamento: pagamento,
            p_total: totalCalculado,
            p_cliente_id: clienteId,
            p_telefone_cliente: telefoneCliente,
            p_status: "Pendente",
            p_previsao_entrega: "Em até 50 minutos",
            p_carrinho: carrinho // Enviando os lanches e adicionais
        };

        const resSupabase = await fetch(`${SUPABASE_URL}/rest/v1/rpc/registrar_pedido_completo`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosPedidoCompleto)
        });

        if (!resSupabase.ok) {
            console.error("Erro ao inserir no Supabase:", await resSupabase.text());
        }

        if (!resSupabase.ok) {
            console.error("Erro ao inserir no Supabase:", await resSupabase.text());
        }

        // 2. MONTAGEM DA MENSAGEM DO WHATSAPP
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
        
        carrinho = [];
        atualizarContadorCart();
        renderizarCardapio(); 
        navegarPara('inicio');
        
        let numeroLimpo = configLoja.numero_whatsapp ? String(configLoja.numero_whatsapp).replace(/\D/g, '') : "5543996150221";
        if(numeroLimpo === "") numeroLimpo = "5543996150221";
        
        window.open(`https://wa.me/${numeroLimpo}?text=${encodeURIComponent(textoPedido)}`, '_blank');

    } catch (erro) {
        alert("Erro de comunicação ao registrar o pedido.");
        if (btnFinalizar) { btnFinalizar.innerText = textoOriginalBotao; btnFinalizar.disabled = false; }
    }
}

// === BUSCAR E RENDERIZAR O HISTÓRICO DE PEDIDOS ===
async function carregarHistoricoPedidos() {
    const container = document.getElementById("lista-historico-pedidos");
    if (!container) return;

    const clienteId = obterOuCriarClienteId();
    const perfilSalvo = JSON.parse(localStorage.getItem("vilelaburgers_perfil") || "{}");
    const telefoneCliente = perfilSalvo.telefone ? String(perfilSalvo.telefone).replace(/\D/g, '') : "";

    container.innerHTML = `<p style="color: #aaa; text-align: center; padding: 20px;">Carregando seus pedidos...</p>`;

    try {
        let queryUrl = `${SUPABASE_URL}/rest/v1/pedidos?select=*&or=(cliente_id.eq.${clienteId}`;
        if (telefoneCliente) {
            queryUrl += `,telefone_cliente.eq.${telefoneCliente}`;
        }
        queryUrl += `)&order=data_pedido.desc`;

        const resposta = await fetch(queryUrl, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });

        if (!resposta.ok) throw new Error("Erro ao carregar histórico");
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

// === 7 a 14: SECUNDÁRIAS MANTIDAS E RODAPÉ DE VOLTA ===
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
    localStorage.setItem("vilelaburgers_perfil", JSON.stringify(perfil)); alert("Pronto! Seus dados foram salvos."); navegarPara('inicio'); 
}
function carregarPerfilNaTela() {
    const salvo = localStorage.getItem("vilelaburgers_perfil");
    if (salvo) { const perfil = JSON.parse(salvo); document.getElementById("perfil-nome").value = perfil.nome || ""; document.getElementById("perfil-telefone").value = perfil.telefone || ""; document.getElementById("perfil-rua").value = perfil.rua || ""; document.getElementById("perfil-numero").value = perfil.numero || ""; document.getElementById("perfil-bairro").value = perfil.bairro || ""; document.getElementById("perfil-complemento").value = perfil.complemento || ""; }
}
function preencherCheckoutComPerfil() {
    const salvo = localStorage.getItem("vilelaburgers_perfil");
    if (salvo) { const perfil = JSON.parse(salvo); document.getElementById("nome-cliente").value = perfil.nome || ""; document.getElementById("rua-cliente").value = perfil.rua || ""; document.getElementById("numero-cliente").value = perfil.numero || ""; document.getElementById("bairro-cliente").value = perfil.bairro || ""; document.getElementById("complemento-cliente").value = perfil.complemento || ""; }
}

function gerarPixCopiaECola(valorPix) {
    const formatarTamanho = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;
    const chaveLimpa = (configLoja.chave_pix || "").trim();
    let payload = "000201" + formatarTamanho("26", formatarTamanho("00", "br.gov.bcb.pix") + formatarTamanho("01", chaveLimpa)) + "520400005303986" + formatarTamanho("54", valorPix.toFixed(2)) + "5802BR" + formatarTamanho("59", (configLoja.nome_recebedor || "Hamburgueria").normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25)) + formatarTamanho("60", (configLoja.cidade_recebedor || "Arapoti").normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 15)) + formatarTamanho("62", formatarTamanho("05", "***")) + "6304";
    let polynomial = 0x1021; let result = 0xFFFF;
    for (let i = 0; i < payload.length; i++) { result ^= payload.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) { if ((result & 0x8000) !== 0) result = (result << 1) ^ polynomial; else result <<= 1; result &= 0xFFFF; } }
    return payload + result.toString(16).toUpperCase().padStart(4, '0'); 
}

// === RENDERIZAR O RODAPÉ AUTOMÁTICO ===
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

// === 15. CARREGAR CONFIGURAÇÕES DO COFRE ===
async function carregarConfiguracoes() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?select=*&limit=1`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await res.json();
        
        if (dados && dados.length > 0) {
            configLoja = dados[0];
        }
    } catch (erro) {
        console.error("Erro ao puxar configurações da loja.", erro);
    } finally {
        verificarHorarioLoja();
        setInterval(verificarHorarioLoja, 60000); 
    }
}

// === 16. O RELÓGIO INTELIGENTE ===
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

    let noDiaCerto = false;
    let naHoraCerta = false;

    if (viraNoite) {
        if (horaAtualMinutos >= tempoAbreMinutos) {
            naHoraCerta = diasAbertosArray.includes(diaSemanaAtual);
            noDiaCerto = naHoraCerta;
        } else if (horaAtualMinutos <= tempoFechaMinutos) {
            let ontem = diaSemanaAtual - 1;
            if (ontem < 0) ontem = 6;
            naHoraCerta = diasAbertosArray.includes(ontem);
            noDiaCerto = naHoraCerta; 
        }
    } else {
        noDiaCerto = diasAbertosArray.includes(diaSemanaAtual);
        naHoraCerta = (horaAtualMinutos >= tempoAbreMinutos && horaAtualMinutos <= tempoFechaMinutos);
    }

    lojaAberta = noDiaCerto && naHoraCerta;

    const bannerHtml = document.getElementById("aviso-loja-fechada");

    if (!lojaAberta) {
        const nomesDias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        
        let diasPraFrente = 0;
        let diaEncontrado = -1;

        for (let i = 0; i <= 7; i++) {
            let diaAlvo = (diaSemanaAtual + i) % 7;
            
            if (diasAbertosArray.includes(diaAlvo)) {
                if (i === 0) { 
                    if (viraNoite) {
                        if (horaAtualMinutos < tempoAbreMinutos && horaAtualMinutos > tempoFechaMinutos) {
                            diasPraFrente = i; diaEncontrado = diaAlvo; break;
                        }
                    } else {
                        if (horaAtualMinutos < tempoAbreMinutos) {
                            diasPraFrente = i; diaEncontrado = diaAlvo; break;
                        }
                    }
                } else {
                    diasPraFrente = i; diaEncontrado = diaAlvo; break;
                }
            }
        }

        let txtDia = "";
        if (diaEncontrado === -1) {
            txtDia = "em breve"; 
        } else if (diasPraFrente === 0) {
            txtDia = "hoje";
        } else if (diasPraFrente === 1) {
            txtDia = "amanhã";
        } else {
            txtDia = nomesDias[diaEncontrado];
        }

        mensagemFechado = `Voltamos ${txtDia} às ${configLoja.horario_abertura}.`;
        
        if (bannerHtml) {
            bannerHtml.innerHTML = `⚠️ Loja Fechada no momento. ${mensagemFechado}`;
            bannerHtml.style.display = "block";
        }
        
        const detalhes = document.getElementById("detalhes-produto-modal");
        if (detalhes && !detalhes.innerHTML.includes("Loja Fechada no Momento") && produtoSendoVisto) {
             abrirModalProduto(produtoSendoVisto.id);
        }
    } else {
        if (bannerHtml) bannerHtml.style.display = "none";
    }
}

// === INICIALIZAÇÃO DO SISTEMA ===
carregarConfiguracoes(); 
carregarCardapioDoBanco(); 
renderizarRodape();