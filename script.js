(function() {
    'use strict';

    // ==========================================
    // 1. КОНСТАНТЫ И ПЕРЕМЕННЫЕ
    // ==========================================
    const YEAR = 2026;
    const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    
    let STAGES = []; // Будут загружены из БД
    let currentStageIndex = 0;
    
    // Прогресс пользователя (из LocalStorage)
    let userProgress = {};

    // --- ГЛАВНАЯ ФУНКЦИЯ ВРЕМЕНИ (MSK UTC+3) ---
    function getMskDate() {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (3 * 3600000));
    }

    // ==========================================
    // 2. ИНИЦИАЛИЗАЦИЯ (ASYNC)
    // ==========================================
    async function initApp() {
        loadUserProgress(); // Грузим прогресс из памяти

        try {
            // 1. Запрос этапов из Supabase
            if (typeof supabaseClient === 'undefined') {
                throw new Error('Supabase client not found');
            }

            const { data, error } = await supabaseClient
                .from('stages')
                .select('*')
                .order('start_date', { ascending: true });

            if (error) throw error;

            if (!data || data.length === 0) {
                document.querySelector('.container').innerHTML = '<h3 style="text-align:center; padding:40px;">Этапы еще не настроены администратором.</h3>';
                return;
            }

            // 2. Преобразование данных
            STAGES = data.map((s, index) => ({
                num: index + 1,
                label: `${s.emoji || ''} ${s.title}`,
                start: new Date(s.start_date),
                end: new Date(s.end_date),
                isSingleDay: s.start_date === s.end_date // Флаг для финала
            }));

            // 3. Определение текущего этапа по дате МСК
            const today = getMskDate();
            // Ищем этап, в который попадает сегодня
            let activeIndex = STAGES.findIndex(s => {
                const sStart = new Date(s.start); sStart.setHours(0,0,0,0);
                const sEnd = new Date(s.end); sEnd.setHours(23,59,59,999);
                return today >= sStart && today <= sEnd;
            });

            // Если не нашли (мы до начала или после конца, или между)
            if (activeIndex === -1) {
                if (today < STAGES[0].start) activeIndex = 0;
                else if (today > STAGES[STAGES.length - 1].end) activeIndex = STAGES.length - 1;
                else {
                    // Ищем ближайший будущий этап
                    activeIndex = STAGES.findIndex(s => s.start > today);
                    if (activeIndex === -1) activeIndex = STAGES.length - 1;
                }
            }

            currentStageIndex = activeIndex;

            // 4. Первичная отрисовка
            updateUI();

        } catch (e) {
            console.error('Critical Error:', e);
            document.querySelector('.container').innerHTML = `<div style="text-align:center; padding:20px; color:red;">Ошибка загрузки данных.<br>Проверьте интернет.<br><small>${e.message}</small></div>`;
        }
    }

    // ==========================================
    // 3. УПРАВЛЕНИЕ ДАННЫМИ (LOCAL STORAGE)
    // ==========================================
    function loadUserProgress() {
        try {
            const data = localStorage.getItem('userCalendarProgress_v2');
            if (data) userProgress = JSON.parse(data);
        } catch (e) {
            console.error('Error loading progress:', e);
            userProgress = {};
        }
    }

    function saveUserProgress() {
        localStorage.setItem('userCalendarProgress_v2', JSON.stringify(userProgress));
        updateStats(); 
        renderMonths(); // Перерисовать галочки
    }

    function getUserDayData(dateStr) {
        return userProgress[dateStr] || { completed: false, inputs: {} };
    }

    function updateUserDayInput(dateStr, blockIndex, value) {
        if (!userProgress[dateStr]) userProgress[dateStr] = { completed: false, inputs: {} };
        userProgress[dateStr].inputs[`block_${blockIndex}`] = value;
        saveUserProgress();
    }

    function toggleDayCompletion(dateStr) {
        if (!userProgress[dateStr]) userProgress[dateStr] = { completed: false, inputs: {} };
        userProgress[dateStr].completed = !userProgress[dateStr].completed;
        saveUserProgress();
        return userProgress[dateStr].completed;
    }

    // ==========================================
    // 4. ЛОГИКА КАЛЕНДАРЯ И РЕНДЕРИНГ
    // ==========================================

    function updateUI() {
        renderStageNavigation();
        renderMonths();
        updateStats();
    }

    function renderMonths() {
        const grid = document.getElementById('monthGrid');
        const finalView = document.getElementById('finalStageView');
        const stage = STAGES[currentStageIndex];

        if (!grid || !stage) return;

        // ЛОГИКА 1: ЭТАП ИЗ ОДНОГО ДНЯ (ФИНАЛ)
        if (stage.isSingleDay) {
            grid.style.display = 'none';
            if (finalView) {
                finalView.style.display = 'block';
                const d = stage.start;
                const dateKey = getDayKey(d.getMonth(), d.getDate());
                
                finalView.innerHTML = `
                    <div class="final-stage-card">
                        <h2>🏁 ${stage.label}</h2>
                        <div class="final-stage-date">${d.getDate()} ${MONTHS[d.getMonth()]} ${YEAR}</div>
                        <p style="margin-bottom:20px; color:#666;">Это особенный день. Нажмите кнопку ниже.</p>
                        <button class="data-btn btn-export" onclick="openUserDayPopup('${dateKey}')" style="font-size:18px; padding:15px 30px;">
                            🚀 Открыть финальный день
                        </button>
                    </div>
                `;
            }
            return;
        }

        // ЛОГИКА 2: ОБЫЧНЫЙ ЭТАП
        if (finalView) finalView.style.display = 'none';
        grid.style.display = 'grid';
        grid.innerHTML = '';
        
        const monthsArr = getStageMonths(stage);
        
        monthsArr.forEach(monthIndex => {
            grid.appendChild(createMonthCard(MONTHS[monthIndex], monthIndex, stage));
        });
    }

    function createMonthCard(monthName, monthIndex, stage) {
        const card = document.createElement('div');
        card.className = 'month-card';

        const daysInM = new Date(YEAR, monthIndex + 1, 0).getDate();
        
        // Подсчет статистики для футера карточки
        let completedCount = 0;
        let visibleDaysCount = 0;
        
        // Границы этапа для проверки
        const stageStart = new Date(stage.start.getFullYear(), stage.start.getMonth(), stage.start.getDate()).getTime();
        const stageEnd = new Date(stage.end.getFullYear(), stage.end.getMonth(), stage.end.getDate()).getTime();

        // Сбор данных для статистики
        for (let d = 1; d <= daysInM; d++) {
            const currentDayTime = new Date(YEAR, monthIndex, d).getTime();
            if (currentDayTime >= stageStart && currentDayTime <= stageEnd) {
                visibleDaysCount++;
                if (getUserDayData(getDayKey(monthIndex, d)).completed) completedCount++;
            }
        }
        
        // Процент (если в месяце нет дней этапа, будет 0)
        const percent = visibleDaysCount > 0 ? Math.round((completedCount / visibleDaysCount) * 100) : 0;

        card.innerHTML = `<div class="month-header">${monthName}</div>`;
        
        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(t => {
            const h = document.createElement('div'); h.className = 'day-header'; h.textContent = t; grid.appendChild(h);
        });

        const firstDay = new Date(YEAR, monthIndex, 1).getDay();
        const startDay = (firstDay === 0) ? 6 : firstDay - 1;
        for (let i = 0; i < startDay; i++) grid.appendChild(createEmptyCell());

        const mskToday = getMskDate();

        for (let day = 1; day <= daysInM; day++) {
            const dateStr = getDayKey(monthIndex, day);
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            
            // Проверка: входит ли день в этап?
            const currentDayTime = new Date(YEAR, monthIndex, day).getTime();
            const isWithinStage = currentDayTime >= stageStart && currentDayTime <= stageEnd;

            if (!isWithinStage) {
                // ДЕНЬ НЕДОСТУПЕН
                cell.classList.add('disabled-day');
                cell.innerHTML = `<div class="day-number">${day}</div>`;
            } else {
                // ДЕНЬ ДОСТУПЕН
                if (mskToday.getFullYear() === YEAR && mskToday.getMonth() === monthIndex && mskToday.getDate() === day) {
                    cell.classList.add('today');
                }
                if (getUserDayData(dateStr).completed) {
                    cell.classList.add('completed');
                }
                // Есть ли скачанный контент (кэш)
                if (localStorage.getItem(`admin_content_${dateStr}`)) {
                    cell.classList.add('has-admin-content');
                }
                
                cell.innerHTML = `<div class="day-number">${day}</div>`;
                cell.onclick = () => openUserDayPopup(dateStr);
            }

            grid.appendChild(cell);
        }

        // Добивка пустых ячеек
        const totalCells = grid.children.length - 7;
        const remainder = totalCells % 7;
        const emptyAtEnd = remainder === 0 ? 0 : 7 - remainder;
        for (let i = 0; i < emptyAtEnd; i++) grid.appendChild(createEmptyCell());

        // Футер только если в месяце есть активные дни
        if (visibleDaysCount > 0) {
            const footer = document.createElement('div');
            footer.className = 'month-progress';
            footer.innerHTML = `
                <div class="month-stats-text">${completedCount}/${visibleDaysCount} выполнено (${percent}%)</div>
                <div class="month-progress-bar"><div class="month-progress-fill" style="width: ${percent}%"></div></div>
            `;
            card.appendChild(footer);
        }

        card.appendChild(grid);
        return card;
    }

    function createEmptyCell() {
        const d = document.createElement('div'); d.className = 'day-cell empty'; return d;
    }

    // ==========================================
    // 5. ПОПАП И РЕНДЕРИНГ БЛОКОВ
    // ==========================================

    window.openUserDayPopup = async function(dateStr) {
        const overlay = document.getElementById('userDayPopupOverlay');
        const container = document.getElementById('popupBlocksContainer');
        const titleEl = document.getElementById('popupTitle');
        const dateBadge = document.getElementById('popupDate');
        const completeBtn = document.getElementById('markDayCompleteBtn');
        const tgLinksContainer = document.getElementById('popupTgLinks');

        // Сброс UI
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#888;">Загрузка...</div>';
        titleEl.textContent = '';
        tgLinksContainer.innerHTML = '';
        completeBtn.innerHTML = 'Загрузка...';
        completeBtn.disabled = true;

        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('active'), 10);
        
        const dateObj = new Date(dateStr);
        dateBadge.textContent = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

        // Кэш
        const cachedData = localStorage.getItem(`admin_content_${dateStr}`);
        if (cachedData) {
            renderPopupContent(JSON.parse(cachedData), dateStr);
        }

        try {
            // Загрузка из Supabase
            if (typeof supabaseClient !== 'undefined') {
                const { data } = await supabaseClient
                    .from('calendar_days')
                    .select('*')
                    .eq('date', dateStr)
                    .single();

                if (data) {
                    const newDataStr = JSON.stringify(data);
                    // Если данные обновились или кэша не было
                    if (newDataStr !== cachedData) {
                        localStorage.setItem(`admin_content_${dateStr}`, newDataStr);
                        renderPopupContent(data, dateStr);
                    }
                } else if (!cachedData) {
                    renderEmptyState(container, completeBtn);
                }
            } else if (!cachedData) {
                renderEmptyState(container, completeBtn);
            }
        } catch (e) {
            console.error('Ошибка загрузки дня:', e);
            if (!cachedData) renderEmptyState(container, completeBtn);
        }
    }

    function renderPopupContent(data, dateStr) {
        const container = document.getElementById('popupBlocksContainer');
        const titleEl = document.getElementById('popupTitle');
        const completeBtn = document.getElementById('markDayCompleteBtn');
        const tgContainer = document.getElementById('popupTgLinks');

        titleEl.textContent = data.title || 'День без названия';
        container.innerHTML = '';

        // Блоки
        if (data.blocks && Array.isArray(data.blocks)) {
            data.blocks.forEach((block, index) => {
                container.appendChild(createBlockElement(block, index, dateStr));
            });
        }

        // Ссылки
        tgContainer.innerHTML = '';
        if (data.tg_links && Array.isArray(data.tg_links) && data.tg_links.length > 0) {
            const validLinks = data.tg_links.filter(l => l && l.trim() !== '');
            if (validLinks.length > 0) {
                const linksWrapper = document.createElement('div');
                linksWrapper.className = 'popup-tg-links-area';
                validLinks.forEach((link, i) => {
                    const a = document.createElement('a');
                    a.className = 'tg-link-btn';
                    a.href = link;
                    a.target = '_blank';
                    a.innerHTML = `<span style="font-size:18px;">✈️</span> Обсудить в Telegram #${i + 1}`;
                    linksWrapper.appendChild(a);
                });
                tgContainer.appendChild(linksWrapper);
            }
        }

        // Кнопка
        const userData = getUserDayData(dateStr);
        updateCompleteButton(completeBtn, userData.completed, dateStr);
    }

    function createBlockElement(block, index, dateStr) {
        const wrapper = document.createElement('div');
        wrapper.className = 'user-block';

        // --- БЛОКИРОВКА ПО ВРЕМЕНИ ---
        if (block.time) {
            const nowMsk = getMskDate();
            const blockDate = new Date(dateStr); blockDate.setHours(0,0,0,0);
            const todayMsk = new Date(nowMsk); todayMsk.setHours(0,0,0,0);
            const [hours, minutes] = block.time.split(':').map(Number);
            
            let isLocked = false;
            // Если день в будущем
            if (blockDate.getTime() > todayMsk.getTime()) isLocked = true;
            // Если сегодня, но время не пришло
            else if (blockDate.getTime() === todayMsk.getTime()) {
                const nowH = nowMsk.getHours();
                const nowM = nowMsk.getMinutes();
                if (nowH < hours || (nowH === hours && nowM < minutes)) isLocked = true;
            }

            if (isLocked) {
                wrapper.innerHTML = `
                    <div class="locked-block">
                        <span class="locked-icon">🔒</span>
                        <div style="font-weight:600">Контент откроется в ${block.time} (МСК)</div>
                    </div>`;
                return wrapper;
            }
        }

        // --- РЕНДЕРИНГ БЛОКОВ ---
        if (block.type === 'text') {
            wrapper.className += ' user-block-text';
            // Заголовок (если есть)
            if (block.label) {
                const h3 = document.createElement('h3');
                h3.className = 'user-block-title';
                h3.textContent = block.label;
                wrapper.appendChild(h3);
            }
            const p = document.createElement('p');
            p.innerHTML = linkify(block.content || '');
            wrapper.appendChild(p);
        } 
        else if (block.type === 'image') {
            wrapper.className += ' user-block-image';
            wrapper.innerHTML = `<img src="${block.content}" alt="Image" loading="lazy">`;
        } 
        else if (block.type === 'userinput') {
            wrapper.innerHTML = `
                <div class="user-block-label">👤 ${block.label || 'Вопрос:'}</div>
                <textarea class="user-input-field" rows="1" placeholder="Ваш ответ..."></textarea>
            `;
            const textarea = wrapper.querySelector('textarea');
            const saved = getUserDayData(dateStr).inputs[`block_${index}`];
            if (saved) textarea.value = saved;
            textarea.addEventListener('input', (e) => updateUserDayInput(dateStr, index, e.target.value));
        } 
        else if (block.type === 'rate') {
            const savedVal = getUserDayData(dateStr).inputs[`block_${index}`] || 5;
            const sliderTitle = block.label && block.label.trim() !== '' ? block.label : 'Оцените день:';
            wrapper.innerHTML = `
                <div class="user-rate-wrapper">
                    <div class="user-block-label" style="text-align:center;">${sliderTitle}</div>
                    <div class="user-range-value" id="rateVal_${index}">${savedVal}</div>
                    <input type="range" min="1" max="10" value="${savedVal}" class="user-range-input">
                    <div style="display:flex; justify-content:space-between; font-size:12px; color:#888; margin-top:5px;">
                        <span>1</span><span>10</span>
                    </div>
                </div>
            `;
            const input = wrapper.querySelector('input');
            const valDisplay = wrapper.querySelector(`#rateVal_${index}`);
            input.addEventListener('input', (e) => {
                valDisplay.textContent = e.target.value;
                updateUserDayInput(dateStr, index, e.target.value);
            });
        } 

        return wrapper;
    }

    function renderEmptyState(container, btn) {
        container.innerHTML = `
            <div style="text-align:center; padding: 40px 20px;">
                <div style="font-size:40px; margin-bottom:15px;">💤</div>
                <h3 style="color:#555; margin-bottom:10px;">Пока пусто</h3>
                <p style="color:#999; font-size:14px;">Контент на этот день еще не загружен.</p>
            </div>`;
        btn.textContent = '⛔ Недоступно';
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }

    // ==========================================
    // 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ==========================================

    function updateCompleteButton(btn, isCompleted, dateStr) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        if (isCompleted) {
            btn.classList.add('active');
            btn.innerHTML = '🎉 Выполнено! (Отменить)';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '✅ Отметить выполненным';
        }
        btn.onclick = () => {
            const newState = toggleDayCompletion(dateStr);
            updateCompleteButton(btn, newState, dateStr);
        };
    }

    function updateStats() {
        let completed = 0;
        Object.values(userProgress).forEach(d => { if(d.completed) completed++; });
        const total = 365;
        const remaining = total - completed;
        const percent = Math.round((completed / total) * 100);

        const ids = { 'completedDays': completed, 'remainingDays': remaining, 'percentDays': percent + '%' };
        for (let id in ids) {
            const el = document.getElementById(id);
            if(el) el.textContent = ids[id];
        }
        const bar = document.getElementById('mainProgressBar');
        if(bar) bar.style.width = percent + '%';
    }

    function renderStageNavigation() {
        const nav = document.getElementById('stageNavigation');
        const stage = STAGES[currentStageIndex];
        
        // Кнопки
        const isFirst = currentStageIndex === 0;
        const isLast = currentStageIndex === STAGES.length - 1;

        // Даты
        const d1 = stage.start;
        const d2 = stage.end;
        let dateLabel = '';
        if (stage.isSingleDay) {
            dateLabel = `${d1.getDate()} ${MONTHS[d1.getMonth()]}`;
        } else {
            const m1 = MONTHS[d1.getMonth()];
            const m2 = MONTHS[d2.getMonth()];
            dateLabel = (m1 === m2) ? `${d1.getDate()} - ${d2.getDate()} ${m1}` : `${d1.getDate()} ${m1} - ${d2.getDate()} ${m2}`;
        }

        nav.innerHTML = `
            <button class="stage-nav-btn stage-nav-btn-left" id="stagePrevBtn" ${isFirst ? 'disabled' : ''}>←</button>
            <div class="stage-content">
                <div class="stage-title">${stage.label}</div>
                <div class="stage-months">${dateLabel}</div>
            </div>
            <button class="stage-nav-btn stage-nav-btn-right" id="stageNextBtn" ${isLast ? 'disabled' : ''}>→</button>
        `;

        document.getElementById('stagePrevBtn').onclick = () => { if(!isFirst) { currentStageIndex--; updateUI(); } };
        document.getElementById('stageNextBtn').onclick = () => { if(!isLast) { currentStageIndex++; updateUI(); } };
    }

    // --- Helpers ---
    function linkify(text) {
        return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#e53935; text-decoration:underline;">$1</a>');
    }
    window.closeUserPopup = function() {
        document.getElementById('userDayPopupOverlay').classList.remove('active');
        setTimeout(() => { document.getElementById('userDayPopupOverlay').style.display = 'none'; }, 300);
        renderMonths(); // Обновить галочки в сетке
    };
    function getDayKey(month, day) {
        return `${YEAR}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    function getStageMonths(stage) {
        let months = new Set();
        let d = new Date(stage.start);
        while (d <= stage.end) { months.add(d.getMonth()); d.setDate(d.getDate() + 1); }
        return Array.from(months).sort();
    }

    // Export/Import оставил как есть
    window.exportData = function() {
        const dataStr = JSON.stringify(userProgress);
        const blob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    window.importData = function(input) {
        const file = input.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if(confirm('Перезаписать данные?')) {
                    userProgress = data; saveUserProgress(); location.reload();
                }
            } catch(e) { alert('Ошибка файла'); }
        };
        reader.readAsText(file); input.value = '';
    };

    // Запуск
    document.addEventListener('DOMContentLoaded', () => {
        initApp();
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
    });

})();