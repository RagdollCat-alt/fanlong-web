const ZS_API = "/api/zhongsheng";
const state = { me: null, tab: "hot", hot: [], feed: [], timeline: [], feedPage: 1, feedHasMore: false, feedLoading: false, accountResults: [], searchSuggestions: null, activityRecords: [], myActivity: { reposts: [] }, feedFilter: "recommended", natureFilter: "all", searchTerm: "", detailTab: "comments", commentSort: "hot", messageFilter: "all", profileTab: "posts", relationshipView: { type: "following", accountId: null, name: "" }, selectedTargets: [], repostTargets: [], repostPage: { postId: null, restorePostId: null, opener: null }, mediaItems: [], commentMedia: { post: null, reply: null }, activePost: null, activeHotDetail: null, notifications: [], replyRootId: null, replyScrollTop: 0, imageViewer: { items: [], index: 0, scale: 1, x: 0, y: 0 }, avatarCrop: null, croppedAvatar: null, coverFile: null, coverPreviewUrl: "", focusStack: [] };
const COMPOSE_DRAFT_KEY = "zhongsheng-compose-draft-v1";
const RECENT_SEARCH_KEY = "zhongsheng-recent-searches-v1";
const SCROLL_KEY = "zhongsheng-scroll-v1";
const DEFAULT_PROFILE_COVER = "/zhongsheng/assets/profile-cover-default.svg";
const pendingLikes = new Set();
const pendingFollows = new Set();

function mediaThumbnail(url, width) {
  return /^\/api\/zhongsheng\?action=media&id=\d+$/.test(url) ? `${url}&w=${width}` : url;
}

async function togglePostLike(postId, action) {
  const id = Number(postId);
  if (pendingLikes.has(id)) return;
  pendingLikes.add(id);
  const posts = new Set();
  const visit = (post) => { if (!post || posts.has(post)) return; posts.add(post); visit(post.repost?.original); };
  [state.activePost, ...state.feed, ...state.hot, ...state.timeline.map(item => item.post || item.repost)].forEach(visit);
  const matches = [...posts].filter(post => Number(post.id) === id);
  const oldLiked = findPost(id)?.viewer?.liked ?? action.classList.contains('active');
  const oldCount = findPost(id)?.counts?.like ?? (Number(action.querySelector('span')?.textContent) || 0);
  const paint = (liked, count) => {
    matches.forEach(post => { post.viewer = {...post.viewer, liked}; post.counts = {...post.counts, like:count}; });
    $$('[data-action="like"]').filter(button => Number(button.closest('[data-post-id]')?.dataset.postId) === id).forEach(button => {
      button.classList.toggle('active', liked);
      button.setAttribute('aria-pressed', String(liked));
      const label = $('span', button); if (label) label.textContent = count || '赞';
    });
  };
  paint(!oldLiked, Math.max(0, oldCount + (oldLiked ? -1 : 1)));
  try {
    const result = await api('like', {method:'POST',body:{postId:id}});
    paint(result.liked, Math.max(0, oldCount + (result.liked === oldLiked ? 0 : result.liked ? 1 : -1)));
    matches.forEach(post => { if (result.heat !== undefined) {post.heat = result.heat;post.displayHeat=`${Math.round(result.heat)}万`;} });
  } catch (error) { paint(oldLiked, oldCount); toast(error.message, 'error'); }
  finally { pendingLikes.delete(id); }
}

