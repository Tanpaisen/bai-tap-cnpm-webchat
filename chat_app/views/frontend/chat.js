/* ================= GLOBALS ================= */
let currentRoomId = null, skip = 0, loadingHistory = false, loadingFriends = false;
const limit = 50, TYPING_DEBOUNCE = 1500;
let currentChatTo = null, typingTimer = null, MINE_ID = null, lastScrollTop = 0, seen = false, roomTypingTimers = {};
let renderedMessageIds = new Set();
const socket = io('http://localhost:3000', { withCredentials: true, autoConnect: true });

/* ================ UTILITIES ================ */
function getAvatar(u) {
  const DEFAULT = 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png';
  if (!u) return DEFAULT;
  return u?.avatar?.trim() ? u.avatar : DEFAULT;
}

async function tryFetchJson(endpoints = [], options = {}) {
  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, options);

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const isJson = ct.includes('application/json');

      if (!res.ok) {
        // 💡 Tối ưu: Nếu non-OK, cố gắng lấy JSON lỗi
        if (isJson) {
          const errorData = await res.json().catch(() => ({}));
          lastErr = new Error(`HTTP ${res.status} ${ep}: ${errorData.error || 'Unknown Server Error'}`);
        } else {
          lastErr = new Error(`HTTP ${res.status} ${ep}`);
        }
        continue;
      }

      // Nếu OK và là JSON
      if (isJson) return await res.json();

      // Trường hợp còn lại: OK nhưng không phải JSON (rất hiếm)
      const text = await res.text();
      try { return JSON.parse(text); } catch { lastErr = new Error(`Not JSON from ${ep}`); }
    } catch (err) { lastErr = err; }
  } throw lastErr || new Error('No endpoints succeeded');
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
  typingIndicatorContainer = document.getElementById('typing-indicator-container'),
  logoutBtn = document.getElementById('logout-btn'),
  profileAvatar = document.getElementById('profile-avatar'),
  avatarInput = document.getElementById('avatar-input'),
  avatarUploadBtn = document.getElementById('avatar-upload-btn'),
  profileNickname = document.getElementById('profile-nickname'),
  nicknameInput = document.getElementById('nickname-input'),
  nicknameUpdateBtn = document.getElementById('nickname-update-btn'),
  passwordPopup = document.getElementById('change-password-popup'),
  passwordModal = document.getElementById('change-password-modal'),
  oldPasswordInput = document.getElementById('old-password'),
  newPasswordInput = document.getElementById('new-password'),
  passwordMsg = document.getElementById('password-msg');

/* ================ INITIALIZATION ================ */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSessionUser();
    // 💡 Kích hoạt kiểm tra yêu cầu đổi mật khẩu ngay sau khi xác thực thành công
    checkPasswordChangeHint();
    attachUiEvents();
    // document.querySelector('[data-func="chat"]')?.click();
    const stored = sessionStorage.getItem('currentChatTo');
    if (stored) { sessionStorage.removeItem('currentChatTo'); await startChatWith(stored); }
  } catch (err) {
    console.error('Init error', err);
    // Nếu loadSessionUser không xử lý được (lỗi mạng, v.v.), ta vẫn có thể chuyển hướng.
    if (String(err.message).includes('401')) {
      location.href = '/login';
    }
  }
});

