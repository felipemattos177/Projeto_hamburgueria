// ==========================================
// CREDENCIAIS DO SUPABASE (mesmo projeto, chave anon)
// ==========================================
const SUPABASE_URL = "https://tjievzloufqptabbvumz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaWV2emxvdWZxcHRhYmJ2dW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTY1NjIsImV4cCI6MjEwMjMzMjU2Mn0.HAIHej243RMeLMBueFjcN0-99y41BEbb3v4PgCj1Vs4";

let listaDeLojasGlobal = [];
let lojaParaVincular = null;
let intervaloRenovarSessaoSuper = null;

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
// AUTENTICAÇÃO (mesmo padrão do admin.js, sessão separada)
// ==========================================
const CHAVE_SESSAO_SUPER = "hamburgueria_superadmin_sessao";

function salvarSessaoSuper(dadosToken) {
    const sessaoAnterior = carregarSessaoSuper();
    const sessao = {
        access_token: dadosToken.access_token,
        refresh_token: dadosToken.refresh_token,
        expira_em: Math.floor(Date.now() / 1000) + dadosToken.expires_in,
        user_id: (dadosToken.user && dadosToken.user.id) ? dadosToken.user.id : (sessaoAnterior ? sessaoAnterior.user_id : null)
    };
    localStorage.setItem(CHAVE_SESSAO_SUPER, JSON.stringify(sessao));
    return sessao;
}

function carregarSessaoSuper() {
    const bruto = localStorage.getItem(CHAVE_SESSAO_SUPER);
    return bruto ? JSON.parse(bruto) : null;
}

function limparSessaoSuper() {
    localStorage.removeItem(CHAVE_SESSAO_SUPER);
}

function sessaoSuperExpirada(sessao) {
    if (!sessao) return true;
    return Math.floor(Date.now() / 1000) >= (sessao.expira_em - 90);
}

function headersAutenticados(contentType) {
    const sessao = carregarSessaoSuper();
    const token = (sessao && sessao.access_token) ? sessao.access_token : SUPABASE_KEY;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    if (contentType) headers['Content-Type'] = contentType;
    return headers;
}