async function uploadComposeMedia(items) {
  let cursor = 0;
  const failures = [];
  await Promise.all(Array.from({length:Math.min(3, items.length)}, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item.url) continue;
      try { item.url = (await uploadFile(item.file)).url; } catch (error) { failures.push(error); }
    }
  }));
  if (failures.length) throw failures[0];
  return items.map(item => item.url);
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function formatPostContent(value = "", mentions = []) {
  let html = escapeHtml(value);
  const term = state.searchTerm.trim();
  if (term && !/[<>]/.test(term)) html = html.replace(new RegExp(escapeRegExp(escapeHtml(term)), "giu"), (match) => `<mark>${match}</mark>`);
  html = html.replace(/(#[^#\s<]{1,24}#)/gu, (tag) => `<button type="button" class="content-tag" data-search-tag="${tag}">${tag}</button>`);
  mentions.forEach((mention) => { const label=`@${escapeHtml(mention.displayName)}`; html=html.replace(new RegExp(escapeRegExp(label),"gu"),`<button type="button" class="content-mention" data-account-id="${mention.id}">${label}</button>`); });
  return html;
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

let mentionTimer = null;
const mentionPopup = document.createElement("div");
mentionPopup.id = "mention-suggestions"; mentionPopup.className = "mention-suggestions"; mentionPopup.hidden=true; document.body.appendChild(mentionPopup);
function hideMentionSuggestions() { mentionPopup.hidden=true; mentionPopup.innerHTML=""; state.mentionTarget=null; }
async function suggestMentions(input) {
  const before=input.value.slice(0,input.selectionStart); const match=before.match(/(?:^|\s)@([^@\s]{0,24})$/u);
  if(!match){hideMentionSuggestions();return;} const query=match[1]; if(!query){hideMentionSuggestions();return;}
  try {
    const accounts=await api("account-search",{query:{q:query,limit:6}}); if(document.activeElement!==input||!accounts.length){hideMentionSuggestions();return;}
    state.mentionTarget={input,start:input.selectionStart-match[1].length-1,end:input.selectionStart};const host=input.closest('dialog')||document.body;if(mentionPopup.parentElement!==host)host.appendChild(mentionPopup);
    const rect=input.getBoundingClientRect(); mentionPopup.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-280))}px`;mentionPopup.style.top=`${Math.min(innerHeight-260,rect.bottom+6)}px`;
    mentionPopup.innerHTML=accounts.map(item=>`<button type="button" data-mention-id="${item.id}" data-mention-name="${escapeHtml(item.displayName)}">${avatar(item,"comment-avatar")}<span><b>${escapeHtml(item.displayName)}</b><small>${escapeHtml(item.identity||item.bio||"")}</small></span></button>`).join("");mentionPopup.hidden=false;
  } catch(_){hideMentionSuggestions();}
}

function rememberFocus(element = document.activeElement) { state.focusStack.push(element instanceof HTMLElement ? element : null); }
function openDialog(dialog, opener = document.activeElement) { if (!dialog.open) { rememberFocus(opener); dialog.showModal(); } }
function restoreFocus() { const target = state.focusStack.pop(); if (target?.isConnected) requestAnimationFrame(() => target.focus()); }

function sourceValue(form) {
  const base = form.sourceLabel?.value || "众声网页版";
  const suffix = form.sourceSuffix?.value.trim();
  return suffix ? `${base} · ${suffix}` : base;
}
function setSourceValue(form,label="众声网页版") { const [base,...suffix]=String(label).split(" · "); if(form.sourceLabel)form.sourceLabel.value=[...form.sourceLabel.options].some(option=>option.value===base)?base:"众声网页版"; if(form.sourceSuffix)form.sourceSuffix.value=suffix.join(" · "); }

function formatTime(value) {
  if (!value) return "";
  const time = new Date(String(value).replace(" ", "T") + "+08:00").getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  return new Date(time).toLocaleDateString("zh-CN");
}

function formatDeadline(value) {
  if (!value) return "首次上榜后24小时";
  const time = new Date(String(value).replace(" ", "T") + "+08:00");
  return `${time.getMonth()+1}月${time.getDate()}日 ${String(time.getHours()).padStart(2,"0")}:${String(time.getMinutes()).padStart(2,"0")}`;
}

function avatar(account, size = "avatar") {
  const name = account?.displayName || "众";
  return `<span class="${size}">${account?.avatarUrl ? `<img src="${escapeHtml(mediaThumbnail(account.avatarUrl, 96))}" alt="">` : escapeHtml(name.slice(0, 1))}</span>`;
}

function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = message;
  $("#toast-stack").appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea"); input.value = value; input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
}

function resetMediaItems(urls = []) {
  state.mediaItems.forEach((item) => item.objectUrl && URL.revokeObjectURL(item.objectUrl));
  state.mediaItems = urls.map((url) => ({ url }));
  $("#media-input").value = "";
  renderMediaPreview();
}

function renderMediaPreview() {
  $("#media-preview").innerHTML = state.mediaItems.map((item, index) => `<figure><img src="${escapeHtml(item.url || item.objectUrl)}" alt="待发布图片"><button type="button" data-remove-media="${index}" aria-label="移除图片">×</button></figure>`).join("");
  const mediaCount = $(".compose-media-button small");
  if (mediaCount) mediaCount.textContent = `${state.mediaItems.length}/9`;
}

function findPost(postId) {
  const id = Number(postId);
  return [state.activePost, ...state.feed, ...state.timeline.map((item) => item.post || item.repost), ...state.timeline.map((item) => (item.post || item.repost)?.repost?.original), ...state.hot].find((post) => Number(post?.id) === id);
}

function renderImageViewer() {
  const { items, index, scale, x, y } = state.imageViewer;
  const image = $("#image-viewer-img");
  image.src = items[index] || "";
  image.alt = `众声大图 ${index + 1}`;
  image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  $("#image-viewer-count").textContent = `${index + 1} / ${items.length}`;
  $("#image-viewer-caption").textContent = items.length > 1 ? `第 ${index + 1} 张，共 ${items.length} 张` : "众声图片";
  $("#image-download").dataset.url = items[index] || "";
  $("#image-thumbnails").innerHTML = items.map((url,itemIndex)=>`<button type="button" class="${itemIndex===index?'active':''}" data-image-index="${itemIndex}" aria-label="查看第${itemIndex+1}张"><img src="${escapeHtml(mediaThumbnail(url, 96))}" alt="" loading="lazy" decoding="async"></button>`).join("");
  $(".image-prev").hidden = items.length < 2;
  $(".image-next").hidden = items.length < 2;
}

function openImageViewer(button) {
  if (button.dataset.commentMedia) {
    state.imageViewer = { items: [button.dataset.commentMedia], index: 0, scale: 1, x: 0, y: 0 };
    renderImageViewer(); openDialog($("#image-dialog"), button); return;
  }
  const post = findPost(button.closest("[data-post-id]")?.dataset.postId);
  const gridItems = [...button.closest(".media-grid")?.querySelectorAll("img") || []].map((image) => image.closest("[data-media-url]")?.dataset.mediaUrl || image.src);
  const items = post?.media?.length ? post.media : gridItems.length ? gridItems : button.dataset.mediaUrl ? [button.dataset.mediaUrl] : [];
  if (!items.length) return;
  state.imageViewer = { items, index: Math.min(Number(button.dataset.mediaIndex || 0), items.length - 1), scale: 1, x: 0, y: 0 };
  renderImageViewer();
  openDialog($("#image-dialog"), button);
}

function stepImageViewer(direction) {
  const total = state.imageViewer.items.length;
  if (total < 2) return;
  state.imageViewer.index = (state.imageViewer.index + direction + total) % total;
  state.imageViewer.scale = 1; state.imageViewer.x = 0; state.imageViewer.y = 0;
  renderImageViewer();
}

async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("仅支持 JPG、PNG、WebP 或 GIF 图片");
  if (file.type === "image/gif" && file.size <= 2 * 1024 * 1024) return await fileToDataUrl(file);
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height); source.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.76));
  if (!blob) throw new Error("图片压缩失败");
  if (blob.size > 2 * 1024 * 1024) throw new Error("图片压缩后仍超过2MB，请换一张图片");
  return await fileToDataUrl(blob);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("图片读取失败")); reader.readAsDataURL(file); });
}

function renderAvatarCrop() {
  const crop = state.avatarCrop;
  if (!crop) return;
  const stage = $("#avatar-crop-stage"); const stageWidth = stage.clientWidth; const stageHeight = stage.clientHeight;
  const scale = Math.max(stageWidth / crop.image.naturalWidth, stageHeight / crop.image.naturalHeight) * crop.zoom;
  const width = crop.image.naturalWidth * scale;
  const height = crop.image.naturalHeight * scale;
  const maxX = Math.max(0, (width - stageWidth) / 2);
  const maxY = Math.max(0, (height - stageHeight) / 2);
  crop.x = Math.max(-maxX, Math.min(maxX, crop.x));
  crop.y = Math.max(-maxY, Math.min(maxY, crop.y));
  crop.render = { stageWidth, stageHeight, width, height, left: (stageWidth - width) / 2 + crop.x, top: (stageHeight - height) / 2 + crop.y };
  const image = $("#avatar-crop-image");
  image.style.width = `${width}px`;
  image.style.height = `${height}px`;
  image.style.left = `${crop.render.left}px`;
  image.style.top = `${crop.render.top}px`;
  const preview=$("#crop-result-preview"); const output=crop.kind==="cover"?{width:480,height:160}:{width:240,height:240};
  if(preview.width!==output.width)preview.width=output.width;if(preview.height!==output.height)preview.height=output.height;
  drawCrop(preview,crop,output.width,output.height);
}

function drawCrop(canvas,crop,outputWidth,outputHeight) {
  const ctx=canvas.getContext("2d");ctx.clearRect(0,0,outputWidth,outputHeight);
  const scaleX=outputWidth/crop.render.stageWidth;const scaleY=outputHeight/crop.render.stageHeight;
  ctx.drawImage(crop.image,crop.render.left*scaleX,crop.render.top*scaleY,crop.render.width*scaleX,crop.render.height*scaleY);
}

async function startImageCrop(file, kind="avatar") {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return toast("请选择 JPG、PNG、WebP 或 GIF 图片", "error");
  const image = new Image();
  image.onload = () => {
    state.avatarCrop = { kind, image, zoom: 1, x: 0, y: 0, dragging: false };
    $("#avatar-crop-image").src = image.src;
    const stage=$("#avatar-crop-stage");stage.classList.toggle("cover-mode",kind==="cover");stage.classList.toggle("avatar-mode",kind!=="cover");
    $("#crop-title").textContent=kind==="cover"?"裁剪个人底图":"裁剪头像";$("#crop-eyebrow").textContent=kind==="cover"?"PROFILE COVER":"AVATAR CROP";
    $("#crop-ratio-label").textContent=kind==="cover"?"3:1 个人主页底图":"1:1 圆形头像";$("#crop-help").textContent=kind==="cover"?"拖动图片选择底图范围，桌面和手机会保持同一视觉中心。":"拖动图片调整位置，右侧会实时显示圆形头像效果。";
    $("[data-crop-confirm]").textContent=kind==="cover"?"使用此底图":"使用此头像";
    $("#avatar-crop-zoom").value = "1";
    openDialog($("#avatar-crop-dialog"));
    requestAnimationFrame(renderAvatarCrop);
  };
  image.onerror = () => toast("图片读取失败", "error");
  image.src = await fileToDataUrl(file);
}

async function startAvatarCrop(file) { return startImageCrop(file,"avatar"); }

async function confirmAvatarCrop() {
  const crop = state.avatarCrop;
  if (!crop?.render) return;
  const output = crop.kind === "cover" ? {width:1500,height:500} : {width:512,height:512};
  const canvas = document.createElement("canvas");
  canvas.width = output.width; canvas.height = output.height;
  drawCrop(canvas,crop,output.width,output.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .9));
  if (!blob) return toast("图片裁剪失败，请重试", "error");
  const url = URL.createObjectURL(blob);
  if(crop.kind==="cover"){
    if(state.coverPreviewUrl)URL.revokeObjectURL(state.coverPreviewUrl);state.coverFile=blob;state.coverPreviewUrl=url;renderCoverPreview(url);
  }else{
    if (state.croppedAvatar?.url) URL.revokeObjectURL(state.croppedAvatar.url);state.croppedAvatar = { blob, url };$("#profile-avatar-preview").innerHTML = `<img src="${url}" alt="裁剪后的头像预览">`;$("#avatar-file-name").textContent = "已完成裁剪，保存资料后生效";
  }
  state.avatarCrop=null;
  $("#avatar-crop-image").removeAttribute("src");
  $("#avatar-crop-dialog").close();
}

async function uploadFile(file) {
  const dataUrl = await compressImage(file);
  return await api("upload", { method: "POST", body: { dataUrl } });
}

async function api(action, { method = "GET", body, query = {}, idempotent = false } = {}) {
  const url = new URL(ZS_API, location.origin);
  url.searchParams.set("action", action);
  Object.entries(query).forEach(([key, value]) => value !== undefined && value !== null && url.searchParams.set(key, value));
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotent) headers["Idempotency-Key"] = crypto.randomUUID();
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
  const payload = await response.json().catch(() => ({ ok: false, error: "服务器返回格式异常" }));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error || "操作失败");
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

function showAuth() {
  $("#app").hidden = true;
  $("#auth-screen").hidden = false;
}

function showApp() {
  $("#auth-screen").hidden = true;
  $("#app").hidden = false;
  renderIdentity();
}

function verificationClass(value) {
  return ({ "蓝V": "blue", "红V": "red", "V": "real", "实名V": "real", "银V": "silver", "金V": "gold", "显赫V": "illustrious" })[value] || "real";
}
function natureLabel(value) { return ({ positive: "正面", negative: "负面", neutral: "中立" })[value] || value; }

const socialIcons = {
  like: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H3V10h4Zm0 9c3 1 5 2 8 2h2a3 3 0 0 0 3-2l1-6a3 3 0 0 0-3-4h-4l1-4a2 2 0 0 0-4-1l-4 6"/></svg>`,
  comment: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H5l-3 2 1-5a9 9 0 1 1 18-5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>`,
  repost: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`,
  image: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4.5-4 3.5 3 3-3 5 4.5"/></svg>`,
  target: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8a7 7 0 0 1 14 0v5l2 3H3l2-3Z"/><path d="M9 20h6"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2s1 5-3 8c-3 2-3 7 1 10-6-1-8-7-5-11 1 2 3 3 4 2 3-2 3-6 3-9Z"/><path d="M15 9c4 3 4 8 0 11 1-3-1-5-3-6"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6Z"/><path d="m9 12 2 2 4-5"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2h.5a2 2 0 0 1 2 2v.2a2 2 0 0 0 1 1.7l.5.3a2 2 0 0 0 2 0l.2-.1a2 2 0 0 1 2.7.7l.3.5a2 2 0 0 1-.8 2.7l-.2.1a2 2 0 0 0-1 1.8v.5a2 2 0 0 0 1 1.7l.2.1a2 2 0 0 1 .8 2.7l-.3.5a2 2 0 0 1-2.7.7l-.2-.1a2 2 0 0 0-2 0l-.5.3a2 2 0 0 0-1 1.7v.2a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2v-.2a2 2 0 0 0-1-1.7l-.5-.3a2 2 0 0 0-2 0l-.2.1a2 2 0 0 1-2.7-.7l-.3-.5a2 2 0 0 1 .8-2.7l.2-.1a2 2 0 0 0 1-1.7v-.5a2 2 0 0 0-1-1.8l-.2-.1a2 2 0 0 1-.8-2.7l.3-.5a2 2 0 0 1 2.7-.7l.2.1a2 2 0 0 0 2 0l.5-.3a2 2 0 0 0 1-1.7V4a2 2 0 0 1 2-2Z"/></svg>`,
  more: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`,
};

function renderIdentity() {
  if (!state.me) return;
  $("#identity-mini").innerHTML = `<div class="identity-head">${avatar(state.me, "mini-avatar")}<div><h3>${escapeHtml(state.me.displayName)}<span class="v-badge ${verificationClass(state.me.verification)}">${escapeHtml(state.me.verification)}</span></h3><p>${state.me.identityUnverified ? "未完成实名" : `${escapeHtml(state.me.realName || state.me.displayName)} · ${escapeHtml(state.me.identity)}`}</p></div></div><div class="mini-stats"><span>传播力<b>${state.me.influence}</b></span><span>名誉进度<b>${Number(state.me.reputationProgress || 0) > 0 ? "+" : ""}${state.me.reputationProgress ?? "—"}</b></span></div>`;
  $("#wallet-balance").textContent = Number(state.me.yuCoin || 0).toLocaleString("zh-CN");
  $("#top-name").textContent = state.me.displayName;
  $("#top-avatar").innerHTML = state.me.avatarUrl ? `<img src="${escapeHtml(state.me.avatarUrl)}" alt="">` : escapeHtml(state.me.displayName.slice(0, 1));
}

function renderPost(post, full = false, options = {}) {
  const mediaCount = Math.min(post.media?.length || 0, 9);
  const displayHeat = post.displayHeat || `${Math.round(Number(post.heat || 0))}万`;
  const media = mediaCount ? `<div class="media-grid media-count-${mediaCount}">${post.media.map((url, index) => `<button type="button" class="media-item" data-media-url="${escapeHtml(url)}" data-media-index="${index}" aria-label="查看第${index + 1}张大图"><img src="${escapeHtml(mediaThumbnail(url, 480))}" alt="众声图片 ${index + 1}" loading="lazy" decoding="async"></button>`).join("")}</div>` : "";
  const targets = post.targets?.length ? `<div class="post-targets"><span class="nature-badge ${post.nature}">${natureLabel(post.nature)}</span><span>影响对象：${post.targets.map((target) => `<b>${escapeHtml(target.name)}</b>`).join("、")}</span></div>` : `<div class="post-targets"><span class="nature-badge ${post.nature}">${natureLabel(post.nature)}</span><span>无名誉影响</span></div>`;
  const ownerActions = `${post.viewer?.isAuthor && state.me.capabilities?.pinLimit ? `<button type="button" data-action="pin">${post.pinned ? "取消置顶" : "置顶众声"}</button>` : ""}${post.viewer?.isAuthor && !post.observationEndsAt ? `<button type="button" data-action="edit">编辑众声</button>` : ""}${post.viewer?.isAuthor ? `<button type="button" class="danger" data-action="delete">删除众声</button>` : ""}`;
  return `<article class="post-card ${post.statementStyle ? "statement-post" : ""}" data-post-id="${post.id}">
    ${options.showPinned && post.pinned ? `<div class="pinned-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M7 10l5-5 5 5M5 21h14"/></svg>置顶</div>` : ""}${post.statementStyle ? `<div class="statement-label">显赫声明</div>` : ""}
    <div class="post-head"><button type="button" class="post-author-link" data-account-id="${post.author.id}" aria-label="查看${escapeHtml(post.author.displayName)}的个人主页">${avatar(post.author)}<span class="post-author"><strong>${escapeHtml(post.author.displayName)}<span class="v-badge ${verificationClass(post.author.verification)}">${escapeHtml(post.author.verification)}</span></strong><small>${formatTime(post.createdAt)}${post.author.official ? "" : ` · 来自 ${escapeHtml(post.sourceLabel || "众声网页版")}`}</small></span></button><span class="post-heat" title="当前众声热度"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2s1 5-3 8c-3 2-3 7 1 10-6-1-8-7-5-11 1 2 3 3 4 2 3-2 3-6 3-9Z"/><path d="M15 9c4 3 4 8 0 11 1-3-1-5-3-6"/></svg><span>热度</span><b>${escapeHtml(displayHeat)}</b></span><div class="post-menu-wrap"><button type="button" class="post-menu-trigger" aria-label="更多操作">${socialIcons.more}</button><div class="post-more-menu" hidden><button type="button" data-action="promote">推广众声</button><button type="button" data-action="cool">降低热搜</button>${ownerActions}</div></div></div>
    <div class="post-body"><div class="post-content">${formatPostContent(post.content, post.mentions)}</div>${targets}${media}</div>
    <div class="post-metrics">
      <button class="post-action ${post.viewer?.reposted ? "active" : ""}" data-action="repost">${socialIcons.repost}<span>${post.counts.repost || "转发"}</span></button>
      <button class="post-action" data-action="comment">${socialIcons.comment}<span>${post.counts.comment || "评论"}</span></button>
      <button class="post-action ${post.viewer?.liked ? "active" : ""}" data-action="like">${socialIcons.like}<span>${post.counts.like || "赞"}</span></button>
    </div>${full ? renderComments(post.comments || []) : ""}</article>`;
}

function renderRepostChain(post) {
  const chain = post.repost?.chain || [];
  if (!chain.length) return "";
  return `<span class="repost-chain-inline">${chain.map((item) => ` <span class="repost-chain-link" data-chain-post="${item.id}" role="link" tabindex="0"><b>//@${escapeHtml(item.author.displayName)}</b><span>：${formatPostContent(item.content || "转发众声")}</span></span>`).join("")}</span>`;
}

function renderRepostCopy(post, detail = false) {
  const content = post.content ? formatPostContent(post.content, post.mentions) : "转发众声";
  return `<div class="repost-copy ${detail ? "post-content" : ""}"><span class="repost-current">${content}</span>${renderRepostChain(post)}</div>`;
}

function renderOriginalEmbed(original) {
  return `<div class="embedded-post ${original.status !== "published" ? "deleted-original" : ""}" data-post-id="${original.id}"><button type="button" class="embedded-author" data-account-id="${original.author.id}">@${escapeHtml(original.author.displayName)}<span class="v-badge ${verificationClass(original.author.verification)}">${escapeHtml(original.author.verification)}</span></button><div class="embedded-content">${formatPostContent(original.content, original.mentions)}</div>${original.media?.length ? `<button type="button" class="embedded-media media-item" data-media-url="${escapeHtml(original.media[0])}" data-media-index="0" aria-label="查看原众声大图"><img src="${escapeHtml(mediaThumbnail(original.media[0], 480))}" alt="原众声图片" loading="lazy" decoding="async"><span>${original.media.length > 1 ? `${original.media.length}张图片` : "查看图片"}</span></button>` : ""}<footer><span>原众声热度 ${escapeHtml(original.displayHeat)}</span><span>${original.counts.repost || 0} 转发 · ${original.counts.comment || 0} 评论 · ${original.counts.like || 0} 赞</span></footer></div>`;
}

function renderRepostCard(post, options = {}) {
  const original = post.repost?.original;
  if (!original) return renderPost(post, false, options);
  if (options.detail) return renderRepostDetail(post, options);
  const targets = post.targets?.length ? `<div class="post-targets repost-targets"><span class="nature-badge ${post.nature}">${natureLabel(post.nature)}</span><span>影响对象：${post.targets.map((target) => `<b>${escapeHtml(target.name)}</b>`).join("、")}</span></div>` : "";
  const ownerActions = `${post.viewer?.isAuthor && state.me.capabilities?.pinLimit ? `<button type="button" data-action="pin">${post.pinned ? "取消置顶" : "置顶这条转发"}</button>` : ""}${post.viewer?.isAuthor && !post.observationEndsAt ? `<button type="button" data-action="edit">编辑转发内容</button>` : ""}${post.viewer?.isAuthor ? `<button type="button" class="danger" data-repost-action="delete">删除转发</button>` : ""}`;
  return `<article class="repost-card" data-post-id="${post.id}" data-repost-id="${post.id}">${options.showPinned && post.pinned ? `<div class="pinned-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M7 10l5-5 5 5M5 21h14"/></svg>置顶</div>` : ""}<header><button type="button" class="repost-author" data-account-id="${post.author.id}">${avatar(post.author)}</button><div><strong>${escapeHtml(post.author.displayName)}<span class="v-badge ${verificationClass(post.author.verification)}">${escapeHtml(post.author.verification)}</span></strong><small>${formatTime(post.createdAt)} · 来自 ${escapeHtml(post.sourceLabel || "众声网页版")}</small></div><div class="post-menu-wrap"><button type="button" class="post-menu-trigger" aria-label="更多操作">${socialIcons.more}</button><div class="post-more-menu" hidden><button type="button" data-action="promote">推广这条转发</button><button type="button" data-action="cool">降低这条热度</button><button type="button" data-repost-action="view" data-post-id="${original.id}">查看原众声</button><button type="button" data-repost-action="copy" data-post-id="${post.id}">复制这条转发链接</button>${ownerActions}</div></div></header>${renderRepostCopy(post)}${targets}${renderOriginalEmbed(original)}<div class="repost-own-heat"><span>本条转发热度</span><b>${escapeHtml(post.displayHeat)}</b></div><div class="post-metrics repost-metrics"><button class="post-action ${post.viewer?.reposted ? "active" : ""}" data-action="repost">${socialIcons.repost}<span>${post.counts.repost || "转发"}</span></button><button class="post-action" data-action="comment">${socialIcons.comment}<span>${post.counts.comment || "评论"}</span></button><button class="post-action ${post.viewer?.liked ? "active" : ""}" data-action="like">${socialIcons.like}<span>${post.counts.like || "赞"}</span></button></div></article>`;
}

function renderRepostDetail(post, options = {}) {
  const original = post.repost.original;
  const displayHeat = post.displayHeat || `${Math.round(Number(post.heat || 0))}万`;
  const targets = post.targets?.length ? `<div class="post-targets"><span class="nature-badge ${post.nature}">${natureLabel(post.nature)}</span><span>影响对象：${post.targets.map((target) => `<b>${escapeHtml(target.name)}</b>`).join("、")}</span></div>` : `<div class="post-targets"><span class="nature-badge neutral">中立</span><span>无名誉影响</span></div>`;
  const ownerActions = `${post.viewer?.isAuthor && state.me.capabilities?.pinLimit ? `<button type="button" data-action="pin">${post.pinned ? "取消置顶" : "置顶这条转发"}</button>` : ""}${post.viewer?.isAuthor && !post.observationEndsAt ? `<button type="button" data-action="edit">编辑转发内容</button>` : ""}${post.viewer?.isAuthor ? `<button type="button" class="danger" data-repost-action="delete">删除转发</button>` : ""}`;
  return `<article class="post-card repost-detail-card" data-post-id="${post.id}" data-repost-id="${post.id}">${options.showPinned && post.pinned ? `<div class="pinned-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M7 10l5-5 5 5M5 21h14"/></svg>置顶</div>` : ""}<div class="post-head"><button type="button" class="post-author-link" data-account-id="${post.author.id}">${avatar(post.author)}<span class="post-author"><strong>${escapeHtml(post.author.displayName)}<span class="v-badge ${verificationClass(post.author.verification)}">${escapeHtml(post.author.verification)}</span></strong><small>${formatTime(post.createdAt)} · 来自 ${escapeHtml(post.sourceLabel || "众声网页版")}</small></span></button><span class="post-heat" title="本条转发热度">${socialIcons.flame}<span>热度</span><b>${escapeHtml(displayHeat)}</b></span><div class="post-menu-wrap"><button type="button" class="post-menu-trigger" aria-label="更多操作">${socialIcons.more}</button><div class="post-more-menu" hidden><button type="button" data-action="promote">推广这条转发</button><button type="button" data-action="cool">降低这条热度</button><button type="button" data-repost-action="view" data-post-id="${original.id}">查看原众声</button>${ownerActions}</div></div></div><div class="post-body">${renderRepostCopy(post, true)}${targets}${renderOriginalEmbed(original)}</div><div class="post-metrics"><button class="post-action ${post.viewer?.reposted ? "active" : ""}" data-action="repost">${socialIcons.repost}<span>${post.counts.repost || "转发"}</span></button><button class="post-action" data-action="comment">${socialIcons.comment}<span>${post.counts.comment || "评论"}</span></button><button class="post-action ${post.viewer?.liked ? "active" : ""}" data-action="like">${socialIcons.like}<span>${post.counts.like || "赞"}</span></button></div></article>`;
}

function renderTimelinePost(post, options = {}) { return post?.type === "repost" ? renderRepostCard(post, options) : renderPost(post, false, options); }

async function openPublicProfile(accountId) {
  if (Number(accountId) === Number(state.me.id)) {
    ["post-dialog", "public-profile-dialog", "search-dialog"].forEach((id) => { if ($(`#${id}`).open) $(`#${id}`).close(); });
    switchTab("mine");
    return;
  }
  const container = $("#public-profile-content");
  container.innerHTML = `<div class="profile-loading">正在读取个人主页……</div>`;
  const dialog = $("#public-profile-dialog");
  if (!dialog.open) openDialog(dialog);
  try {
    const data = await api("public-profile", { query: { id: accountId } });
    const profile = data.profile;
    container.innerHTML = `<section class="public-profile-page"><header class="profile-topbar"><button class="detail-back" type="button" data-close="public-profile-dialog" aria-label="返回"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><div><h1>个人主页</h1><span>@${escapeHtml(profile.identityUnverified ? profile.displayName : (profile.realName || profile.displayName))}</span></div></header><div class="mine-cover public-cover"><img src="${escapeHtml(profile.coverUrl || DEFAULT_PROFILE_COVER)}" alt="${escapeHtml(profile.displayName)}的主页背景"></div><section class="mine-hero">${avatar(profile)}<div class="profile-actions"><button class="follow-button ${profile.viewerFollowing ? "following" : ""}" data-follow-account="${profile.id}">${profile.viewerFollowing ? "已关注" : "+ 关注"}</button></div><div class="profile-identity"><h2>${escapeHtml(profile.displayName)}<span class="v-badge ${verificationClass(profile.verification)}">${escapeHtml(profile.verification)}</span></h2><p>${escapeHtml(profile.bio || "尚未填写个人简介")}</p><div class="profile-meta"><span>${profile.identityUnverified ? "未完成实名" : profile.realName ? `实名 ${escapeHtml(profile.realName)}` : "官方认证账号"}</span>${profile.identityUnverified ? "" : `<span>${escapeHtml(profile.identity)}</span>`}</div></div></section><div class="profile-social-stats public-stats"><div><b>${data.posts.length}</b><span>众声</span></div><button type="button" data-relationship-type="following" data-relationship-account="${profile.id}" data-relationship-name="${escapeHtml(profile.displayName)}"><b>${profile.followingCount || 0}</b><span>关注</span></button><button type="button" data-relationship-type="followers" data-relationship-account="${profile.id}" data-relationship-name="${escapeHtml(profile.displayName)}"><b>${profile.followerCount || 0}</b><span>粉丝</span></button><div><b>${profile.influence}</b><span>传播力</span></div></div><nav class="profile-tabs"><span class="active">众声</span></nav><div class="profile-timeline">${data.posts.length ? data.posts.map((post) => renderTimelinePost(post, { showPinned: true })).join("") : profileEmpty("还没有发布众声", "这个账号暂时没有公开内容。")}</div></section>`;
  } catch (error) {
    container.innerHTML = `<div class="profile-loading error">${escapeHtml(error.message)}</div>`;
  }
}

async function openRelationshipList(type, accountId = state.me.id, name = state.me.displayName) {
  state.relationshipView = { type, accountId: Number(accountId), name };
  const dialog = $("#relationship-dialog");
  const title = type === "followers" ? "粉丝" : "关注";
  $("#relationship-title").textContent = `${name}的${title}`;
  $("#relationship-list").innerHTML = `<div class="relationship-loading">正在读取${title}列表……</div>`;
  if (!dialog.open) openDialog(dialog);
  try {
    const items = await api("relationships", { query: { id: accountId, type } });
    $("#relationship-list").innerHTML = items.length ? items.map((profile) => `<article class="relationship-row"><button type="button" class="relationship-account" data-account-id="${profile.id}">${avatar(profile, "comment-avatar")}<span><strong>${escapeHtml(profile.displayName)}<i class="v-badge ${verificationClass(profile.verification)}">${escapeHtml(profile.verification)}</i></strong><small>${escapeHtml(profile.bio || profile.identity)}</small></span></button>${profile.isSelf ? `<span class="relationship-self">我</span>` : `<button type="button" class="relationship-follow ${profile.viewerFollowing ? "following" : ""}" data-follow-account="${profile.id}">${profile.viewerFollowing ? "已关注" : "+ 关注"}</button>`}</article>`).join("") : profileEmpty(`还没有${title}`, type === "followers" ? "新的关注者会出现在这里。" : "关注账号后会出现在这里。");
  } catch (error) {
    $("#relationship-list").innerHTML = `<div class="relationship-loading error">${escapeHtml(error.message)}</div>`;
  }
}

function commentItem(comment, parent = null, compact = false, extraClass = "") {
  if (comment.tombstone) return `<article class="comment comment-tombstone ${extraClass}" data-comment-id="${comment.id}"><span class="comment-avatar">—</span><div class="comment-main"><p>原评论已删除或隐藏</p></div></article>`;
  const replyTo = parent ? `<span class="reply-to">回复 <b>@${escapeHtml(parent.author.displayName)}</b>：</span>` : "";
  const badges = `${comment.isPinned ? `<span class="comment-badge pinned">置顶</span>` : ""}${comment.isFeatured ? `<span class="comment-badge featured">精选</span>` : ""}`;
  const media = comment.media?.length ? `<button type="button" class="comment-image media-item" data-comment-media="${escapeHtml(comment.media[0])}" aria-label="查看评论图片"><img src="${escapeHtml(mediaThumbnail(comment.media[0], 480))}" alt="评论图片" loading="lazy" decoding="async"></button>` : "";
  const canRootManage = comment.viewer?.canModerate && !comment.parentId && comment.moderationStatus === "visible";
  const menuActions = `${comment.viewer?.isAuthor && comment.moderationStatus === "visible" ? `<button type="button" class="danger" data-delete-comment="${comment.id}">删除</button>` : ""}${canRootManage ? `<button type="button" data-manage-comment="pin" data-comment-id="${comment.id}">${comment.isPinned ? "取消置顶" : "置顶评论"}</button><button type="button" data-manage-comment="feature" data-comment-id="${comment.id}">${comment.isFeatured ? "取消精选" : "精选评论"}</button>` : ""}`;
  const menu = menuActions ? `<details class="comment-more"><summary aria-label="评论更多操作">${socialIcons.more}</summary><div>${menuActions}</div></details>` : "";
  return `<article class="comment ${parent ? "is-reply" : ""} ${compact ? "compact-reply" : ""} ${extraClass}" data-comment-id="${comment.id}">${avatar(comment.author, "comment-avatar")}<div class="comment-main"><div class="comment-head"><strong>${escapeHtml(comment.author.displayName)}<span class="v-badge ${verificationClass(comment.author.verification)}">${escapeHtml(comment.author.verification)}</span>${badges}</strong>${menu}</div>${comment.content ? `<p>${replyTo}${formatPostContent(comment.content, comment.mentions)}</p>` : ""}${media}<footer><time>${formatTime(comment.createdAt)} · 来自 ${escapeHtml(comment.sourceLabel || "众声网页版")}</time><div><button type="button" data-reply-comment="${comment.id}" data-reply-name="${escapeHtml(comment.author.displayName)}" aria-label="回复">${socialIcons.comment}</button><button type="button" class="${comment.viewer?.liked ? "active" : ""}" data-comment-like="${comment.id}" aria-label="点赞评论">${socialIcons.like}<span>${comment.likeCount || ""}</span></button></div></footer></div></article>`;
}

function commentTree(comments) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const children = new Map();
  comments.forEach((comment) => { const key = comment.parentId || 0; if (!children.has(key)) children.set(key, []); children.get(key).push(comment); });
  const descendants = (id, out = []) => { (children.get(id) || []).forEach((child) => { out.push(child); descendants(child.id,out); }); return out; };
  return { byId, children, roots: children.get(0) || [], descendants };
}

