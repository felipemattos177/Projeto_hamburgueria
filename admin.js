// ==========================================
// 1. CREDENCIAIS DO SUPABASE
// ==========================================
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let produtoAtualParaReceita = null;
let listaDeIngredientesGlobal = [];

// ==========================================
// MÓDULO 0: NAVEGAÇÃO DE ABAS ADMIN
// ==========================================
function mudarAbaAdmin(idAba, botaoClicado) {
    // Esconde todas as abas
    document.querySelectorAll('.view-section').forEach(aba => aba.style.display = 'none');
    // Tira o foco de todos os botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativa'));
    
    // Mostra a aba clicada e foca o botão
    document.getElementById(idAba).style.display = 'block';
    if(botaoClicado) botaoClicado.classList.add('ativa');
}

// ==========================================
// MÓDULO 1: GESTÃO DE PRODUTOS
// ==========================================
async function carregarProdutos() {
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=*&order=id.asc`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await resposta.json();
        renderizarTabelaProdutos(dados);
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
            <tr>
                <td>#${produto.id}</td>
                <td><strong>${produto.nome}</strong></td>
                <td>${produto.categoria}</td>
                <td>R$ ${produto.preco.toFixed(2).replace('.', ',')}</td>
                <td><span class="status-badge ${badgeClass}">${badgeTexto}</span></td>
                <td>
                    <button class="btn-acao btn-toggle" onclick="mudarStatusProduto(${produto.id}, ${!produto.ativo})">
                        ${botaoTexto}
                    </button>
                    <button class="btn-acao btn-receita" onclick="abrirModalReceita(${produto.id}, '${produto.nome}')">
                        📋 Ficha Técnica
                    </button>
                </td>
            </tr>
        `;
    });
}

async function mudarStatusProduto(id, novoStatus) {
    await fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: novoStatus }) 
    });
    carregarProdutos();
}

function abrirModalAdmin() { document.getElementById("modal-novo-produto").style.display = "flex"; }
function fecharModalAdmin() { document.getElementById("modal-novo-produto").style.display = "none"; }

// ==========================================
// MÓDULO 2: CONTROLE DE ESTOQUE
// ==========================================
async function carregarEstoque() {
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?select=*&order=id.asc`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
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
                <td><strong>${ing.nome}</strong></td>
                <td>${ing.unidade}</td>
                <td class="${classeAlerta}">${ing.estoque}</td>
                <td>
                    <button class="btn-acao btn-toggle" onclick="ajustarSaldo(${ing.id}, '${ing.nome}', ${ing.estoque})">
                        Atualizar Saldo
                    </button>
                </td>
            </tr>
        `;
    });
}