/* ================ UI / EVENTS ================ */
function showSection(id) {
  document.querySelectorAll('.main-content section').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// Close profile overlay khi click nút ×
function closeProfileOverlay() {
  const profileOverlay = document.getElementById('chat-profile');
  profileOverlay?.classList.remove('active');
  document.querySelector('.main-content')?.classList.remove('profile-open');
}


function handleSidebarClick() {
  const buttons = document.querySelectorAll('.menu-buttons button[data-func]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const func = btn.dataset.func;

      // Xóa active trên tất cả các nút
      document.querySelectorAll('.menu-buttons button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Xóa active trên tất cả các list và section chính (để tránh trùng lặp với showSection)
      document.querySelectorAll('.list-section').forEach(s => s.classList.remove('active'));
      document.getElementById('section-welcome')?.classList.remove('active');

      // ----------------------------------------------------------------------
      // LƯU Ý: showSection sẽ tự xóa active của các section nội dung, nên ta chỉ
      // cần gọi showSection và quản lý các list section.
      // ----------------------------------------------------------------------

      if (func === 'chat') {
        document.getElementById('list-chat')?.classList.add('active');

        // [SỬA ĐỔI QUAN TRỌNG] Khôi phục trạng thái chat cuối cùng
        if (currentChatTo && currentRoomId) {
          // Nếu đang chat với ai đó, hiển thị lại cửa sổ chat (section-chat)
          console.log('✅ Sidebar Click: Đã khôi phục chat. Room ID:', currentRoomId);
          showSection('section-chat');

          // Đảm bảo client join lại phòng để nhận tin nhắn real-time
          socket.emit('joinRoom', currentRoomId);

          // Tải lại danh sách bạn bè/chat để cập nhật (giữ nguyên logic loadFriends cũ)
          loadFriends(true);
        } else {
          // Nếu chưa chọn ai, hiển thị màn hình chào mừng
          console.log('❌ Sidebar Click: Không tìm thấy chat cũ, hiển thị welcome.');
          showSection('section-welcome');
          loadFriends(true);
        }
      }
      else if (func === 'friends') {
        document.getElementById('list-friends')?.classList.add('active');
        showSection('section-friends');
        // Đảm bảo tab bạn bè đang hoạt động
        document.querySelectorAll('#friend-menu li').forEach(x => x.classList.remove('active'));
        document.querySelector('#friend-menu li[data-menu="friends"]')?.classList.add('active');
        // Tải danh sách bạn bè
        loadFriends(true);

      }
      else if (func === 'groups') {
        document.getElementById('list-groups')?.classList.add('active');
        showSection('section-groups');
      }
      else if (func === 'profile') {
        showSection('section-profile');
        loadProfile();
      }
    });
  });
}

function handleTypingInput() {
  // Không cần log và điều kiện kiểm tra (if) nếu bạn đã debug xong
  if (!inputEl) return;

  // ✅ 1. Tự động điều chỉnh chiều cao input
  inputEl.style.height = 'auto';
  inputEl.style.height = inputEl.scrollHeight + 'px';

  const text = inputEl.value.trim();

  // Dùng optional chaining để tránh crash nếu biến chưa kịp khởi tạo
  const roomId = currentRoomId;
  const chatTo = currentChatTo;

  // Nếu chưa có Room/Chat ID, không thể gửi sự kiện socket. Dừng ở đây.
  if (!roomId || !chatTo) {
    // Dọn dẹp timer nếu có, để tránh timeout gửi stopTyping sau này
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = null;
    return;
  }

  // 2. Xóa timeout cũ (nếu có)
  if (typingTimer) {
    clearTimeout(typingTimer);
  }

  // 3. Nếu không còn văn bản (text rỗng), DỪNG GÕ NGAY LẬP TỨC
  if (text === '') {
    console.log('Typing Action: Stop Typing (Empty Text) - SENT');
    socket.emit('stopTyping', { roomId: roomId, to: chatTo });
    typingTimer = null;
    return;
  }

  // 4. Nếu vẫn còn văn bản (text KHÔNG rỗng)
  console.log('Typing Action: Send Typing (Text present) - SENT');

  socket.emit('typing', { roomId: roomId, to: chatTo });

  // Thiết lập timeout mới
  typingTimer = setTimeout(() => {
    console.log('Typing Action: Stop Typing (Timeout) - SENT');
    socket.emit('stopTyping', { roomId: roomId, to: chatTo });
    typingTimer = null;
  }, TYPING_DEBOUNCE);
}

