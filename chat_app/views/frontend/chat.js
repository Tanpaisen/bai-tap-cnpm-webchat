/* ================= GLOBALS ================= */
let currentRoomId = null, skip = 0, loadingHistory = false, loadingFriends = false;
const limit = 50, TYPING_DEBOUNCE = 1000;
let currentChatTo = null, typingTimer = null, roomId = null, MINE_ID = null, lastScrollTop = 0;

const socket = io('http://localhost:3000', { withCredentials: true, autoConnect: true });

/* ================ UTILITIES ================ */
function getAvatar(u) {
  const DEFAULT = 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png';
  return u?.avatar?.trim() ? u.avatar : DEFAULT;
}

async function tryFetchJson(endpoints = [], options = {}) {
  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, options);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} ${ep}`); continue; }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) return await res.json();
      const text = await res.text();
      try { return JSON.parse(text); } catch { lastErr = new Error(`Not JSON from ${ep}`); }
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error('No endpoints succeeded');
}


function formatZaloTime(createdAt) {
  if (!createdAt) return '';
  const t = new Date(createdAt), now = new Date();
  const hh = t.getHours().toString().padStart(2, '0'), mm = t.getMinutes().toString().padStart(2, '0');
  if (t.toDateString() === now.toDateString()) return `${hh}:${mm}`;
  const dd = t.getDate().toString().padStart(2, '0'), MM = (t.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${MM} ${hh}:${mm}`;
}

/* ================ DOM SELECTORS ================ */
const inputWrapper = document.getElementById('chat-input-wrapper'),
  funcBtns = document.querySelectorAll('.menu-buttons button[data-func]'),
  friendListEl = document.getElementById('friend-list-chat'),
  friendListFullEl = document.getElementById('friend-list-friends'),
  allUsersListEl = document.getElementById('all-user-list') || document.getElementById('all-users-list') || document.getElementById('friend-list-full'),
  requestsListEl = document.getElementById('requests-list'),
  messagesEl = document.getElementById('messages'),
  headerEl = document.getElementById('chat-with'),
  inputEl = document.getElementById('message-input'),
  fileInputEl = document.getElementById('file-input'),
  sendBtnEl = document.getElementById('send-btn'),
  typingIndicator = document.getElementById('typing-indicator'),
  logoutBtn = document.getElementById('logout-btn'),
  profileAvatar = document.getElementById('profile-avatar'),
  avatarInput = document.getElementById('avatar-input'),
  avatarUploadBtn = document.getElementById('avatar-upload-btn'),
  profileNickname = document.getElementById('profile-nickname'),
  nicknameInput = document.getElementById('nickname-input'),
  nicknameUpdateBtn = document.getElementById('nickname-update-btn');
renderedMessageIds = new Set(),

  /* ================ INITIALIZATION ================ */
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      await loadSessionUser();
      attachUiEvents();
      // document.querySelector('[data-func="chat"]')?.click();
      const stored = sessionStorage.getItem('currentChatTo');
      if (stored) { sessionStorage.removeItem('currentChatTo'); await startChatWith(stored); }
    } catch (err) {
      console.error('Init error', err);
    }
  });

/* ================ UI / EVENTS ================ */
function showSection(id) {
  document.querySelectorAll('.main-content section').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function showProfilePanel() {
  const name = document.getElementById('chat-name').textContent;
  const avatar = document.getElementById('chat-avatar').src;

  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-avatar-preview').src = avatar;

  document.querySelector('.layout-3-col')?.classList.add('profile-open');
}



function handleSidebarClick() {
  const buttons = document.querySelectorAll('.menu-buttons button[data-func]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const func = btn.dataset.func;

      // Reset trạng thái
      document.querySelectorAll('.menu-buttons button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.list-section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.main-content section').forEach(s => s.classList.remove('active'));
      document.getElementById('section-welcome')?.classList.remove('active');


      // Hiển thị đúng phần
      if (func === 'chat') {
        document.getElementById('list-chat')?.classList.add('active');
        showSection('section-chat');
      }

      if (func === 'friends') {
        document.getElementById('list-friends')?.classList.add('active');
        showSection('section-friends');

        // Đặt menu con mặc định
        document.querySelectorAll('#friend-menu li').forEach(x => x.classList.remove('active'));
        document.querySelector('#friend-menu li[data-menu="friends"]')?.classList.add('active');

        loadFriends(true);
      }

      if (func === 'groups') {
        document.getElementById('list-groups')?.classList.add('active');
        showSection('section-groups');
      }

      if (func === 'profile') {
        showSection('section-profile');
        loadProfile();
      }
    });
  });
}