function commentComposer(placeholder = "写评论……", context = "post") {
  if (!state.activePost?.viewer?.canComment) return `<div class="comment-closed">${state.activePost?.commentPolicy === "closed" ? "发布者已关闭评论" : "仅发布者关注的人可以评论"}</div>`;
  const preview=state.commentMedia[context]?.objectUrl ? `<span class="comment-image-preview"><img src="${state.commentMedia[context].objectUrl}" alt="待发布评论图片"><button type="button" data-remove-comment-media="${context}" aria-label="移除评论图片">×</button></span>` : "";
  return `<form class="comment-box" id="comment-form" data-comment-context="${context}"><div class="comment-input-row"><input name="content" maxlength="500" placeholder="${escapeHtml(placeholder)}"><label class="comment-media-button" title="添加评论图片"><input type="file" data-comment-media-input="${context}" accept="image/jpeg,image/png,image/webp,image/gif"><span>${socialIcons.image}</span></label><button>评论</button></div>${preview}<select name="sourceLabel" aria-label="评论来源"><option>众声网页版</option><option>iPhone</option><option>Android</option><option>OPPO</option><option>华为</option><option>小米</option><option>繁笼终端</option></select></form>`;
}

function renderComments(comments) {
  const tree = commentTree(comments);
  const sorter=(a,b)=>Number(Boolean(b.isPinned))-Number(Boolean(a.isPinned))||Number(Boolean(b.isFeatured))-Number(Boolean(a.isFeatured))||(state.commentSort==="time"?new Date(String(b.createdAt).replace(" ","T"))-new Date(String(a.createdAt).replace(" ","T")):Number(b.hotScore||0)-Number(a.hotScore||0)||new Date(String(b.createdAt).replace(" ","T"))-new Date(String(a.createdAt).replace(" ","T")));
  const roots=[...tree.roots].sort(sorter);
  const threads = roots.map((root) => { const replies = tree.descendants(root.id,[]).sort(sorter); const preview = replies.slice(0,2).map((reply)=>commentItem(reply,tree.byId.get(reply.parentId),true)).join(""); return `<section class="comment-thread">${commentItem(root)}${preview}${replies.length ? `<button type="button" class="expand-replies" data-open-replies="${root.id}">共 ${replies.length} 条回复 <span>›</span></button>` : ""}</section>`; }).join("");
  return `<div class="discussion-head"><b>全部评论 (${comments.filter(item=>!item.tombstone&&item.moderationStatus==="visible").length})</b><div class="comment-sort" role="group" aria-label="评论排序"><button type="button" class="${state.commentSort==="hot"?"active":""}" data-comment-sort="hot" aria-pressed="${state.commentSort==="hot"}">按热度</button><button type="button" class="${state.commentSort==="time"?"active":""}" data-comment-sort="time" aria-pressed="${state.commentSort==="time"}">按时间</button></div></div>${commentComposer("写评论……","post")}<div class="comments">${threads || `<div class="empty-state discussion-empty">还没有评论，来留下第一句话</div>`}</div>`;
}

function openReplyThread(rootId, restorePosition = true) {
  const comments = state.activePost?.comments || []; const tree = commentTree(comments); const root = tree.byId.get(Number(rootId)); if (!root) return;
  const sorter=(a,b)=>state.commentSort==="time"?new Date(String(b.createdAt).replace(" ","T"))-new Date(String(a.createdAt).replace(" ","T")):Number(b.hotScore||0)-Number(a.hotScore||0)||new Date(String(b.createdAt).replace(" ","T"))-new Date(String(a.createdAt).replace(" ","T"));
  const replies = tree.descendants(root.id,[]).sort(sorter); state.replyRootId = root.id;
  const replyItems = replies.map((reply) => { const direct = Number(reply.parentId) === Number(root.id); return commentItem(reply, direct ? null : tree.byId.get(reply.parentId), false, direct ? "reply-level-one" : "reply-level-nested"); }).join("");
  $("#reply-thread").innerHTML = `<section class="reply-sheet"><header><button type="button" class="reply-refresh" data-reply-refresh aria-label="刷新回复"><svg viewBox="0 0 24 24"><path d="M20 6v5h-5"/><path d="M18.5 16a8 8 0 1 1 .7-8.8L20 11"/></svg></button><h2>${replies.filter(item=>!item.tombstone).length} 条回复</h2><button type="button" data-close="reply-dialog" aria-label="关闭">×</button></header><div class="reply-root">${commentItem(root)}</div><div class="reply-sort"><div class="comment-sort" role="group" aria-label="回复排序"><button type="button" class="${state.commentSort==="hot"?"active":""}" data-comment-sort="hot" aria-pressed="${state.commentSort==="hot"}">按热度</button><button type="button" class="${state.commentSort==="time"?"active":""}" data-comment-sort="time" aria-pressed="${state.commentSort==="time"}">按时间</button></div></div><div class="reply-list">${replyItems || `<div class="discussion-empty">暂时还没有回复</div>`}</div>${commentComposer(`回复 @${root.author.displayName}`,"reply")}</section>`;
  openDialog($("#reply-dialog"));
  if (restorePosition) requestAnimationFrame(()=>{const list=$("#reply-dialog .reply-list");if(list)list.scrollTop=state.replyScrollTop;});
  const input = $("#reply-dialog #comment-form [name=content]"); if (input) input.dataset.parentId = root.id;
}

function captureReplyScroll() { const list=$("#reply-dialog .reply-list"); if(list)state.replyScrollTop=list.scrollTop; }
function clearCommentMedia(context) { const item=state.commentMedia[context];if(item?.objectUrl)URL.revokeObjectURL(item.objectUrl);state.commentMedia[context]=null; }
async function refreshCommentViews(keepReplies=false) { captureReplyScroll();state.activePost=await api("post",{query:{id:state.activePost.id}});$("#detail-discussion").innerHTML=renderDetailDiscussion("comments");if(keepReplies&&state.replyRootId)openReplyThread(state.replyRootId,true); }

function renderDetailDiscussion(tab) {
  const post = state.activePost;
  if (!post) return "";
  if (tab === "comments") return renderComments(post.comments || []);
  const items = tab === "reposts" ? (post.reposts || []) : (post.likes || []);
  const label = tab === "reposts" ? "转发" : "赞";
  if (!items.length) return `<div class="discussion-head"><b>${label} 0</b></div><div class="detail-empty">还没有人${label === "赞" ? "点赞" : "转发"}</div>`;
  return `<div class="discussion-head"><b>${label} ${items.length}</b><span>按时间</span></div><div class="interaction-list">${items.map((item) => `<article class="interaction-item" ${tab === "reposts" && item.postId ? `data-repost-post-link="${item.postId}" role="button" tabindex="0"` : ""}>${avatar(item.author, "comment-avatar")}<div><strong>${escapeHtml(item.author.displayName)}<span class="v-badge ${verificationClass(item.author.verification)}">${escapeHtml(item.author.verification)}</span></strong>${tab === "reposts" ? `<p>${escapeHtml(item.content || "转发众声")}</p>` : `<p class="liked-copy">赞了这条众声</p>`}<time>${formatTime(item.createdAt)}</time></div></article>`).join("")}</div>`;
}

