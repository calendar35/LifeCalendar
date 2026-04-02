// ==========================================
// 1. КОНСТАНТЫ И ПЕРЕМЕННЫЕ
// ==========================================
const YEAR = 2026;
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

let STAGES = []; // Загружаем из БД
let currentStageIndex = 0;
let currentOpenDate = null;
let filledDates = new Set();

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ И AUTH
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Ждем инициализации Supabase
    let attempts = 0;
    while ((typeof supabaseClient === 'undefined' || !supabaseClient) && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }
    
    checkAuth();

    // Обработчик входа
    const loginBtn = document.getElementById("loginBtn");
    if(loginBtn) loginBtn.onclick = handleLogin;
    
    // Вход по Enter
    const form = document.getElementById("loginFormElement");
    if(form) form.addEventListener('submit', (e) => { e.preventDefault(); handleLogin(); });
});

async function handleLogin() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else checkAuth();
}

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        showLoginForm();
    } else {
        await Promise.all([fetchFilledDays(), loadStages()]);
        showAdminContent();
    }
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'flex';
    document.getElementById('adminContent').style.display = 'none';
}

function showAdminContent() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    renderAdminStageNavigation();
    renderAdminMonths();
}

// ==========================================
// 3. ЛОГИКА ЭТАПОВ (Supabase)
// ==========================================
async function loadStages() {
    const { data, error } = await supabaseClient
        .from('stages')
        .select('*')
        .order('start_date', { ascending: true });

    if (error) {
        console.error('Error loading stages:', error);
        return;
    }

    STAGES = data.map((s, i) => ({
        id: s.id,
        num: i + 1,
        label: `${s.title} ${s.emoji || ''}`,
        start: new Date(s.start_date),
        end: new Date(s.end_date),
        isSingleDay: s.start_date === s.end_date
    }));
}

// --- Управление этапами (CRUD) ---
window.openStagesModal = function() {
    document.getElementById('stagesModal').style.display = 'flex';
    renderStagesList();
}
window.closeStagesModal = function() {
    document.getElementById('stagesModal').style.display = 'none';
    location.reload(); // Обновляем календарь
}

function renderStagesList() {
    const container = document.getElementById('stagesList');
    container.innerHTML = '';
    
    STAGES.forEach(stage => {
        const div = document.createElement('div');
        div.className = 'stage-item';
        const dateText = stage.isSingleDay 
            ? `<span style="color:#d32f2f; font-weight:bold;">${formatDateRu(stage.start)} (Финал)</span>`
            : `${formatDateRu(stage.start)} — ${formatDateRu(stage.end)}`;
            
        div.innerHTML = `
            <div>
                <div style="font-weight:bold;">${stage.label}</div>
                <div class="stage-dates">${dateText}</div>
            </div>
            <button onclick="deleteStage(${stage.id})" style="color:red; background:none; border:none; cursor:pointer; font-size:20px;">🗑</button>
        `;
        container.appendChild(div);
    });
}

window.addNewStage = async function() {
    const title = document.getElementById('newStageTitle').value;
    const emoji = document.getElementById('newStageEmoji').value;
    const start = document.getElementById('newStageStart').value;
    const end = document.getElementById('newStageEnd').value;

    if (!title || !start || !end) { alert('Заполните название и даты'); return; }

    const { error } = await supabaseClient.from('stages').insert([{
        title, emoji, start_date: start, end_date: end
    }]);

    if (error) alert(error.message);
    else {
        await loadStages();
        renderStagesList();
        document.getElementById('newStageTitle').value = '';
        alert('Этап создан!');
    }
}

window.deleteStage = async function(id) {
    if(confirm('Удалить этап?')) {
        const { error } = await supabaseClient.from('stages').delete().eq('id', id);
        if(!error) { await loadStages(); renderStagesList(); }
    }
}