function attachUiEvents() {
  // Menu buttons
  handleSidebarClick();

  document.getElementById('friend-menu')?.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;

    const menu = li.dataset.menu;

    // Đổi active cho menu
    document.querySelectorAll('#friend-menu li').forEach(x => x.classList.remove('active'));
    li.classList.add('active');

    // Ẩn tất cả section
    showSection(`section-${menu}`);

    // Hiện section tương ứng
    if (menu === 'friends') {
      loadFriends(true);
      showSection('section-friends');
    } else if (menu === 'requests') {
      loadRequests();
      showSection('section-requests');
    } else if (menu === 'all-user') {
      loadAllUsers();
      showSection('section-all-users');
    }
  });


  friendListFullEl?.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const id = li.dataset.id;
    const name = li.querySelector('span')?.textContent || 'Bạn';
    const avatar = li.querySelector('img')?.src || "https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png";

    document.getElementById('chat-name').textContent = name;
    document.getElementById('chat-avatar').src = avatar;

    startChatWith(id);
    friendListFullEl.querySelectorAll('li').forEach(x => x.classList.remove('active'));
    li.classList.add('active');
  });

  document.getElementById('close-profile-btn')?.addEventListener('click', () => {
    document.querySelector('.layout-3-col')?.classList.remove('profile-open');
  });


  document.getElementById('back-btn')?.addEventListener('click', () => {
    currentChatTo = null;
    document.getElementById('section-chat')?.classList.remove('active');
    document.getElementById('section-welcome')?.classList.add('active');
    document.querySelector('.main-content')?.classList.remove('profile-open');
  });


  document.getElementById('video-call-btn')?.addEventListener('click', () => {
    if (!currentChatTo) return alert('Chọn người để gọi trước đã!');
    alert('Đang gọi video tới: ' + document.getElementById('chat-name').textContent);
    // TODO: Tích hợp WebRTC hoặc mở popup gọi video ở đây
  });


  // Friend click
  friendListEl?.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    const id = li.dataset.id; if (!id || id === currentChatTo) return;
    friendListEl.querySelectorAll('li').forEach(x => x.classList.remove('active')); li.classList.add('active');
    const name = li.querySelector('span')?.textContent || 'Bạn';
    const avatar = li.querySelector('img')?.src || "https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png";

    document.getElementById('section-welcome')?.classList.remove('active');
    showSection('section-chat');

    document.getElementById('chat-name').textContent = name;
    document.getElementById('chat-avatar').src = avatar;

    startChatWith(id);
  });

  // Khi click vào lời mời → hiển thị chi tiết lời mời
  requestsListEl?.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const name = li.querySelector('span')?.textContent || 'Người dùng';
    document.getElementById('request-details').textContent = 'Lời mời từ: ' + name;
    showSection('section-requests');
  });

  // Khi click vào người dùng → hiển thị chi tiết người dùng
  allUsersListEl?.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const name = li.querySelector('span')?.textContent || 'Người dùng';
    document.getElementById('user-details').textContent = 'Thêm bạn: ' + name;
    showSection('section-all-users'); // sửa lại đúng ID
  });

  // Send message
  sendBtnEl?.addEventListener('click', sendMessage);

  // Input behavior
  if (inputEl) {
    let lastEnterTime = 0, ENTER_THRESHOLD = 1000;
    inputEl.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const now = Date.now(), isDouble = now - lastEnterTime < ENTER_THRESHOLD;
      lastEnterTime = now;
      if (isDouble) { sendMessage(); lastEnterTime = 0; }
      else { const s = inputEl.selectionStart, t = inputEl.selectionEnd; inputEl.value = inputEl.value.slice(0, s) + '\n' + inputEl.value.slice(t); inputEl.setSelectionRange(s + 1, s + 1); }
    });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto'; inputEl.style.height = inputEl.scrollHeight + 'px';
      if (!socket.connected || !currentChatTo) return;
      if (typingTimer) clearTimeout(typingTimer);
      socket.emit('typing', { to: currentChatTo, roomId });
      typingTimer = setTimeout(() => { socket.emit('stopTyping', { to: currentChatTo, roomId }); }, TYPING_DEBOUNCE);
    });
  }

  // File input change preview optional
  fileInputEl?.addEventListener('change', () => { });

  // Avatar upload
  avatarInput?.addEventListener('change', () => { profileAvatar.src = URL.createObjectURL(avatarInput.files[0]); });
  avatarUploadBtn?.addEventListener('click', async () => {
    const f = avatarInput.files?.[0]; if (!f) return alert('Chọn ảnh trước');
    const form = new FormData(); form.append('avatar', f);
    try {
      const res = await fetch('/api/users/update-avatar', { method: 'POST', body: form, credentials: 'same-origin' });
      const data = await res.json();
      if (!data.success || !data.avatar) throw new Error('Upload thất bại');
      profileAvatar.src = data.avatar; alert('Avatar đã cập nhật');
    } catch (err) { console.error('avatar upload', err); alert('Upload thất bại'); }
  });

  // Update nickname
  nicknameUpdateBtn?.addEventListener('click', async () => {
    const newNick = nicknameInput?.value?.trim();
    if (!newNick) return alert('Nhập nickname mới');

    try {
      const res = await fetch('/api/users/update-nickname', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: newNick })
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { success: res.ok ? true : false, raw: text }; }

      if (!res.ok) {
        console.error('Nickname API non-200', res.status, data);
        return alert(data.error || `Lỗi server ${res.status}`);
      }

      if (data.success) {
        if (profileNickname) profileNickname.textContent = newNick;
        alert('Nickname đã cập nhật');
      } else {
        console.error('Nickname update failed', data);
        alert(data.error || 'Cập nhật thất bại');
      }
    } catch (err) {
      console.error('Network or JS error updating nickname', err);
      alert('Lỗi kết nối hoặc lỗi nội bộ');
    }
  });


  // Logout
  logoutBtn?.addEventListener('click', async () => { try { await fetch('/logout', { method: 'POST', credentials: 'same-origin' }); } catch { } location.href = '/login'; });

  // Scroll handler
  messagesEl?.addEventListener('scroll', () => {
    const scrollTop = messagesEl.scrollTop;
    const atTop = scrollTop === 0;
    const gap = messagesEl.scrollHeight - messagesEl.clientHeight - scrollTop;

    inputWrapper?.classList.toggle('hide', scrollTop > lastScrollTop + 10);
    if (scrollTop < lastScrollTop - 10 || gap > 100) inputWrapper?.classList.remove('hide');

    lastScrollTop = scrollTop;

    if (atTop && !loadingHistory) {
      loadingHistory = true;
      safeLoadHistory(true).finally(() => loadingHistory = false);
    }
  });

}

