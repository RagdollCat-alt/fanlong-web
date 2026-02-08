/* js/core.js - 虞宫数字化终端·全功能整合终极修复版 */

const API_BASE = "/api/query?qq=";
let currentUser = null;

// 1. 属性配置
const statConfig = {
    stat_face: { label: '颜值', color: 'bg-stat-gold' },
    stat_charm: { label: '魅力', color: 'bg-stat-pink' },
    stat_intel: { label: '智力', color: 'bg-stat-blue' },
    stat_biz: { label: '商业', color: 'bg-stat-emerald' },
    stat_talk: { label: '口才', color: 'bg-stat-indigo' },
    stat_body: { label: '体能', color: 'bg-stat-red' },
    stat_art: { label: '才艺', color: 'bg-stat-purple' },
    'stat_obed ': { label: '服从/威慑', color: 'bg-stat-orange' } 
};

// 2. 核心登录逻辑
async function handleLogin() {
    const loginBtn = document.querySelector('#login-panel button');
    const qqInput = document.getElementById('login-qq');
    
    qqInput.blur(); 
    window.focus(); 
    
    const qq = qqInput.value.trim();
    if (!qq) return alert("请输入身份标识码");

    loginBtn.disabled = true;
    const originalBtnHTML = loginBtn.innerHTML;
    loginBtn.innerText = "正在验证身份...";

    try {
        const response = await fetch(`${API_BASE}${qq}&t=${Date.now()}`);
        if (!response.ok) throw new Error("UserNotFound");

        const data = await response.json();

        if (data && data.name) {
            currentUser = data;
            updateLoginUI(true, data.name);
            
            const previewCard = document.getElementById('login-status-preview');
            if (previewCard) previewCard.classList.add('hidden');

            showCyberPopup(
                "ACCESS GRANTED", 
                `终端身份校验通过。<br>欢迎回来，${data.name}。`,
                () => {
                    setTimeout(() => {
                        switchTab('profile');
                        requestAnimationFrame(() => {
                            renderProfileData(data);
                        });
                    }, 50);
                }
            );
        } else {
            throw new Error("EmptyUserData");
        }
    } catch (err) {
        currentUser = null;
        updateLoginUI(false);
        
        showCyberPopup(
            "IDENTIFICATION FAILED", 
            "未查询到该 ID。<br>请确保身份标识码输入正确，或在下方完成新户籍录入登记。",
            () => {
                const registerSection = document.getElementById('register-section');
                if (registerSection) {
                    // 1. 立即显示，但不滚动
                    registerSection.classList.remove('hidden');
                    
                    // 2. ✅ 核心修复：双重帧同步，确保 DOM 已经渲染且弹窗完全销毁
                    setTimeout(() => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                registerSection.scrollIntoView({ 
                                    behavior: 'smooth', 
                                    block: 'start' 
                                });
                            });
                        });
                    }, 100); 
                }
            },
            'error',
            '前往登记'
        );
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalBtnHTML;
    }
} // ✅ 补齐 handleLogin 闭合括号

// 3. 核心渲染函数
function renderProfileData(data) {
    document.getElementById('p-name').innerText = data.name;
    document.getElementById('p-class').innerText = data.profile['户籍'] || '未定籍';
    document.getElementById('p-job').innerText = data.profile['职位'] || '无职';
    document.getElementById('p-group').innerText = data.profile['隶属'] || '无';
    document.getElementById('p-coin').innerText = data.currency.yuCoin.toLocaleString();
    document.getElementById('p-rep').innerText = data.currency.reputation;

    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    let totalScore = 0;

    const displayMap = {
        'stat_face': '颜值', 'stat_charm': '魅力', 'stat_intel': '智力',
        'stat_biz': '商业', 'stat_talk': '口才', 'stat_body': '体能',
        'stat_art': '才艺', 'stat_obed': '服从/威慑'
    };

    Object.keys(displayMap).forEach(key => {
        const label = displayMap[key];
        const config = statConfig[key] || statConfig['stat_obed '];
        let val = 0;
        const realKey = Object.keys(data.stats).find(k => k.trim() === key);
        if (realKey) val = parseInt(data.stats[realKey]) || 0;
        
        totalScore += val;
        const percent = Math.min((val / 200) * 100, 100);

        container.innerHTML += `
            <div class="space-y-1">
                <div class="flex justify-between text-[10px] font-bold">
                    <span class="text-gray-500 uppercase">${label}</span>
                    <span class="text-white">${val}</span>
                </div>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill relative overflow-hidden ${config.color}" style="width: 0%;" data-w="${percent}%"></div>
                </div>
            </div>`;
    });

    document.getElementById('p-total').innerText = totalScore;
    const obedRankEl = document.getElementById('p-obed');
    let rank = 'E', rankColor = 'text-gray-500';
    if (totalScore >= 1000) { rank = 'S'; rankColor = 'text-yu-gold'; }
    else if (totalScore >= 800) { rank = 'A'; rankColor = 'text-red-500'; }
    else if (totalScore >= 600) { rank = 'B'; rankColor = 'text-purple-500'; }
    else if (totalScore >= 400) { rank = 'C'; rankColor = 'text-orange-600'; }
    else if (totalScore >= 200) { rank = 'D'; rankColor = 'text-blue-400'; }

    obedRankEl.innerText = rank;
    obedRankEl.className = `text-2xl font-roman tracking-widest ${rankColor}`;

    setTimeout(() => {
        document.querySelectorAll('.stat-bar-fill').forEach(bar => {
            bar.style.width = bar.getAttribute('data-w');
        });
    }, 200);
}