async function verificarEhSuperAdmin(userId) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/super_admins?select=user_id&user_id=eq.${userId}`, {
            headers: headersAutenticados()
        });
        const dados = await res.json();
        return dados.length > 0;
    } catch (erro) {
        return false;
    }
}

async function fazerLoginSuper(event) {
    if (event) event.preventDefault();
    const email = document.getElementById("login-email-super").value.trim();
    const senha = document.getElementById("login-senha-super").value;
    const erroEl = document.getElementById("login-erro-super");
    const btn = document.getElementById("btn-login-super");

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

        salvarSessaoSuper(dados);

        const ehSuper = await verificarEhSuperAdmin(dados.user.id);
        if (!ehSuper) {
            limparSessaoSuper();
            erroEl.innerText = "Esta conta não tem acesso ao painel da plataforma.";
            erroEl.style.display = "block";
            return;
        }

        iniciarPainelSuper();
    } catch (erro) {
        erroEl.innerText = "Erro de conexão. Tente novamente.";
        erroEl.style.display = "block";
        console.error(erro);
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

function sairSuper() {
    limparSessaoSuper();
    location.reload();
}

async function renovarSessaoSuperSeNecessario() {
    const sessao = carregarSessaoSuper();
    if (!sessao) return false;
    if (!sessaoSuperExpirada(sessao)) return true;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: sessao.refresh_token })
        });
        if (!res.ok) { limparSessaoSuper(); return false; }
        salvarSessaoSuper(await res.json());
        return true;
    } catch (erro) {
        limparSessaoSuper();
        return false;
    }
}

function iniciarPainelSuper() {
    document.getElementById("tela-login-super").style.display = "none";
    document.getElementById("app-super-container").style.display = "block";

    carregarLojas();
    intervaloRenovarSessaoSuper = setInterval(renovarSessaoSuperSeNecessario, 60 * 1000);
}

// Roda antes de toda chamada ao banco: renova o token se estiver perto de
// expirar. Se a sessão já morreu de vez (ex: aba ficou muito tempo em segundo
// plano), volta pra tela de login em vez de falhar silenciosamente com 401.
async function garantirSessaoOuRelogarSuper() {
    const ok = await renovarSessaoSuperSeNecessario();
    if (!ok) {
        if (intervaloRenovarSessaoSuper) clearInterval(intervaloRenovarSessaoSuper);
        limparSessaoSuper();
        document.getElementById("app-super-container").style.display = "none";
        document.getElementById("tela-login-super").style.display = "flex";
        const erroEl = document.getElementById("login-erro-super");
        if (erroEl) {
            erroEl.innerText = "Sua sessão expirou. Faça login novamente.";
            erroEl.style.display = "block";
        }
    }
    return ok;
}

async function verificarSessaoAoAbrirSuper() {
    const sessao = carregarSessaoSuper();
    if (sessao && await renovarSessaoSuperSeNecessario()) {
        const sessaoAtual = carregarSessaoSuper();
        const ehSuper = sessaoAtual.user_id ? await verificarEhSuperAdmin(sessaoAtual.user_id) : false;
        if (ehSuper) iniciarPainelSuper();
        else limparSessaoSuper();
    }
}

// ==========================================
// GESTÃO DE LOJAS
// ==========================================
let adminsPorLoja = {}; // loja_id -> array de { user_id, ativo, email }
let lojaGerenciarAtual = null; // loja cujo modal "Gerenciar Admins" está aberto

async function carregarLojas() {
    if (!(await garantirSessaoOuRelogarSuper())) return;
    try {
        const [resLojas, resVinculos] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/lojas?select=*&order=id.asc`, { headers: headersAutenticados() }),
            fetch(`${SUPABASE_URL}/rest/v1/admin_lojas?select=user_id,loja_id,ativo,email`, { headers: headersAutenticados() })
        ]);
        listaDeLojasGlobal = await resLojas.json();
        const vinculos = await resVinculos.json();

        adminsPorLoja = {};
        vinculos.forEach(v => {
            if (!adminsPorLoja[v.loja_id]) adminsPorLoja[v.loja_id] = [];
            adminsPorLoja[v.loja_id].push(v);
        });

        renderizarTabelaLojas(listaDeLojasGlobal);
    } catch (erro) {
        console.error(erro);
    }
}

function renderizarTabelaLojas(lojas) {
    const tbody = document.getElementById("tabela-lojas");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (lojas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma loja cadastrada ainda.</td></tr>';
        return;
    }

    lojas.forEach(loja => {
        const badgeClass = loja.ativo ? "status-ativo" : "status-inativo";
        const badgeTexto = loja.ativo ? "Ativa" : "Inativa";
        const botaoTexto = loja.ativo ? "Desativar" : "Ativar";

        const admins = adminsPorLoja[loja.id] || [];
        const qtdAtivos = admins.filter(a => a.ativo !== false).length;

        let colunaAdmin;
        if (admins.length === 0) {
            colunaAdmin = '<span style="color:#ff4757;">Sem admin</span>';
        } else {
            colunaAdmin = `<span style="color:${qtdAtivos > 0 ? '#2ed573' : '#ffa502'};">${admins.length} admin${admins.length > 1 ? 's' : ''} (${qtdAtivos} ativo${qtdAtivos !== 1 ? 's' : ''})</span>`;
        }

        tbody.innerHTML += `
            <tr>
                <td>#${loja.id}</td>
                <td><strong>${escaparHtml(loja.nome)}</strong></td>
                <td>${escaparHtml(loja.subdominio)}.mathshub.com.br</td>
                <td><span class="status-badge ${badgeClass}">${badgeTexto}</span></td>
                <td>${colunaAdmin}</td>
                <td>
                    <button class="btn-acao btn-toggle" onclick="mudarStatusLoja(${loja.id}, ${!loja.ativo})">${botaoTexto}</button>
                    <button class="btn-acao btn-vincular" onclick="abrirModalGerenciarAdmins(${loja.id}, '${escaparHtml(loja.nome)}')">Gerenciar Admins</button>
                </td>
            </tr>
        `;
    });
}