/* ================ PROFILE / SESSION ================ */
async function loadProfile() {
  try {
    const user = await tryFetchJson(['/api/users/profile']);
    profileAvatar && (profileAvatar.src = user.avatar);
    profileNickname && (profileNickname.textContent = user.nickname || 'Không tên');
    nicknameInput && (nicknameInput.value = user.nickname || '');
  } catch (err) { console.error('loadProfile', err); if (String(err.message).includes('401')) location.href = '/login'; }
}

async function loadSessionUser() {
  try {
    const user = await tryFetchJson(['/api/users/profile']);
    if (!user) return location.href = '/login';
    if (!user.nickname?.trim()) return location.href = '/setup-nickname';
    MINE_ID = user._id || user.id;
    profileAvatar && (profileAvatar.src = user.avatar);
    profileNickname && (profileNickname.textContent = user.nickname);
    await loadFriends();
  } catch (err) { console.error('loadSessionUser', err); if (String(err.message).includes('401')) location.href = '/login'; }
}

/* ================ FRIENDS / USERS / REQUESTS ================ */
async function loadFriends(full = false) {
  if (loadingFriends) return; loadingFriends = true;
  try {
    const arr = await tryFetchJson(['/api/friends', '/api/friends/list', '/api/friends/'], { credentials: 'same-origin' });
    if (!Array.isArray(arr)) { console.warn('Không nhận được danh sách bạn bè'); return; }
    friendListEl && (friendListEl.innerHTML = '');
    const seen = new Set();
    const uniqueFriends = arr.filter(u => { const id = u.id || u._id || ''; if (seen.has(id)) return false; seen.add(id); return true; });
    if (uniqueFriends.length === 0) { friendListEl && (friendListEl.innerHTML = '<li>Không có bạn nào</li>'); return; }

    uniqueFriends.forEach(u => {
      const id = u.id || u._id || '';
      const li = document.createElement('li'); li.dataset.id = id;
      li.innerHTML = `<img src="${getAvatar(u)}" class="avatar-sm"/><span>${u.nickname || 'Không tên'}</span><button class="unfriend-btn">Hủy kết bạn</button>`;
      friendListEl?.appendChild(li);
      li.querySelector('.unfriend-btn')?.addEventListener('click', () => removeFriend(id, li));
    });

    if (full && friendListFullEl) {
      friendListFullEl.innerHTML = '';
      uniqueFriends.forEach(u => {
        const id = u.id || u._id || '';
        const li = document.createElement('li'); li.dataset.id = id;
        li.innerHTML = `<img src="${getAvatar(u)}" class="avatar-sm"/><span>${u.nickname || 'Không tên'}</span><button class="unfriend-btn">Hủy kết bạn</button>`;
        friendListFullEl.appendChild(li);
      });
    }
  } catch (err) { console.error('loadFriends', err); }
  finally { loadingFriends = false; }
}

