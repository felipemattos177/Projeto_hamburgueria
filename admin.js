// ==========================================
// 1. CREDENCIAIS DO SUPABASE
// ==========================================
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let listaDeIngredientesGlobal = []; // Essa já existe
let listaDeProdutosGlobal = []; // GUARDA OS LANCHES PARA A EDIÇÃO
let produtoEdicaoId = null; // CONTROLA SE ESTAMOS CRIANDO (null) OU EDITANDO (id);

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
        listaDeProdutosGlobal = dados; // Salva na memória para podermos editar depois
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

async function mudarStatusProduto(id, novoStatus) {
    await fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: novoStatus }) 
    });
    carregarProdutos();
}

// === ABRIR MODAL VAZIO (NOVO PRODUTO) ===
function abrirModalAdmin() { 
    produtoEdicaoId = null; // Avisa o sistema que é um cadastro novo
    document.querySelector("#modal-novo-produto h2").innerText = "Cadastrar Lanche";
    document.getElementById("novo-nome").value = "";
    document.getElementById("novo-descricao").value = "";
    document.getElementById("novo-preco").value = "";
    document.getElementById("novo-categoria").value = "Artesanal";
    document.getElementById("novo-imagem").value = "";
    document.getElementById("modal-novo-produto").style.display = "flex"; 
}

function fecharModalAdmin() { document.getElementById("modal-novo-produto").style.display = "none"; }

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
    document.getElementById("novo-categoria").value = produto.categoria || "Artesanal";
    document.getElementById("novo-imagem").value = produto.imagem || "";

    document.getElementById("modal-novo-produto").style.display = "flex";
}

// === SALVAR (CRIA OU ATUALIZA) ===
async function salvarNovoProduto() {
    const nome = document.getElementById("novo-nome").value;
    const descricao = document.getElementById("novo-descricao").value;
    const preco = parseFloat(document.getElementById("novo-preco").value);
    const categoria = document.getElementById("novo-categoria").value;
    const imagem = document.getElementById("novo-imagem").value;

    if(!nome || isNaN(preco)) {
        alert("Preencha ao menos o Nome e um Preço válido!");
        return;
    }

    const payload = { nome, descricao, preco, categoria, imagem };
    
    let url = `${SUPABASE_URL}/rest/v1/produtos`;
    let metodo = 'POST'; // POST = Inserir Novo

    // Se a variável não estiver vazia, significa que estamos EDITANDO!
    if (produtoEdicaoId !== null) {
        url = `${url}?id=eq.${produtoEdicaoId}`;
        metodo = 'PATCH'; // PATCH = Atualizar Existente
    }

    try {
        const res = await fetch(url, {
            method: metodo,
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if(!res.ok) throw new Error("Erro do Supabase ao salvar.");
        
        fecharModalAdmin();
        carregarProdutos(); // Recarrega a tabela para mostrar as mudanças
    } catch(erro) {
        alert("Erro ao salvar produto. Verifique o console.");
        console.error(erro);
    }
}

// === EXCLUIR PRODUTO (COM PROTEÇÃO DE DADOS) ===
async function excluirProduto(id) {
    if(!confirm("⚠️ Tem certeza que deseja excluir este produto do cardápio?")) return;
    
    try {
        // Passo 1: Excluir a receita amarrada ao lanche primeiro (para não dar erro de Chave Estrangeira)
        await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?produto_id=eq.${id}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });

        // Passo 2: Deletar o Produto
        const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${id}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
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
                <td>
                    <strong>${ing.nome}</strong><br>
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
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
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

    const payload = { nome, unidade, estoque, preco_adicional };
    let url = `${SUPABASE_URL}/rest/v1/ingredientes`;
    let metodo = 'POST';

    if (ingredienteEdicaoId !== null) {
        url = `${url}?id=eq.${ingredienteEdicaoId}`;
        metodo = 'PATCH';
    }

    try {
        const res = await fetch(url, {
            method: metodo,
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
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
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
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
async function salvarConfiguracoesLoja() {
    const btn = document.getElementById("btn-salvar-config");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = "⏳ Salvando Dados e Imagem (Aguarde)...";
    btn.disabled = true;

    // Pega o link atual que está escondido (caso o usuário não mande foto nova, a gente mantém a velha)
    let urlDaImagem = document.getElementById("admin-img-banner").value;
    const inputArquivo = document.getElementById("admin-file-banner");

    try {
        // 1. SE O USUÁRIO ESCOLHEU UMA FOTO NOVA, FAZ O UPLOAD PRIMEIRO!
        if (inputArquivo.files.length > 0) {
            const arquivo = inputArquivo.files[0];
            // Cria um nome único para o arquivo não substituir outros (ex: banner-1718293.jpg)
            const nomeUnico = `banner-${Date.now()}-${arquivo.name.replace(/\s+/g, '-')}`;

            // Envia para o "Pen Drive" (Bucket) chamado 'imagens'
            const resUpload = await fetch(`${SUPABASE_URL}/storage/v1/object/imagens/${nomeUnico}`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': arquivo.type // Avisa o Supabase se é JPG, PNG, etc
                },
                body: arquivo
            });

            if (!resUpload.ok) throw new Error("Falha ao subir a imagem para a nuvem.");

            // Constrói o link público que a internet inteira consegue ver
            urlDaImagem = `${SUPABASE_URL}/storage/v1/object/public/imagens/${nomeUnico}`;
            
            // Já atualiza o campo invisível com o link novo
            document.getElementById("admin-img-banner").value = urlDaImagem;
        }

        // 2. COLETA TODOS OS DADOS DA TELA
        const corpoDb = {
            chave_pix: document.getElementById("admin-chave-pix").value,
            nome_recebedor: document.getElementById("admin-nome-pix").value,
            cidade_recebedor: document.getElementById("admin-cidade-pix").value,
            dias_trabalho: document.getElementById("admin-dias-trabalho").value,
            horario_abertura: document.getElementById("admin-hora-abre").value,
            horario_fechar: document.getElementById("admin-hora-fecha").value,
            numero_whatsapp: document.getElementById("admin-whatsapp").value,
            
            nome_loja: document.getElementById("admin-nome-loja").value,
            titulo_banner: document.getElementById("admin-titulo-banner").value,
            subtitulo_banner: document.getElementById("admin-subtitulo-banner").value,
            cor_principal: document.getElementById("admin-cor-principal").value,
            imagem_banner: urlDaImagem // Salva o link no Banco de Dados!
        };

        // 3. SALVA TUDO NA TABELA CONFIGURACOES
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?id=eq.1`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(corpoDb)
        });

        if (!res.ok) throw new Error("Falha ao salvar no banco de dados.");
        
        alert("✅ Loja e Identidade Visual atualizadas com sucesso!");
        inputArquivo.value = ""; // Limpa a seleção do arquivo para não subir de novo sem querer
        
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
carregarProdutos();
carregarEstoque();
carregarPedidosAdmin();
carregarConfiguracoesAdmin(); // Carrega os dados da loja ao abrir o painel

// Atualiza o painel de pedidos silenciosamente a cada 3 segundos
setInterval(carregarPedidosAdmin, 3000);

// Atualiza o cardápio e o estoque a cada 15 segundos (Atualização Real-Time)
setInterval(() => {
    carregarProdutos();
    carregarEstoque();
}, 5000);