function renderHot() {
  const view = $("#view-hot");
  const header = `<header class="hot-board-head"><h1>众声热搜榜</h1><p>根据最新互动实时更新</p></header>`;
  if (!state.hot.length) { view.innerHTML = `<section class="hot-board">${header}<div class="empty-state">当前暂无众声达到热搜门槛</div></section>`; return; }
  const fire = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2s1 5-3 8c-3 2-3 7 1 10-6-1-8-7-5-11 1 2 3 3 4 2 3-2 3-6 3-9Z"/></svg>`;
  const rows = state.hot.map((post, index) => {
    const rank = index + 1;
    const title = String(post.hotTitle || post.content.slice(0, 18)).replace(/^#|#$/g, "");
    const targets = post.targets?.length ? post.targets.map((target) => target.name).join("、") : "无名誉影响";
    const movement = Number(post.rankChange || 0);
    const change = movement >= 3 ? `<span class="rank-change up">↑${movement}</span>` : movement <= -3 ? `<span class="rank-change down">↓${Math.abs(movement)}</span>` : `<span class="rank-change">—</span>`;
    const stateClass = post.hotState === "爆" ? "boom" : post.hotState === "沸" ? "boiling" : "";
    const status = post.hotState ? `<span class="heat-state ${stateClass}">${escapeHtml(post.hotState)}</span>` : "";
    const nature = `<span class="nature-badge ${post.nature}">${natureLabel(post.nature)}</span>`;
    const author = post.author?.displayName ? `由 ${escapeHtml(post.author.displayName)} 发布` : "众声实时舆情";
    const meta = `<div class="hot-mobile-meta">${nature}<span class="hot-heat">${fire}${escapeHtml(post.displayHeat)}</span><span class="hot-target">${author} · 影响对象：${escapeHtml(targets)}</span></div>`;
    return `<article class="hot-row rank-${rank}" data-hot-detail="${post.id}" role="button" tabindex="0" aria-label="查看热搜详情：${escapeHtml(title)}"><span class="hot-rank">${rank}</span><div class="hot-title"><h2>${escapeHtml(title)}</h2>${meta}</div><div class="hot-target">影响对象：${escapeHtml(targets)}</div><div class="hot-heat">${fire}${escapeHtml(post.displayHeat)}</div><div class="hot-status">${status}${change}</div></article>`;
  }).join("");
  view.innerHTML = `<section class="hot-board">${header}<div class="hot-columns"><span>排名</span><span>热搜内容</span><span>影响对象</span><span>热度</span><span>状态</span></div>${rows}<footer class="hot-board-foot"><span>当前共 ${state.hot.length} 条热搜</span><span>观察期为首次上榜后24小时</span></footer></section>`;
}

function renderFeed() {
  let items = [...state.timeline];
  if (state.natureFilter !== "all") items = items.filter((item) => (item.post || item.repost)?.nature === state.natureFilter);
  if (state.searchTerm) {
    const term = state.searchTerm.toLocaleLowerCase("zh-CN");
    items = items.filter((item) => { const post = item.post || item.repost; return [post.content, post.author.displayName, post.repost?.original?.content, post.repost?.original?.author?.displayName, ...(post.targets || []).map((target) => target.name)].join(" ").toLocaleLowerCase("zh-CN").includes(term); });
  }
  const heading = `<header class="feed-page-head"><div><h1>公开内容</h1><p>所有人正在讨论的事</p></div></header>`;
  const filters = `<header class="feed-toolbar"><div class="feed-tabs" role="tablist">${[["recommended","推荐"],["following","关注"],["latest","最新"],["official","官方"]].map(([key,label])=>`<button class="${state.feedFilter===key?'active':''}" data-feed-filter="${key}" role="tab" aria-selected="${state.feedFilter===key}">${label}</button>`).join("")}</div><label class="nature-filter"><span>筛选</span><svg viewBox="0 0 24 24"><path d="M4 5h16l-6 7v6l-4 2v-8Z"/></svg><select aria-label="按内容性质筛选"><option value="all" ${state.natureFilter === "all" ? "selected" : ""}>全部性质</option><option value="positive" ${state.natureFilter === "positive" ? "selected" : ""}>正面</option><option value="negative" ${state.natureFilter === "negative" ? "selected" : ""}>负面</option><option value="neutral" ${state.natureFilter === "neutral" ? "selected" : ""}>中立</option></select></label></header>`;
  const quickCompose = `<section class="quick-compose">${avatar(state.me)}<div class="quick-compose-main"><button type="button" data-quick-compose>此刻，所有人都在听……</button><footer><div class="quick-compose-tools"><span>${socialIcons.image}图片</span><span>${socialIcons.target}影响对象</span></div><span>实名公开发布</span></footer></div></section>`;
  const searchNote = state.searchTerm ? `<div class="feed-search-note">正在查看“${escapeHtml(state.searchTerm)}”的搜索结果<button type="button" data-clear-search>清除</button></div>` : "";
  const accounts = state.searchTerm && state.accountResults.length ? `<section class="account-search-results"><header><b>相关用户</b><span>${state.accountResults.length} 个结果</span></header>${state.accountResults.map((profile) => `<button type="button" data-account-id="${profile.id}">${avatar(profile,"comment-avatar")}<span><strong>${escapeHtml(profile.displayName)}<i class="v-badge ${verificationClass(profile.verification)}">${escapeHtml(profile.verification)}</i></strong><small>${escapeHtml(profile.bio || profile.identity)}</small></span></button>`).join("")}</section>` : "";
  const more = !state.searchTerm && state.feedHasMore ? `<button type="button" class="load-more auto-load" data-load-more>继续加载众声</button>` : "";
  const emptyCopy = state.feedFilter === "following" ? "关注的人还没有发布新众声" : "没有找到符合条件的众声";
  $("#view-feed").innerHTML = `<section class="feed-board">${heading}${filters}${quickCompose}${searchNote}${accounts}<div class="feed-list">${items.length ? items.map((item) => renderTimelinePost(item.post || item.repost)).join("") : `<div class="empty-state">${emptyCopy}</div>`}</div>${more}</section>`;
  $$('.feed-list .post-card:first-child .media-grid img').forEach(img => {img.loading='eager';img.fetchPriority='high';});
  requestAnimationFrame(observeFeedEnd);
}

function renderFeedRail() {
  const hotRows = state.hot.slice(0, 5).map((post, index) => `<button class="mini-hot-row" type="button" data-hot-detail="${post.id}"><b>${index + 1}</b><span>${escapeHtml(String(post.hotTitle || post.content).replace(/^#|#$/g, ""))}</span>${post.hotState ? `<i class="${post.hotState === "爆" ? "boom" : ""}">${escapeHtml(post.hotState)}</i>` : ""}<small>${escapeHtml(post.displayHeat)}</small></button>`).join("");
  $("#feed-right").innerHTML = `<section class="side-card live-hot-card"><header><h3>实时热搜</h3><button type="button" data-side-hot>更多 ›</button></header><div>${hotRows || `<p class="side-empty">暂无热搜</p>`}</div></section><section class="side-card feed-guide"><h3>众声公示</h3><p>众声热度由属性、身份、认证与真实互动共同产生。任何玩家均可为自己或他人的众声推广。</p><dl><div><dt>热</dt><dd>150</dd></div><div><dt>沸</dt><dd>300</dd></div><div><dt>爆</dt><dd>600</dd></div></dl></section><footer class="rail-footer"><a href="/">繁笼官网</a><span>·</span><button type="button" data-tab-link="mine">账号设置</button><p>众声 · 公开社交舆情平台</p></footer>`;
}

function notificationKind(item) {
  const text = `${item.title || ""} ${item.content || ""}`;
  if (/点赞|评论|回复|转发|互动/.test(text)) return "interaction";
  if (/热搜|名誉|热度|推广|降热/.test(text)) return "reputation";
  return "system";
}

function renderNotification(item) {
  const kind = notificationKind(item);
  const icons = { interaction: socialIcons.comment, reputation: socialIcons.flame, system: socialIcons.shield };
  const labels = { interaction: "互动", reputation: "舆情", system: "系统" };
  const ids=(item.groupIds||[item.id]).join(",");
  const link = item.link ? `data-notification-link="${escapeHtml(item.link)}"` : "";
  return `<article class="notification-item notification-${kind} ${Number(item.is_read) ? "" : "unread"}" ${link} data-notification-ids="${ids}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}">
    <span class="notification-icon" aria-hidden="true">${icons[kind]}</span>
    <div class="notification-copy"><header><span>${labels[kind]}</span><time>${formatTime(item.created_at)}</time></header><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.content)}</p></div>
    <div class="notification-actions">${!Number(item.is_read) ? `<button type="button" data-notification-read="${ids}">标为已读</button>` : `<span>已读</span>`}<button type="button" data-notification-delete="${ids}">删除</button></div>${item.link ? `<span class="notification-arrow" aria-hidden="true">›</span>` : ""}
  </article>`;
}

function aggregateNotifications(items) {
  const out=[];
  items.forEach(item=>{
    const groupable=["like","comment","reply","repost"].includes(item.type);
    const previous=out[out.length-1]; const same=groupable&&previous&&previous.type===item.type&&String(previous.post_id||"")===String(item.post_id||"");
    if(!same){out.push({...item,groupIds:[item.id],actors:item.actor?[item.actor.displayName]:[]});return;}
    previous.groupIds.push(item.id); if(item.actor?.displayName&&!previous.actors.includes(item.actor.displayName))previous.actors.push(item.actor.displayName);
    previous.is_read=Number(previous.is_read)&&Number(item.is_read)?1:0; const count=previous.groupIds.length; const names=previous.actors.slice(0,2).join("、")||"多人";
    previous.title=`${names}${count>previous.actors.length?`等${count}人`:count>1?`等${count}人`:""}${item.type==="like"?"赞了":"互动了"}你的众声`;
  });
  return out;
}

function profileEmpty(title, copy) {
  return `<div class="profile-empty"><span class="brand-seal" aria-hidden="true">众</span><b>${title}</b><p>${copy}</p></div>`;
}

function renderActivityRecord(item) {
  const isPromotion = item.type === "promotion";
  return `<article class="activity-record" data-post-id="${item.postId}"><span class="record-icon ${item.type}">${isPromotion ? "↑" : "↓"}</span><div><header><b>${escapeHtml(item.title)}</b><time>${formatTime(item.createdAt)}</time></header><p>${escapeHtml(item.content)}</p><footer><span>虞元 -${item.yuCoin}</span><span>热度 ${item.heat > 0 ? "+" : ""}${item.heat}</span><span>${item.beforeHeat} → ${item.afterHeat}</span></footer></div></article>`;
}

function renderMine() {
  const me = state.me;
  const influence = me.influenceBreakdown || {};
  const influenceFormula = me.type === "official"
    ? `官方账号固定身份系数 ${Number(influence.identityCoefficient || 1.8).toFixed(2)}，当前传播力为 ${Number(me.influence).toFixed(2)}。`
    : `${me.identityUnverified ? "身份系数" : `身份“${escapeHtml(influence.identity || me.identity)}”`} ${Number(influence.identityCoefficient || 1).toFixed(2)} × 属性总值 ${Number(influence.attributeTotal || 0)} 对应系数 ${Number(influence.attributeCoefficient || 1).toFixed(2)} × 正式名誉 ${Number(influence.reputation || 0)} 对应系数 ${Number(influence.reputationCoefficient || 1).toFixed(2)} ＝ ${Number(me.influence).toFixed(2)}。`;
  const ownPosts = state.feed.filter((post) => post.viewer?.isAuthor);
  const timeline = ownPosts.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Number(a.pinnedPosition || 999) - Number(b.pinnedPosition || 999) || new Date(String(b.createdAt).replace(" ", "T")) - new Date(String(a.createdAt).replace(" ", "T")));
  const names = new Set([me.realName, me.displayName].filter(Boolean));
  const involvedPosts = state.feed.filter((post) => post.targets?.some((target) => names.has(target.name)));
  const profilePanels = {
    posts: timeline.length ? timeline.map((post) => renderTimelinePost(post, { showPinned: true })).join("") : profileEmpty("还没有发布众声", "原创和转发内容都会出现在这里。"),
    involved: involvedPosts.length ? involvedPosts.map(renderTimelinePost).join("") : profileEmpty("暂无涉及你的内容", "将你列为影响对象的公开众声会出现在这里。"),
  };
  $("#view-mine").innerHTML = `<section class="profile-page">
    <header class="profile-topbar"><div><h1>个人主页</h1><span>@${escapeHtml(me.identityUnverified ? me.displayName : (me.realName || me.displayName))}</span></div><button class="profile-security" data-mine-action="password" aria-label="账号与安全" title="账号与安全">${socialIcons.settings}</button></header>
    <button type="button" class="mine-cover mine-cover-action" data-mine-action="cover" aria-label="更换个人主页背景"><img src="${escapeHtml(me.coverUrl || DEFAULT_PROFILE_COVER)}" alt="个人主页背景"></button>
    <section class="mine-hero"><button type="button" class="avatar mine-avatar-action" data-mine-action="avatar" aria-label="更换头像">${me.avatarUrl ? `<img src="${escapeHtml(me.avatarUrl)}" alt="当前头像">` : escapeHtml(me.displayName.slice(0, 1))}</button><div class="profile-actions"><button class="outline-btn" data-mine-action="profile">编辑资料</button><button class="profile-more" data-mine-action="logout" aria-label="退出登录" title="退出登录">${socialIcons.more}</button></div><div class="profile-identity"><h2>${escapeHtml(me.displayName)}<span class="v-badge ${verificationClass(me.verification)}">${escapeHtml(me.verification)}</span></h2><p>${escapeHtml(me.bio || "尚未填写个人简介")}</p><div class="profile-meta"><span>${me.type === "official" ? "官方认证账号" : (me.identityUnverified ? "未完成实名" : `实名 ${escapeHtml(me.realName)}`)}</span>${me.identityUnverified || me.type === "official" ? "" : `<span>${escapeHtml(me.identity)}</span>`}</div></div></section>
    <div class="profile-social-stats"><button data-profile-tab="posts"><b>${timeline.length}</b><span>众声</span></button><button data-profile-tab="involved"><b>${involvedPosts.length}</b><span>涉及我的</span></button><button type="button" data-relationship-type="following" data-relationship-account="${me.id}" data-relationship-name="${escapeHtml(me.displayName)}"><b>${me.followingCount || 0}</b><span>关注</span></button><button type="button" data-relationship-type="followers" data-relationship-account="${me.id}" data-relationship-name="${escapeHtml(me.displayName)}"><b>${me.followerCount || 0}</b><span>粉丝</span></button></div>
    <section class="account-snapshot"><div><span>属性总值</span><b>${me.attributeTotal ?? "—"}</b></div><div><span>虞元余额</span><b>${Number(me.yuCoin || 0).toLocaleString("zh-CN")}</b></div><div><span>正式名誉</span><b>${Number(me.reputation || 0)}</b></div><div><span>名誉进度</span><b>${Number(me.reputationProgress || 0) > 0 ? "+" : ""}${me.reputationProgress ?? "—"}</b></div><div class="influence-metric"><span>传播力 <button type="button" class="metric-help" data-influence-help aria-expanded="false" aria-controls="influence-help-panel">?</button></span><b>${me.influence}</b></div></section>
    <aside class="influence-explainer" id="influence-help-panel" hidden><b>你的传播力是怎么得到的</b><p>${influenceFormula}</p><p>属性系数＝1＋属性总值×0.0016；名誉等级对应系数为V 1.00、银V 1.15、金V 1.30、显赫V 1.50。名誉系数仍按实际名誉数值计算，身份限制只优先限制认证及对应权限，不清空名誉。页面显示值按最终乘积四舍五入到两位小数。</p><small>传播力用于发布、点赞、评论与首次有效转发的热度贡献；自赞不增加热度。</small></aside>
    <nav class="profile-tabs" aria-label="个人主页内容"><button class="${state.profileTab === "posts" ? "active" : ""}" data-profile-tab="posts" aria-selected="${state.profileTab === "posts"}">众声</button><button class="${state.profileTab === "involved" ? "active" : ""}" data-profile-tab="involved" aria-selected="${state.profileTab === "involved"}">涉及我的</button></nav>
    <div class="profile-timeline">${profilePanels[state.profileTab] || profilePanels.posts}</div>
  </section>`;
}

function renderMessages() {
  const unread = state.notifications.filter((item) => !Number(item.is_read)).length;
  const operationTitles = new Set(["推广操作已完成", "降热操作已完成"]);
  const counts = { interaction: 0, reputation: 0, system: 0 };
  state.notifications.forEach((item) => { if (!operationTitles.has(item.title)) counts[notificationKind(item)] += 1; });
  const regularNotifications = aggregateNotifications(state.notifications.filter((item) => !operationTitles.has(item.title)));
  let records = [];
  if (state.messageFilter === "operations") records = state.activityRecords.map((item) => ({ type: "record", createdAt: item.createdAt, item }));
  else if (state.messageFilter === "all") records = [...regularNotifications.map((item) => ({ type: "notification", createdAt: item.created_at, item })), ...state.activityRecords.map((item) => ({ type: "record", createdAt: item.createdAt, item }))];
  else records = regularNotifications.filter((item) => notificationKind(item) === state.messageFilter).map((item) => ({ type: "notification", createdAt: item.created_at, item }));
  records.sort((a, b) => new Date(String(b.createdAt).replace(" ", "T")) - new Date(String(a.createdAt).replace(" ", "T")));
  const items = records.length ? records.map((entry) => entry.type === "record" ? renderActivityRecord(entry.item) : renderNotification(entry.item)).join("") : `<div class="message-empty"><span>${socialIcons.bell}</span><b>这里还很安静</b><p>新的互动、热搜与系统通知会出现在这里。</p></div>`;
  $("#view-messages").innerHTML = `<section class="message-board"><header class="message-head"><div><h1>消息</h1><p>${unread ? `${unread} 条未读消息` : "没有未读消息"}</p></div><div class="message-head-actions"><span class="message-status">${regularNotifications.length + state.activityRecords.length} 条</span><button type="button" data-read-all ${unread ? "" : "disabled"}>全部已读</button></div></header><nav class="message-tabs" aria-label="消息分类">${[["all","全部"],["interaction","互动"],["reputation","热搜与名誉"],["operations","舆情操作"],["system","系统"]].map(([key,label])=>`<button class="${state.messageFilter===key?'active':''}" data-message-filter="${key}" aria-selected="${state.messageFilter===key}">${label}</button>`).join("")}</nav><div class="notification-list">${items}</div></section>`;
}

async function loadAll() {
  await Promise.all([
    api('hot').then(hot => {state.hot=hot;renderHot();renderFeedRail();}),
    api('timeline',{query:{page:1,limit:20,mode:state.feedFilter}}).then(timeline => {state.timeline=timeline;state.feedPage=1;state.feedHasMore=timeline.length===20;renderFeed();}),
    api('feed',{query:{page:1,limit:50}}).then(feed => {state.feed=feed;renderMine();}),
    api('notifications').then(items => {state.notifications=items;renderMessages();updateUnreadBadges();}),
    api('my-activity').then(items => {state.myActivity=items||{reposts:[]};renderMine();}).catch(() => {}),
    api('activity-records').then(items => {state.activityRecords=items;renderMine();}).catch(() => {})
  ]);
}

function updateUnreadBadges() {
  const unread = state.notifications.filter((item) => !Number(item.is_read)).length;
  const badge = $("#notification-count"); badge.textContent = unread; badge.hidden = unread < 1;
  const navBadge = $("#nav-notification-count"); navBadge.textContent = unread; navBadge.hidden = unread < 1;
}

async function loadMoreFeed() {
  if (!state.feedHasMore || state.feedLoading) return;
  state.feedLoading = true;
  try { const next = state.feedPage + 1;
    const items = await api("timeline", { query: { page: next, limit: 20, mode: state.feedFilter } });
    const key = (item) => `${item.type}:${item.type === "repost" ? item.repost.id : item.post.id}`;
    const known = new Set(state.timeline.map(key));
    state.timeline.push(...items.filter((item) => !known.has(key(item))));
    state.feedPage = next; state.feedHasMore = items.length === 20; renderFeed();
  } finally { state.feedLoading=false; }
}

