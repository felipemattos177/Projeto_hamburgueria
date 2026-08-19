// ==========================================
// 1. CREDENCIAIS DO SUPABASE
// ==========================================
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let listaDeIngredientesGlobal = []; // Essa já existe
let listaDeProdutosGlobal = []; // GUARDA OS LANCHES PARA A EDIÇÃO
let produtoEdicaoId = null; // CONTROLA SE ESTAMOS CRIANDO (null) OU EDITANDO (id);
let lojaAtual = null; // { id, subdominio, nome, ativo }

// ==========================================
// MÓDULO -2: RESOLUÇÃO DA LOJA PELO SUBDOMÍNIO
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
        // Sempre com a chave pública (nunca o token de sessão): isso roda antes
        // do login, e um token velho/expirado sobrando no navegador não pode
        // derrubar essa consulta que deveria ser sempre pública.
        const res = await fetch(`${SUPABASE_URL}/rest/v1/lojas?select=*&subdominio=eq.${encodeURIComponent(slug)}&limit=1`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const dados = await res.json();

        if (!dados || dados.length === 0) {
            mostrarTelaLojaIndisponivel("Loja não encontrada", "Não encontramos nenhuma hamburgueria neste endereço.");
            return false;
        }
        if (!dados[0].ativo) {
            mostrarTelaLojaIndisponivel("Loja inativa", "Esta loja está desativada no momento. Fale com o suporte da plataforma.");
            return false;
        }

        lojaAtual = dados[0];

        document.title = `Painel de Gestão - ${lojaAtual.nome}`;
        const elLogin = document.getElementById("login-nome-loja");
        const elTabs = document.getElementById("tabs-nome-loja");
        if (elLogin) elLogin.innerText = `${lojaAtual.nome} Admin`;
        if (elTabs) elTabs.innerText = `${lojaAtual.nome} Admin`;

        return true;
    } catch (erro) {
        mostrarTelaLojaIndisponivel("Erro de conexão", "Não foi possível conectar ao servidor.");
        return false;
    }
}

function mostrarTelaLojaIndisponivel(titulo, mensagem) {
    document.body.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #121212; color: #fff; padding: 30px; text-align: center; font-family: 'Roboto', sans-serif;">
            <div>
                <i class="fa-solid fa-shop-slash" style="font-size: 40px; color: #ff5e00; margin-bottom: 15px;"></i>
                <h2 style="margin-bottom: 10px;">${escaparHtml(titulo)}</h2>
                <p style="color: #aaa;">${escaparHtml(mensagem)}</p>
            </div>
        </div>
    `;
}

// Confere se o usuário que acabou de logar está vinculado a ESTA loja
// (evita que a conta de uma hamburgueria acesse o painel de outra).
async function verificarAcessoLoja(userId) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_lojas?select=loja_id&user_id=eq.${userId}`, {
            headers: headersAutenticados()
        });
        const dados = await res.json();
        return dados.length > 0 && dados[0].loja_id === lojaAtual.id;
    } catch (erro) {
        return false;
    }
}

// ==========================================
// MÓDULO -1: AUTENTICAÇÃO DO PAINEL (SUPABASE AUTH)
// ==========================================
const CHAVE_SESSAO_ADMIN = "hamburgueria_admin_sessao";

function salvarSessao(dadosToken) {
    const sessao = {
        access_token: dadosToken.access_token,
        refresh_token: dadosToken.refresh_token,
        expira_em: Math.floor(Date.now() / 1000) + dadosToken.expires_in
    };
    localStorage.setItem(CHAVE_SESSAO_ADMIN, JSON.stringify(sessao));
    return sessao;
}

function carregarSessao() {
    const bruto = localStorage.getItem(CHAVE_SESSAO_ADMIN);
    return bruto ? JSON.parse(bruto) : null;
}

function limparSessao() {
    localStorage.removeItem(CHAVE_SESSAO_ADMIN);
}

function sessaoExpirada(sessao) {
    if (!sessao) return true;
    return Math.floor(Date.now() / 1000) >= (sessao.expira_em - 90); // 90s de margem
}

// Monta os headers de toda chamada ao Supabase usando o token do admin logado
// (necessário pra passar nas políticas RLS que exigem usuário autenticado)
function headersAutenticados(contentType) {
    const sessao = carregarSessao();
    const token = (sessao && sessao.access_token) ? sessao.access_token : SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (contentType) headers['Content-Type'] = contentType;
    return headers;
}