// 4. 标签切换
function switchTab(tabId) {
    // 1. 定义所有可能的顶级容器 ID
    const allTabs = ['home', 'world', 'politics', 'map', 'families', 'apply', 'profile'];
    
    // 2. 档案页面的特殊逻辑：未登录显示 apply，已登录显示 profile
    let activeId = tabId;
    if (tabId === 'apply' || tabId === 'profile') {
        activeId = currentUser ? 'profile' : 'apply';
    }

    // 3. 隐藏所有容器
    allTabs.forEach(id => {
        const el = document.getElementById('tab-' + id);
        if (el) {
            el.classList.add('hidden');
            el.style.display = 'none'; // 确保强制隐藏
        }
    });

    // 4. 显示目标容器
    const selected = document.getElementById('tab-' + activeId);
    if (selected) {
        selected.classList.remove('hidden');
        selected.style.display = 'block'; // 确保显示
        
        // 如果进入档案页且已登录，触发数据渲染
        if (activeId === 'profile' && currentUser) {
            renderProfileData(currentUser);
        }
    }

    // 5. 更新导航栏高亮状态
    const highlightId = (tabId === 'apply' || tabId === 'profile') ? 'apply' : tabId;
    const allBtns = document.querySelectorAll('#desktop-nav .tab-btn, .bottom-nav-item');
    
    allBtns.forEach(btn => {
        const clickAttr = btn.getAttribute('onclick');
        if (clickAttr && clickAttr.includes(`'${highlightId}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 5. 户籍详情弹窗
function showCitizenshipDetails(type) {
    const data = citizenData[type];
    const modal = document.getElementById('citizen-modal');
    const content = document.getElementById('citizen-content');
    if (!data) return;

    const renderList = (list) => list.map(item => `<li class="mb-2 leading-relaxed">${item}</li>`).join('');

    content.innerHTML = `
        <div class="modal-fixed-header">
            <div class="inline-block px-2 py-0.5 border border-gray-700 rounded text-[9px] font-roman mb-3 tracking-widest text-gray-500 uppercase">
                ${data.chip}
            </div>
            <h3 class="text-3xl font-serif ${data.color} mb-3 tracking-widest">${data.title}</h3>
            <p class="text-[11px] text-gray-400 italic px-4 leading-relaxed opacity-80">${data.desc}</p>
        </div>
        <div class="modal-scroll-area space-y-4 text-sm pr-2">
            <div class="bg-white/5 p-4 rounded border border-white/10 shadow-inner">
                <p class="text-xs text-gray-300 font-bold mb-2 underline decoration-yu-gold/30 underline-offset-4">获取方式</p>
                <p class="text-xs text-gray-400 leading-relaxed">${data.origin}</p>
            </div>
            <div class="bg-white/5 p-4 rounded border border-white/10 shadow-inner">
                <p class="text-xs text-gray-300 font-bold mb-3 underline decoration-yu-gold/30 underline-offset-4">基本权利</p>
                <ul class="text-xs text-gray-400 space-y-1 list-none">${renderList(data.rights)}</ul>
            </div>
            <div class="bg-white/5 p-4 rounded border border-white/10 shadow-inner">
                <p class="text-xs text-gray-300 font-bold mb-3 underline decoration-yu-gold/30 underline-offset-4">社会待遇</p>
                <ul class="text-xs text-gray-400 space-y-1 list-none">${renderList(data.benefits)}</ul>
            </div>
            <div class="bg-white/5 p-4 rounded border border-white/10 shadow-inner">
                <p class="text-xs text-gray-300 font-bold mb-2 underline decoration-yu-gold/30 underline-offset-4">晋升与流动</p>
                <p class="text-xs text-gray-400 leading-relaxed font-sans">${data.flow}</p>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; 
}

// 6. 地图逻辑
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

// 7. 家族逻辑
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
    document.body.style.overflow = 'hidden';
}

// 8. 赛博风格弹窗
function showCyberPopup(title, message, callback, type = 'success', btnText = '确认接入') {
    const existing = document.querySelector('.cyber-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'cyber-modal-overlay';
    const contentClass = type === 'error' ? 'cyber-modal-content error' : 'cyber-modal-content';
    
    overlay.innerHTML = `
        <div class="${contentClass}">
            <div class="cyber-modal-title">${title}</div>
            <div class="cyber-modal-body">${message}</div>
            <button class="cyber-modal-btn">${btnText}</button>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);

    const btn = overlay.querySelector('.cyber-modal-btn');
    btn.onclick = function(e) {
        e.preventDefault();
        btn.blur(); 
        overlay.classList.remove('active');
        
        setTimeout(() => {
            overlay.remove(); 
            document.body.style.overflow = 'auto'; 
            if (callback) callback(); 
        }, 300);
    };
} 

// 9. 登记表生成 (已更新：身高自动加cm)
function generateRegisterData() {
    const form = document.querySelector('#register-form');
    const data = new FormData(form);
    const modal = document.getElementById('register-modal');
    const resultArea = document.getElementById('register-result');
    
    const placeholders = {
        'name': '（限中文名）', 
        'age': '（最低16岁）', 
        'attribute': '（DOM/SWI/SUB、1/0；奴皮不允DOM/S，奴1会被玩后面，但不进入，主皮不允许SUB/M）',
        'personality': '（不写为人处世，不写明面如何其实如何。字数不低于20）', 
        'appearance': '（写清楚长什么样，不强制写四肢。字数不低于30）',
        'height': '', 
        'family': '（家族内身份/士绅/平民，如X家少爷/旁系）', 
        'position': '（奴皮选公奴，主皮有官职的写:正x品+官职名称，身兼多职写最高品级，无官职可自拟任意职业）',
        'background': '', 
        'likes': '', 
        'taboos': '', 
        'class': '（公民籍/奴籍/罪奴籍）',
        'salary': '（根据薪资表自行填写）', 
        'affiliation': '（奴皮填训御司，主皮填家族名称）', 
        'notes': ''
    };
    
    const outputOrder = [
        { key: 'name', label: '姓名' }, 
        { key: 'age', label: '年龄' }, 
        { key: 'attribute', label: '属性' },
        { key: 'personality', label: '性格' }, 
        { key: 'appearance', label: '外貌' }, 
        { key: 'height', label: '身高' },
        { key: 'family', label: '家世' }, 
        { key: 'position', label: '职位' }, 
        { key: 'background', label: '背景' },
        { key: 'likes', label: '喜恶' }, 
        { key: 'taboos', label: '禁忌' }, 
        { key: 'class', label: '户籍' },
        { key: 'salary', label: '薪资' }, 
        { key: 'affiliation', label: '隶属' }, 
        { key: 'notes', label: '备注' }
    ];
    
    let content = "【户籍登记表】\n";
    outputOrder.forEach(item => {
        let userValue = data.get(item.key);

        // --- 核心修改：如果是身高且有值，自动追加 cm ---
        if (item.key === 'height' && userValue && userValue.trim() !== "") {
            userValue += "cm";
        }
        // ------------------------------------------

        const valueToShow = (userValue && userValue.trim() !== "") ? userValue : (placeholders[item.key] || "");
        content += `${item.label}：${valueToShow}\n`;
    });
    
    resultArea.value = content;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function copyRegisterData() {
    const textarea = document.getElementById('register-result');
    textarea.select();
    try {
        document.execCommand('copy');
        alert("已成功复制到剪贴板。");
    } catch (err) {
        alert("复制失败，请手动全选复制。");
    }
}

// 10. 全局点击与关闭
window.addEventListener('click', (e) => {
    const modals = ['family-modal', 'citizen-modal', 'register-modal'];
    if (modals.includes(e.target.id)) {
        document.getElementById(e.target.id).classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
});

function closeCitizenModal() { 
    document.getElementById('citizen-modal').classList.add('hidden'); 
    document.body.style.overflow = 'auto';
}

function closeModal() { 
    document.getElementById('family-modal').classList.add('hidden'); 
    document.body.style.overflow = 'auto';
}

function closeRegisterModal() {
    document.getElementById('register-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

// 11. UI 状态
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
// ====================
// 薪资计算器逻辑 (已更新：奴位自动推算主人薪资)
// ====================

// 1. 薪资数据映射表 (提取到外层，供双向查询)
const salaryMap = {
    'qingui': { direct: 25, collateral: 20 },
    'quangui': { direct: 20, collateral: 15 },
    'noble': { direct: 15, collateral: 12 },
    'newnoble': { direct: 12, collateral: 10 },
    'gentry': { direct: 8, collateral: 6 },
    'commoner': { direct: 5, collateral: 5 }
};

// 切换弹窗显示/隐藏
function toggleSalaryModal() {
    const modal = document.getElementById('salary-modal');
    modal.classList.toggle('hidden');
    // 重置并初次计算
    if (!modal.classList.contains('hidden')) {
        updateCalcUI();
        calculateSalary();
    }
}

// 更新界面显示（主位/奴位切换时）
function updateCalcUI() {
    const type = document.querySelector('input[name="calc-type"]:checked').value;
    const masterOpts = document.getElementById('master-options');
    const slaveOpts = document.getElementById('slave-options');
    
    // 获取新的选择区域和选项
    const slaveType = document.getElementById('calc-slave-type').value;
    const slaveMasterSelect = document.getElementById('slave-master-select'); // 对应新HTML中的ID
    const yuOption = document.getElementById('yu-private-option');

    if (type === 'master') {
        masterOpts.classList.remove('hidden');
        slaveOpts.classList.add('hidden');
    } else {
        masterOpts.classList.add('hidden');
        slaveOpts.classList.remove('hidden');
        
        // 只有私奴和侍奴需要选择主人身份
        if (slaveType === 'private' || slaveType === 'attendant') {
            slaveMasterSelect.classList.remove('hidden'); // 显示下拉框区域
            
            // 只有私奴显示"是虞家私奴"选项
            if(slaveType === 'private') {
                yuOption.classList.remove('hidden');
            } else {
                yuOption.classList.add('hidden');
            }
        } else {
            slaveMasterSelect.classList.add('hidden');
            yuOption.classList.add('hidden');
        }
    }
}

// 核心计算函数
function calculateSalary() {
    let baseSalary = 0;
    const type = document.querySelector('input[name="calc-type"]:checked').value;
    const rankBonus = parseInt(document.getElementById('calc-rank').value) || 0;

    if (type === 'master') {
        // --- 主位/平民计算逻辑 ---
        const level = document.getElementById('calc-master-level').value;
        const lineage = document.getElementById('calc-lineage').value;
        
        baseSalary = salaryMap[level][lineage];

    } else {
        // --- 奴位计算逻辑 ---
        const slaveType = document.getElementById('calc-slave-type').value;
        const isYuSlave = document.getElementById('is-yu-slave').checked;

        // 1. 先计算主人基薪（仅私奴/侍奴需要）
        let masterBase = 0;
        if (slaveType === 'private' || slaveType === 'attendant') {
            // 获取新下拉框的值
            const mLevel = document.getElementById('calc-slave-master-level').value;
            const mLineage = document.getElementById('calc-slave-master-lineage').value;
            masterBase = salaryMap[mLevel][mLineage];
            
            // 更新界面上的调试小字显示 (主人基薪: xx)
            const debugEl = document.getElementById('debug-master-salary');
            if(debugEl) debugEl.innerText = masterBase;
        }

        // 2. 根据奴籍类型计算
        if (slaveType === 'private') {
            if (isYuSlave) {
                baseSalary = 18; // 虞家私奴固定
            } else {
                baseSalary = masterBase - 5; // 主人-5
            }
        } else if (slaveType === 'attendant') {
            // 主人-8，但最低不低于10
            let calc = masterBase - 8;
            baseSalary = calc < 10 ? 10 : calc;
        } else if (slaveType === 'contract') {
            baseSalary = 8;
        } else if (slaveType === 'public') {
            baseSalary = 5;
        } else if (slaveType === 'sinner') {
            baseSalary = 2;
        } else if (slaveType === 'animal') {
            baseSalary = 0;
        }
        
        // 防止负数
        if (baseSalary < 0) baseSalary = 0;
    }

    // 总计 = 基础 + 职位
    const total = baseSalary + rankBonus;
    
    // 渲染结果
    const resultEl = document.getElementById('calc-result');
    if(resultEl) resultEl.innerText = total;
}

// 将计算结果填入登记表
function applySalaryToForm() {
    // 1. 获取计算结果
    const resultText = document.getElementById('calc-result').innerText;
    
    // 2. 找到登记表中的薪资输入框
    const salaryInput = document.querySelector('input[name="salary"]');
    
    // 3. 赋值
    if (salaryInput) {
        salaryInput.value = resultText;
    }
    
    // 4. 关闭弹窗
    toggleSalaryModal();
    
    // 5. 聚焦输入框
    salaryInput.focus();
}

// 实时更新字数统计
function updateCharCount(input, outputId) {
    const len = input.value.length;
    const output = document.getElementById(outputId);
    if (output) {
        output.innerText = len + " 字";
        // 可选：如果字数达标（比如30字），可以让颜色变绿，这里先保持简单的金色
        // if (len >= 30) output.classList.add('text-green-500');
    }
}