async function loadTimelineMode(mode) {
  if (state.feedLoading || state.feedFilter === mode) return;
  state.feedLoading = true;
  state.feedFilter = mode;
  renderFeed();
  try {
    const items = await api("timeline", { query: { page: 1, limit: 20, mode } });
    state.timeline = items; state.feedPage = 1; state.feedHasMore = items.length === 20;
  } catch (error) {
    toast(error.message, "error");
  } finally { state.feedLoading = false; renderFeed(); }
}

function renderHotTrend(history = []) {
  if (!history.length) return `<div class="hot-trend-empty">本期榜单刚生成，下一批次将形成趋势。</div>`;
  const maxHeat = Math.max(...history.map((item) => Number(item.heat) || 0), 1);
  return `<div class="hot-trend" aria-label="热度走势">${history.map((item) => { const height = Math.max(12, Math.round((Number(item.heat) / maxHeat) * 100)); return `<span style="--trend-height:${height}%" title="第${item.rank}名 · 热度${item.heat}"><i></i><small>${item.rank}</small></span>`; }).join("")}</div>`;
}

async function openHotDetail(postId) {
  const dialog = $("#hot-detail-dialog");
  $("#hot-detail-content").innerHTML = `<div class="hot-detail-loading"><span class="skeleton-line"></span><span class="skeleton-line"></span></div>`;
  openDialog(dialog);
  try {
    const data = await api("hot-detail", { query: { id: postId } });
    state.activeHotDetail = data;
    const post = data.post; const status = data.status || {}; const targets = status.shares || [];
    const title = String(post.hotTitle || post.content).replace(/^#|#$/g, "");
    $("#hot-detail-content").innerHTML = `<section class="hot-detail-sheet">
      <header><button type="button" data-close="hot-detail-dialog" aria-label="返回"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><div><span>众声热搜详情</span><h2>${escapeHtml(title)}</h2></div><b class="hot-detail-rank">${status.currentRank ? `NO.${status.currentRank}` : "已下榜"}</b></header>
<div class="hot-detail-hero"><div><span>实时热度</span><strong>${escapeHtml(post.displayHeat)}</strong><small>读取于 ${formatTime(status.heatSyncedAt)}</small></div><div><span>最好稳定成绩</span><strong>${status.bestStableRank ? `第 ${status.bestStableRank} 名` : "—"}</strong><small>${status.isBoom ? "已锁定爆榜成绩" : "持续观察中"}</small></div><div><span>观察状态</span><strong>${status.settledAt ? "已结算" : "进行中"}</strong><small>截至 ${formatDeadline(status.observationEndsAt)}</small></div></div>
      <section class="hot-detail-trend"><header><b>榜单走势</b><span>每30分钟一个榜单批次，数字为名次</span></header>${renderHotTrend(data.history)}</section>
      <section class="hot-detail-impact"><header><b>${post.settledAt ? "已结算名誉影响" : "预计名誉影响"}</b><span class="nature-badge ${post.nature}">${natureLabel(post.nature)}</span></header>${targets.length ? targets.map((item) => `<div><span>${escapeHtml(item.name)}</span><b>${Number(item.progress) > 0 ? "+" : ""}${item.progress}</b></div>`).join("") : `<p>本条未设置影响对象，不产生名誉结算。</p>`}<small>${post.settledAt ? "已结算：显示历史账本实际结果，不追溯调整。" : `当前有效互动玩家 ${data.status.effectiveParticipants ?? "—"} 人。少于3人不奖不扣，3—5人按新分值的50%，6人起按新分值全额结算；以稳定名次为准。`}</small></section>
      <button type="button" class="primary-action hot-open-post" data-hot-open-post="${post.id}">查看众声正文与讨论</button>
    </section>`;
  } catch (error) { $("#hot-detail-content").innerHTML = `<div class="hot-detail-error"><b>暂时无法读取热搜详情</b><p>${escapeHtml(error.message)}</p><button type="button" data-close="hot-detail-dialog">关闭</button></div>`; }
}

function renderAdvancedDetail(post) {
  const responses = post.responses?.length ? `<section class="party-responses"><header><b>当事人回应</b><span>金V及以上认证</span></header>${post.responses.map((item)=>`<article>${avatar(item.author,"comment-avatar")}<div><strong>${escapeHtml(item.author.displayName)}<span class="v-badge ${verificationClass(item.author.verification)}">${escapeHtml(item.author.verification)}</span></strong><p>${formatPostContent(item.content,item.mentions)}</p><time>${formatTime(item.updatedAt)}</time></div></article>`).join("")}</section>` : "";
  const responseForm = post.viewer?.canRespond ? `<form id="response-form" class="response-form"><b>作为当事人回应</b><textarea name="content" maxlength="500" required placeholder="回应将以认证身份公开展示……"></textarea><button type="submit">发布回应</button></form>` : "";
  const baseLabel = post.type === "repost" ? "转发启动" : "发布基础";
  const baseValue = post.type === "repost" ? post.heatBreakdown?.repostSeed : post.heatBreakdown?.base;
  const heat = post.heatBreakdown ? `<details class="heat-breakdown"><summary>详细热度构成 <span>银V权限</span></summary><div><span>${baseLabel}<b>+${baseValue || 0}</b></span><span>虞元推广<b>+${post.heatBreakdown.paid}</b></span><span>累计降热<b>-${post.heatBreakdown.cooling}</b></span><span>自然衰减<b>-${post.heatBreakdown.decay}</b></span><span>当前热度<b>${post.heatBreakdown.current}</b></span></div></details>` : "";
  return `${responses}${responseForm}${heat}`;
}

async function runSearch(term) {
  state.searchTerm = term.trim();
  state.accountResults = state.searchTerm ? await api("account-search", { query: { q: state.searchTerm, limit: 8 } }).catch(() => []) : [];
  if (state.searchTerm) { const recent=[state.searchTerm,...JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY)||"[]").filter((item)=>item!==state.searchTerm)].slice(0,8); localStorage.setItem(RECENT_SEARCH_KEY,JSON.stringify(recent)); }
  hideSuggestions();
  switchTab("feed"); renderFeed();
}

function renderSuggestions(data, target) {
  const recent = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY)||"[]");
  const accounts=(data?.accounts||[]).map((item)=>`<button type="button" data-account-id="${item.id}">${avatar(item,"comment-avatar")}<span><b>${escapeHtml(item.displayName)}</b><small>账号</small></span></button>`).join("");
  const topics=(data?.topics||[]).map((topic)=>`<button type="button" data-suggest-search="${escapeHtml(topic)}"><span class="suggest-icon">#</span><span><b>${escapeHtml(topic)}</b><small>话题</small></span></button>`).join("");
  const posts=(data?.posts||[]).map((post)=>`<button type="button" data-post-id="${post.id}" class="suggest-post">${avatar(post.author,"comment-avatar")}<span><b>${escapeHtml(post.author.displayName)}</b><small>${escapeHtml(post.content.slice(0,46))}</small></span></button>`).join("");
  const recentHtml=!data ? recent.map((term)=>`<button type="button" data-suggest-search="${escapeHtml(term)}"><span class="suggest-icon">⌕</span><span><b>${escapeHtml(term)}</b><small>最近搜索</small></span></button>`).join("") : "";
  target.innerHTML = `${recentHtml}${accounts}${topics}${posts}` || `<p>没有匹配结果</p>`; target.hidden=false;
}

function hideSuggestions(){ $$(".search-suggestions").forEach((el)=>el.hidden=true); $$("[aria-controls=search-suggestions]").forEach((el)=>el.setAttribute("aria-expanded","false")); }
let searchTimer;
async function suggestSearch(input,target){ clearTimeout(searchTimer); const term=input.value.trim(); input.setAttribute("aria-expanded","true"); if(!term){renderSuggestions(null,target);return;} searchTimer=setTimeout(async()=>{const data=await api("search-suggest",{query:{q:term,limit:4}}).catch(()=>({accounts:[],topics:[],posts:[]}));renderSuggestions(data,target);},180); }

function restoreScroll(){ const value=Number(sessionStorage.getItem(SCROLL_KEY)||0); if(value) requestAnimationFrame(()=>window.scrollTo(0,value)); }
window.addEventListener("pagehide",()=>sessionStorage.setItem(SCROLL_KEY,String(window.scrollY)));

let feedObserver;
function observeFeedEnd(){ feedObserver?.disconnect(); const sentinel=$("[data-load-more]"); if(!sentinel)return; feedObserver=new IntersectionObserver(async(entries)=>{if(!entries[0].isIntersecting)return; sentinel.innerHTML='<span class="skeleton-line"></span><span class="skeleton-line"></span>'; try{await loadMoreFeed();}catch(error){state.feedLoading=false;sentinel.innerHTML='加载失败，点击重试';sentinel.dataset.retry='1';}}, {rootMargin:"500px"}); feedObserver.observe(sentinel); }

let postOpenRequest = 0;
async function openPost(postId, pushHistory = true) {
  const request = ++postOpenRequest;
  const dialog = $("#post-dialog");
  const cached = findPost(postId);
  state.activePost = null;
  $("#post-detail").innerHTML = `<div class="detail-shell"><header class="detail-topbar"><button class="detail-back" type="button" data-close="post-dialog" aria-label="返回">←</button><h2>众声正文</h2></header>${cached ? `<div class="detail-main" inert>${renderTimelinePost(cached, {detail:true})}</div>` : ''}<section class="empty-state" role="status" aria-live="polite">正在加载评论……</section></div>`;
  if (!dialog.open) openDialog(dialog);
  dialog.scrollTop = 0;
  try {
    const loaded = await api("post", { query: { id: postId } });
    if (request !== postOpenRequest || !dialog.open) return;
    state.activePost = loaded;
    state.detailTab = "comments";
    const post = state.activePost;
    $("#post-detail").innerHTML = `<div class="detail-shell" data-post-id="${post.id}"><header class="detail-topbar"><button class="detail-back" type="button" data-close="post-dialog" aria-label="返回"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><h2>众声正文</h2><button class="detail-top-menu" type="button" data-detail-more aria-label="更多操作">${socialIcons.more}</button></header><div class="detail-visibility"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>公开</div><div class="detail-main">${renderTimelinePost(post, { detail: true })}</div>${renderAdvancedDetail(post)}<nav class="detail-tabs"><button type="button" data-detail-tab="reposts">转发 <b>${post.counts.repost}</b></button><button type="button" class="active" data-detail-tab="comments">评论 <b>${post.counts.comment}</b></button><button type="button" data-detail-tab="likes">赞 <b>${post.counts.like}</b></button></nav><section class="detail-discussion" id="detail-discussion">${renderDetailDiscussion("comments")}</section><footer class="detail-action-bar"><button type="button" class="${post.viewer?.reposted ? "active" : ""}" data-action="repost">${socialIcons.repost}<span>${post.counts.repost || "转发"}</span></button><button type="button" data-detail-comment>${socialIcons.comment}<span>${post.counts.comment || "评论"}</span></button><button type="button" class="${post.viewer?.liked ? "active" : ""}" data-action="like">${socialIcons.like}<span>${post.counts.like || "赞"}</span></button></footer></div>`;
    if (!$("#post-dialog").open) openDialog($("#post-dialog"));
    if (pushHistory && new URLSearchParams(location.search).get("post") !== String(post.id)) {
      const url = new URL(location.href); url.searchParams.set("post", post.id);
      history.pushState({ zsOverlay: "post", postId: post.id }, "", url);
    }
  } catch (error) {
    if (request !== postOpenRequest || !dialog.open) return;
    $("#post-detail").innerHTML = `<div class="detail-shell"><header class="detail-topbar"><button class="detail-back" type="button" data-close="post-dialog" aria-label="返回">←</button><h2>众声正文</h2></header><section class="empty-state" role="alert"><p>${escapeHtml(error.message)}</p><button type="button" class="outline-btn" data-retry-post="${escapeHtml(postId)}">重新加载</button></section></div>`;
  }
}

function switchTab(tab) {
  sessionStorage.setItem(`${SCROLL_KEY}-${state.tab}`,String(window.scrollY));
  state.tab = tab;
  window.scrollTo({ top: Number(sessionStorage.getItem(`${SCROLL_KEY}-${tab}`)||0), behavior: "auto" });
  $("#app").dataset.activeTab = tab;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${tab}`));
  if (tab === "messages") {
    renderMessages();
  }
}

function saveComposeDraft() {
  const form = $("#compose-form");
  if (form.dataset.editingPostId) return;
  const values = Object.fromEntries(new FormData(form));
  const draft = { content: values.content || "", nature: values.nature || "neutral", sourceLabel: sourceValue(form), commentPolicy: values.commentPolicy || "everyone", advancedStatement: values.advancedStatement === "on", targets: state.selectedTargets };
  if (draft.content.trim() || draft.targets.length) localStorage.setItem(COMPOSE_DRAFT_KEY, JSON.stringify(draft));
  else localStorage.removeItem(COMPOSE_DRAFT_KEY);
}

function restoreComposeDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(COMPOSE_DRAFT_KEY) || "null");
    if (!draft) return false;
    const form = $("#compose-form"); form.content.value = draft.content || ""; form.nature.value = draft.nature || "neutral"; setSourceValue(form,draft.sourceLabel); form.commentPolicy.value=draft.commentPolicy||"everyone";
    if (form.advancedStatement) form.advancedStatement.checked = Boolean(draft.advancedStatement);
    state.selectedTargets = Array.isArray(draft.targets) ? draft.targets : [];
    renderSelectedTargets(); $("#compose-count").textContent = `${form.content.value.length} / 1000`;
    return true;
  } catch (_) { localStorage.removeItem(COMPOSE_DRAFT_KEY); return false; }
}

function closeComposer() {
  const form = $("#compose-form");
  if (!form.dataset.editingPostId) saveComposeDraft();
  $("#compose-dialog").close();
}

function openComposer() {
  const form = $("#compose-form");
  form.reset();
  form.dataset.editingPostId = "";
  $("h2", form).textContent = "发众声";
  $(".compose-submit", form).textContent = "发布";
  state.selectedTargets = [];
  resetMediaItems();
  renderSelectedTargets();
  const composerAvatar = $("#compose-avatar");
  composerAvatar.innerHTML = state.me.avatarUrl ? `<img src="${escapeHtml(state.me.avatarUrl)}" alt="">` : escapeHtml(state.me.displayName.slice(0, 1));
  $("#compose-author-name").innerHTML = `${escapeHtml(state.me.displayName)}<span class="v-badge ${verificationClass(state.me.verification)}">${escapeHtml(state.me.verification)}</span>`;
  $("#compose-count").textContent = "0 / 1000";
  $("#statement-toggle").hidden = !state.me.capabilities?.advancedStatement;
  $(".form-message", form).textContent = "";
  syncComposerRules();
  const restored = restoreComposeDraft();
  openDialog($("#compose-dialog"));
  if (restored) toast("已恢复未发布的草稿");
  setTimeout(() => $("#compose-content").focus(), 50);
}

function openPassword(force = false) {
  const dialog = $("#password-dialog");
  dialog.dataset.locked = force ? "true" : "false";
  $("#password-hint").textContent = force ? "管理员重置密码后，需要先设置新密码再继续使用众声。" : "修改成功后，其他登录状态将失效，需要重新登录。";
  $(".current-password-field", dialog).hidden = force;
  $(".dialog-close", dialog).hidden = force;
  openDialog(dialog);
}

function renderCoverPreview(url = "") {
  const preview = $("#profile-cover-preview");
  const imageUrl = url || DEFAULT_PROFILE_COVER;
  preview.style.backgroundImage = `linear-gradient(rgba(20,14,10,.18),rgba(20,14,10,.35)),url("${String(imageUrl).replace(/["\\]/g, "")}")`;
  preview.classList.toggle("has-image", Boolean(url));
}

