/* js/core.js - 终端接入逻辑终极版 */
const API_BASE = "http://116.205.101.141:8443/query?qq=";
let currentUser = null;

// 属性配置：特别处理后端键名中存在的空格
const statConfig = {
    stat_face: { label: '颜值', color: 'bg-stat-gold' },
    stat_charm: { label: '魅力', color: 'bg-stat-pink' },
    stat_intel: { label: '智力', color: 'bg-stat-blue' },
    stat_biz: { label: '商业', color: 'bg-stat-emerald' },
    stat_talk: { label: '口才', color: 'bg-stat-indigo' },
    stat_body: { label: '体能', color: 'bg-stat-red' },
    stat_art: { label: '才艺', color: 'bg-stat-purple' },
    'stat_obed ': { label: '服从/威慑', color: 'bg-stat-orange' } // 适配后端带空格的键名
};

// 核心登录逻辑 - 修复错误QQ号无提示版
async function handleLogin() {
    const loginBtn = document.querySelector('#login-panel button');
    const qqInput = document.getElementById('login-qq');
    const qq = qqInput.value.trim();

    if (!qq) return alert("请输入身份芯片标识码");

    // 💡 优化：点击后立即禁用按钮，防止多次点击
    loginBtn.disabled = true;
    const originalBtnHTML = loginBtn.innerHTML; // 保存原始按钮内容
    loginBtn.innerText = "正在验证身份...";

    try {
        const response = await fetch(`${API_BASE}${qq}&t=${Date.now()}`);

        // 如果服务器返回非 200 状态码，直接视为未查获
        if (!response.ok) {
            throw new Error("UserNotFound");
        }

        const data = await response.json();

        // 🛠️ 关键修复：判断返回的数据是否包含有效用户信息
        // 假设没有该用户时后端返回空对象或 name 字段为空
        if (data && data.name) {
            currentUser = data;

            // 1. 更新 UI 状态
            updateLoginUI(true, data.name);

            // 2. 彻底移除“未接入系统”预览卡片
            const previewCard = document.getElementById('login-status-preview');
            if (previewCard) previewCard.classList.add('hidden');

            // 3. 渲染数据并直接切换到档案页
            renderProfileData(data);
            switchTab('profile');

            alert(`终端接入成功。欢迎回来，${data.name}。`);
        } else {
            // 如果解析出的 data 里面没有有效信息，手动抛出错误进入 catch
            throw new Error("EmptyUserData");
        }

    } catch (err) {
        currentUser = null;
        updateLoginUI(false);

        // 自动展开登记表
        const registerSection = document.getElementById('register-section');
        if (registerSection) registerSection.classList.remove('hidden');

        // 💡 确保页面平滑滚动到登记处
        setTimeout(() => {
            document.getElementById('register-section').scrollIntoView({ behavior: 'smooth' });
        }, 100);

        // 提示文案
        alert("未查获该 ID 户籍记录。请确保 QQ 号输入正确，或在下方完成新户籍录入。");

    } finally {
        // 💡 还原按钮文字
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalBtnHTML;
    }
}

/* 修改后的核心渲染函数 - 具备强力容错能力 */
function renderProfileData(data) {
    // 1. 基础信息展示
    document.getElementById('p-name').innerText = data.name;
    document.getElementById('p-class').innerText = data.profile['户籍'] || '未定籍';
    document.getElementById('p-job').innerText = data.profile['职位'] || '无职';
    document.getElementById('p-group').innerText = data.profile['隶属'] || '无';
    document.getElementById('p-coin').innerText = data.currency.yuCoin.toLocaleString();
    document.getElementById('p-rep').innerText = data.currency.reputation;

    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    let totalScore = 0;

    // 2. 预定义我们要展示的属性映射
    const displayMap = {
        'stat_face': '颜值',
        'stat_charm': '魅力',
        'stat_intel': '智力',
        'stat_biz': '商业',
        'stat_talk': '口才',
        'stat_body': '体能',
        'stat_art': '才艺',
        'stat_obed': '服从/威慑'
    };

    // 3. 核心修复：遍历 displayMap，并在 data.stats 中寻找对应的键（忽略空格）
    Object.keys(displayMap).forEach(key => {
        const label = displayMap[key];
        const config = statConfig[key] || statConfig['stat_obed ']; // 获取颜色配置

        // 模糊寻找：在 stats 的所有键中找包含当前 key 的那个（处理空格问题）
        let val = 0;
        const realKey = Object.keys(data.stats).find(k => k.trim() === key);
        if (realKey) {
            val = parseInt(data.stats[realKey]) || 0;
        }

        // 累计总分
        totalScore += val;

        // 计算百分比（上限 200）
        const percent = Math.min((val / 200) * 100, 100);

        container.innerHTML += `
            <div class="space-y-1">
                <div class="flex justify-between text-[10px] font-bold">
                    <span class="text-gray-500 uppercase">${label}</span>
                    <span class="text-white">${val}</span>
                </div>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill ${config.color}" style="width: 0%;" data-w="${percent}%"></div>
                </div>
            </div>`;
    });

    // 4. 更新综合评分
    document.getElementById('p-total').innerText = totalScore;

    // 5. 更新价值评级（文案已按要求修改）
    const obedRankEl = document.getElementById('p-obed');
    let rank = 'E';
    let rankColor = 'text-gray-500';

    if (totalScore >= 1000) { rank = 'S'; rankColor = 'text-yu-gold'; }
    else if (totalScore >= 800) { rank = 'A'; rankColor = 'text-red-500'; }
    else if (totalScore >= 600) { rank = 'B'; rankColor = 'text-purple-500'; }
    else if (totalScore >= 400) { rank = 'C'; rankColor = 'text-orange-600'; }
    else if (totalScore >= 200) { rank = 'D'; rankColor = 'text-blue-400'; }

    obedRankEl.innerText = rank;
    obedRankEl.className = `text-2xl font-roman tracking-widest ${rankColor}`;

    // 6. 延时触发生长动画
    setTimeout(() => {
        document.querySelectorAll('.stat-bar-fill').forEach(bar => {
            bar.style.width = bar.getAttribute('data-w');
        });
    }, 200);
}