async function loadAllUsers() {
  try {
    const users = await tryFetchJson(['/api/friends/all', '/api/friends/all-users', '/api/friends/allUsers'], { credentials: 'same-origin' });
    if (!Array.isArray(users)) { allUsersListEl.innerHTML = '<li>Không có người dùng nào</li>'; return; }
    if (!allUsersListEl) return;
    allUsersListEl.innerHTML = '';
    users.forEach(u => {
      const id = u.id || u._id || '';
      const li = document.createElement('li');
      li.dataset.id = id;
      const btnLabel = u.status === 'none' ? 'Kết bạn' : u.status === 'pending' ? 'Đang chờ' : u.status === 'incoming' ? 'Chấp nhận' : 'Bạn bè';
      li.innerHTML = `<img src="${getAvatar(u)}" class="avatar-sm"/><span>${u.nickname}</span><button class="action-btn">${btnLabel}</button>`;
      const btn = li.querySelector('.action-btn');
      if (btn) {
        if (u.status === 'incoming') btn.addEventListener('click', () => respondRequest(u.reqId || u.requestId, 'accept', btn));
        else if (u.status === 'none') btn.addEventListener('click', () => sendRequest(id, btn));
        else btn.disabled = true;
      }
      allUsersListEl.appendChild(li);
    });
  } catch (err) {
    console.error('loadAllUsers', err);
  }
}

async function loadRequests() {
  try {
    const arr = await tryFetchJson(['/api/friends/requests'], { credentials: 'same-origin' });
    if (!Array.isArray(arr)) return;
    if (!requestsListEl) return;
    requestsListEl.innerHTML = '';
    arr.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `<img src="${getAvatar(r)}" class="avatar-sm"/><span>${r.nickname}</span>
        <button class="accept-btn">Chấp nhận</button>
        <button class="reject-btn">Từ chối</button>`;
      li.querySelector('.accept-btn')?.addEventListener('click', () => respondRequest(r.reqId, 'accept', li.querySelector('.accept-btn')));
      li.querySelector('.reject-btn')?.addEventListener('click', () => respondRequest(r.reqId, 'reject', li.querySelector('.reject-btn')));
      requestsListEl.appendChild(li);
    });
  } catch (err) {
    console.error('loadRequests', err);
  }
}