function openProfileEditor(force = false) {
  const form = $("#profile-form");
  $("#profile-dialog").dataset.locked = force ? "true" : "false";
  $("#profile-dialog .dialog-close").hidden = force;
  $("#profile-dialog h2").textContent = force ? "完成首次资料设置" : "编辑社交资料";
  form.bio.required = force;
  form.nickname.value = force && state.me.identityUnverified ? "" : state.me.displayName; form.avatarUrl.value = state.me.avatarUrl || ""; form.coverUrl.value = state.me.coverUrl || ""; form.bio.value = state.me.bio || "";
  $("#avatar-input").value = ""; $("#cover-input").value = ""; state.coverFile = null;
  if (state.coverPreviewUrl) URL.revokeObjectURL(state.coverPreviewUrl); state.coverPreviewUrl = "";
  if (state.croppedAvatar?.url) URL.revokeObjectURL(state.croppedAvatar.url); state.croppedAvatar = null;
  $("#profile-avatar-preview").innerHTML = state.me.avatarUrl ? `<img src="${escapeHtml(state.me.avatarUrl)}" alt="当前头像">` : escapeHtml(state.me.displayName.slice(0, 1));
  $("#avatar-file-name").textContent = "上传后可缩放和移动裁剪"; renderCoverPreview(state.me.coverUrl || "");
  $(".form-message", form).textContent = force ? "昵称和简介为必填；头像可跳过并使用默认头像。" : ""; openDialog($("#profile-dialog"));
}

function syncRepostEditor() {
  const form = $("#repost-form"); const nature = new FormData(form).get("nature") || "neutral"; const box = $("#repost-target-box");
  if (!box) return; box.hidden = nature === "neutral";
  $("#repost-selected-targets").innerHTML = state.repostTargets.map((target) => `<button type="button" class="target-chip" data-remove-repost-target="${escapeHtml(target.id)}">${escapeHtml(target.name)} ×</button>`).join("");
  const note = $("#repost-rule-note"); const names = state.repostTargets.map((item) => item.name).join("、");
  note.className = `compose-rule-note repost-rule-note ${nature}`;
  note.innerHTML = nature === "neutral" ? `<b>默认中立</b><span>这条转发独立累计热度，但不继承原众声的名誉影响。</span>` : `<b>${natureLabel(nature)}转发</b><span>${names ? `影响对象：${escapeHtml(names)}` : "请选择至少1名影响对象。"}</span>`;
}

function bindRepostEditor() {
  const form = $("#repost-form");
  state.repostTargets = []; syncRepostEditor();
  if (form.dataset.bound === "true") return;
  form.dataset.bound = "true"; let timer;
  $$("#repost-form [name=nature]").forEach((input) => input.addEventListener("change", syncRepostEditor));
  $("#repost-target-search").addEventListener("input", (event) => { clearTimeout(timer); const query=event.target.value.trim(); if(!query){$("#repost-target-results").innerHTML="";return;} timer=setTimeout(async()=>{ try { const results=await api("targets",{query:{q:query}}); $("#repost-target-results").innerHTML=results.map((target)=>`<button type="button" class="target-result" data-repost-target-id="${escapeHtml(target.id)}" data-repost-target-name="${escapeHtml(target.name)}"><span>${escapeHtml(target.name)}</span><small>${escapeHtml(target.position||target.family||"已实名")}</small></button>`).join(""); } catch(error){toast(error.message,"error");} },260); });
  $("#repost-target-results").addEventListener("click",(event)=>{const button=event.target.closest("[data-repost-target-id]");if(!button)return;if(state.repostTargets.length>=3)return toast("最多选择3名影响对象","error");if(!state.repostTargets.some((item)=>item.id===button.dataset.repostTargetId))state.repostTargets.push({id:button.dataset.repostTargetId,name:button.dataset.repostTargetName});syncRepostEditor();});
  $("#repost-selected-targets").addEventListener("click",(event)=>{const button=event.target.closest("[data-remove-repost-target]");if(!button)return;state.repostTargets=state.repostTargets.filter((item)=>item.id!==button.dataset.removeRepostTarget);syncRepostEditor();});
}

function repostPreview(post) {
  const media = post.media?.[0] || post.repost?.original?.media?.[0] || "";
  const image = media ? `<img src="${escapeHtml(media)}" alt="原众声图片">` : avatar(post.author, "repost-origin-avatar");
  const copy = post.content || (post.type === "repost" ? "转发众声" : "原众声");
  return `${image}<div><strong>@${escapeHtml(post.author?.displayName || "众声用户")}</strong><p>${escapeHtml(copy)}</p>${post.type === "repost" && post.repost?.original ? `<small>原众声来自 @${escapeHtml(post.repost.original.author.displayName)}</small>` : ""}</div>`;
}

async function openRepostPage(postId) {
  try {
    const opener = document.activeElement;
    let post = findPost(postId);
    if (!post) post = await api("post", { query: { id: postId } });
    const detailOpen = $("#post-dialog").open;
    state.repostPage = { postId: Number(postId), restorePostId: detailOpen ? Number(state.activePost?.id || postId) : null, opener };
    if (detailOpen) $("#post-dialog").close();
    const form = $("#repost-form"); form.reset(); form.postId.value = postId;
    $("#repost-page-author").textContent = state.me.displayName;
    $("#repost-origin-preview").innerHTML = repostPreview(post);
    $(".form-message", form).textContent = "";
    $("#repost-target-results").innerHTML = "";
    $("#repost-target-search").value = "";
    bindRepostEditor();
    $("#repost-page").hidden = false;
    document.body.classList.add("repost-open");
    requestAnimationFrame(() => form.content.focus());
  } catch (error) { toast(error.message, "error"); }
}

async function closeRepostPage(restore = true) {
  const page = $("#repost-page");
  if (page.hidden) return;
  page.hidden = true; document.body.classList.remove("repost-open"); hideMentionSuggestions();
  const restorePostId = state.repostPage.restorePostId;
  const opener = state.repostPage.opener;
  state.repostPage = { postId: null, restorePostId: null, opener: null };
  state.repostTargets = [];
  if (restore && restorePostId) await openPost(restorePostId, false);
  else if (restore && opener?.isConnected) requestAnimationFrame(() => opener.focus());
}

async function openAction(type, postId) {
  if (type === "repost") return openRepostPage(postId);
  const dialog = $("#action-dialog");
  const titles = { promote: ["YU / HEAT", "推广众声"], repost: ["RETRANSMISSION", "转发众声"], cool: ["HEAT CONTROL", "降低热搜"] };
  $(".eyebrow", dialog).textContent = titles[type][0]; $("#action-title").textContent = titles[type][1];
  const fields = {
    promote: `<label>投入虞元<input name="yuCoin" type="number" min="10" step="10" value="10" required></label><div class="action-preview" data-action-preview>本次预计增加 <b>20</b> 热度 · 当前余额 ${Number(state.me.yuCoin || 0).toLocaleString("zh-CN")} 虞元</div><p>每10虞元增加20热度，可以多次投入，也可以推广其他人的众声。</p>`,
    cool: `<div class="action-preview"><b>扣除当前热度的20%</b><span>系统会在提交前按最新热度校验费用、次数与余额</span></div><p>费用＝本次降低热度÷2×1.2，向上取整，最低1虞元；每人每条最多3次，不再递增价格。</p>`,
  };
  $("#action-fields").innerHTML = fields[type];
  $(".form-message", dialog).textContent = "";
  dialog.querySelector("[name=postId]")?.remove(); dialog.querySelector("[name=actionType]")?.remove();
  dialog.querySelector("form").insertAdjacentHTML("afterbegin", `<input type="hidden" name="postId" value="${postId}"><input type="hidden" name="actionType" value="${type}">`);
  openDialog(dialog);
  dialog.querySelector("[name=yuCoin]")?.addEventListener("input", (event) => { const amount = Math.max(0, Number(event.target.value || 0)); const preview = dialog.querySelector("[data-action-preview]"); if (preview) preview.innerHTML = `本次预计增加 <b>${amount * 2}</b> 热度 · 当前余额 ${Number(state.me.yuCoin || 0).toLocaleString("zh-CN")} 虞元`; });
  if (type === "cool") {
    try {
      const preview = await api("action-preview", { query: { actionType: "cool", postId } });
      $("#action-fields").innerHTML = `<div class="action-preview"><b>预计扣除 ${preview.heatRemoved} 热度</b><span>热度 ${preview.beforeHeat} → ${preview.afterHeat}</span><span>第 ${preview.sequence} 次操作，需 ${preview.cost} 虞元；当前余额 ${preview.balance} 虞元</span></div><p>确认后即时生效，本次操作不可撤回。</p>`;
      $(".primary-action", dialog).disabled = !preview.affordable;
      if (!preview.affordable) $(".form-message", dialog).textContent = "虞元余额不足";
    } catch (error) { $("#action-fields").innerHTML = `<div class="action-preview"><b>暂不可降热</b><span>${escapeHtml(error.message)}</span></div>`; $(".primary-action", dialog).disabled = true; }
  } else $(".primary-action", dialog).disabled = false;
}

async function refreshMe() { state.me = await api("me"); renderIdentity(); }

async function init() {
  try {
    state.me = await api("me");
    showApp();
    if (state.me.needsProfile) openProfileEditor(true);
    else if (state.me.mustChangePassword) openPassword(true);
    else { await loadAll(); const linkedPost = new URLSearchParams(location.search).get("post"); if (linkedPost) await openPost(linkedPost, false); restoreScroll(); }
  } catch (error) { showAuth(); }
}

window.addEventListener("popstate", async () => {
  const linkedPost = new URLSearchParams(location.search).get("post");
  if (linkedPost) await openPost(linkedPost, false);
  else if ($("#post-dialog").open) $("#post-dialog").close();
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const message = $("#login-message"); const button = $("button[type=submit]", form);
  message.textContent = ""; button.disabled = true;
  try {
    const data = await api("login", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    state.me = data.account; showApp();
    if (data.needsProfile) openProfileEditor(true); else if(data.mustChangePassword)openPassword(true); else { await loadAll(); const linkedPost = new URLSearchParams(location.search).get("post"); if (linkedPost) await openPost(linkedPost, false); }
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

$("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const message = $(".form-message", form);
  if (data.newPassword !== data.confirmPassword) { message.textContent = "两次输入的新密码不一致"; return; }
  try { await api("change-password", { method: "POST", body: data }); $("#password-dialog").close(); toast("密码已修改，请重新登录"); form.reset(); showAuth(); }
  catch (error) { message.textContent = error.message; }
});

$("#password-dialog").addEventListener("cancel", (event) => { if (event.currentTarget.dataset.locked === "true") event.preventDefault(); });
$("#profile-dialog").addEventListener("cancel", (event) => { if (event.currentTarget.dataset.locked === "true") event.preventDefault(); });
$("#compose-dialog").addEventListener("cancel", (event) => { event.preventDefault(); closeComposer(); });

$$(".nav-item").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
$("#notification-button").addEventListener("click", () => switchTab("messages"));
$("#top-profile").addEventListener("click", () => switchTab("mine"));
$("#compose-trigger").addEventListener("click", openComposer);
const userDirectory = {items:[],cursor:null,hasMore:false,loading:false,version:0};
let directoryTimer;
function renderUserDirectory() {
  $("#directory-list").innerHTML = userDirectory.items.map(profile => `<article class="directory-row"><button type="button" class="directory-person" data-account-id="${profile.id}">${avatar(profile,'comment-avatar')}<span><strong>${escapeHtml(profile.displayName)}<i class="v-badge ${verificationClass(profile.verification)}">${escapeHtml(profile.verification)}</i></strong><small>${escapeHtml(profile.bio || '尚未填写简介')}</small></span></button>${profile.isSelf ? '<span class="relationship-self">我</span>' : `<button type="button" class="follow-button ${profile.viewerFollowing?'following':''}" data-follow-account="${profile.id}" aria-pressed="${Boolean(profile.viewerFollowing)}">${profile.viewerFollowing?'已关注':'+ 关注'}</button>`}</article>`).join('');
}
async function loadUserDirectory(reset = true) {
  if (!reset && userDirectory.loading) return;
  const version = ++userDirectory.version;
  if (reset) {userDirectory.items=[];userDirectory.cursor=null;renderUserDirectory();}
  userDirectory.loading=true;
  $("#directory-more").hidden=true;
  $("#directory-status").textContent='正在加载用户……';
  const query=$("#mobile-search-input").value.trim();
  $("#directory-title").textContent=query?'匹配的已注册用户':'已注册用户';
  try {
    const data=await api('account-directory',{query:{q:query,cursor:userDirectory.cursor||0,limit:30}});
    if(version!==userDirectory.version) return;
    if(!Array.isArray(data.items)) throw Error('用户列表暂不可用，请确认后端已更新');
    const known=new Set(userDirectory.items.map(item=>item.id));
    userDirectory.items.push(...data.items.filter(item=>!known.has(item.id)));
    userDirectory.cursor=data.nextCursor;userDirectory.hasMore=data.hasMore;
    renderUserDirectory();
    $("#directory-status").textContent=userDirectory.items.length?(data.hasMore?'':'已展示全部匹配用户'):'暂无匹配的已注册用户';
    $("#directory-more").textContent='加载更多用户';$("#directory-more").hidden=!data.hasMore;
  } catch(error) {
    if(version!==userDirectory.version)return;
    $("#directory-status").textContent=`用户列表加载失败：${error.message}`;
    $("#directory-more").textContent='重新加载';$("#directory-more").hidden=false;
  } finally {if(version===userDirectory.version)userDirectory.loading=false;}
}
function openSearchPage(query = '') {
  clearTimeout(directoryTimer);hideSuggestions();
  $("#mobile-search-input").value = query;
  openDialog($("#search-dialog"));
  loadUserDirectory();
}
$("#mobile-search-button")?.addEventListener("click", () => openSearchPage());
$("#mobile-search-trigger").addEventListener("click", () => openSearchPage());
$("#global-search-input").addEventListener("click", () => openSearchPage($("#global-search-input").value));
$("#directory-more").addEventListener("click",()=>loadUserDirectory(!userDirectory.items.length));
$("#mobile-search-input").addEventListener('input',()=>{
  clearTimeout(directoryTimer);userDirectory.version++;userDirectory.loading=false;
  $("#directory-list").innerHTML='';$("#directory-more").hidden=true;$("#directory-status").textContent='正在搜索用户……';
  directoryTimer=setTimeout(()=>loadUserDirectory(),200);
});
$("#search-dialog").addEventListener("close", () => $("#mobile-search-input").blur());
$("#search-dialog form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const term = $("#mobile-search-input").value.trim();
  $("#global-search-input").value = term;
  $("#search-dialog").close();
  await runSearch(term);
});

$("#media-input").addEventListener("change", (event) => {
  const files = [...event.target.files];
  if (state.mediaItems.length + files.length > 9) { event.target.value = ""; return toast("一条众声最多上传9张图片", "error"); }
  for (const file of files) state.mediaItems.push({ file, objectUrl: URL.createObjectURL(file) });
  event.target.value = ""; renderMediaPreview(); saveComposeDraft();
});
document.addEventListener("change",(event)=>{const input=event.target.closest("[data-comment-media-input]");if(!input)return;const file=input.files?.[0];if(!file)return;const context=input.dataset.commentMediaInput;if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){input.value="";toast("评论图片仅支持 JPG、PNG、WebP 或 GIF","error");return;}clearCommentMedia(context);const objectUrl=URL.createObjectURL(file);state.commentMedia[context]={file,objectUrl};const form=input.closest("form");form.querySelector(".comment-image-preview")?.remove();const preview=document.createElement("span");preview.className="comment-image-preview";preview.innerHTML=`<img src="${objectUrl}" alt="待发布评论图片"><button type="button" data-remove-comment-media="${context}" aria-label="移除评论图片">×</button>`;form.querySelector("select")?.before(preview);input.value="";});
$("#media-preview").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-media]"); if (!button) return; const item = state.mediaItems.splice(Number(button.dataset.removeMedia), 1)[0]; if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl); renderMediaPreview(); saveComposeDraft(); });

$("#compose-form [name=content]").addEventListener("input", (event) => { $("#compose-count").textContent = `${event.target.value.length} / 1000`; saveComposeDraft(); });
let targetTimer;
$("#target-search").addEventListener("input", (event) => {
  clearTimeout(targetTimer); const query = event.target.value.trim();
  if (!query) { $("#target-results").innerHTML = ""; return; }
  targetTimer = setTimeout(async () => {
    try { const results = await api("targets", { query: { q: query } }); $("#target-results").innerHTML = results.map((target) => `<button type="button" class="target-result" data-target-id="${escapeHtml(target.id)}" data-target-name="${escapeHtml(target.name)}"><span>${escapeHtml(target.name)}</span><small>${escapeHtml(target.position || target.family || "已实名")}</small></button>`).join(""); }
    catch (error) { toast(error.message, "error"); }
  }, 260);
});

