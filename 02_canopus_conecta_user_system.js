// ============================================================================
// CANOPUS CONECTA - SISTEMA DE AUTENTICAÇÃO E HIERARQUIA DE USUÁRIOS (FRONTEND)
// ============================================================================

// 1. CONFIGURAÇÃO DE ACESSO POR PERFIL
const PAGE_PERMISSIONS = {
    'admin': ['dashboard-admin', 'gerenciar-usuarios', 'auditoria', 'configuracoes', 'perfil'],
    'gestor': ['dashboard-gestor', 'minha-equipe', 'relatorios-equipe', 'perfil'],
    'colaborador': ['dashboard-colaborador', 'trilhas', 'faq', 'certificados', 'perfil']
};

// Página inicial padrão para redirecionamento pós-login
const DEFAULT_PAGES = {
    'admin': 'dashboard-admin',
    'gestor': 'dashboard-gestor',
    'colaborador': 'dashboard-colaborador'
};

/**
 * Busca o perfil detalhado do usuário na tabela 'profiles' do Supabase
 * @param {string} userId - UUID do usuário autenticado
 */
async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao buscar perfil do usuário:', error.message);
        return null;
    }
}

/**
 * Função unificada de Login para substituir as antigas (loginUser / loginAdmin)
 */
async function loginUser(email, password) {
    try {
        // Validação de domínio exigida pela LGPD/Corporativo da Canopus
        if (!email.endsWith('@canopus.com.br')) {
            alert('Acesso permitido apenas para e-mails institucionais (@canopus.com.br).');
            return null;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        // Busca o perfil na tabela corporativa para saber a role (Admin, Gestor, Colaborador)
        const profile = await getUserProfile(data.user.id);

        if (!profile || profile.ativo !== 'ativo') {
            await supabase.auth.signOut();
            alert('Sua conta está inativa ou não foi encontrada no sistema corporativo.');
            return null;
        }

        // Registrar auditoria de login com a função que criamos no banco
        await supabase.rpc('registrar_auditoria', {
            p_acao: 'LOGIN',
            p_recurso: 'SISTEMA',
            p_detalhes: { email: email }
        });

        // Guarda o perfil no sessionStorage para acesso rápido no frontend
        sessionStorage.setItem('user_profile', JSON.stringify(profile));

        // Redireciona para a página correta baseada no nível de acesso
        const targetPage = DEFAULT_PAGES[profile.perfil];
        navigateToProtected(targetPage);

        return { user: data.user, profile: profile };
    } catch (error) {
        alert('Erro no login: ' + error.message);
        return null;
    }
}

/**
 * Valida se o usuário logado tem permissão síncrona para ver uma página
 * @param {string} page - ID ou nome da página/seção do sistema
 */
function canAccessPage(page) {
    const profileData = sessionStorage.getItem('user_profile');
    if (!profileData) return false;

    const profile = JSON.parse(profileData);
    const allowedPages = PAGE_PERMISSIONS[profile.perfil] || [];
    
    return allowedPages.includes(page);
}

/**
 * Redireciona ou exibe a página protegida, bloqueando se não houver acesso
 * @param {string} page - ID ou nome da página alvo
 */
function navigateToProtected(page) {
    if (!canAccessPage(page)) {
        alert('Acesso negado. Você não tem permissão para visualizar esta página.');
        // Se tiver algum perfil, joga para a home dele, se não tiver, joga pro login
        const profileData = sessionStorage.getItem('user_profile');
        if (profileData) {
            const profile = JSON.parse(profileData);
            window.location.hash = DEFAULT_PAGES[profile.perfil];
        } else {
            window.location.hash = 'login';
        }
        return;
    }

    // Se passou na validação, executa a lógica de exibição do seu app
    console.log(`Navegando com sucesso para a página: ${page}`);
    // Exemplo: se o seu app usa ids escondidos no HTML (display: none/block):
    // document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    // document.getElementById(page).style.display = 'block';
    window.location.hash = page; 
}

/**
 * Atualiza dados cadastrais (Restrito a si mesmo ou regras de hierarquia)
 */
async function updateUserProfile(userId, updatedData) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update(updatedData)
            .eq('id', userId);

        if (error) throw error;
        alert('Perfil atualizado com sucesso!');
    } catch (error) {
        alert('Erro ao atualizar perfil: ' + error.message);
    }
}

/**
 * Desativação de Usuário (Soft Delete executado por Admin)
 */
async function desativarUsuario(userId) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ ativo: 'inativo' })
            .eq('id', userId);

        if (error) throw error;
        alert('Usuário desativado com sucesso (histórico mantido).');
    } catch (error) {
        alert('Erro ao desativar usuário: ' + error.message);
    }
}

/**
 * Alteração de Perfil de Acesso (Exclusivo Admin)
 */
async function alterarPerfilAcesso(userId, novoPerfil) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ perfil: novoPerfil })
            .eq('id', userId);

        if (error) throw error;
        alert(`Perfil alterado para ${novoPerfil} com sucesso.`);
    } catch (error) {
        alert('Erro ao alterar perfil: ' + error.message);
    }
}

/**
 * Verifica o estado da sessão ao carregar a página
 */
async function checkAuthState() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        const profile = await getUserProfile(session.user.id);
        if (profile && profile.ativo === 'ativo') {
            sessionStorage.setItem('user_profile', JSON.stringify(profile));
            return profile;
        }
    }
    
    sessionStorage.removeItem('user_profile');
    return null;
}