// 登录态 UI 切换
function updateLoginUI(isOnline, name = "") {
    document.getElementById('status-offline').classList.toggle('hidden', isOnline);
    document.getElementById('status-online').classList.toggle('hidden', !isOnline);
    if (isOnline) {
        document.getElementById('header-user-name').innerText = name;
        document.getElementById('login-panel').classList.add('hidden');
    }
}

function logout() {
    currentUser = null;
    location.reload();
}

// 标签切换
function switchTab(tabId) {
    // 1. 定义所有可能的页面区块
    const allTabs = ['home', 'world', 'politics', 'map', 'families', 'apply', 'profile'];

    // 2. 核心逻辑：如果点击的是“档案”，根据登录状态决定去哪
    let targetId = tabId;
    if (tabId === 'apply' || tabId === 'profile') {
        // 如果已登录(currentUser有值)，强制去 profile 面板
        // 如果未登录，强制去 apply 登录/登记页
        targetId = currentUser ? 'profile' : 'apply';
    }

    // 3. 隐藏所有区块
    allTabs.forEach(id => {
        const el = document.getElementById('tab-' + id);
        if (el) el.classList.add('hidden');
    });

    // 4. 显示目标区块
    const selected = document.getElementById('tab-' + targetId);
    if (selected) {
        selected.classList.remove('hidden');
        // 如果进入的是 profile，重新触发一次进度条动画
        if (targetId === 'profile' && currentUser) {
            renderProfileData(currentUser);
        }
    }

    // 5. 同步所有导航高亮 (桌面 + 手机)
    // 匹配逻辑：点击 'profile' 或 'apply' 都要让导航上的“档案”按钮变色
    const highlightId = (tabId === 'profile' || tabId === 'apply') ? 'profile' : tabId;

    const allBtns = document.querySelectorAll('#desktop-nav .tab-btn, .bottom-nav-item');
    allBtns.forEach(btn => {
        const clickAttr = btn.getAttribute('onclick');
        if (clickAttr && (clickAttr.includes(`'${tabId}'`) || clickAttr.includes(`'profile'`) || clickAttr.includes(`'apply'`))) {
            // 只有当按钮本身对应的功能与 highlightId 一致时才高亮
            if (clickAttr.includes(`'${highlightId}'`) || (highlightId === 'profile' && clickAttr.includes('apply'))) {
                btn.classList.add('active');
                if (btn.classList.contains('tab-btn')) btn.classList.add('text-white');
            } else {
                btn.classList.remove('active');
                if (btn.classList.contains('tab-btn')) btn.classList.remove('text-white');
            }
        } else {
            btn.classList.remove('active');
            if (btn.classList.contains('tab-btn')) btn.classList.remove('text-white');
        }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === 弹窗控制与原有逻辑保留 ===
function showFamilyDetails(id) {
    const data = familyData[id];
    const modal = document.getElementById('family-modal');
    const content = document.getElementById('modal-content');
    let rolesHtml = data.roles.map(r => `<span class="inline-block bg-white/10 text-gray-300 px-3 py-1 text-xs rounded border border-white/5 mr-2 mb-2 tracking-wide">${r}</span>`).join('');
    content.innerHTML = `
        <div class="text-center mb-6">
            <span class="text-xs font-bold border border-gray-600 px-2 py-1 rounded text-gray-400 mb-4 inline-block tracking-widest font-roman">${data.title}</span>
            <h3 class="text-3xl font-serif ${data.color} mb-4">${data.name}</h3>
            <div class="h-px w-16 bg-gray-700 mx-auto"></div>
        </div>
        <div class="space-y-6 text-sm text-gray-400">
            <div><h4 class="text-white font-bold mb-2 font-serif">家族简介</h4><p class="leading-relaxed font-sans">${data.desc}</p></div>
            <div><h4 class="text-white font-bold mb-2 font-serif">垄断领域</h4><p class="text-gray-300 font-sans">${data.monopoly}</p></div>
            <div><h4 class="text-white font-bold mb-2 font-serif">开放职位</h4><div class="flex flex-wrap">${rolesHtml}</div></div>
        </div>
    `;
    modal.classList.remove('hidden');
}

function showMapDetail(regionId) {
    const element = document.getElementById('detail-' + regionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.transition = "all 0.5s";
        element.style.borderColor = "var(--yu-gold)";
        element.style.boxShadow = "0 0 20px rgba(197, 160, 89, 0.4)";
        setTimeout(() => {
            element.style.borderColor = "";
            element.style.boxShadow = "";
        }, 800);
    }
}

function showCitizenshipDetails(type) {
    const data = citizenData[type];
    const modal = document.getElementById('citizen-modal');
    const content = document.getElementById('citizen-content');
    if (!data) return;
    let rightsHtml = data.rights.map(r => `<li class="mb-1">${r}</li>`).join('');
    let dutiesHtml = data.duties.map(d => `<li class="mb-1">${d}</li>`).join('');
    content.innerHTML = `
        <div class="text-center mb-6">
            <div class="inline-block px-3 py-1 border border-gray-600 rounded text-xs font-roman mb-3 tracking-widest text-gray-400 uppercase">${data.chip}</div>
            <h3 class="text-3xl font-serif ${data.color} mb-2">${data.title}</h3>
            <p class="text-xs text-gray-500">${data.desc}</p>
        </div>
        <div class="space-y-6 text-sm text-gray-300">
            <div class="bg-white/5 p-4 rounded border-l-2 border-gray-600">
                <h4 class="text-white font-bold mb-2 font-serif">权利与权限</h4>
                <ul class="list-disc list-inside text-xs text-gray-400 space-y-1">${rightsHtml}</ul>
            </div>
            <div class="bg-white/5 p-4 rounded border-l-2 border-red-900/50">
                <h4 class="text-white font-bold mb-2 font-serif">义务与限制</h4>
                <ul class="list-disc list-inside text-xs text-gray-400 space-y-1">${dutiesHtml}</ul>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

function closeModal() { document.getElementById('family-modal').classList.add('hidden'); }
function closeCitizenModal() { document.getElementById('citizen-modal').classList.add('hidden'); }

function generateRegisterData() {
    const form = document.querySelector('#register-form');
    const data = new FormData(form);
    const modal = document.getElementById('register-modal');
    const resultArea = document.getElementById('register-result');
    const placeholders = {
        'name': '', 'age': '（最低16岁）', 'attribute': '（dom/swi/sub、1/0）',
        'family': '（家族内身份，如X家少爷/旁系）', 'position': '（职位名称）',
        'height': '', 'personality': '（字数不低于20）', 'appearance': '（字数不低于30）',
        'background': '', 'likes': '', 'taboos': '', 'class': '（公民籍/奴籍/罪奴籍）',
        'salary': '（自行填写）', 'affiliation': '（仅奴皮填）', 'notes': ''
    };
    const outputOrder = [
        { key: 'name', label: '姓名' }, { key: 'age', label: '年龄' }, { key: 'attribute', label: '属性' },
        { key: 'family', label: '家世' }, { key: 'position', label: '职位' }, { key: 'height', label: '身高' },
        { key: 'personality', label: '性格' }, { key: 'appearance', label: '外貌' }, { key: 'background', label: '背景' },
        { key: 'likes', label: '喜恶' }, { key: 'taboos', label: '禁忌' }, { key: 'class', label: '户籍' },
        { key: 'salary', label: '薪资' }, { key: 'affiliation', label: '隶属' }, { key: 'notes', label: '备注' }
    ];
    let content = "【户籍登记表】\n";
    outputOrder.forEach(item => {
        const userValue = data.get(item.key);
        const valueToShow = (userValue && userValue.trim() !== "") ? userValue : (placeholders[item.key] || "");
        content += `${item.label}=${valueToShow}\n`;
    });
    resultArea.value = content;
    modal.classList.remove('hidden');
}

function copyRegisterData() {
    const textarea = document.getElementById('register-result');
    textarea.select();
    document.execCommand('copy');
    alert("已复制到剪贴板");
}

window.addEventListener('click', (e) => {
    if (e.target.id === 'family-modal') closeModal();
    if (e.target.id === 'citizen-modal') closeCitizenModal();
    if (e.target.id === 'register-modal') document.getElementById('register-modal').classList.add('hidden');
});