function syncComposerRules() {
  const form = $("#compose-form");
  const nature = new FormData(form).get("nature") || "neutral";
  const targetBox = $("#compose-target-box");
  targetBox.hidden = nature === "neutral";
  $("#target-limit").textContent = `${state.selectedTargets.length}/3`;
  const selectedNames = state.selectedTargets.map((target) => target.name).join("、");
  const notes = {
    neutral: ["中立内容", "即使进入热搜，也不会结算名誉进度。"],
    positive: ["正面内容", selectedNames ? `进入热搜后，将增加 ${selectedNames} 的名誉进度。` : "请选择至少1名影响对象，进入热搜后将增加其名誉进度。"],
    negative: ["负面内容", selectedNames ? `进入热搜后，将减少 ${selectedNames} 的名誉进度。` : "请选择至少1名影响对象，进入热搜后将减少其名誉进度。"],
  };
  const note = $("#compose-rule-note");
  note.className = `compose-rule-note ${nature}`;
  note.innerHTML = `<b>${notes[nature][0]}</b><span>${escapeHtml(notes[nature][1])}</span>`;
}

function renderSelectedTargets() {
  $("#selected-targets").innerHTML = state.selectedTargets.map((target) => `<button type="button" class="target-chip" data-remove-target="${escapeHtml(target.id)}">${escapeHtml(target.name)} ×</button>`).join("");
  syncComposerRules();
}
$("#target-results").addEventListener("click", (event) => { const button = event.target.closest(".target-result"); if (!button) return; if (state.selectedTargets.length >= 3) return toast("最多选择3名影响对象", "error"); if (!state.selectedTargets.some((item) => item.id === button.dataset.targetId)) state.selectedTargets.push({ id: button.dataset.targetId, name: button.dataset.targetName }); renderSelectedTargets(); saveComposeDraft(); });
$("#selected-targets").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-target]"); if (!button) return; state.selectedTargets = state.selectedTargets.filter((item) => item.id !== button.dataset.removeTarget); renderSelectedTargets(); saveComposeDraft(); });
$("#compose-form").addEventListener("change", (event) => { if (event.target.name === "nature") syncComposerRules(); saveComposeDraft(); });

$("#compose-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const message = $(".form-message", form);
  message.textContent = "";
  const tags = values.content.match(/#[^#\s]{1,24}#/gu) || [];
  if (tags.length > 3) { message.textContent = "一条众声最多添加3个文字标签"; $("#compose-content").focus(); return; }
  if (values.nature !== "neutral" && !state.selectedTargets.length) { message.textContent = "正面或负面众声必须选择至少1名影响对象"; $("#target-search").focus(); return; }
  const submit = $(".primary-action", form); if (submit.disabled) return; submit.disabled = true;
  const payload = { postId: Number(form.dataset.editingPostId || 0), content: values.content, nature: values.nature, sourceLabel: sourceValue(form), commentPolicy: values.commentPolicy || "everyone", advancedStatement: values.advancedStatement === "on", targets: values.nature === "neutral" ? [] : state.selectedTargets.map((target) => target.id), media: [] };
  try {
    const pendingUploads = state.mediaItems.filter((item) => !item.url).length;
    if (pendingUploads) submit.textContent = `正在上传 ${pendingUploads} 张图片`;
    payload.media = await uploadComposeMedia([...state.mediaItems]);
    submit.textContent = "正在发布";
    const saved = await api(form.dataset.editingPostId ? "edit-post" : "post", { method: "POST", body: payload });
    localStorage.removeItem(COMPOSE_DRAFT_KEY); form.reset(); form.dataset.editingPostId = ""; state.selectedTargets = []; resetMediaItems(); $("#compose-dialog").close();
    toast(payload.postId ? "众声已修改" : "众声已发布");
    if (saved.author && saved.counts) {
      state.feed = [saved, ...state.feed.filter(post => post.id !== saved.id)];
      state.timeline = [{type:'post',post:saved}, ...state.timeline.filter(item => (item.post || item.repost)?.id !== saved.id)];
      state.searchTerm = ''; state.natureFilter = 'all'; renderFeed(); renderMine();
    }
    switchTab("feed"); window.scrollTo({top:0,behavior:'auto'});
    // Refresh the ranking independently; publishing does not wait for six list requests.
    api('hot').then(hot => {state.hot=hot;renderHot();renderFeedRail();}).catch(() => {});
  }
  catch (error) { message.textContent = error.message; }
  finally { submit.disabled = false; submit.textContent = "发布"; }
});

document.addEventListener("click", async (event) => {
  const retryPost = event.target.closest('[data-retry-post]');
  if (retryPost) return openPost(retryPost.dataset.retryPost);
  const suggested = event.target.closest("[data-suggest-search]");
  if (suggested) { const term=suggested.dataset.suggestSearch; $("#global-search-input").value=term; $("#mobile-search-input").value=term; if($("#search-dialog").open)$("#search-dialog").close(); await runSearch(term); return; }
  const suggestedPost = event.target.closest(".suggest-post");
  if (suggestedPost) { hideSuggestions(); await openPost(suggestedPost.dataset.postId); return; }
  const follow = event.target.closest("[data-follow-account]");
  if (follow) {
    const id=Number(follow.dataset.followAccount);
    if(pendingFollows.has(id))return;pendingFollows.add(id);
    const buttons=$$('[data-follow-account]').filter(button=>Number(button.dataset.followAccount)===id);
    buttons.forEach(button=>button.disabled=true);
    try {
      const result=await api('follow',{method:'POST',body:{accountId:id}});
      userDirectory.items.filter(item=>item.id===id).forEach(item=>item.viewerFollowing=result.following);
      $$('[data-follow-account]').filter(button=>Number(button.dataset.followAccount)===id).forEach(button=>{button.classList.toggle('following',result.following);button.textContent=result.following?'已关注':'+ 关注';button.setAttribute('aria-pressed',String(result.following));});
      refreshMe().then(()=>{if(state.tab==='mine')renderMine();}).catch(()=>{});
    } catch(error){toast(error.message,'error');}
    finally{pendingFollows.delete(id);$$('[data-follow-account]').filter(button=>Number(button.dataset.followAccount)===id).forEach(button=>button.disabled=false);}
    return;
  }
  const openReplies = event.target.closest("[data-open-replies]"); if(openReplies){state.replyScrollTop=0;openReplyThread(openReplies.dataset.openReplies,false);return;}
  const refreshReplies = event.target.closest("[data-reply-refresh]");
  if(refreshReplies){refreshReplies.disabled=true;try{await refreshCommentViews(true);}catch(error){toast(error.message,"error");}finally{refreshReplies.disabled=false;}return;}
  const readAll = event.target.closest("[data-read-all]");
  if(readAll){readAll.disabled=true;await api("notifications-read",{method:"POST"});state.notifications.forEach(item=>item.is_read=1);renderMessages();updateUnreadBadges();return;}
  const readOne=event.target.closest("[data-notification-read]");
  if(readOne){const ids=readOne.dataset.notificationRead.split(",").map(Number);await Promise.all(ids.map(id=>api("notifications-read",{method:"POST",body:{id}})));state.notifications.filter(item=>ids.includes(Number(item.id))).forEach(item=>item.is_read=1);renderMessages();updateUnreadBadges();return;}
  const deleteNotice=event.target.closest("[data-notification-delete]");
  if(deleteNotice){const ids=deleteNotice.dataset.notificationDelete.split(",").map(Number);await Promise.all(ids.map(id=>api("notification-delete",{method:"POST",body:{id}})));state.notifications=state.notifications.filter(item=>!ids.includes(Number(item.id)));renderMessages();updateUnreadBadges();return;}
  const commentSort=event.target.closest("[data-comment-sort]");
  if(commentSort){captureReplyScroll();state.commentSort=commentSort.dataset.commentSort;$("#detail-discussion").innerHTML=renderDetailDiscussion("comments");if($("#reply-dialog").open&&state.replyRootId)openReplyThread(state.replyRootId,true);return;}
  const removeCommentMedia=event.target.closest("[data-remove-comment-media]");
  if(removeCommentMedia){const context=removeCommentMedia.dataset.removeCommentMedia;clearCommentMedia(context);removeCommentMedia.closest(".comment-image-preview")?.remove();return;}
  const manageComment=event.target.closest("[data-manage-comment]");
  if(manageComment){const action=manageComment.dataset.manageComment;const keepReplies=$("#reply-dialog").open;manageComment.disabled=true;try{await api("manage-comment",{method:"POST",body:{commentId:Number(manageComment.dataset.commentId),manageAction:action}});toast({pin:"置顶状态已更新",feature:"精选状态已更新"}[action]);await refreshCommentViews(keepReplies);await loadAll();}catch(error){toast(error.message,"error");}finally{manageComment.disabled=false;}return;}
  const thumb=event.target.closest("[data-image-index]"); if(thumb){state.imageViewer.index=Number(thumb.dataset.imageIndex);state.imageViewer.scale=1;state.imageViewer.x=0;state.imageViewer.y=0;renderImageViewer();return;}
  const mediaButton = event.target.closest(".media-item");
  if (mediaButton) { event.preventDefault(); event.stopPropagation(); openImageViewer(mediaButton); return; }
  const accountLink = event.target.closest("[data-account-id]");
  if (accountLink) { event.preventDefault(); event.stopPropagation(); if($("#relationship-dialog").open)$("#relationship-dialog").close(); await openPublicProfile(accountLink.dataset.accountId); return; }
  const searchTag = event.target.closest("[data-search-tag]");
  if (searchTag) {
    $("#global-search-input").value = searchTag.dataset.searchTag;
    ["post-dialog", "public-profile-dialog"].forEach((id) => { if ($(`#${id}`).open) $(`#${id}`).close(); });
    await runSearch(searchTag.dataset.searchTag); return;
  }
  const loadMore = event.target.closest("[data-load-more]");
  if (loadMore) { loadMore.disabled = true; try { await loadMoreFeed(); } catch (error) { toast(error.message, "error"); } return; }
  const quickCompose = event.target.closest("[data-quick-compose]");
  if (quickCompose) { openComposer(); return; }
  const relationship = event.target.closest("[data-relationship-type]");
  if (relationship) { await openRelationshipList(relationship.dataset.relationshipType, relationship.dataset.relationshipAccount, relationship.dataset.relationshipName); return; }
  const influenceHelp = event.target.closest("[data-influence-help]");
  if (influenceHelp) { const panel=$("#influence-help-panel"); const expanded=panel.hidden; panel.hidden=!expanded; influenceHelp.setAttribute("aria-expanded",String(expanded)); return; }
  const messageFilter = event.target.closest("[data-message-filter]");
  if (messageFilter) { state.messageFilter = messageFilter.dataset.messageFilter; renderMessages(); return; }
  const profileTab = event.target.closest("[data-profile-tab]");
  if (profileTab) { state.profileTab = profileTab.dataset.profileTab; renderMine(); return; }
  const detailMore = event.target.closest("[data-detail-more]");
  if (detailMore) {
    const menu = $(".detail-main .post-more-menu");
    if (menu) menu.hidden = !menu.hidden;
    return;
  }
  const detailTab = event.target.closest("[data-detail-tab]");
  if (detailTab) {
    state.detailTab = detailTab.dataset.detailTab;
    $$("[data-detail-tab]", $("#post-detail")).forEach((button) => button.classList.toggle("active", button === detailTab));
    $("#detail-discussion").innerHTML = renderDetailDiscussion(state.detailTab);
    return;
  }
  const detailComment = event.target.closest("[data-detail-comment]");
  if (detailComment) {
    state.detailTab = "comments";
    $$("[data-detail-tab]", $("#post-detail")).forEach((button) => button.classList.toggle("active", button.dataset.detailTab === "comments"));
    $("#detail-discussion").innerHTML = renderDetailDiscussion("comments");
    $("#comment-form [name=content]")?.focus();
    return;
  }
  const feedFilter = event.target.closest("[data-feed-filter]");
  if (feedFilter) { await loadTimelineMode(feedFilter.dataset.feedFilter); return; }
  const clearSearch = event.target.closest("[data-clear-search]");
  if (clearSearch) { state.searchTerm = ""; state.accountResults = []; $("#global-search-input").value = ""; renderFeed(); return; }
  const sideHot = event.target.closest("[data-side-hot]");
  if (sideHot) { switchTab("hot"); return; }
  const tabLink = event.target.closest("[data-tab-link]");
  if (tabLink) { switchTab(tabLink.dataset.tabLink); return; }
  const postMenu = event.target.closest(".post-menu-trigger");
  if (postMenu) {
    const menu = postMenu.nextElementSibling;
    $$(".post-more-menu").forEach((item) => { if (item !== menu) item.hidden = true; });
    if (menu) menu.hidden = !menu.hidden;
    return;
  }
  if (!event.target.closest(".post-more-menu")) $$(".post-more-menu").forEach((menu) => { menu.hidden = true; });
  const dialogClose = event.target.closest(".dialog-close");
  if (dialogClose) { event.preventDefault(); const dialog = dialogClose.closest("dialog"); if (dialog?.id === "compose-dialog") closeComposer(); else dialog?.close(); return; }
  const close = event.target.closest("[data-close]"); if (close) { if (close.dataset.close === "post-dialog" && new URLSearchParams(location.search).has("post")) history.back(); else $("#" + close.dataset.close).close(); return; }
  const commentLike = event.target.closest("[data-comment-like]");
  if (commentLike) { const keepReplies=$("#reply-dialog").open; try { await api("comment-like", { method: "POST", body: { commentId: Number(commentLike.dataset.commentLike) } }); await refreshCommentViews(keepReplies); await loadAll(); } catch (error) { toast(error.message, "error"); } return; }
  const deleteComment = event.target.closest("[data-delete-comment]");
  if (deleteComment) { if (!confirm("确认删除这条评论？其产生的有效热度也会扣除。")) return; const keepReplies=$("#reply-dialog").open; try { await api("delete-comment", { method: "POST", body: { commentId: Number(deleteComment.dataset.deleteComment) } }); await refreshCommentViews(keepReplies); await loadAll(); } catch (error) { toast(error.message, "error"); } return; }
  const reply = event.target.closest("[data-reply-comment]");
  if (reply) { const scope=reply.closest("dialog")||document; const input=$("#comment-form [name=content]",scope)||$("#comment-form [name=content]"); if(!input)return; input.dataset.parentId = reply.dataset.replyComment; input.placeholder = `回复 @${reply.dataset.replyName}`; input.focus(); return; }
  const repostPostLink = event.target.closest("[data-repost-post-link]"); if (repostPostLink) return openPost(repostPostLink.dataset.repostPostLink);
  const hotDetail = event.target.closest("[data-hot-detail]"); if (hotDetail) return openHotDetail(hotDetail.dataset.hotDetail);
  const hotOpenPost = event.target.closest("[data-hot-open-post]"); if (hotOpenPost) { $("#hot-detail-dialog").close(); return openPost(hotOpenPost.dataset.hotOpenPost); }
  const repostAction = event.target.closest("[data-repost-action]");
  if (repostAction) {
    const card = repostAction.closest("[data-repost-id]"); const kind = repostAction.dataset.repostAction; const postId = repostAction.dataset.postId;
    if (kind === "view") return openPost(postId);
    if (kind === "copy") { const url = new URL(location.href); url.search = ""; url.hash = ""; url.searchParams.set("post", postId); try { await copyText(url.href); toast("原众声链接已复制"); } catch (_) { toast("复制失败，请重试", "error"); } return; }
    if (kind === "delete") { if (!confirm("确认删除这条转发？原众声不会被删除。")) return; try { await api("delete-repost", { method: "POST", body: { repostId: Number(card.dataset.repostId) } }); if ($("#post-dialog").open && Number(state.activePost?.id) === Number(card.dataset.repostId)) history.back(); toast("转发已删除"); await loadAll(); } catch (error) { toast(error.message, "error"); } return; }
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    const postId = action.closest("[data-post-id]").dataset.postId; const type = action.dataset.action;
    if (type === "like") return togglePostLike(postId, action);
    if (type === "comment") return openPost(postId);
    if (type === "pin") { try { const result = await api("pin", { method: "POST", body: { postId } }); toast(result.pinned ? "众声已置顶" : "已取消置顶"); await loadAll(); } catch (error) { toast(error.message, "error"); } return; }
    if (type === "edit") {
      try { const post = await api("post", { query: { id: postId } }); const form = $("#compose-form"); form.reset(); form.dataset.editingPostId = post.id; form.content.value = post.content; form.nature.value = post.nature; setSourceValue(form,post.sourceLabel); form.commentPolicy.value=post.commentPolicy||"everyone"; if (form.advancedStatement) form.advancedStatement.checked = Boolean(post.statementStyle); $("#statement-toggle").hidden = !state.me.capabilities?.advancedStatement; resetMediaItems(post.media || []); state.selectedTargets = post.targets.map((target) => ({ id: target.id, name: target.name })); renderSelectedTargets(); $("h2", form).textContent = "编辑众声"; $(".compose-submit", form).textContent = "保存"; const composerAvatar = $("#compose-avatar"); composerAvatar.innerHTML = state.me.avatarUrl ? `<img src="${escapeHtml(state.me.avatarUrl)}" alt="">` : escapeHtml(state.me.displayName.slice(0, 1)); $("#compose-author-name").innerHTML = `${escapeHtml(state.me.displayName)}<span class="v-badge ${verificationClass(state.me.verification)}">${escapeHtml(state.me.verification)}</span>`; $("#compose-count").textContent = `${post.content.length} / 1000`; openDialog($("#compose-dialog")); } catch (error) { toast(error.message, "error"); } return;
    }
    if (type === "delete") {
      if (!confirm("删除后正文不再公开；已进入热搜的众声仍会按锁定成绩结算。确认删除？")) return;
      try { await api("delete-post", { method: "POST", body: { postId } }); if ($("#post-dialog").open) $("#post-dialog").close(); toast("众声已删除"); await loadAll(); } catch (error) { toast(error.message, "error"); } return;
    }
    return openAction(type, postId);
  }
  const mine = event.target.closest("[data-mine-action]");
  if (mine) {
    if (mine.dataset.mineAction === "profile") return openProfileEditor();
    if (mine.dataset.mineAction === "avatar") { openProfileEditor(); $("#avatar-input").click(); return; }
    if (mine.dataset.mineAction === "cover") { openProfileEditor(); $("#cover-input").click(); return; }
    if (mine.dataset.mineAction === "password") return openPassword(false);
    if (mine.dataset.mineAction === "logout") { if (!confirm("确认退出众声？")) return; await api("logout", { method: "POST" }).catch(() => {}); state.me = null; showAuth(); }
  }
  const notification = event.target.closest(".notification-item[data-notification-ids]");
  if (notification) { const link=notification.dataset.notificationLink; const ids=notification.dataset.notificationIds.split(",").map(Number); const unreadIds=ids.filter(id=>!Number(state.notifications.find(item=>Number(item.id)===id)?.is_read)); if(unreadIds.length){await Promise.all(unreadIds.map(id=>api("notifications-read",{method:"POST",body:{id}})));state.notifications.filter(item=>ids.includes(Number(item.id))).forEach(item=>item.is_read=1);updateUnreadBadges();renderMessages();} if(link){const id=new URL(link,location.origin).searchParams.get("post");if(id)await openPost(id);} else if(!unreadIds.length)renderMessages(); return; }
  const activityRecord = event.target.closest(".activity-record");
  if (activityRecord) { await openPost(activityRecord.dataset.postId); return; }
  const chainPost = event.target.closest("[data-chain-post]");
  if (chainPost) { await openPost(chainPost.dataset.chainPost); return; }
  const embeddedPost = event.target.closest(".embedded-post");
  if (embeddedPost) { await openPost(embeddedPost.dataset.postId); return; }
  const repostCard = event.target.closest(".repost-card");
  if (repostCard && !event.target.closest("button")) { await openPost(repostCard.dataset.postId); return; }
  const postCard = event.target.closest(".post-card");
  if (postCard && !event.target.closest("button")) await openPost(postCard.dataset.postId);
});
document.addEventListener("pointerdown",event=>{if(!event.target.closest(".search-combobox,.search-dialog"))setTimeout(hideSuggestions,0);});
document.addEventListener("input",event=>{const input=event.target;if(!input.matches?.('textarea[name="content"],input[name="content"]'))return;clearTimeout(mentionTimer);mentionTimer=setTimeout(()=>suggestMentions(input),180);});
mentionPopup.addEventListener("click",event=>{const button=event.target.closest("[data-mention-id]");const target=state.mentionTarget;if(!button||!target?.input)return;const input=target.input;input.setRangeText(`@${button.dataset.mentionName} `,target.start,target.end,"end");input.dispatchEvent(new Event("input",{bubbles:true}));hideMentionSuggestions();input.focus();});
document.addEventListener("pointerdown",event=>{if(!event.target.closest("#mention-suggestions,textarea[name='content'],input[name='content']"))setTimeout(hideMentionSuggestions,0);});
document.addEventListener("keydown",event=>{const target=event.target.closest?.('.notification-item[role="button"],[data-chain-post][role="link"]');if(target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();target.click();}});