async function sendRequest(toId, btn) {
  try {
    const res = await fetch('/api/friends/send', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toId })
    });
    const data = await res.json();
    if (data.success && btn) { btn.textContent = 'Đang chờ'; btn.disabled = true; }
  } catch (err) {
    console.error('sendRequest', err);
  }
}

async function respondRequest(reqId, action, btn) {
  try {
    const res = await fetch('/api/friends/requests/respond', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: reqId, action })
    });
    const data = await res.json();
    if (data.success && btn) { btn.textContent = action === 'accept' ? 'Đã chấp nhận' : 'Đã từ chối'; btn.disabled = true; }
    await loadRequests();
    await loadFriends(true);
  } catch (err) {
    console.error('respondRequest', err);
  }
}

function renderUserList(users, container, showUnfriend = false) {
  container.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.dataset.id = u.id || u._id;
    li.innerHTML = `<img src="${getAvatar(u)}" class="avatar-sm"/><span>${u.nickname}</span>`;
    if (showUnfriend) li.innerHTML += '<button class="unfriend-btn">Hủy kết bạn</button>';
    container.appendChild(li);
  });
}


/* ================ CHAT HISTORY / MESSAGES ================ */
async function startChatWith(userId) {
  if (!MINE_ID || !userId) return;
  const newRoomId = [MINE_ID, userId].sort().join('_');
  if (newRoomId === currentRoomId) return;

  currentChatTo = userId;
  roomId = newRoomId;
  currentRoomId = newRoomId;
  skip = 0;

  if (messagesEl) messagesEl.innerHTML = '';
  if (inputWrapper) {
    inputWrapper.classList.remove('hide');
    inputWrapper.style.display = 'flex';
  }
  if (inputEl) {
    inputEl.value = '';
    inputEl.focus();
  }

  socket.emit('joinRoom', roomId);

  await loadHistory(false);

  // ✅ Đợi DOM render xong rồi mới cuộn
  setTimeout(() => {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }, 50);
}



async function loadHistory(prepend = false) {
  if (!roomId || !currentChatTo) return;
  try {
    const url = `/api/chat/history?user1=${MINE_ID}&user2=${currentChatTo}&limit=${limit}&skip=${skip}`;
    const arr = await tryFetchJson([url], { credentials: 'same-origin' });
    if (!Array.isArray(arr) || !arr.length) return;

    const seen = new Set();
    const list = arr
      .filter(m => {
        if (seen.has(m._id)) return false;
        seen.add(m._id);
        return true;
      })
      .reverse();

    const container = document.createDocumentFragment();
    let lastDate = null;

    for (const m of list) {
      const dstr = new Date(m.createdAt).toLocaleDateString('vi-VN');
      if (dstr !== lastDate) {
        lastDate = dstr;
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.innerText = dstr;
        container.appendChild(sep);
      }

      const sid = typeof m.sender === 'string' ? m.sender : (m.sender?._id || m.sender?.id);
      const isMine = String(sid) === String(MINE_ID);

      appendMessage({
        _id: m._id,
        senderAvatar: isMine ? profileAvatar?.src : getAvatar(m.sender),
        senderOnline: m.sender?.online,
        content: m.content,
        file: m.image || m.file,
        createdAt: m.createdAt
      }, isMine, container);
    }

    if (prepend) messagesEl.prepend(container);
    else messagesEl.appendChild(container);

    skip += list.length;

    if (inputWrapper) {
      inputWrapper.classList.remove('hide');
      inputWrapper.style.display = 'flex';
    }
  } catch (err) {
    console.error('loadHistory', err);
  }
}


/* ================ MESSAGE BUILD / SEND ================ */
function appendMessage(data, self = false, container = messagesEl) {
  if (!container || !data || !data._id) return;
  if (renderedMessageIds.has(data._id)) return; // ✅ bỏ qua nếu đã render
  renderedMessageIds.add(data._id);

  const node = buildMessageNode(data, self);
  container.appendChild(node);
}