// ==========================================
// 4. ОТРИСОВКА КАЛЕНДАРЯ
// ==========================================
function renderAdminStageNavigation() {
    const nav = document.getElementById('adminStageNavigation');
    const stage = STAGES[currentStageIndex];
    if(!stage) return;

    let months = getStageMonths(stage);
    let monthLabel = months.length === 1 ? MONTHS[months[0]] : `${MONTHS[months[0]]} – ${MONTHS[months[months.length-1]]}`;
    
    nav.innerHTML = `
        <button class="stage-nav-btn stage-nav-btn-left" onclick="changeStage(-1)" ${currentStageIndex === 0 ? 'disabled' : ''}>←</button>
        <div class="stage-content">
            <div class="stage-title">${stage.label}</div>
            <div class="stage-months">${formatDateRu(stage.start)} - ${formatDateRu(stage.end)}</div>
        </div>
        <button class="stage-nav-btn stage-nav-btn-right" onclick="changeStage(1)" ${currentStageIndex === STAGES.length - 1 ? 'disabled' : ''}>→</button>
    `;
}
window.changeStage = function(dir) {
    if (currentStageIndex + dir >= 0 && currentStageIndex + dir < STAGES.length) {
        currentStageIndex += dir;
        renderAdminStageNavigation();
        renderAdminMonths();
    }
}