async function fazerLoginAdmin(event) {
    if (event) event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const senha = document.getElementById("login-senha").value;
    const erroEl = document.getElementById("login-erro");
    const btn = document.getElementById("btn-login-admin");

    erroEl.style.display = "none";
    const textoOriginal = btn.innerText;
    btn.innerText = "Entrando...";
    btn.disabled = true;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: senha })
        });
        const dados = await res.json();

        if (!res.ok) {
            erroEl.innerText = "E-mail ou senha inválidos.";
            erroEl.style.display = "block";
            return;
        }

        salvarSessao(dados);

        const temAcesso = await verificarAcessoLoja(dados.user.id);
        if (!temAcesso) {
            limparSessao();
            erroEl.innerText = "Esta conta não tem acesso a esta loja.";
            erroEl.style.display = "block";
            return;
        }

        iniciarPainelAdmin();
    } catch (erro) {
        erroEl.innerText = "Erro de conexão. Tente novamente.";
        erroEl.style.display = "block";
        console.error(erro);
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

function sairAdmin() {
    limparSessao();
    location.reload();
}

async function renovarSessaoSeNecessario() {
    const sessao = carregarSessao();
    if (!sessao) return false;
    if (!sessaoExpirada(sessao)) return true;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: sessao.refresh_token })
        });
        if (!res.ok) { limparSessao(); return false; }
        salvarSessao(await res.json());
        return true;
    } catch (erro) {
        limparSessao();
        return false;
    }
}

let intervaloPedidosAdmin = null;
let intervaloProdutosEstoqueAdmin = null;
let intervaloRenovarSessaoAdmin = null;

function pararIntervalosAdmin() {
    if (intervaloPedidosAdmin) clearInterval(intervaloPedidosAdmin);
    if (intervaloProdutosEstoqueAdmin) clearInterval(intervaloProdutosEstoqueAdmin);
    if (intervaloRenovarSessaoAdmin) clearInterval(intervaloRenovarSessaoAdmin);
}

// Roda antes de toda chamada periódica: renova o token se estiver perto de
// expirar. Se a sessão já morreu de vez (ex: aba ficou muito tempo em segundo
// plano e o timer de renovação não disparou a tempo), para o polling e volta
// pra tela de login em vez de ficar repetindo erro 401 silenciosamente.
async function garantirSessaoOuRelogar() {
    const ok = await renovarSessaoSeNecessario();
    if (!ok) {
        pararIntervalosAdmin();
        limparSessao();
        document.getElementById("app-admin-container").style.display = "none";
        document.getElementById("tela-login-admin").style.display = "flex";
        const erroEl = document.getElementById("login-erro");
        if (erroEl) {
            erroEl.innerText = "Sua sessão expirou. Faça login novamente.";
            erroEl.style.display = "block";
        }
    }
    return ok;
}

function iniciarPainelAdmin() {
    document.getElementById("tela-login-admin").style.display = "none";
    document.getElementById("app-admin-container").style.display = "block";

    carregarProdutos();
    carregarEstoque();
    carregarPedidosAdmin();
    carregarConfiguracoesAdmin();

    intervaloPedidosAdmin = setInterval(carregarPedidosAdmin, 3000);
    intervaloProdutosEstoqueAdmin = setInterval(() => { carregarProdutos(); carregarEstoque(); }, 5000);
    intervaloRenovarSessaoAdmin = setInterval(renovarSessaoSeNecessario, 60 * 1000);
}

async function verificarSessaoAoAbrir() {
    const sessao = carregarSessao();
    if (sessao && await renovarSessaoSeNecessario()) {
        iniciarPainelAdmin();
    }
}

// ==========================================
// MÓDULO 0: NAVEGAÇÃO DE ABAS ADMIN
// ==========================================
function mudarAbaAdmin(idAba, botaoClicado) {
    // Esconde todas as abas
    document.querySelectorAll('.view-section').forEach(aba => aba.classList.remove('ativa'));
    // Tira o foco de todos os botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativa'));

    // Mostra a aba clicada e foca o botão
    document.getElementById(idAba).classList.add('ativa');
    if(botaoClicado) botaoClicado.classList.add('ativa');
}

// Evita XSS: qualquer texto vindo do banco (nome de cliente, produto, ingrediente)
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

