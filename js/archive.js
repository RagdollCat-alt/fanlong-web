(function () {
  const state = {
    records: [],
    filtered: [],
    activeSurname: "全部",
    activeClass: "全部",
    query: "",
    source: "loading"
  };

  const statLabels = {
    stat_face: "颜值",
    stat_charm: "魅力",
    stat_intel: "智力",
    stat_biz: "商业",
    stat_talk: "口才",
    stat_body: "体能",
    stat_art: "才艺",
    stat_obed: "服从/威慑"
  };

  const compoundSurnames = [
    "都尉", "欧阳", "太史", "端木", "上官", "司马", "东方", "独孤", "南宫", "万俟",
    "闻人", "夏侯", "诸葛", "尉迟", "公羊", "赫连", "澹台", "皇甫", "宗政", "濮阳",
    "公冶", "太叔", "申屠", "公孙", "慕容", "仲孙", "钟离", "长孙", "宇文", "司徒", "司空"
  ];

  const familyAliases = {
    虞: "虞家",
    奚: "奚家",
    闻: "闻家",
    褚: "褚家",
    薄: "薄家",
    段: "段家",
    司: "司家",
    明: "明家",
    都尉: "都尉家"
  };

  const profileFieldOrder = [
    "年龄",
    "属性",
    "性格",
    "外貌",
    "身高",
    "家世",
    "职位",
    "背景",
    "喜恶",
    "禁忌",
    "户籍",
    "薪资",
    "隶属",
    "备注"
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pickPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.records)) return payload.records;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.profiles)) return payload.profiles;
    if (payload && typeof payload === "object") return Object.values(payload);
    return [];
  }

  function getProfileValue(record, keys, fallback = "未录入") {
    const profile = record.profile || {};
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
      if (profile[key] !== undefined && profile[key] !== null && profile[key] !== "") return profile[key];
    }
    return fallback;
  }

  function getSurname(name, record) {
    const explicitFamily = getProfileValue(record, ["姓氏", "家族"], "");
    if (explicitFamily) return String(explicitFamily).replace(/家$/, "");

    const safeName = String(name || "").trim();
    const compound = compoundSurnames.find((surname) => safeName.startsWith(surname));
    if (compound) return compound;
    return safeName.slice(0, 1) || "未定";
  }

  function normalizeRecord(raw, index) {
    const name = raw.name || raw["姓名"] || raw.profile?.["姓名"] || `未命名档案 ${index + 1}`;
    const surname = getSurname(name, raw);
    const stats = raw.stats || {};
    const total = Object.keys(statLabels).reduce((sum, key) => {
      const realKey = Object.keys(stats).find((statKey) => statKey.trim() === key);
      return sum + (parseInt(stats[realKey], 10) || 0);
    }, 0);

    return {
      ...raw,
      __raw: raw,
      id: raw.id || raw.qq || raw.uid || raw.profile?.QQ || `archive-${index}`,
      name,
      surname,
      family: getProfileValue(raw, ["家世", "家族", "隶属"], familyAliases[surname] || `${surname}家`),
      className: getProfileValue(raw, ["户籍", "class"], "未定籍"),
      position: getProfileValue(raw, ["职位", "职务", "position"], "无职"),
      group: getProfileValue(raw, ["隶属", "所属", "affiliation"], "未录入"),
      age: getProfileValue(raw, ["年龄", "age"], "未录入"),
      total
    };
  }

  async function loadRecords() {
    try {
      const response = await fetch(`/api/archives?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const records = pickPayload(payload);
      if (!records.length) throw new Error("empty archive payload");

      state.records = records.map(normalizeRecord);
      state.source = "remote";
    } catch (error) {
      state.records = (window.archiveSeedData || archiveSeedData || []).map(normalizeRecord);
      state.source = "seed";
      console.info("Archive API unavailable, using local seed data.", error);
    }
  }

  function getClassTone(className) {
    if (String(className).includes("罪")) return "archive-chip danger";
    if (String(className).includes("奴")) return "archive-chip info";
    if (String(className).includes("公民")) return "archive-chip success";
    return "archive-chip";
  }

  function renderStats() {
    const total = state.records.length;
    const familyCount = new Set(state.records.map((record) => record.surname)).size;
    const filtered = state.filtered.length;
    const topFamily = getTopFamily();

    $("archive-total").textContent = total;
    $("archive-family-count").textContent = familyCount;
    $("archive-filtered-count").textContent = filtered;
    $("archive-top-family").textContent = topFamily;
  }

  function getTopFamily() {
    const counts = state.records.reduce((acc, record) => {
      acc[record.surname] = (acc[record.surname] || 0) + 1;
      return acc;
    }, {});
    const [surname] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ["-"];
    return surname === "-" ? "-" : `${surname}氏`;
  }

  function renderFilters() {
    const surnames = ["全部", ...Array.from(new Set(state.records.map((record) => record.surname))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))];
    const classes = ["全部", ...Array.from(new Set(state.records.map((record) => record.className))).filter(Boolean)];

    $("surname-filters").innerHTML = surnames.map((surname) => `
      <button class="archive-filter-btn ${state.activeSurname === surname ? "active" : ""}" data-surname="${escapeHtml(surname)}">
        ${escapeHtml(surname === "全部" ? "全部家族" : `${surname}氏`)}
      </button>
    `).join("");

    $("class-filter").innerHTML = classes.map((className) => `
      <option value="${escapeHtml(className)}">${escapeHtml(className)}</option>
    `).join("");
    $("class-filter").value = state.activeClass;
  }

  function applyFilters() {
    const keyword = state.query.trim().toLowerCase();
    state.filtered = state.records.filter((record) => {
      const matchesSurname = state.activeSurname === "全部" || record.surname === state.activeSurname;
      const matchesClass = state.activeClass === "全部" || record.className === state.activeClass;
      const haystack = [
        record.name,
        record.surname,
        record.family,
        record.className,
        record.position,
        record.group,
        record.notes,
        JSON.stringify(record.profile || {})
      ].join(" ").toLowerCase();
      const matchesKeyword = !keyword || haystack.includes(keyword);
      return matchesSurname && matchesClass && matchesKeyword;
    });
  }

  function renderRecords() {
    const grid = $("archive-grid");
    const empty = $("archive-empty");

    if (!state.filtered.length) {
      grid.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");
    grid.innerHTML = state.filtered.map((record) => `
      <article class="archive-card" data-id="${escapeHtml(record.id)}">
        <div class="archive-card-topline">
          <span>${escapeHtml(record.surname)}氏档案</span>
          <span>${escapeHtml(record.id)}</span>
        </div>
        <div class="archive-card-main">
          <div class="archive-avatar">${escapeHtml(record.surname.slice(0, 2))}</div>
          <div>
            <h3>${escapeHtml(record.name)}</h3>
            <p>${escapeHtml(record.family)}</p>
          </div>
        </div>
        <div class="archive-meta">
          <span class="${getClassTone(record.className)}">${escapeHtml(record.className)}</span>
          <span class="archive-chip">${escapeHtml(record.position)}</span>
        </div>
        <dl class="archive-card-data">
          <div><dt>年龄</dt><dd>${escapeHtml(record.age)}</dd></div>
          <div><dt>隶属</dt><dd>${escapeHtml(record.group)}</dd></div>
        </dl>
      </article>
    `).join("");
  }

  function renderAll() {
    applyFilters();
    renderStats();
    renderFilters();
    renderRecords();
  }

  function labelField(key) {
    const labels = {
      id: "档案ID",
      uid: "UID",
      qq: "QQ",
      name: "姓名",
      notes: "备注"
    };
    return labels[key] || key;
  }

  function formatFieldValue(value) {
    if (value === undefined || value === null || value === "") return "未录入";
    if (Array.isArray(value)) return value.map(formatFieldValue).join("、");
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return value;
  }

  function isLikelyBadProfileKey(key) {
    const text = String(key || "").trim();
    if (!text) return true;
    if (text.length > 24) return true;
    if (/[，。；：、！？,.!?]/.test(text)) return true;
    return false;
  }

  function collectArchiveFields(record) {
    const raw = record.__raw || record;
    const excludedKeys = new Set([
      "__raw",
      "profile",
      "stats",
      "currency",
      "total",
      "surname",
      "family",
      "className",
      "position",
      "group",
      "age"
    ]);
    const rows = [];
    const seenKeys = new Set();
    const seenLabels = new Set();

    const pushField = (key, value) => {
      const label = labelField(key);
      if (seenKeys.has(key) || seenLabels.has(label)) return;
      seenKeys.add(key);
      seenLabels.add(label);
      rows.push([label, formatFieldValue(value)]);
    };

    pushField("id", record.id);
    pushField("name", record.name);

    const profile = raw.profile || {};
    profileFieldOrder.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(profile, key)) pushField(key, profile[key]);
    });

    Object.entries(profile).forEach(([key, value]) => {
      if (key === "姓名") return;
      if (profileFieldOrder.includes(key)) return;
      if (isLikelyBadProfileKey(key)) return;
      pushField(key, value);
    });

    Object.entries(raw).forEach(([key, value]) => {
      if (!excludedKeys.has(key)) pushField(key, value);
    });

    return rows;
  }

  function renderModal(record) {
    const modal = $("archive-modal");
    const archiveEntries = collectArchiveFields(record);

    $("archive-modal-body").innerHTML = `
      <div class="archive-modal-header">
        <div class="archive-avatar large">${escapeHtml(record.surname.slice(0, 2))}</div>
        <div>
          <span class="archive-kicker">${escapeHtml(record.surname)}氏 / ${escapeHtml(record.id)}</span>
          <h2>${escapeHtml(record.name)}</h2>
          <p>${escapeHtml(record.family)} · ${escapeHtml(record.className)} · ${escapeHtml(record.position)}</p>
        </div>
      </div>

      <section class="archive-detail-section">
        <h3>基础档案</h3>
        <div class="archive-detail-grid">
          ${archiveEntries.map(([key, value]) => `
            <div>
              <dt>${escapeHtml(key)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `).join("") || `<p class="archive-muted">暂无基础档案字段。</p>`}
        </div>
      </section>
    `;

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("archive-modal").classList.add("hidden");
    document.body.style.overflow = "auto";
  }

  function bindEvents() {
    $("surname-filters").addEventListener("click", (event) => {
      const button = event.target.closest("[data-surname]");
      if (!button) return;
      state.activeSurname = button.dataset.surname;
      renderAll();
    });

    $("archive-search").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderAll();
    });

    $("class-filter").addEventListener("change", (event) => {
      state.activeClass = event.target.value;
      renderAll();
    });

    $("archive-grid").addEventListener("click", (event) => {
      const card = event.target.closest("[data-id]");
      if (!card) return;
      const record = state.records.find((item) => String(item.id) === String(card.dataset.id));
      if (record) renderModal(record);
    });

    $("archive-modal-close").addEventListener("click", closeModal);
    $("archive-modal").addEventListener("click", (event) => {
      if (event.target.id === "archive-modal") closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("archive-modal").classList.contains("hidden")) closeModal();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    await loadRecords();
    renderAll();
  });
})();