function renderAdminMonths() {
    const grid = document.getElementById('adminMonthGrid');
    const finalEditor = document.getElementById('adminFinalStageEditor');
    const stage = STAGES[currentStageIndex];

    if (!stage) return;

    // Логика 1 дня (Финал)
    if (stage.isSingleDay) {
        grid.style.display = 'none';
        finalEditor.style.display = 'block';
        finalEditor.innerHTML = `
            <h2>🏁 ${stage.label}</h2>
            <p style="margin-bottom:20px; color:#666;">Дата: ${formatDateRu(stage.start)}</p>
            <button class="btn" onclick="openAdminDayPopup(new Date('${stage.start.toISOString()}'))">✏️ Редактировать контент</button>
        `;
        return;
    }

    finalEditor.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = '';
    
    const monthsArr = getStageMonths(stage);
    // ВАЖНО: передаем stage третьим аргументом!
    monthsArr.forEach(m => grid.appendChild(createAdminMonthCard(MONTHS[m], m, stage)));
}
function createAdminMonthCard(monthName, monthIndex, stage) {
    const card = document.createElement('div');
    card.className = 'month-card';
    card.innerHTML = `<div class="month-header">${monthName}</div>`;
    
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(t => {
        const h = document.createElement('div'); h.className = 'day-header'; h.textContent = t; grid.appendChild(h);
    });
    
    const firstDay = new Date(YEAR, monthIndex, 1).getDay();
    const startDay = (firstDay === 0) ? 6 : firstDay - 1;
    for(let i=0; i<startDay; i++) grid.appendChild(document.createElement('div')).className='day-cell empty';
    
    const days = new Date(YEAR, monthIndex + 1, 0).getDate();

    // Подготовка дат границ этапа (сбрасываем время в 00:00:00 для корректного сравнения)
    const stageStart = new Date(stage.start.getFullYear(), stage.start.getMonth(), stage.start.getDate()).getTime();
    const stageEnd = new Date(stage.end.getFullYear(), stage.end.getMonth(), stage.end.getDate()).getTime();

    for(let d=1; d<=days; d++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        
        // Текущая дата ячейки
        const currentDayTime = new Date(YEAR, monthIndex, d).getTime();
        const dateStr = `${YEAR}-${String(monthIndex+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        // ПРОВЕРКА: Входит ли день в этап?
        if (currentDayTime < stageStart || currentDayTime > stageEnd) {
            cell.classList.add('disabled-day'); // Добавляем класс блокировки
            // НЕ добавляем onclick, чтобы нельзя было открыть
            cell.innerHTML = `<div class="day-number">${d}</div>`;
        } else {
            // День доступен
            if(filledDates.has(dateStr)) cell.classList.add('has-content');
            cell.innerHTML = `<div class="day-number">${d}</div>`;
            cell.onclick = () => openAdminDayPopup(new Date(YEAR, monthIndex, d));
        }
        
        grid.appendChild(cell);
    }
    
    // Добиваем сетку пустыми ячейками
    const total = grid.children.length - 7;
    const empty = (7 - (total % 7)) % 7;
    for(let i=0; i<empty; i++) grid.appendChild(document.createElement('div')).className='day-cell empty';

    card.appendChild(grid);
    return card;
}

// ==========================================
// 5. РЕДАКТОР КОНТЕНТА
// ==========================================
async function openAdminDayPopup(date) {
    currentOpenDate = date;
    const dateStr = formatDateISO(date);
    document.getElementById('adminDayPopupOverlay').style.display = 'flex';
    const popup = document.getElementById('adminDayPopup');
    
    popup.innerHTML = `
        <div class="popup-header">
            <div class="popup-title">${formatDateRu(date)}</div>
            <button class="admin-popup-close" onclick="closeAdminPopup()">×</button>
        </div>
        <div class="popup-scroll-area">
            <div id="popupLoading" style="text-align:center; padding:20px;">Загрузка...</div>
            <div id="popupContent" style="display:none;">
                <label class="admin-input-label">Заголовок дня (в шапке)</label>
                <input class="admin-input" type="text" id="dayTitle" placeholder="Пример: День 1. Начало">
                
                <label class="admin-input-label">Ссылки на посты</label>
                <div id="tgLinksContainer"></div>
                <div class="add-link-wrapper">
                    <button class="btn btn-secondary" id="addLinkBtn" style="font-size:12px;">+ Добавить ссылку</button>
                    <div id="socialLinkSelector" class="social-link-selector" style="display:none;">
                        <button type="button" class="social-select-option" data-type="telegram">Telegram</button>
                        <button type="button" class="social-select-option" data-type="facebook">Facebook</button>
                        <button type="button" class="social-select-option" data-type="vk">ВКонтакте</button>
                        <button type="button" class="social-select-option" data-type="max">Max</button>
                    </div>
                </div>
                
                <hr style="margin:20px 0; border:0; border-top:1px solid #eee;">
                
                <label class="admin-input-label">Блоки контента</label>
                <div class="admin-blocks-list" id="popupBlocksList"></div>
                
                <div style="text-align:center; padding:20px;">
                    <button class="btn btn-secondary" id="addBlockBtn">+ Добавить блок</button>
                </div>
            </div>
        </div>
        <div class="popup-footer">
            <div id="saveStatus" style="color:#666; font-size:13px;"></div>
            <button class="btn" onclick="saveDayContent()">💾 Сохранить</button>
        </div>
    `;
    
    document.getElementById('addBlockBtn').onclick = (e) => showBlockSelector(e.target);

    // Кнопка "Добавить ссылку" — показывает выбор соцсети (Telegram / Facebook / VK)
    const addLinkBtn = document.getElementById('addLinkBtn');
    const addLinkWrapper = document.querySelector('.add-link-wrapper');
    const selector = document.getElementById('socialLinkSelector');
    addLinkBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = selector.style.display === 'block';
        selector.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            const closeSelector = (e2) => {
                if (!addLinkWrapper.contains(e2.target)) {
                    selector.style.display = 'none';
                    document.removeEventListener('click', closeSelector);
                }
            };
            setTimeout(() => document.addEventListener('click', closeSelector), 0);
        }
    };
    selector.querySelectorAll('.social-select-option').forEach(btn => {
        btn.onclick = () => {
            addSocialLinkField(btn.dataset.type);
            selector.style.display = 'none';
        };
    });

    // Загрузка данных
    const { data } = await supabaseClient.from('calendar_days').select('*').eq('date', dateStr).single();
    document.getElementById('popupLoading').style.display = 'none';
    document.getElementById('popupContent').style.display = 'block';
    
    if (data) {
        document.getElementById('dayTitle').value = data.title || '';
        const links = normalizeSocialLinks(data.social_links || data.tg_links);
        links.forEach(item => addSocialLinkField(item.type, item.url));
        (data.blocks || []).forEach(b => renderBlockItem(b.type, b));
    }
}

window.closeAdminPopup = function() {
    document.getElementById('adminDayPopupOverlay').style.display = 'none';
    currentOpenDate = null;
}

function renderBlockItem(type, data = {}) {
    const list = document.getElementById('popupBlocksList');
    const block = document.createElement('div');
    block.className = 'admin-block';
    block.setAttribute('data-type', type);
    
    // Время открытия
    const time = data.time || '';
    const timeSelect = `
        <select class="block-time-select admin-input" style="width:auto; margin:0; padding:4px;">
            <option value="" ${time===''?'selected':''}>Сразу</option>
            <option value="07:00" ${time==='07:00'?'selected':''}>07:00</option>
            <option value="19:00" ${time==='19:00'?'selected':''}>19:00</option>
        </select>
    `;

    let contentHtml = '';
    
    // НОВЫЙ ТЕКСТ (С ЗАГОЛОВКОМ)
    if (type === 'text') {
        contentHtml = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:bold;">📝 Текст</span> ${timeSelect}
            </div>
            <input class="block-title-input text-title-input" value="${data.label || ''}" placeholder="Заголовок (необязательно)">
            <textarea class="admin-input block-text-input" placeholder="Текст поста..." style="min-height:100px;">${data.content || ''}</textarea>
        `;
    }
    else if (type === 'image') {
        contentHtml = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:bold;">📷 Картинка</span> ${timeSelect}
            </div>
            <label class="custom-file-upload">
                <input type="file" accept="image/*" onchange="previewImage(this)">
                <div class="file-upload-text">Выбрать файл</div>
            </label>
            <img src="${data.content || ''}" class="block-img-preview ${data.content ? 'visible' : ''}">
            <input type="hidden" class="block-existing-url" value="${data.content || ''}">
        `;
    }
    else if (type === 'rate' || type === 'userinput') {
        const icon = type === 'rate' ? '🔢' : '👤';
        const name = type === 'rate' ? 'Шкала 1-10' : 'Вопрос';
        contentHtml = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:bold;">${icon} ${name}</span> ${timeSelect}
            </div>
            <input class="admin-input block-label-input" value="${data.label || ''}" placeholder="Заголовок блока...">
        `;
    }

    block.innerHTML = `
        <div class="drag-handle">⋮</div>
        <button class="admin-block-remove-btn" onclick="this.closest('.admin-block').remove()">×</button>
        <div class="admin-block-content">${contentHtml}</div>
    `;
    list.appendChild(block);
}

