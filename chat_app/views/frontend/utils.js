/* ================= GLOBALS ================= */
window.currentRoomId = null;
window.skip = 0;
window.loadingHistory = false;
window.loadingFriends = false;
window.loadingAllUsers = false;
window.ALL_CHATS = [];
window.ALL_FRIENDS = [];
window.ALL_USERS = [];
window.limit = 50;
window.TYPING_DEBOUNCE = 3000;
window.currentChatTo = null;
window.typingTimer = null;
window.MINE_ID = null;
window.lastScrollTop = 0;
window.isSending = false;
window.roomTypingTimers = {};
window.renderedMessageIds = new Set();

window.socket = io(window.location.origin, { withCredentials: true, autoConnect: true });

/* ================ UTILITIES ================ */
window.getAvatar = function(u) {
  const DEFAULT = 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png';
  if (!u) return DEFAULT;
  return u.avatar?.trim() ? u.avatar : DEFAULT;
};

window.tryFetchJson = async function(endpoints = [], options = {}) {
  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, options);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok) {
        if (ct.includes('application/json')) {
          const errData = await res.json().catch(() => ({}));
          lastErr = new Error(errData.error || `HTTP ${res.status}`);
        } else { lastErr = new Error(`HTTP ${res.status}`); }
        continue;
      }
      if (ct.includes('application/json')) return await res.json();
      return JSON.parse(await res.text());
    } catch (err) { lastErr = err; }
  } 
  throw lastErr || new Error('Request failed');
};

window.formatZaloTime = function(createdAt) {
  if (!createdAt) return '';
  const t = new Date(createdAt), now = new Date();
  const hh = t.getHours().toString().padStart(2, '0'), mm = t.getMinutes().toString().padStart(2, '0');
  if (t.toDateString() === now.toDateString()) return `${hh}:${mm}`;
  const dd = t.getDate().toString().padStart(2, '0'), MM = (t.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${MM} ${hh}:${mm}`;
};

window.escapeHtml = function(text) {
  if (!text) return text;
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

window.showMainSection = function(id) {
    document.querySelectorAll('.main-content > section').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none'; 
    });
    const el = document.getElementById(id);
    if(el) { 
        el.style.display = 'flex'; 
        setTimeout(() => el.classList.add('active'), 10);
    }
};

window.applyBackground = function(url) {
    const main = document.querySelector('.main-content');
    if(main) { 
        main.style.backgroundImage = `url('${url}')`; 
        main.style.backgroundSize = 'cover'; 
    }
};

window.checkPasswordChangeHint = async function() {
    try {
        const u = await window.tryFetchJson(['/api/users/profile']);
        if(u.askChangePassword) document.getElementById('password-popup').style.display = 'flex';
    } catch(e){}
};

// ✅ CẬP NHẬT: Mặc định Dark Mode nếu chưa set
window.initTheme = function() {
    const theme = localStorage.getItem('theme');
    // Nếu theme là dark HOẶC chưa có theme (mặc định) -> Thêm class dark
    if (theme === 'dark' || !theme) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark'); // Lưu luôn trạng thái mặc định
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    // Init Ghost Mode (Ẩn danh)
    const status = localStorage.getItem('userStatus');
    if (status === 'offline') {
        document.body.classList.add('ghost-mode');
    } else {
        document.body.classList.remove('ghost-mode');
    }
};

window.initTheme();