function attachUiEvents() {
  handleSidebarClick();

  const openProfileHandler = async (userId) => {
    // 1. Kiểm tra ID người dùng
    if (!userId) return;

    try {
      // 2. Gọi API lấy thông tin người dùng
      // tryFetchJson xử lý việc gọi fetch, kiểm tra status (404/401), và parse JSON
      const user = await tryFetchJson([`/api/users/${userId}`], { credentials: 'include' });

      // 3. Kiểm tra dữ liệu hợp lệ
      if (!user || !user._id) {
        throw new Error('Không nhận được thông tin người dùng hợp lệ');
      }

      // 4. Điền thông tin vào overlay
      document.getElementById('profile-name').textContent = user.nickname || user.username || 'Không tên';
      document.getElementById('profile-avatar-preview').src = getAvatar(user) || '/default-avatar.png';

      // 5. Hiển thị các nút chức năng (nếu có)

      document.getElementById('profile-actions').style.ddisplay = 'block';

      // 6. Mở overlay profile
      const profileOverlay = document.getElementById('chat-profile');
      profileOverlay?.classList.add('active');
      document.querySelector('.main-content')?.classList.add('profile-open');
    } catch (err) {
      // 7. Xử lý lỗi
      console.error('Lỗi lấy profile:', err);
      alert('Không lấy được thông tin người dùng. Lỗi: ' + (err.message || 'Lỗi mạng/server'));
    }
  };


  /* --- CONSOLIDATED PROFILE OVERLAY LOGIC (ĐÃ SỬA LỖI TRÙNG LẶP) --- */

  // Click avatar/tên mở profile
  document.getElementById('chat-avatar')?.addEventListener('click', () => {
    if (!currentChatTo) return;
    openProfileHandler(currentChatTo);
  });

  document.getElementById('chat-name')?.addEventListener('click', () => {
    if (!currentChatTo) return;
    openProfileHandler(currentChatTo);
  });

  // Click nút × đóng overlay
  document.getElementById('close-profile-btn')?.addEventListener('click', closeProfileOverlay);

  // Click bên ngoài overlay đóng
  document.addEventListener('click', (e) => {
    const profileOverlay = document.getElementById('chat-profile');
    const chatAvatar = document.getElementById('chat-avatar');
    const chatName = document.getElementById('chat-name');

    if (!profileOverlay?.classList.contains('active')) return;

    // Kiểm tra click có nằm trong overlay, avatar, hoặc tên chat không
    const isClickInside = profileOverlay.contains(e.target) ||
      chatAvatar?.contains(e.target) ||
      chatName?.contains(e.target);

    if (!isClickInside) {
      closeProfileOverlay();
    }
  });

  /* --- END PROFILE LOGIC --- */


  // Friend menu sub-section
  document.getElementById('friend-menu')?.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const menu = li.dataset.menu;
    document.querySelectorAll('#friend-menu li').forEach(x => x.classList.remove('active'));
    li.classList.add('active');

    if (menu === 'friends') { loadFriends(true); showSection('section-friends'); }
    else if (menu === 'requests') { loadRequests(); showSection('section-requests'); }
    else if (menu === 'all-user') { loadAllUsers(); showSection('section-all-users'); }
  });

  // Friend click → mở chat
  friendListEl?.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    const id = li.dataset._id;

    // Bỏ qua nếu click lại người đang chat
    // if (!id || id === currentChatTo) return;


    friendListEl.querySelectorAll('li').forEach(x => x.classList.remove('active'));
    li.classList.add('active');

    const nickname = li.dataset.nickname || li.querySelector('span')?.textContent || 'Bạn';
    document.getElementById('chat-name').textContent = nickname;

    const avatar = li.querySelector('img')?.src || profileAvatar.src;

    document.getElementById('chat-name').textContent = nickname;
    document.getElementById('chat-avatar').src = avatar;

    // Hiển thị avatar + back button
    document.getElementById('chat-avatar').style.display = 'block';
    document.getElementById('back-btn').style.display = 'block';

    showSection('section-chat');
    if (id != currentChatTo) {
      startChatWith(id);
    }

    const roomId = [id, MINE_ID].sort().join('_');
    currentRoomId = roomId;

    socket.emit('joinRoom', roomId);

    // Khi click avatar trong list → mở profile
    li.querySelector('img')?.addEventListener('click', (event) => {
      event.stopPropagation();
      openProfileHandler(id); // overlay sẽ hiển thị nickname từ server
    });

  });

  // Back button
  document.getElementById('back-btn')?.addEventListener('click', () => {
    currentChatTo = null;
    showSection('section-welcome');
    // Đảm bảo profile đóng khi quay lại màn hình welcome
    closeProfileOverlay();
  });

  // Send message
  sendBtnEl?.addEventListener('click', sendMessage);

  // Input behavior (Đã sửa lỗi logic Double-Enter)
  if (inputEl) {
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Enter đơn → Gửi tin nhắn
        e.preventDefault();
        sendMessage();
      } else if (e.key === 'Enter' && e.shiftKey) {
        // Shift + Enter → Xuống dòng (Hành vi mặc định)
        // Không cần làm gì, cứ để hành vi mặc định của trình duyệt
      }
    });

    // Xử lý Typing Status và chiều cao input (Đúng vị trí, chỉ gọi 1 lần)
    inputEl.addEventListener('input', () => {
      // Tự động điều chỉnh chiều cao input
      inputEl.style.height = 'auto';
      inputEl.style.height = inputEl.scrollHeight + 'px';

      // Xử lý Typing Status
      if (!socket.connected || !currentChatTo) return;
      if (typingTimer) clearTimeout(typingTimer);
      socket.emit('typing', { to: currentChatTo, roomId: currentRoomId });
      typingTimer = setTimeout(() => socket.emit('stopTyping', { to: currentChatTo, roomId: currentRoomId }), TYPING_DEBOUNCE);
    });
    inputEl.addEventListener('input', handleTypingInput);
  }

  // File input change preview optional
  fileInputEl?.addEventListener('change', () => { /* Logic Preview */ });

  // Avatar upload
  avatarInput?.addEventListener('change', () => {
    if (avatarInput.files?.[0]) {
      profileAvatar.src = URL.createObjectURL(avatarInput.files[0]);
    }
  });

  avatarUploadBtn?.addEventListener('click', async () => {
    const f = avatarInput.files?.[0]; if (!f) return alert('Chọn ảnh trước');
    const form = new FormData(); form.append('avatar', f);
    try {
      const res = await fetch('/api/users/update-avatar', { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json();
      if (!data.success || !data.avatar) throw new Error('Upload thất bại');
      profileAvatar.src = data.avatar; alert('Avatar đã cập nhật');
    } catch (err) {
      console.error('avatar upload', err);
      alert('Upload thất bại: ' + (err.message || 'Lỗi mạng/server'));
    }
  });

  // Update nickname
  nicknameUpdateBtn?.addEventListener('click', async () => {
    const newNick = nicknameInput?.value?.trim();
    if (!newNick) return alert('Nhập nickname mới');

    try {
      const data = await tryFetchJson(['/api/users/update-nickname'], {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: newNick })
      });

      // Xử lý phản hồi từ server, kể cả khi non-200
      if (data.success) {
        if (profileNickname) profileNickname.textContent = newNick;
        alert('Nickname đã cập nhật');
      } else {
        // Trường hợp tryFetchJson thành công nhưng server vẫn gửi success: false
        throw new Error(data.error || 'Cập nhật thất bại không rõ nguyên nhân.');
      }

    } catch (err) {
      console.error('Network or JS error updating nickname', err);
      alert('Cập nhật thất bại: ' + (err.message || 'Lỗi kết nối hoặc lỗi nội bộ'));
    }
    finally {
      nicknameUpdateBtn.disabled = false; // Kích hoạt lại nút
    }
  });

  // --- LOGIC ĐỔI MẬT KHẨU (THÊM MỚI) ---

  // Nút "Đổi ngay" trên Popup
  document.getElementById('go-to-change-password')?.addEventListener('click', goToChangePassword);

  // Nút "Nhắc sau" trên Popup
  document.getElementById('postpone-change-btn')?.addEventListener('click', postponeChange);

  // Nút "Đóng" trên Modal
  document.getElementById('close-password-modal-btn')?.addEventListener('click', closePasswordModal);

  // Nút "Submit" trong Modal
  document.getElementById('submit-password-change-btn')?.addEventListener('click', submitPasswordChange);

  // Xử lý Enter trong Modal
  newPasswordInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitPasswordChange();
    }
  });


  // Logout
  logoutBtn?.addEventListener('click', async () => {
    try {
      await fetch('/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error("Logout failed on fetch:", e);
    }
    location.href = '/login';
  });

  // Scroll handler (Load history)
  messagesEl?.addEventListener('scroll', () => {
    const scrollTop = messagesEl.scrollTop;
    const atTop = scrollTop === 0;
    const gap = messagesEl.scrollHeight - messagesEl.clientHeight - scrollTop;

    // Ẩn/Hiện input khi cuộn
    inputWrapper?.classList.toggle('hide', scrollTop > lastScrollTop + 10);
    if (scrollTop < lastScrollTop - 10 || gap > 100) inputWrapper?.classList.remove('hide');

    lastScrollTop = scrollTop;

    // Logic tải lịch sử khi cuộn lên đầu
    if (atTop && !loadingHistory) {
      loadingHistory = true;
      loadHistory(true).finally(() => loadingHistory = false);
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

// KHẮC PHỤC loadSessionUser TRONG chat.js 2
async function loadSessionUser() {
  try {
    // Lấy user profile. Nếu không có session, tryFetchJson sẽ báo lỗi 401.
    const user = await tryFetchJson(['/api/users/profile']);

    // Kiểm tra user có tồn tại và hợp lệ không
    if (!user || !user._id) {
      // Trường hợp có lỗi không phải 401, nhưng không có dữ liệu user.
      return location.href = '/login';
    }

    // Kiểm tra xem user đã setup nickname chưa. Nếu chưa, chuyển hướng đến trang setup.
    if (!user.nickname?.trim()) {
      return location.href = '/setup-nickname';
    }

    // Gán ID người dùng và load bạn bè
    MINE_ID = user._id || user.id;
    profileAvatar && (profileAvatar.src = user.avatar);
    profileNickname && (profileNickname.textContent = user.nickname);
    await loadFriends();

  } catch (err) {
    console.error('loadSessionUser', err);
    // Đây là điểm chặn chính: Nếu tryFetchJson thất bại (do lỗi 401),
    // chuyển hướng đến trang đăng nhập.
    if (String(err.message).includes('401') || String(err.message).includes('login')) {
      return location.href = '/login';
    }
    // Nếu là lỗi khác, vẫn có thể hiển thị lỗi nhưng không chặn
  }
}

/* ================ FRIENDS / USERS / REQUESTS ================ */
async function loadFriends(full = false) {
  if (loadingFriends) return; loadingFriends = true;
  try {
    const arr = await tryFetchJson(['/api/friends', '/api/friends/list', '/api/friends/'], { credentials: 'include' });
    if (!Array.isArray(arr)) { console.warn('Không nhận được danh sách bạn bè'); return; }
    friendListEl && (friendListEl.innerHTML = '');
    const seen = new Set();
    const uniqueFriends = arr.filter(u => { const id = u._id; if (seen.has(id)) return false; seen.add(id); return true; });
    if (uniqueFriends.length === 0) {
      friendListEl && (friendListEl.innerHTML = '<li>Không có bạn nào</li>');
      friendListFullEl && (friendListFullEl.innerHTML = '<li>Không có bạn nào</li>');
      return;
    }

    // =========================================================
    // 1. XỬ LÝ DANH SÁCH CHAT (friendListEl) - KHÔNG CÓ NÚT HỦY KẾT BẠN
    // =========================================================
    uniqueFriends.forEach(u => {
      const id = u.id || u._id;
      const li = document.createElement('li');
      li.dataset._id = id;
      // [SỬA]: CHỈ CÓ AVATAR VÀ TÊN
      li.innerHTML = `<img src="${getAvatar(u)}" class="avatar-sm"/><span>${u.nickname || 'Vô danh'}</span>`;
      friendListEl?.appendChild(li);
    });

    // =========================================================
    // 2. XỬ LÝ DANH SÁCH BẠN BÈ ĐẦY ĐỦ (friendListFullEl) - CÓ NÚT HỦY KẾT BẠN
    // =========================================================
    if (full && friendListFullEl) {
      friendListFullEl.innerHTML = '';
      uniqueFriends.forEach(u => {
        const id = u._id;
        const li = document.createElement('li'); li.dataset._id = id;
        // Có nút Hủy kết bạn, gắn ID vào data-id
        li.innerHTML = `<img src="${getAvatar(u)}" class="avatar-sm"/><span>${u.nickname || 'Vô danh'}</span><button class="unfriend-btn" data-id="${id}">Hủy kết bạn</button>`;
        friendListFullEl.appendChild(li);

        //  GẮN SỰ KIỆN HỦY KẾT BẠN
        li.querySelector('.unfriend-btn')?.addEventListener('click', (e) => {
          const btn = e.currentTarget; // Sử dụng currentTarget hoặc e.target đều được, nhưng currentTarget an toàn hơn nếu có span bên trong nút
          const friendId = btn.dataset.id; // Lấy ID từ data-id
          removeFriend(friendId, btn.closest('li')); // Truyền ID và LI vào hàm
        });
      });
    }
  } catch (err) { console.error('loadFriends', err); }
  finally { loadingFriends = false; }
}

async function loadAllUsers() {
  try {
    const users = await tryFetchJson(['/api/friends/all', '/api/friends/all-users', '/api/friends/allUsers'], { credentials: 'include' });
    if (!Array.isArray(users)) { allUsersListEl.innerHTML = '<li>Không có người dùng nào</li>'; return; }
    if (!allUsersListEl) return;
    allUsersListEl.innerHTML = '';
    users.forEach(u => {
      const id = u._id || u.id;
      const li = document.createElement('li');
      li.dataset._id = id;
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
    const arr = await tryFetchJson(['/api/friends/requests'], { credentials: 'include' });
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
    console.log('Client sending request to:', toId);
    const res = await fetch('/api/friends/send', {
      method: 'POST', credentials: 'include',
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
      method: 'POST', credentials: 'include',
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
    li.dataset._id = u._id;
    li.innerHTML = `<img src="${getAvatar(u)}" class="avatar-sm"/><span>${u.nickname}</span>`;
    if (showUnfriend) li.innerHTML += '<button class="unfriend-btn">Hủy kết bạn</button>';
    container.appendChild(li);
  });
}


/* ================ CHAT HISTORY / MESSAGES ================ */
async function startChatWith(userId) {
  if (!MINE_ID || !userId) return;
  const newRoomId = [MINE_ID, userId].sort().join('_');
  if (newRoomId === currentRoomId && skip > 0) return;

  currentChatTo = userId;
  currentRoomId = newRoomId;
  skip = 0;

  renderedMessageIds.clear();

  if (messagesEl) messagesEl.innerHTML = '';
  if (inputWrapper) {
    inputWrapper.classList.remove('hide');
    inputWrapper.style.display = 'flex';
  }
  if (inputEl) {
    inputEl.value = '';
    inputEl.focus();
  }

  socket.emit('joinRoom', currentRoomId);

  await loadHistory(false);

  // ✅ Đợi DOM render xong rồi mới cuộn
  setTimeout(() => {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }, 50);
}

async function loadHistory(prepend = false) {
  if (!currentRoomId || !currentChatTo) return;
  try {
    const url = `/api/chat/history?user1=${MINE_ID}&user2=${currentChatTo}&limit=${limit}&skip=${skip}`;
    const arr = await tryFetchJson([url], { credentials: 'include' });
    if (!Array.isArray(arr) || !arr.length) return;

    const list = arr.reverse();

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

    if (messagesEl && typingIndicatorContainer) {
      messagesEl.appendChild(typingIndicatorContainer);
    }

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

  // if (messagesEl && typingIndicatorContainer) {
  //   messagesEl.appendChild(typingIndicatorContainer);
  // }
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
  if (!currentChatTo || !currentRoomId) { alert('Chọn bạn để chat trước'); return; }
  const raw = inputEl?.value?.replace(/[\s\n]+$/g, '') || '';
  const text = raw.split('\n').map(l => l.trim()).join('\n');
  const files = fileInputEl?.files || [];
  if (!text && files.length === 0) return;

  // Nếu đang gửi, bỏ qua lần nhấn Enter tiếp theo
  if (seen) return;
  seen = true;

  let fileUrl = null;
  if (files.length) {
    const f = files[0];
    const api = f.type.startsWith('image/') ? '/api/upload/image' : '/api/upload/file';
    const form = new FormData();
    form.append(f.type.startsWith('image/') ? 'image' : 'file', f);
    try {
      const res = await fetch(api, { method: 'POST', credentials: 'include', body: form });
      const d = await res.json();
      if (!d.success || !d.url) throw new Error('Upload thất bại');
      fileUrl = d.url;
    } catch (err) {
      console.error('upload', err);
      alert('Upload thất bại');
      seen = false;
      return;
    }
  }

  const payload = { receiver: currentChatTo, roomId: currentRoomId, text, file: fileUrl };
  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Save failed');
    let savedMsg = await res.json();
    if (savedMsg.room && !savedMsg.roomId) {
      savedMsg.roomId = savedMsg.room;
      delete savedMsg.room; // Xóa trường cũ để nhất quán
    }

    // Append locally (đảm bảo có _id)
    appendMessage({
      _id: savedMsg._id,
      senderAvatar: savedMsg.sender?.avatar || profileAvatar?.src,
      senderOnline: savedMsg.sender?.online ?? true,
      content: savedMsg.content,
      file: savedMsg.file,
      createdAt: savedMsg.createdAt
    }, true);

    socket.emit('newMessage', savedMsg);

    if (typingIndicatorContainer && messagesEl) {
      messagesEl.appendChild(typingIndicatorContainer);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; inputEl.focus(); }
    if (fileInputEl) fileInputEl.value = '';
  } catch (err) {
    console.error('sendMessage', err);
    alert('Gửi tin nhắn thất bại');
  }
  finally {
    seen = false;
  }
}

/* ================ SAFE HELPERS ================ */
async function removeFriend(targetId, listItem) {
  if (!confirm('Bạn có chắc muốn hủy kết bạn?')) return;
  try {
    const res = await fetch('/api/friends/remove', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId }) // targetId là ID cần hủy kết bạn
    });
    const data = await res.json();
    if (data.success) {
      listItem && listItem.remove(); //  Xóa LI khỏi danh sách UI nếu có
      alert('Đã hủy kết bạn');
      await loadFriends(true); // Tải lại danh sách chat và danh sách bạn bè
    } else {
      alert(data.error || 'Hủy kết bạn thất bại');
    }
  } catch (err) {
    console.error('removeFriend', err);
    alert('Lỗi khi hủy kết bạn');
  }
}


/* ================ SOCKET EVENTS ================ */
socket.on('connect', () => {
  console.log('socket connected', socket.id);
  // rejoin current room if any
  if (currentRoomId) socket.emit('joinRoom', currentRoomId);
});
socket.on('disconnect', reason => console.log('socket disconnected', reason));

// show typing indicator when server emits
socket.on('typing', data => {
  // 1. Kiểm tra các phần tử DOM quan trọng (nên có)
  if (!typingIndicatorContainer) return;

  // 2. CHUẨN HÓA và KIỂM TRA ID
  const incomingRoomId = String(data.roomId);
  const currentRoom = String(currentRoomId);
  const senderId = String(data.from);

  // Kiểm tra xem sự kiện có thuộc về phòng hiện tại và không phải tin nhắn của chính mình
  if (incomingRoomId !== currentRoom || senderId === String(MINE_ID)) {
    // Nếu không thuộc phòng hiện tại, hoặc là sự kiện từ chính mình -> ẨN chỉ báo gõ
    // Nếu đang hiển thị, cần ẩn nó đi ngay lập tức (tránh bị kẹt)
    if (typingIndicatorContainer.style.display === 'flex') {
      typingIndicatorContainer.style.display = 'none';
    }
    return;
  }
  // 2. CẬP NHẬT AVATAR 
  const avatarImg = typingIndicatorContainer.querySelector('.avatar-sm');
  if (avatarImg) {
    // Sử dụng hàm getAvatar nếu cần xử lý URL rỗng/mặc định
    avatarImg.src = data.senderAvatar || getAvatar(null);
  }
  // 3. HIỂN THỊ CHỈ BÁO GÕ (ĐÃ QUA TẤT CẢ CÁC BƯỚC KIỂM TRA)
  typingIndicatorContainer.style.display = 'flex';

  // Xóa timeout cũ nếu người này vẫn đang gõ
  if (roomTypingTimers[data.roomId]) clearTimeout(roomTypingTimers[data.roomId]);

  // Thiết lập timeout mới (1.7 giây)
  roomTypingTimers[data.roomId] = setTimeout(() => {
    typingIndicatorContainer.style.display = 'none'; // Ẩn container
    delete roomTypingTimers[data.roomId];
  }, 1700);

  // Tự động cuộn xuống
  if (messagesEl) {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  }
});

// Bạn cũng cần kiểm tra lại hàm stopTyping
socket.on('stopTyping', data => {
  const incomingRoomId = String(data.roomId);
  const currentRoom = String(currentRoomId);

  if (typingIndicatorContainer && incomingRoomId === currentRoom) {
    typingIndicatorContainer.style.display = 'none'; // Ẩn container
    // Xóa luôn timer
    if (roomTypingTimers[data.roomId]) {
      clearTimeout(roomTypingTimers[data.roomId]);
      delete roomTypingTimers[data.roomId];
    }
  }
});

socket.on('newMessage', msg => {
  try {
    // console.log('✅ SOCKET RECEIVE: Tin nhắn mới đã đến Client:', msg);
    const incomingRoomId = msg.roomId || msg.room;
    if (!msg || !msg.sender || !incomingRoomId) return;
    // console.log(`Debug Room: Tin nhắn RoomID=${incomingRoomId}, Current RoomID=${currentRoomId}`);

    // Chỉ xử lý nếu đang ở đúng phòng
    if (incomingRoomId !== currentRoomId) {
      // console.warn('❌ SOCKET BLOCK (Room Mismatch): Bỏ qua vì không phải phòng hiện tại.');
      return;
    }

    // Bỏ qua tin của chính mình
    const sid = msg.sender._id || msg.sender.id;
    // console.log(`Debug Sender: Tin nhắn SenderID=${sid}, MINE_ID=${MINE_ID}`);
    if (String(sid) === String(MINE_ID)) {
      console.warn('❌ SOCKET BLOCK: Bỏ qua tin của chính mình.');
      return;
    }
    // Kiểm tra xem tin nhắn có bị bỏ qua không
    if (renderedMessageIds.has(msg._id)) {
      // console.warn('Tin nhắn đã bị bỏ qua vì trùng ID:', msg._id);
      return;
    }
    // console.log('🎉 SOCKET PASS: Tin nhắn được hiển thị!');

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
    if (typingIndicatorContainer && messagesEl) {
      messagesEl.appendChild(typingIndicatorContainer);
    }
  } catch (err) {
    console.error('socket newMessage', err);
  }
});



/* ================ PASSWORD POPUP / MODAL LOGIC ================ */

// Kiểm tra xem user có cần đổi mật khẩu hay không (và hiển thị popup)
async function checkPasswordChangeHint() {
  try {
    const data = await tryFetchJson(['/api/users/profile']);
    if (data?.askChangePassword && passwordPopup) {
      passwordPopup.style.display = 'block';
    }
  } catch (err) {
    console.error('checkPasswordChangeHint', err);
    // Không cần làm gì khác, nếu lỗi 401, loadSessionUser đã xử lý chuyển hướng
  }
}

// Mở modal đổi mật khẩu
function goToChangePassword() {
  if (passwordPopup) passwordPopup.style.display = 'none';
  if (passwordModal) passwordModal.style.display = 'block';
  if (oldPasswordInput) oldPasswordInput.focus();
}

// Đóng modal đổi mật khẩu và reset input + message
function closePasswordModal() {
  if (passwordModal) passwordModal.style.display = 'none';
  if (passwordMsg) { passwordMsg.textContent = ''; passwordMsg.style.color = ''; }
  if (oldPasswordInput) oldPasswordInput.value = '';
  if (newPasswordInput) newPasswordInput.value = '';
}

// Hoãn yêu cầu đổi mật khẩu (nếu user click "Nhắc sau")
async function postponeChange() {
  try {
    await fetch('/api/users/postpone-password-change', { method: 'POST', credentials: 'include' });
    if (passwordPopup) passwordPopup.style.display = 'none';
  } catch (e) {
    console.error('postponeChange failed:', e);
  }
}

// Submit đổi mật khẩu
async function submitPasswordChange() {
  const oldPass = oldPasswordInput?.value.trim();
  const newPass = newPasswordInput?.value.trim();

  if (!oldPass || !newPass) {
    if (passwordMsg) { passwordMsg.style.color = '#d00'; passwordMsg.textContent = 'Vui lòng nhập đầy đủ thông tin.'; }
    return;
  }

  if (newPass.length < 6) { // Kiểm tra tối thiểu 6 ký tự
    if (passwordMsg) { passwordMsg.style.color = '#d00'; passwordMsg.textContent = 'Mật khẩu mới phải có ít nhất 6 ký tự.'; }
    return;
  }

  if (passwordMsg) { passwordMsg.style.color = '#000'; passwordMsg.textContent = 'Đang xử lý...'; }

  try {
    const res = await fetch('/api/users/update-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
    });
    const data = await res.json();

    if (data.success) {
      if (passwordMsg) { passwordMsg.style.color = '#0068ff'; passwordMsg.textContent = 'Đổi mật khẩu thành công! ✅'; }
      setTimeout(closePasswordModal, 1500);
      if (passwordPopup) passwordPopup.style.display = 'none';
    } else {
      if (passwordMsg) { passwordMsg.style.color = '#d00'; passwordMsg.textContent = data.error || 'Có lỗi xảy ra.'; }
    }
  } catch (e) {
    console.error('changePass', e);
    if (passwordMsg) { passwordMsg.style.color = '#d00'; passwordMsg.textContent = 'Lỗi kết nối hoặc lỗi nội bộ.'; }
  }
}