function buildMessageNode({ senderAvatar, senderOnline, content, file, createdAt }, self) {
  const div = document.createElement('div');
  div.className = 'message' + (self ? ' self' : '');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (content) {
    const p = document.createElement('p');
    p.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
    bubble.appendChild(p);
  }

  if (file) {
    let fileNode;
    if (/\.(jpe?g|png|gif|webp)$/i.test(file)) {
      fileNode = document.createElement('img');
      fileNode.src = file;
      fileNode.className = 'chat-image';
    } else {
      fileNode = document.createElement('a');
      fileNode.href = file;
      fileNode.target = '_blank';
      fileNode.className = 'file-link';
      fileNode.innerHTML = '<i class="fa-solid fa-link"></i> Tệp đính kèm';
    }
    bubble.appendChild(fileNode);
  }

  const timeSpan = document.createElement('span');
  timeSpan.className = 'time';
  timeSpan.textContent = formatZaloTime(createdAt);
  bubble.appendChild(timeSpan);

  // Avatar wrapper
  const avatarWrapper = document.createElement('div');
  avatarWrapper.className = 'avatar-wrapper';
  const img = document.createElement('img');
  img.src = senderAvatar || getAvatar();
  img.className = 'avatar-sm';
  avatarWrapper.appendChild(img);

  if (senderOnline) {
    const online = document.createElement('span');
    online.className = 'online-indicator';
    avatarWrapper.appendChild(online);
  }

  div.appendChild(avatarWrapper);
  div.appendChild(bubble);

  return div;
}


function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function sendMessage() {
  if (!currentChatTo || !roomId) { alert('Chọn bạn để chat trước'); return; }
  const raw = inputEl?.value?.replace(/[\s\n]+$/g, '') || '';
  const text = raw.split('\n').map(l => l.trim()).join('\n');
  const files = fileInputEl?.files || [];
  if (!text && files.length === 0) return;

  let fileUrl = null;
  if (files.length) {
    const f = files[0];
    const api = f.type.startsWith('image/') ? '/api/upload/image' : '/api/upload/file';
    const form = new FormData();
    form.append(f.type.startsWith('image/') ? 'image' : 'file', f);
    try {
      const res = await fetch(api, { method: 'POST', credentials: 'same-origin', body: form });
      const d = await res.json();
      if (!d.success || !d.url) throw new Error('Upload thất bại');
      fileUrl = d.url;
    } catch (err) {
      console.error('upload', err);
      return alert('Upload thất bại');
    }
  }

  const payload = { receiver: currentChatTo, roomId, text, file: fileUrl };
  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Save failed');
    const savedMsg = await res.json();

    // Append locally (đảm bảo có _id)
    appendMessage({
      _id: savedMsg._id,
      senderAvatar: savedMsg.sender?.avatar || profileAvatar?.src,
      senderOnline: savedMsg.sender?.online ?? true,
      content: savedMsg.content,
      file: savedMsg.file,
      createdAt: savedMsg.createdAt
    }, true);

    messagesEl.scrollTop = messagesEl.scrollHeight;

    // NOTE: không emit socket ở đây nữa (xóa socket.emit)
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; inputEl.focus(); }
    if (fileInputEl) fileInputEl.value = '';
  } catch (err) {
    console.error('sendMessage', err);
    alert('Gửi tin nhắn thất bại');
  }
}


/* ================ SOCKET EVENTS ================ */
socket.on('connect', () => {
  console.log('socket connected', socket.id);
  // rejoin current room if any
  if (roomId) socket.emit('joinRoom', roomId);
});
socket.on('disconnect', reason => console.log('socket disconnected', reason));

// show typing indicator when server emits
const typingTimers = {}; // key = roomId
socket.on('typing', data => {
  if (!typingIndicator) return;
  typingIndicator.style.display = 'block';
  if (typingTimers[data.roomId]) clearTimeout(typingTimers[data.roomId]);
  typingTimers[data.roomId] = setTimeout(() => {
    typingIndicator.style.display = 'none';
    delete typingTimers[data.roomId];
  }, 1200);
});


socket.on('stopTyping', () => {
  if (typingIndicator) typingIndicator.style.display = 'none';
});