// ==========================================
// MÓDULO 1: GESTÃO DE PRODUTOS
// ==========================================
async function carregarProdutos() {
    if (!(await garantirSessaoOuRelogar())) return;
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=*&loja_id=eq.${lojaAtual.id}&order=id.asc`, {
            method: 'GET',
            headers: headersAutenticados()
        });
        const dados = await resposta.json();
        listaDeProdutosGlobal = dados; 
        renderizarTabelaProdutos(dados);

        // --- MÁGICA DAS CATEGORIAS DINÂMICAS ---
        // Extrai apenas as categorias únicas que existem no banco
        // --- MÁGICA DAS CATEGORIAS (COM DROP DOWN) ---
        const categoriasUnicas = [...new Set(dados.map(p => p.categoria).filter(c => c))];
        const selectCat = document.getElementById("novo-categoria");
        if(selectCat) {
            selectCat.innerHTML = ""; // Limpa as antigas
            categoriasUnicas.forEach(cat => {
                selectCat.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            // Adiciona a opção de Nova Categoria no final da lista
            selectCat.innerHTML += `<option value="nova_cat">➕ Criar Nova Categoria...</option>`;
        }
        // --------------------------------------
        // --------------------------------------

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
                <td><strong>${escaparHtml(produto.nome)}</strong></td>
                <td>${escaparHtml(produto.categoria)}</td>
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
        headers: headersAutenticados('application/json'),
        body: JSON.stringify({ ativo: novoStatus })
    });
    carregarProdutos();
}

/// === ABRIR MODAL VAZIO (NOVO PRODUTO) ===
function abrirModalAdmin() { 
    produtoEdicaoId = null; // Avisa o sistema que é um cadastro novo
    document.querySelector("#modal-novo-produto h2").innerText = "Cadastrar Lanche";
    
    // Limpa textos e preços
    document.getElementById("novo-nome").value = "";
    document.getElementById("novo-descricao").value = "";
    document.getElementById("novo-preco").value = "";
    
    // Volta o select de categoria pro padrão e ESCONDE a caixa de criar nova
    const selectCat = document.getElementById("novo-categoria");
    if(selectCat && selectCat.options.length > 0) selectCat.selectedIndex = 0;
    
    const novaCatTexto = document.getElementById("nova-categoria-texto");
    if(novaCatTexto) {
        novaCatTexto.value = "";
        novaCatTexto.style.display = "none";
    }

    // Limpa as imagens
    document.getElementById("novo-imagem").value = "";
    document.getElementById("novo-file-imagem").value = "";
    
    document.getElementById("modal-novo-produto").style.display = "flex"; 
}

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
    document.getElementById("novo-categoria").value = produto.categoria || "";
    
    // ESCONDE O CAMPO TEXTO (limpando a sujeira de ações anteriores)
    const novaCatTexto = document.getElementById("nova-categoria-texto");
    if(novaCatTexto) {
        novaCatTexto.value = "";
        novaCatTexto.style.display = "none";
    }
    
    // Limpa imagens
    document.getElementById("novo-imagem").value = produto.imagem || "";
    document.getElementById("novo-file-imagem").value = ""; 

    document.getElementById("modal-novo-produto").style.display = "flex";
}

// === MOSTRAR/ESCONDER CAMPO DE NOVA CATEGORIA ===
function verificarNovaCategoria() {
    const select = document.getElementById("novo-categoria");
    const inputTexto = document.getElementById("nova-categoria-texto");
    
    if (select.value === "nova_cat") {
        inputTexto.style.display = "block";
        inputTexto.focus();
    } else {
        // Se ele desistir e voltar o select pra Artesanal, a gente apaga o texto intruso
        inputTexto.style.display = "none";
        inputTexto.value = ""; 
    }
}

// === SALVAR (CRIA OU ATUALIZA) ===
async function salvarNovoProduto() {
    const nome = document.getElementById("novo-nome").value;
    const descricao = document.getElementById("novo-descricao").value;
    const preco = parseFloat(document.getElementById("novo-preco").value);
    
    // --- LÓGICA BLINDADA DA CATEGORIA ---
    let categoria = document.getElementById("novo-categoria").value;
    const inputNovaCat = document.getElementById("nova-categoria-texto");
    
    // Se a caixinha de texto estiver aparecendo e com algo escrito, ela MANDA na regra!
    if (categoria === "nova_cat" || (inputNovaCat && inputNovaCat.style.display !== "none" && inputNovaCat.value.trim() !== "")) {
        categoria = inputNovaCat.value.trim();
        
        if (categoria === "") {
            alert("Por favor, digite o nome da nova categoria!");
            inputNovaCat.focus();
            return;
        }
    }
    // ------------------------------------
    
    if(!nome || isNaN(preco)) {
        alert("Preencha ao menos o Nome e um Preço válido!");
        return;
    }

    // Pega o botão para mostrar que está carregando
    const btnSalvar = document.querySelector(".btn-novo") || document.getElementById("btn-salvar-produto");
    const textoOriginal = btnSalvar ? btnSalvar.innerHTML : "Salvar";
    if(btnSalvar) {
        btnSalvar.innerHTML = "⏳ Salvando...";
        btnSalvar.disabled = true;
    }

    // Lida com a imagem
    let urlDaImagem = document.getElementById("novo-imagem").value; 
    const inputArquivo = document.getElementById("novo-file-imagem");

    try {
        if (inputArquivo && inputArquivo.files.length > 0) {
            const arquivo = inputArquivo.files[0];
            const nomeUnico = `${lojaAtual.subdominio}/produto-${Date.now()}-${arquivo.name.replace(/\s+/g, '-')}`;

            const resUpload = await fetch(`${SUPABASE_URL}/storage/v1/object/imagens/${nomeUnico}`, {
                method: 'POST',
                headers: headersAutenticados(arquivo.type),
                body: arquivo
            });

            if (!resUpload.ok) throw new Error("Falha ao subir a imagem do lanche.");
            urlDaImagem = `${SUPABASE_URL}/storage/v1/object/public/imagens/${nomeUnico}`;
        }

        const payload = { nome, descricao, preco, categoria, imagem: urlDaImagem, loja_id: lojaAtual.id };
        
        let url = `${SUPABASE_URL}/rest/v1/produtos`;
        let metodo = 'POST'; 

        if (produtoEdicaoId !== null) {
            url = `${url}?id=eq.${produtoEdicaoId}`;
            metodo = 'PATCH'; 
        }

        const res = await fetch(url, {
            method: metodo,
            headers: headersAutenticados('application/json'),
            body: JSON.stringify(payload)
        });

        if(!res.ok) throw new Error("Erro do Supabase ao salvar.");
        
        // Limpa a tela para a próxima
        if(inputArquivo) inputArquivo.value = "";
        if(inputNovaCat) {
            inputNovaCat.value = "";
            inputNovaCat.style.display = "none";
        }
        
        fecharModalAdmin();
        carregarProdutos(); 
        
    } catch(erro) {
        alert("Erro ao salvar produto. Verifique o console.");
        console.error(erro);
    } finally {
        if(btnSalvar) {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    }
}
// === FECHAR MODAL DO LANCHE ===
function fecharModalAdmin() { 
    document.getElementById("modal-novo-produto").style.display = "none"; 
}

// === EXCLUIR PRODUTO (COM PROTEÇÃO DE DADOS) ===
async function excluirProduto(id) {
    if(!confirm("⚠️ Tem certeza que deseja excluir este produto do cardápio?")) return;
    
    try {
        // Passo 1: Excluir a receita amarrada ao lanche primeiro (para não dar erro de Chave Estrangeira)
        await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?produto_id=eq.${id}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });

        // Passo 2: Deletar o Produto
        const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?id=eq.${id}`, {
            method: 'DELETE',
            headers: headersAutenticados()
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
    if (!(await garantirSessaoOuRelogar())) return;
    try {
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/ingredientes?select=*&loja_id=eq.${lojaAtual.id}&order=id.asc`, {
            method: 'GET',
            headers: headersAutenticados()
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
                    <strong>${escaparHtml(ing.nome)}</strong><br>
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
            headers: headersAutenticados('application/json'),
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

    const payload = { nome, unidade, estoque, preco_adicional, loja_id: lojaAtual.id };
    let url = `${SUPABASE_URL}/rest/v1/ingredientes`;
    let metodo = 'POST';

    if (ingredienteEdicaoId !== null) {
        url = `${url}?id=eq.${ingredienteEdicaoId}`;
        metodo = 'PATCH';
    }

    try {
        const res = await fetch(url, {
            method: metodo,
            headers: headersAutenticados('application/json'),
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
            headers: headersAutenticados()
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
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/receita_produto?produto_id=eq.${produtoId}&loja_id=eq.${lojaAtual.id}`, {
            method: 'GET',
            headers: headersAutenticados()
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
                    <td><strong>${escaparHtml(nome)}</strong></td>
                    <td>${itemDaReceita.quantidade} ${escaparHtml(unidade)}</td>
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
            headers: { ...headersAutenticados('application/json'), 'Prefer': 'return=representation' },
            body: JSON.stringify({
                produto_id: produtoAtualParaReceita,
                ingrediente_id: parseInt(ingredienteId),
                quantidade: parseFloat(quantidade),
                loja_id: lojaAtual.id
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
            headers: headersAutenticados()
        });
        buscarIngredientesDesteLanche(produtoAtualParaReceita);
    } catch (erro) { console.error("Erro ao remover:", erro); }
}


// ==========================================
// MÓDULO 4: GESTÃO DE PEDIDOS (KANBAN)
// ==========================================
async function carregarPedidosAdmin() {
    if (!(await garantirSessaoOuRelogar())) return;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=*&loja_id=eq.${lojaAtual.id}&order=id.asc`, {
            method: 'GET',
            headers: headersAutenticados()
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

        let obsHtml = "";
        if (ped.observacoes && String(ped.observacoes).trim() !== "") {
            obsHtml = `<div style="background: #332a00; color: #ffc107; padding: 8px 10px; border-radius: 6px; margin-top: 8px; font-size: 13px; white-space: pre-line;"><i class="fa-solid fa-pen"></i> ${escaparHtml(ped.observacoes)}</div>`;
        }

        const cardHtml = `
            <div class="card-pedido ${statusFormatado.toLowerCase().replace(/ /g, '-')}">
                <div class="card-header">
                    <span class="pedido-id">#${ped.id}</span>
                    <span class="pedido-tempo"><i class="fa-regular fa-clock"></i> ${dataFormatada}</span>
                </div>
                <div class="info-cliente">
                    <strong>${escaparHtml(ped.nome_cliente) || 'Cliente não informado'}</strong><br>
                    Pgto: ${escaparHtml(ped.forma_pagamento) || '-'}<br>
                    <span style="color: #2ed573; font-weight: bold;">R$ ${totalNum.toFixed(2).replace('.', ',')}</span>
                </div>
                ${obsHtml}
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
            headers: { ...headersAutenticados('application/json'), 'Prefer': 'return=representation' },
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
        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?loja_id=eq.${lojaAtual.id}&select=*`, {
            method: 'GET',
            headers: headersAutenticados()
        });
        const dados = await res.json();

        if (dados && dados.length > 0) {
            const config = dados[0];

            // 1. Preenche os Dados da Loja (PIX, Horários, WhatsApp)
            document.getElementById("admin-chave-pix").value = config.chave_pix || "";
            document.getElementById("admin-nome-pix").value = config.nome_recebedor || "";
            document.getElementById("admin-cidade-pix").value = config.cidade_recebedor || "";
            document.getElementById("admin-dias-trabalho").value = config.dias_trabalho || "";
            document.getElementById("admin-hora-abre").value = config.horario_abertura || "";
            document.getElementById("admin-hora-fecha").value = config.horario_fechar || "";
            document.getElementById("admin-whatsapp").value = config.numero_whatsapp || "";

            // 2. Preenche os Dados da Identidade Visual (White-Label)
            document.getElementById("admin-nome-loja").value = config.nome_loja || "";
            document.getElementById("admin-titulo-banner").value = config.titulo_banner || "";
            document.getElementById("admin-subtitulo-banner").value = config.subtitulo_banner || "";
            document.getElementById("admin-cor-principal").value = config.cor_principal || "#ff5e00";

            // Salva o link da imagem atual no campo invisível
            document.getElementById("admin-img-banner").value = config.imagem_banner || "";
            document.getElementById("admin-logo-loja").value = config.logo_url || "";
        }
    } catch (erro) {
        console.error("Erro ao puxar configurações no Admin:", erro);
    }
}

async function salvarConfiguracoesLoja() {
    const btn = document.getElementById("btn-salvar-config");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = "⏳ Salvando Dados, Imagem e Áudio (Aguarde)...";
    btn.disabled = true;

    let urlDaImagem = document.getElementById("admin-img-banner").value;
    const inputArquivo = document.getElementById("admin-file-banner");

    let urlDoLogo = document.getElementById("admin-logo-loja").value;
    const inputLogo = document.getElementById("admin-file-logo");

    const inputAudio = document.getElementById("admin-file-audio-fogo");
    let urlDoAudio = null;

    try {
        // ==========================================================
        // 1. UPLOAD DA IMAGEM (Vai para o bucket 'imagens')
        // ==========================================================
        if (inputArquivo && inputArquivo.files.length > 0) {
            const arquivo = inputArquivo.files[0];
            const nomeUnico = `${lojaAtual.subdominio}/banner-${Date.now()}-${arquivo.name.replace(/\s+/g, '-')}`;

            const resUpload = await fetch(`${SUPABASE_URL}/storage/v1/object/imagens/${nomeUnico}`, {
                method: 'POST',
                headers: headersAutenticados(arquivo.type),
                body: arquivo
            });

            if (!resUpload.ok) throw new Error("Falha ao subir a imagem para a nuvem.");

            urlDaImagem = `${SUPABASE_URL}/storage/v1/object/public/imagens/${nomeUnico}`;
            document.getElementById("admin-img-banner").value = urlDaImagem;
        }

        // ==========================================================
        // 1.2. UPLOAD DA LOGO (mesmo bucket 'imagens')
        // ==========================================================
        if (inputLogo && inputLogo.files.length > 0) {
            const arquivoLogo = inputLogo.files[0];
            const nomeUnicoLogo = `${lojaAtual.subdominio}/logo-${Date.now()}-${arquivoLogo.name.replace(/\s+/g, '-')}`;

            const resUploadLogo = await fetch(`${SUPABASE_URL}/storage/v1/object/imagens/${nomeUnicoLogo}`, {
                method: 'POST',
                headers: headersAutenticados(arquivoLogo.type),
                body: arquivoLogo
            });

            if (!resUploadLogo.ok) throw new Error("Falha ao subir a logo para a nuvem.");

            urlDoLogo = `${SUPABASE_URL}/storage/v1/object/public/imagens/${nomeUnicoLogo}`;
            document.getElementById("admin-logo-loja").value = urlDoLogo;
        }

        // ==========================================================
        // 1.5. UPLOAD DO ÁUDIO (Vai para o bucket separado 'audios')
        // ==========================================================
        if (inputAudio && inputAudio.files.length > 0) {
            const arquivoAudio = inputAudio.files[0];
            const nomeUnicoAudio = `${lojaAtual.subdominio}/som_fogo-${Date.now()}.mp3`;

            // Agora envia corretamente para o bucket 'audios'
            const resUploadAudio = await fetch(`${SUPABASE_URL}/storage/v1/object/audios/${nomeUnicoAudio}`, {
                method: 'POST',
                headers: headersAutenticados(arquivoAudio.type),
                body: arquivoAudio
            });

            if (!resUploadAudio.ok) {
                const erroSupabase = await resUploadAudio.text();
                console.error("Erro no áudio:", erroSupabase);
                throw new Error("Falha ao subir o áudio. Verifique as Políticas do Storage (Passo 2).");
            }

            urlDoAudio = `${SUPABASE_URL}/storage/v1/object/public/audios/${nomeUnicoAudio}`;
        }

        // ==========================================================
        // 2. SALVANDO NA TABELA 'CONFIGURACOES'
        // ==========================================================
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
            imagem_banner: urlDaImagem,
            logo_url: urlDoLogo
        };

        if (urlDoAudio) {
            corpoDb.audio_fogo = urlDoAudio;
        }

        const res = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?loja_id=eq.${lojaAtual.id}`, {
            method: 'PATCH',
            headers: headersAutenticados('application/json'),
            body: JSON.stringify(corpoDb)
        });

        if (!res.ok) throw new Error("Falha ao salvar no banco de dados.");
        
        alert("✅ Configurações salvas com sucesso! Áudio e Imagem separados.");
        
        if(inputArquivo) inputArquivo.value = "";
        if(inputLogo) inputLogo.value = "";
        if(inputAudio) inputAudio.value = "";
        
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
// Primeiro resolve qual loja este subdomínio é; só então mostra a tela de
// login (ou o painel, se já tiver sessão válida). Ver iniciarPainelAdmin.
async function iniciarAdmin() {
    const lojaOk = await resolverLoja();
    if (!lojaOk) return;
    await verificarSessaoAoAbrir();
}

iniciarAdmin();