function abrirModalGerenciarAdmins(lojaId, lojaNome) {
    lojaGerenciarAtual = { id: lojaId, nome: lojaNome };
    document.getElementById("titulo-modal-gerenciar").innerText = `Admins: ${lojaNome}`;
    renderizarListaAdminsModal();
    document.getElementById("modal-gerenciar-admins").style.display = "flex";
}

function fecharModalGerenciarAdmins() {
    document.getElementById("modal-gerenciar-admins").style.display = "none";
    lojaGerenciarAtual = null;
}

function renderizarListaAdminsModal() {
    const container = document.getElementById("lista-admins-loja");
    if (!lojaGerenciarAtual) return;
    const admins = adminsPorLoja[lojaGerenciarAtual.id] || [];

    if (admins.length === 0) {
        container.innerHTML = '<p style="color: var(--texto-claro); font-size: 13.5px;">Nenhum admin vinculado ainda.</p>';
        return;
    }

    container.innerHTML = admins.map(a => {
        const ativo = a.ativo !== false;
        const email = a.email || a.user_id;
        return `
            <div class="linha-admin-loja">
                <span class="email-admin">${escaparHtml(email)}${ativo ? '' : ' <br><small style="color: var(--vermelho);">Desativado</small>'}</span>
                <div class="acoes-admin">
                    <button class="btn-acao btn-toggle" onclick="alternarAcessoAdmin('${a.user_id}', ${!ativo})">${ativo ? 'Desativar' : 'Reativar'}</button>
                    <button class="btn-acao btn-remover-admin" onclick="removerAdmin('${a.user_id}')">Remover</button>
                </div>
            </div>
        `;
    }).join('');
}

async function alternarAcessoAdmin(userId, novoAtivo) {
    if (!(await garantirSessaoOuRelogarSuper())) return;
    await fetch(`${SUPABASE_URL}/rest/v1/admin_lojas?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: headersAutenticados('application/json'),
        body: JSON.stringify({ ativo: novoAtivo })
    });
    await carregarLojas();
    if (lojaGerenciarAtual) renderizarListaAdminsModal();
}

async function removerAdmin(userId) {
    if (!confirm("Remover o acesso desse usuário a esta loja? O login dele no Supabase continua existindo, só o vínculo com a loja é apagado.")) return;
    if (!(await garantirSessaoOuRelogarSuper())) return;
    await fetch(`${SUPABASE_URL}/rest/v1/admin_lojas?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: headersAutenticados()
    });
    await carregarLojas();
    if (lojaGerenciarAtual) renderizarListaAdminsModal();
}

function abrirModalVincularDentroDeGerenciar() {
    if (!lojaGerenciarAtual) return;
    document.getElementById("modal-gerenciar-admins").style.display = "none";
    abrirModalVincular(lojaGerenciarAtual.id, lojaGerenciarAtual.nome);
}

async function mudarStatusLoja(id, novoStatus) {
    if (!(await garantirSessaoOuRelogarSuper())) return;
    await fetch(`${SUPABASE_URL}/rest/v1/lojas?id=eq.${id}`, {
        method: 'PATCH',
        headers: headersAutenticados('application/json'),
        body: JSON.stringify({ ativo: novoStatus })
    });
    carregarLojas();
}

function abrirModalNovaLoja() {
    document.getElementById("nova-loja-nome").value = "";
    document.getElementById("nova-loja-subdominio").value = "";
    document.getElementById("preview-subdominio").innerText = "subdominio";
    document.getElementById("modal-nova-loja").style.display = "flex";

    document.getElementById("nova-loja-subdominio").oninput = function () {
        const slug = this.value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        document.getElementById("preview-subdominio").innerText = slug || "subdominio";
    };
}