socket.on('newMessage', msg => {
  try {
    if (!msg || !msg.sender || !msg.roomId) return;

    // Chỉ xử lý nếu đang ở đúng phòng
    if (msg.roomId !== roomId) return;

    // Bỏ qua tin của chính mình
    const sid = msg.sender._id || msg.sender.id;
    if (String(sid) === String(MINE_ID)) return;

    // Hiển thị tin nhắn
    appendMessage({
      _id: msg._id,
      senderAvatar: getAvatar(msg.sender),
      senderOnline: msg.sender.online,
      content: msg.content,
      file: msg.image || msg.file,
      createdAt: msg.createdAt
    }, false);

    // Cuộn xuống cuối
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  } catch (err) {
    console.error('socket newMessage', err);
  }
});



/* ================ PASSWORD POPUP / MODAL ================ */

// Kiểm tra xem user có cần đổi mật khẩu hay không
async function checkPasswordChangeHint() {
  try {
    const data = await tryFetchJson(['/api/users/profile']);
    if (data?.askChangePassword) {
      const popup = document.getElementById('change-password-popup');
      if (popup) popup.style.display = 'block';
    }
  } catch (err) {
    console.error('checkPasswordChangeHint', err);
  }
}
checkPasswordChangeHint();

// Mở modal đổi mật khẩu
function goToChangePassword() {
  const popup = document.getElementById('change-password-popup');
  const modal = document.getElementById('change-password-modal');
  if (popup) popup.style.display = 'none';
  if (modal) modal.style.display = 'block';
}

// Đóng modal đổi mật khẩu và reset input + message
function closePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.style.display = 'none';
  const msg = document.getElementById('password-msg');
  if (msg) { msg.textContent = ''; msg.style.color = ''; }
  const oldInput = document.getElementById('old-password'); if (oldInput) oldInput.value = '';
  const newInput = document.getElementById('new-password'); if (newInput) newInput.value = '';
}

// Submit đổi mật khẩu
async function submitPasswordChange() {
  const oldPass = document.getElementById('old-password')?.value.trim();
  const newPass = document.getElementById('new-password')?.value.trim();
  const msg = document.getElementById('password-msg');

  if (!oldPass || !newPass) {
    if (msg) { msg.style.color = '#d00'; msg.textContent = 'Vui lòng nhập đầy đủ thông tin.'; }
    return;
  }

  try {
    const res = await fetch('/api/users/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
    });
    const data = await res.json();

    if (data.success) {
      if (msg) { msg.style.color = '#0068ff'; msg.textContent = 'Đổi mật khẩu thành công!'; }
      setTimeout(closePasswordModal, 1500);
    } else {
      if (msg) { msg.style.color = '#d00'; msg.textContent = data.error || 'Có lỗi xảy ra.'; }
    }
  } catch (e) {
    console.error('changePass', e);
    if (msg) { msg.style.color = '#d00'; msg.textContent = 'Lỗi'; }
  }
}

// Hoãn yêu cầu đổi mật khẩu (nếu user click "Nhắc sau")
async function postponeChange() {
  try {
    await fetch('/api/users/postpone-password-change', { method: 'POST' });
    const popup = document.getElementById('change-password-popup');
    if (popup) popup.style.display = 'none';
  } catch (e) {
    console.error('postponeChange', e);
  }
}

/* ================ SAFE HELPERS ================ */
// call loadHistory only when safe
async function safeLoadHistory(prepend = false) {
  if (!roomId || !currentChatTo || !messagesEl || messagesEl.scrollHeight === 0) return;
  try {
    await loadHistory(prepend);
  } catch (err) {
    console.error('safeLoadHistory', err);
  }
}

async function removeFriend(targetId, li) {
  if (!confirm('Bạn có chắc muốn hủy kết bạn?')) return;
  try {
    const res = await fetch('/api/friends/remove', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId })
    });
    const data = await res.json();
    if (data.success) {
      li.remove(); // Xóa khỏi danh sách UI
      alert('Đã hủy kết bạn');
    } else {
      alert(data.error || 'Hủy kết bạn thất bại');
    }
  } catch (err) {
    console.error('removeFriend', err);
    alert('Lỗi khi hủy kết bạn');
  }
}