// Меню выбора блока
function showBlockSelector(btn) {
    const el = document.createElement('div');
    el.className = 'admin-block-selector-popup';
    el.innerHTML = `
        <button class="selector-item-btn" onclick="addBlock('text', this)">📝 Текст</button>
        <button class="selector-item-btn" onclick="addBlock('image', this)">📷 Картинка</button>
        <button class="selector-item-btn" onclick="addBlock('rate', this)">🔢 Шкала</button>
        <button class="selector-item-btn" onclick="addBlock('userinput', this)">👤 Вопрос</button>
    `;
    const rect = btn.getBoundingClientRect();
    el.style.top = (rect.top + window.scrollY - 150) + 'px';
    el.style.left = (rect.left + rect.width/2 - 90) + 'px';
    document.body.appendChild(el);
    
    // Закрытие при клике вне
    setTimeout(() => {
        window.addEventListener('click', function close(e) {
            if(!el.contains(e.target) && e.target !== btn) { el.remove(); window.removeEventListener('click', close); }
        });
    }, 0);
    
    window.addBlock = (t, b) => { renderBlockItem(t); el.remove(); }
}

// Сохранение
window.saveDayContent = async function() {
    if (!currentOpenDate) return;
    const btn = document.querySelector('.popup-footer .btn');
    btn.innerHTML = '⏳ Сохранение...';
    
    try {
        const dateStr = formatDateISO(currentOpenDate);
        const title = document.getElementById('dayTitle').value;
        const tgLinks = Array.from(document.querySelectorAll('.social-link-input'))
            .map(i => ({ type: i.dataset.type, url: i.value.trim() }))
            .filter(v => v.url);
        
        const blocksData = [];
        const blockEls = document.querySelectorAll('#popupBlocksList .admin-block');
        
        for (let el of blockEls) {
            const type = el.getAttribute('data-type');
            const time = el.querySelector('.block-time-select').value;
            let content = null, label = null;

            if (type === 'text') {
                content = el.querySelector('.block-text-input').value;
                label = el.querySelector('.text-title-input').value; // Заголовок
            }
            else if (type === 'image') {
                const fileInp = el.querySelector('input[type=file]');
                const existUrl = el.querySelector('.block-existing-url').value;
                content = existUrl;
                
                if (fileInp.files.length) {
                    const file = fileInp.files[0];
                    const fileName = `${Date.now()}_${file.name}`;
                    const { error } = await supabaseClient.storage.from('images').upload(fileName, file);
                    if (error) throw error;
                    const { data } = supabaseClient.storage.from('images').getPublicUrl(fileName);
                    content = data.publicUrl;
                }
            }
            else {
                label = el.querySelector('.block-label-input').value;
            }
            
            blocksData.push({ type, time, content, label });
        }

        const { error } = await supabaseClient.from('calendar_days').upsert({
            date: dateStr, title, social_links: tgLinks, blocks: blocksData
        }, { onConflict: 'date' });

        if (error) throw error;
        
        filledDates.add(dateStr);
        renderAdminMonths();
        btn.innerHTML = '✅ Сохранено';
        setTimeout(() => closeAdminPopup(), 500);

    } catch (e) {
        alert('Ошибка: ' + e.message);
        btn.innerHTML = '💾 Сохранить';
    }
}