function fecharModalNovaLoja() {
    document.getElementById("modal-nova-loja").style.display = "none";
}

async function salvarNovaLoja() {
    const nome = document.getElementById("nova-loja-nome").value.trim();
    const subdominio = document.getElementById("nova-loja-subdominio").value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    if (!nome || !subdominio) {
        alert("Preencha o nome e o subdomínio.");
        return;
    }

    if (!(await garantirSessaoOuRelogarSuper())) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/lojas`, {
            method: 'POST',
            headers: headersAutenticados('application/json'),
            body: JSON.stringify({ nome, subdominio, ativo: true })
        });

        if (!res.ok) {
            const erro = await res.json();
            alert(`Erro ao criar loja: ${erro.message || "verifique se o subdomínio já está em uso"}`);
            return;
        }

        // Cada loja precisa de uma linha em configuracoes pra salvar PIX/horário/etc.
        // Busca o id da loja recém-criada e já cria essa linha em branco.
        const resLoja = await fetch(`${SUPABASE_URL}/rest/v1/lojas?select=id&subdominio=eq.${encodeURIComponent(subdominio)}`, {
            headers: headersAutenticados()
        });
        const lojaCriada = await resLoja.json();

        if (lojaCriada && lojaCriada.length > 0) {
            const resConfig = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes`, {
                method: 'POST',
                headers: headersAutenticados('application/json'),
                body: JSON.stringify({ loja_id: lojaCriada[0].id, nome_loja: nome })
            });
            if (!resConfig.ok) {
                alert("Loja criada, mas não consegui criar a linha de configurações automaticamente. Crie manualmente na tabela 'configuracoes' (loja_id = " + lojaCriada[0].id + ") pelo SQL Editor antes do dono acessar o admin.html.");
            }
        }

        fecharModalNovaLoja();
        carregarLojas();
    } catch (erro) {
        alert("Erro de conexão ao criar loja.");
        console.error(erro);
    }
}

function abrirModalVincular(lojaId, lojaNome) {
    lojaParaVincular = lojaId;
    document.getElementById("vincular-email").value = "";
    document.getElementById("vincular-user-id").value = "";
    document.getElementById("titulo-modal-vincular").innerText = `Vincular Admin: ${lojaNome}`;
    document.getElementById("modal-vincular-admin").style.display = "flex";
}

function fecharModalVincular() {
    document.getElementById("modal-vincular-admin").style.display = "none";
    lojaParaVincular = null;
    if (lojaGerenciarAtual) {
        document.getElementById("modal-gerenciar-admins").style.display = "flex";
    }
}

async function salvarVinculo() {
    const email = document.getElementById("vincular-email").value.trim();
    const userId = document.getElementById("vincular-user-id").value.trim();
    if (!userId) {
        alert("Cole o UID do usuário.");
        return;
    }

    if (!(await garantirSessaoOuRelogarSuper())) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_lojas`, {
            method: 'POST',
            headers: { ...headersAutenticados('application/json'), 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify({ user_id: userId, loja_id: lojaParaVincular, email: email || null, ativo: true })
        });

        if (!res.ok) {
            const erro = await res.json();
            alert(`Erro ao vincular: ${erro.message || "verifique se o UID está correto"}`);
            return;
        }

        const voltarParaGerenciar = lojaGerenciarAtual;
        fecharModalVincular();
        await carregarLojas();
        if (voltarParaGerenciar) {
            abrirModalGerenciarAdmins(voltarParaGerenciar.id, voltarParaGerenciar.nome);
        }
    } catch (erro) {
        alert("Erro de conexão ao vincular admin.");
        console.error(erro);
    }
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
verificarSessaoAoAbrirSuper();