$("#view-feed").addEventListener("change", (event) => { if (!event.target.matches(".nature-filter select")) return; state.natureFilter = event.target.value; renderFeed(); });
$("#global-search-input").addEventListener("keydown", async (event) => { if (event.key !== "Enter") return; event.preventDefault(); await runSearch(event.currentTarget.value); });
$("#global-search-input").addEventListener("input",event=>suggestSearch(event.currentTarget,$("#search-suggestions")));
$("#global-search-input").addEventListener("focus",event=>suggestSearch(event.currentTarget,$("#search-suggestions")));

$("#repost-page").addEventListener("click", async (event) => {
  if (event.target.closest("[data-repost-close]")) { await closeRepostPage(true); return; }
  const insert = event.target.closest("[data-repost-insert]");
  if (!insert) return;
  const input = $("#repost-form [name=content]"); const token = insert.dataset.repostInsert;
  const value = token === "#" ? "##" : "@";
  input.setRangeText(value, input.selectionStart, input.selectionEnd, token === "#" ? "select" : "end"); input.focus();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#repost-page").hidden) { event.preventDefault(); closeRepostPage(true); } });

$("#repost-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const message = $(".form-message", form); const submit = $(".repost-send", form);
  const nature = values.nature || "neutral"; message.textContent = "";
  if (nature !== "neutral" && !state.repostTargets.length) { message.textContent = "正面或负面转发必须选择至少1名影响对象"; $("#repost-target-search").focus(); return; }
  if (submit.disabled) return; submit.disabled = true; submit.textContent = "发送中";
  try {
    await api("repost", { method: "POST", body: { postId: values.postId, content: values.content || "", nature, targets: nature === "neutral" ? [] : state.repostTargets.map((item) => item.id), sourceLabel: sourceValue(form) } });
    await closeRepostPage(false); toast("已转发，本条转发将独立累计热度"); await refreshMe(); await loadAll(); switchTab("feed");
  } catch (error) { message.textContent = error.message; }
  finally { submit.disabled = false; submit.textContent = "发送"; }
});

$("#action-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const message = $(".form-message", form);
  const submit=$("#action-submit"); if(submit.disabled)return; submit.disabled=true;
  try {
    if (values.actionType === "promote") await api("promote", { method: "POST", body: { postId: values.postId, yuCoin: Number(values.yuCoin) }, idempotent: true });
    if (values.actionType === "cool") await api("cool", { method: "POST", body: { postId: values.postId }, idempotent: true });
    $("#action-dialog").close(); toast("操作已完成"); await refreshMe(); await loadAll();
  } catch (error) { message.textContent = error.message; }
  finally { submit.disabled=false; }
});

$("#image-dialog .image-close").addEventListener("click", () => $("#image-dialog").close());
$("#image-dialog .image-prev").addEventListener("click", () => stepImageViewer(-1));
$("#image-dialog .image-next").addEventListener("click", () => stepImageViewer(1));
$("#image-reset").addEventListener("click",()=>{state.imageViewer.scale=1;state.imageViewer.x=0;state.imageViewer.y=0;renderImageViewer();});
$("#image-download").addEventListener("click",()=>{const link=document.createElement("a");link.href=$("#image-download").dataset.url;link.download=`众声原图-${state.imageViewer.index+1}`;link.target="_blank";link.click();});
$("#image-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.addEventListener("keydown", (event) => { if (!$("#image-dialog").open) return; if (event.key === "ArrowLeft") stepImageViewer(-1); if (event.key === "ArrowRight") stepImageViewer(1); });
const imageStage=$("#image-stage"); let imageTouch={startX:0,lastX:0,lastY:0,lastTap:0,distance:0};
imageStage.addEventListener("wheel",event=>{event.preventDefault();state.imageViewer.scale=Math.max(1,Math.min(5,state.imageViewer.scale+(event.deltaY<0?.25:-.25)));renderImageViewer();},{passive:false});
imageStage.addEventListener("dblclick",()=>{state.imageViewer.scale=state.imageViewer.scale>1?1:2.5;state.imageViewer.x=0;state.imageViewer.y=0;renderImageViewer();});
imageStage.addEventListener("touchstart",event=>{if(event.touches.length===1){imageTouch.startX=imageTouch.lastX=event.touches[0].clientX;imageTouch.lastY=event.touches[0].clientY;const now=Date.now();if(now-imageTouch.lastTap<280){state.imageViewer.scale=state.imageViewer.scale>1?1:2.5;renderImageViewer();}imageTouch.lastTap=now;}if(event.touches.length===2)imageTouch.distance=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);},{passive:true});
imageStage.addEventListener("touchmove",event=>{if(event.touches.length===2){event.preventDefault();const distance=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);state.imageViewer.scale=Math.max(1,Math.min(5,state.imageViewer.scale*(distance/imageTouch.distance)));imageTouch.distance=distance;renderImageViewer();}else if(event.touches.length===1&&state.imageViewer.scale>1){event.preventDefault();state.imageViewer.x+=event.touches[0].clientX-imageTouch.lastX;state.imageViewer.y+=event.touches[0].clientY-imageTouch.lastY;imageTouch.lastX=event.touches[0].clientX;imageTouch.lastY=event.touches[0].clientY;renderImageViewer();}},{passive:false});
imageStage.addEventListener("touchend",event=>{if(!event.touches.length&&state.imageViewer.scale===1){const delta=(event.changedTouches[0]?.clientX||0)-imageTouch.startX;if(Math.abs(delta)>55)stepImageViewer(delta>0?-1:1);}});
$$('dialog').forEach(dialog=>dialog.addEventListener('close',restoreFocus));
$("#reply-dialog").addEventListener("close",()=>{captureReplyScroll();clearCommentMedia("reply");state.replyRootId=null;});

$("#avatar-input").addEventListener("change", async (event) => { const file = event.target.files[0]; if (file) await startAvatarCrop(file); });
$("#cover-input").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { event.target.value = ""; return toast("底图仅支持 JPG、PNG 或 WebP", "error"); } await startImageCrop(file,"cover"); });
$("[data-cover-reset]").addEventListener("click", () => { const form = $("#profile-form"); form.coverUrl.value = ""; $("#cover-input").value = ""; state.coverFile = null; if (state.coverPreviewUrl) URL.revokeObjectURL(state.coverPreviewUrl); state.coverPreviewUrl = ""; renderCoverPreview(""); });
$$('[data-crop-cancel]').forEach(button=>button.addEventListener("click", () => { if(state.avatarCrop?.kind==="cover")$("#cover-input").value="";else $("#avatar-input").value = "";state.avatarCrop=null;$("#avatar-crop-image").removeAttribute("src");$("#avatar-crop-dialog").close(); }));
$("[data-crop-confirm]").addEventListener("click", confirmAvatarCrop);
function setCropZoom(value){if(!state.avatarCrop)return;state.avatarCrop.zoom=Math.max(1,Math.min(4,Number(value)));$("#avatar-crop-zoom").value=String(state.avatarCrop.zoom);renderAvatarCrop();}
$("#avatar-crop-zoom").addEventListener("input", (event) => setCropZoom(event.target.value));
$("[data-crop-zoom-out]").addEventListener("click",()=>setCropZoom((state.avatarCrop?.zoom||1)-.15));
$("[data-crop-zoom-in]").addEventListener("click",()=>setCropZoom((state.avatarCrop?.zoom||1)+.15));
$("[data-crop-reset]").addEventListener("click",()=>{if(!state.avatarCrop)return;state.avatarCrop.x=0;state.avatarCrop.y=0;setCropZoom(1);});
const cropStage = $("#avatar-crop-stage");
cropStage.addEventListener("wheel",event=>{if(!state.avatarCrop)return;event.preventDefault();setCropZoom(state.avatarCrop.zoom+(event.deltaY<0?.08:-.08));},{passive:false});
cropStage.addEventListener("pointerdown", (event) => { if (!state.avatarCrop) return; state.avatarCrop.dragging = true; state.avatarCrop.pointerX = event.clientX; state.avatarCrop.pointerY = event.clientY; state.avatarCrop.startX = state.avatarCrop.x; state.avatarCrop.startY = state.avatarCrop.y; cropStage.setPointerCapture?.(event.pointerId); });
cropStage.addEventListener("pointermove", (event) => { const crop = state.avatarCrop; if (!crop?.dragging) return; crop.x = crop.startX + event.clientX - crop.pointerX; crop.y = crop.startY + event.clientY - crop.pointerY; renderAvatarCrop(); });
cropStage.addEventListener("pointerup", () => { if (state.avatarCrop) state.avatarCrop.dragging = false; });
cropStage.addEventListener("pointercancel", () => { if (state.avatarCrop) state.avatarCrop.dragging = false; });

$("#profile-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const submit = $(".primary-action", form); const wasLocked=$("#profile-dialog").dataset.locked==="true"; try { submit.disabled = true; const body = Object.fromEntries(new FormData(form)); const avatarFile = state.croppedAvatar?.blob; const coverFile = state.coverFile; if (avatarFile || coverFile) { submit.textContent = "正在上传图片"; const [avatarUpload, coverUpload] = await Promise.all([avatarFile ? uploadFile(avatarFile) : null, coverFile ? uploadFile(coverFile) : null]); if (avatarUpload) body.avatarUrl = avatarUpload.url; if (coverUpload) body.coverUrl = coverUpload.url; } state.me = await api("profile", { method: "POST", body }); $("#profile-dialog").dataset.locked="false"; $("#profile-dialog").close(); $("#avatar-input").value = ""; $("#cover-input").value = ""; if (state.croppedAvatar?.url) URL.revokeObjectURL(state.croppedAvatar.url); if (state.coverPreviewUrl) URL.revokeObjectURL(state.coverPreviewUrl); state.croppedAvatar = null; state.coverFile = null; state.coverPreviewUrl = ""; $("#avatar-file-name").textContent = "上传后可缩放和移动裁剪"; renderIdentity(); if(wasLocked)loadAll().catch(()=>{});else renderMine(); toast(wasLocked?"众声账号已开通":"个人资料已保存"); } catch (error) { $(".form-message", form).textContent = error.message; } finally { submit.disabled = false; submit.textContent = "保存资料"; } });

async function submitCommentForm(form, context) {
  const input=form.content;const submit=$("button[type=submit],button:not([type])",form);const content=input.value.trim();const mediaItem=state.commentMedia[context];
  if(!content&&!mediaItem){toast("请输入评论或添加一张图片","error");input.focus();return;}
  submit.disabled=true;captureReplyScroll();
  try{
    let media=[];if(mediaItem?.file){submit.textContent="上传中";media=[(await uploadFile(mediaItem.file)).url];}
    const parentId=input.dataset.parentId?Number(input.dataset.parentId):null;
    const optimistic={id:`temp-${Date.now()}`,content,parentId,media:mediaItem?[mediaItem.objectUrl]:[],sourceLabel:form.sourceLabel?.value||"众声网页版",likeCount:0,hotScore:0,createdAt:new Date().toISOString(),author:state.me,moderationStatus:"visible",viewer:{isAuthor:true,isPostAuthor:Boolean(state.activePost?.viewer?.isAuthor),liked:false}};
    state.activePost.comments.push(optimistic);$("#detail-discussion").innerHTML=renderDetailDiscussion("comments");if(context==="reply"&&state.replyRootId)openReplyThread(state.replyRootId,true);
    await api("comment",{method:"POST",body:{postId:state.activePost.id,content,parentId,sourceLabel:optimistic.sourceLabel,media}});
    input.value="";clearCommentMedia(context);await refreshCommentViews(context==="reply");await loadAll();
  }catch(error){toast(error.message,"error");await refreshCommentViews(context==="reply").catch(()=>{});}finally{submit.disabled=false;submit.textContent="评论";}
}

$("#post-dialog").addEventListener("submit", async (event) => {
  if (event.target.id === "response-form") { event.preventDefault(); const input=event.target.content;const submit=$("button",event.target);if(submit.disabled)return;submit.disabled=true; try { await api("respond",{method:"POST",body:{postId:state.activePost.id,content:input.value}}); toast("当事人回应已发布"); await openPost(state.activePost.id,false); } catch(error){toast(error.message,"error");}finally{submit.disabled=false;} return; }
  if (event.target.id !== "comment-form") return;
  event.preventDefault();await submitCommentForm(event.target,"post");
});

$("#reply-dialog").addEventListener("submit", async (event) => {
  if(event.target.id!=="comment-form")return;event.preventDefault();await submitCommentForm(event.target,"reply");
});

init();