// Helpers
const SOCIAL_LABELS = { telegram: 'Telegram', facebook: 'Facebook', vk: 'ВКонтакте' };

function normalizeSocialLinks(raw) {
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map(item => {
        if (typeof item === 'string') return { type: 'telegram', url: item };
        return { type: item.type || 'telegram', url: item.url || '' };
    }).filter(item => item.url && item.url.trim());
}

function addSocialLinkField(type, url = '') {
    const c = document.getElementById('tgLinksContainer');
    const d = document.createElement('div');
    d.className = 'social-link-row';
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.gap = '8px';
    d.style.marginBottom = '8px';
    d.innerHTML = `
        <span class="social-link-badge social-link-badge-${type}">${SOCIAL_LABELS[type] || type}</span>
        <input class="admin-input social-link-input" data-type="${type}" value="${(url || '').replace(/"/g, '&quot;')}" placeholder="Ссылка на пост..." style="flex:1; margin:0;">
        <button type="button" class="social-link-remove" onclick="this.closest('.social-link-row').remove()">×</button>
    `;
    c.appendChild(d);
}
function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = input.parentElement.nextElementSibling;
            img.src = e.target.result; img.classList.add('visible');
        };
        reader.readAsDataURL(input.files[0]);
    }
}
async function fetchFilledDays() {
    const { data } = await supabaseClient.from('calendar_days').select('date');
    if(data) filledDates = new Set(data.map(d=>d.date));
}
function getStageMonths(stage) {
    let months = new Set();
    let d = new Date(stage.start);
    while (d <= stage.end) { months.add(d.getMonth()); d.setDate(d.getDate() + 1); }
    return Array.from(months).sort();
}
function formatDateISO(d) { return new Date(d.getTime()-(d.getTimezoneOffset()*60000)).toISOString().split('T')[0]; }
function formatDateRu(d) { return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
