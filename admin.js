// 1. CREDENCIAIS (Use as mesmas que você usou no script.js)
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

// === 2. LER (GET) - BUSCAR TODOS OS PRODUTOS ===
async function carregarPainel() {
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=*&order=id.asc`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        const dados = await resposta.json();
        renderizarTabela(dados);

    } catch (erro) {
        console.error("Erro ao buscar dados:", erro);
    }
}

// === 3. DESENHAR A TABELA ===
function renderizarTabela(produtos) {
    const tbody = document.getElementById("tabela-produtos");
    tbody.innerHTML = "";

    produtos.forEach(produto => {
        const badgeClass = produto.ativo ? "status-ativo" : "status-inativo";
        const badgeTexto = produto.ativo ? "Disponível" : "Esgotado";
        const botaoAcaoTexto = produto.ativo ? "Pausar Venda" : "Ativar Venda";

        tbody.innerHTML += `
            <tr>
                <td>#${produto.id}</td>
                <td><strong>${produto.nome}</strong></td>
                <td>${produto.categoria}</td>
                <td>R$ ${produto.preco.toFixed(2).replace('.', ',')}</td>
                <td><span class="status-badge ${badgeClass}">${badgeTexto}</span></td>
                <td>
                    <button class="btn-acao btn-toggle" onclick="mudarStatus(${produto.id}, ${!produto.ativo})">
                        ${botaoAcaoTexto}
                    </button>
                </td>
            </tr>
        `;
    });
}

// === 4. ATUALIZAR (PATCH) - MUDAR STATUS ===
async function mudarStatus(id, novoStatus) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ativo: novoStatus }) 
        });
        carregarPainel();
    } catch (erro) {
        console.error("Erro ao atualizar:", erro);
    }
}

// === 5. CRIAR (POST) - ADICIONAR NOVO PRODUTO ===
function abrirModalAdmin() {
    document.getElementById("modal-novo-produto").style.display = "flex";
}

function fecharModalAdmin() {
    document.getElementById("modal-novo-produto").style.display = "none";
    
    // Limpa as caixinhas quando fecha
    document.getElementById("novo-nome").value = "";
    document.getElementById("novo-descricao").value = "";
    document.getElementById("novo-preco").value = "";
    document.getElementById("novo-imagem").value = "";
}

async function salvarNovoProduto() {
    // 1. Coleta o que o usuário digitou
    const nome = document.getElementById("novo-nome").value;
    const descricao = document.getElementById("novo-descricao").value;
    const preco = document.getElementById("novo-preco").value;
    const categoria = document.getElementById("novo-categoria").value;
    let imagem = document.getElementById("novo-imagem").value;

    // Regra de segurança básica
    if(nome === "" || preco === "") {
        alert("Nome e Preço são obrigatórios!");
        return;
    }

    // Se não colocar foto, põe uma imagem genérica de hambúrguer
    if(imagem === "") {
        imagem = "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80";
    }

    // 2. Monta o pacote de dados
    const novoLanche = {
        nome: nome,
        descricao: descricao,
        preco: parseFloat(preco),
        categoria: categoria,
        imagem: imagem,
        ativo: true // Já entra vendendo
    };

    try {
        // 3. Dispara o POST para o banco de dados
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/produtos`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal' // Pede pro banco não precisar devolver o objeto inteiro
            },
            body: JSON.stringify(novoLanche) 
        });

        if (resposta.ok) {
            alert("Lanche adicionado com sucesso!");
            fecharModalAdmin(); // Fecha a tela
            carregarPainel(); // Recarrega a tabela para mostrar o novo lanche
        } else {
            alert("Falha ao salvar no banco.");
        }
    } catch (erro) {
        console.error("Erro na inserção:", erro);
    }
}

// Inicia o painel
carregarPainel();