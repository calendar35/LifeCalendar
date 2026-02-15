const SUPABASE_URL = "https://tpuzwthjccmcxidlbsxc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-QbIXonRuOMIpn5Zd68Z-w_K-4mHn8W";

// Используем другое имя переменной, чтобы не конфликтовать с библиотекой window.supabase
let supabaseClient;

function initSupabase() {
    try {
        // Проверяем, загрузилась ли сама библиотека (она лежит в window.supabase)
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            const { createClient } = window.supabase;
            
            // Создаем клиент и кладем в нашу переменную
            supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            
            // Явно делаем доступным глобально, чтобы admin.js его видел
            window.supabaseClient = supabaseClient; 
            
            console.log('Supabase клиент инициализирован успешно');
        } else {
            console.error('Supabase библиотека еще не загружена. Ждем...');
            setTimeout(initSupabase, 100);
        }
    } catch (error) {
        console.error('Ошибка инициализации Supabase:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}