async function ajustarSaldo(id, nome, saldoAtual) {
    const novoValorTexto = prompt(`Atualizar saldo de: ${nome}\nSaldo atual: ${saldoAtual}\n\nDigite o NOVO SALDO TOTAL:`, saldoAtual);
    if (novoValorTexto === null || novoValorTexto === "") return;
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ estoque: parseFloat(novoValorTexto) }) 
        });
        carregarEstoque();
    } catch (erro) { console.error(erro); }
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
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?produto_id=eq.${produtoId}`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
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
                    <td><strong>${nome}</strong></td>
                    <td>${itemDaReceita.quantidade} ${unidade}</td>
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
            headers: {
                'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json', 'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                produto_id: produtoAtualParaReceita,
                ingrediente_id: parseInt(ingredienteId),
                quantidade: parseFloat(quantidade)
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
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        buscarIngredientesDesteLanche(produtoAtualParaReceita);
    } catch (erro) { console.error("Erro ao remover:", erro); }
}


// ==========================================
// MÓDULO 4: GESTÃO DE PEDIDOS (KANBAN)
// ==========================================
async function carregarPedidosAdmin() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=*&order=id.asc`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });

        if (!res.ok) {
            const erroSupabase = await res.json();
            document.getElementById("col-pendentes").innerHTML = `<p style="color:#ff4757; text-align:center; margin-top:20px;"><b>Erro do Banco:</b> ${erroSupabase.message}</p>`;
            return;
        }

        const pedidos = await res.json();
        renderizarKanban(pedidos);
    } catch (erro) {
        document.getElementById("col-pendentes").innerHTML = `<p style="color:#ff4757; text-align:center; margin-top:20px;"><b>Erro no Script:</b> ${erro.message}</p>`;
    }
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

        let dataFormatada = "--:--";
        if (ped.created_at) {
            const d = new Date(ped.created_at);
            dataFormatada = d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        }

        const totalNum = parseFloat(ped.total) || 0;

        const cardHtml = `
            <div class="card-pedido ${statusFormatado.toLowerCase().replace(' ', '-')}">
                <div class="card-header">
                    <span class="pedido-id">#${ped.id}</span>
                    <span class="pedido-tempo"><i class="fa-regular fa-clock"></i> ${dataFormatada}</span>
                </div>
                <div class="info-cliente">
                    <strong>${ped.nome_cliente || 'Cliente não informado'}</strong><br>
                    Pgto: ${ped.forma_pagamento || '-'}<br>
                    <span style="color: #2ed573; font-weight: bold;">R$ ${totalNum.toFixed(2).replace('.', ',')}</span>
                </div>
                ${botoesAcaoKanban(ped.id, statusFormatado)}
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

function botoesAcaoKanban(id, status) {
    const inputTempo = document.getElementById("input-tempo-preparo");
    const tempoFila = inputTempo ? inputTempo.value : "40";

    if (status === "Pendente") {
        return `<button class="btn-acao-kanban btn-aceitar" onclick="atualizarStatusPedido(${id}, 'Em Preparo')"><i class="fa-solid fa-fire"></i> Aceitar (~${tempoFila}m)</button>`;
    } else if (status === "Em Preparo") {
        return `<button class="btn-acao-kanban btn-despachar" onclick="atualizarStatusPedido(${id}, 'Saiu para Entrega')"><i class="fa-solid fa-motorcycle"></i> Despachar Moto</button>`;
    } else if (status === "Saiu para Entrega") {
        return `<button class="btn-acao-kanban btn-entregue" onclick="atualizarStatusPedido(${id}, 'Entregue')"><i class="fa-solid fa-check-double"></i> Concluir Pedido</button>`;
    }
    return "";
}

async function atualizarStatusPedido(id, novoStatus) {
    let previsao = null;
    
    if (novoStatus === 'Em Preparo') {
        const inputTempo = document.getElementById("input-tempo-preparo");
        const tempoFila = inputTempo ? inputTempo.value : "40";
        previsao = tempoFila + " min"; 
    }

    const corpo = previsao 
        ? { status: novoStatus, previsao_entrega: previsao }
        : { status: novoStatus };

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json', 'Prefer': 'return=representation'
            },
            body: JSON.stringify(corpo)
        });
        
        carregarPedidosAdmin();
    } catch (erro) {
        alert("Erro ao atualizar status do pedido.");
    }
}

// ==========================================
// MÓDULO 5: CONFIGURAÇÕES DA LOJA (O Cofre Mestre)
// ==========================================
async function carregarConfiguracoesAdmin() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?id=eq.1&select=*`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await res.json();
        
        if (dados && dados.length > 0) {
            const config = dados[0];
            // Preenche todos os inputs da tela com o que está no banco
            document.getElementById("admin-chave-pix").value = config.chave_pix || "";
            document.getElementById("admin-nome-pix").value = config.nome_recebedor || "";
            document.getElementById("admin-cidade-pix").value = config.cidade_recebedor || "";
            document.getElementById("admin-dias-trabalho").value = config.dias_trabalho || "";
            document.getElementById("admin-hora-abre").value = config.horario_abertura || "";
            document.getElementById("admin-hora-fecha").value = config.horario_fechar || "";
            document.getElementById("admin-whatsapp").value = config.numero_whatsapp || "";
        }
    } catch (erro) {
        console.error("Erro ao puxar configurações no Admin:", erro);
    }
}

async function salvarConfiguracoesLoja() {
    const btn = document.getElementById("btn-salvar-config");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = "⏳ Salvando Configurações...";
    btn.disabled = true;

    // Coleta o que você digitou na tela
    const corpoDb = {
        chave_pix: document.getElementById("admin-chave-pix").value,
        nome_recebedor: document.getElementById("admin-nome-pix").value,
        cidade_recebedor: document.getElementById("admin-cidade-pix").value,
        dias_trabalho: document.getElementById("admin-dias-trabalho").value,
        horario_abertura: document.getElementById("admin-hora-abre").value,
        horario_fechar: document.getElementById("admin-hora-fecha").value,
        numero_whatsapp: document.getElementById("admin-whatsapp").value
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?id=eq.1`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(corpoDb)
        });

        if (!res.ok) throw new Error("Falha ao salvar no banco");
        
        alert("✅ Loja atualizada! Chave PIX, horários e WhatsApp salvos com sucesso.");
    } catch (erro) {
        alert("Erro ao salvar configurações. Verifique o console.");
        console.error(erro);
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}


// ==========================================
// INICIALIZAÇÃO DO SISTEMA
// ==========================================
carregarProdutos();
carregarEstoque();
carregarPedidosAdmin();
carregarConfiguracoesAdmin(); // Carrega os dados da loja ao abrir o painel

// Atualiza o painel de pedidos silenciosamente a cada 3 segundos
setInterval(carregarPedidosAdmin, 3000);