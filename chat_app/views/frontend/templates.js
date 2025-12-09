/* ================ UI GENERATORS (TAILWIND CSS) ================ */

// 1. Tạo Chat Item cho Sidebar
// Trong file js/templates.js

window.createChatItemHTML = function(user) {
  const isActive = window.currentChatTo === (user._id || user.id);
  const activeClass = isActive 
    ? 'bg-brand-purple/10 border-brand-purple' 
    : 'border-transparent hover:bg-zinc-800/50 hover:border-zinc-700';

  // =================================================================
  // ✅ FIX LOGIC: KẾT HỢP TRẠNG THÁI CỦA BẢN THÂN VÀ ĐỐI PHƯƠNG
  // =================================================================
  
  // 1. Lấy trạng thái của chính mình (đã lưu khi toggle nút switch)
  const myStatus = localStorage.getItem("userStatus") || "online";
  
  let showGreenDot = false;

  // CHỈ KHI MÌNH ONLINE thì mới tính toán việc hiện chấm xanh của người khác/nhóm
  if (myStatus === "online") {
      if (user.isGroup) {
          // Nhóm: Hiện xanh khi có ít nhất 1 người KHÁC mình đang online
          if (Array.isArray(user.members)) {
              showGreenDot = user.members.some(m => 
                  String(m._id) !== String(window.MINE_ID) && m.online
              );
          }
      } else {
          // Cá nhân: Hiện xanh khi họ online
          showGreenDot = user.online;
      }
  }
  // Nếu myStatus === 'offline' -> showGreenDot luôn là false (Ẩn toàn bộ)

  const onlineDotHTML = showGreenDot 
    ? '<span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-brand-panel rounded-full"></span>' 
    : '';
  
  return `
    <li data-_id="${user._id || user.id}" data-nickname="${user.nickname}" 
        onclick="window.startChatWith('${user._id || user.id}')"
        class="p-3 rounded-xl cursor-pointer flex items-center gap-3 transition-all border ${activeClass} group animate-fade-in mb-1">
      <div class="relative">
        <img src="${window.getAvatar(user)}" class="w-12 h-12 rounded-full object-cover border border-zinc-800 group-hover:border-brand-purple transition-colors">
        ${onlineDotHTML}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-baseline mb-0.5">
          <h4 class="text-sm font-semibold text-zinc-100 truncate group-hover:text-white">${user.nickname || 'Người dùng'}</h4>
          <span class="text-[10px] text-zinc-500 font-medium">Now</span>
        </div>
        <p class="text-xs text-zinc-500 truncate group-hover:text-zinc-400">Nhấn để trò chuyện...</p>
      </div>
    </li>
  `;
};

// 2. Tạo Date Separator
window.createDateSeparator = function(dateStr) {
    const div = document.createElement('div');
    div.className = 'flex justify-center my-6';
    div.innerHTML = `<span class="text-[10px] font-medium text-zinc-500 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800 backdrop-blur-sm shadow-sm">${dateStr}</span>`;
    return div;
};

// 3. Tạo Bong bóng Chat (Message Bubble)
window.buildMessageNode = function(msg, isSelf) {
  const div = document.createElement('div');
  div.className = `flex gap-3 items-end mb-4 group ${isSelf ? 'flex-row-reverse' : ''} animate-fade-in`;
  div.id = `msg-${msg._id}`;

  const avatarHTML = `
    <img src="${isSelf ? (document.getElementById('profile-avatar')?.src) : window.getAvatar(msg.sender)}" 
         class="w-8 h-8 rounded-full object-cover border border-zinc-800 flex-shrink-0 mb-1 cursor-pointer hover:opacity-80"
         onclick="${!isSelf ? `window.openProfileHandler('${msg.sender._id || msg.sender}')` : ''}">
  `;

  const bubbleClass = isSelf 
    ? 'bg-gradient-to-br from-brand-purple to-brand-purpleDark text-white rounded-br-none shadow-lg shadow-purple-900/20' 
    : 'bg-brand-bubble text-zinc-200 rounded-bl-none border border-zinc-700 shadow-md';

  let contentHTML = '';
  
  if (msg.image) {
    contentHTML += `<img src="${msg.image}" class="max-w-full md:max-w-sm rounded-lg mb-2 cursor-pointer hover:opacity-90 transition-opacity border border-white/10" onclick="window.open(this.src)">`;
  } else if (msg.file) {
    contentHTML += `
      <a href="${msg.file}" target="_blank" class="flex items-center gap-3 p-3 bg-black/20 rounded-lg hover:bg-black/30 transition-colors border border-white/10">
        <div class="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center"><i class="fa-solid fa-file-arrow-down text-xl"></i></div>
        <div class="text-sm overflow-hidden">
           <p class="font-medium truncate w-32">Tệp đính kèm</p>
           <p class="text-xs opacity-70 underline decoration-dotted">Nhấn để tải</p>
        </div>
      </a>`;
  }

  if (msg.content) {
    const formattedText = window.escapeHtml(msg.content).replace(/\n/g, '<br>');
    contentHTML += `<p class="text-sm leading-relaxed whitespace-pre-wrap break-words">${formattedText}</p>`;
  }

  div.innerHTML = `
    ${avatarHTML}
    <div class="max-w-[75%] md:max-w-[60%] flex flex-col ${isSelf ? 'items-end' : 'items-start'}">
      <div class="${bubbleClass} px-4 py-3 rounded-2xl transition-all relative">
        ${contentHTML}
      </div>
      <div class="flex items-center gap-1 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
        <span class="text-[10px] text-zinc-500">${window.formatZaloTime(msg.createdAt)}</span>
        ${isSelf ? '<i class="fa-solid fa-check-double text-[10px] text-brand-purple"></i>' : ''}
      </div>
    </div>
  `;
  return div;
};

/* ================ DISPLAY FUNCTIONS (Render ra màn hình) ================ */

window.displayChats = function(chats, container) {
  if (!container) return;
  container.innerHTML = '';
  if(!chats.length) container.innerHTML = '<div class="text-center text-zinc-500 text-sm mt-10">Chưa có cuộc trò chuyện nào</div>';
  
  chats.forEach(chat => {
    const user = {
      _id: chat.partnerId || chat._id,
      nickname: chat.nickname || chat.groupName || 'Không tên',
      avatar: chat.avatar,
      online: chat.online
    };
    container.insertAdjacentHTML('beforeend', window.createChatItemHTML(user));
  });
};

window.displayFriends = function(friends, container) {
  if (!container) return;
  container.innerHTML = '';
  friends.forEach(u => {
    const html = `
      <li class="bg-brand-panel border border-brand-border p-4 rounded-xl flex flex-col items-center gap-3 hover:border-brand-purple transition-all group relative animate-fade-in">
        <img src="${window.getAvatar(u)}" class="w-16 h-16 rounded-full object-cover border-2 border-zinc-800 group-hover:border-brand-purple transition-colors">
        <div class="text-center w-full">
          <h4 class="font-bold text-white truncate">${u.nickname}</h4>
          <span class="text-xs text-zinc-500">Bạn bè</span>
        </div>
        <div class="flex gap-2 w-full mt-2">
           <button onclick="window.startChatWith('${u._id || u.id}')" class="flex-1 py-2 bg-brand-purple hover:bg-brand-purpleDark text-white rounded-lg text-xs font-bold transition-colors">Chat</button>
           <button onclick="window.removeFriend('${u._id || u.id}', this.closest('li'))" class="px-3 py-2 bg-zinc-800 hover:bg-red-900/50 text-zinc-400 hover:text-red-400 rounded-lg text-xs transition-colors"><i class="fa-solid fa-user-minus"></i></button>
        </div>
      </li>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
};

window.displayAllUsers = function(users, container) {
  if (!container) return;
  container.innerHTML = '';
  users.forEach(u => {
    const statusText = u.status === 'none' ? 'Kết bạn' : u.status === 'pending' ? 'Đã gửi' : u.status === 'incoming' ? 'Chấp nhận' : 'Bạn bè';
    const btnClass = u.status === 'none' ? 'bg-brand-purple hover:bg-brand-purpleDark text-white' : (u.status === 'incoming' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-zinc-700 text-zinc-400 cursor-not-allowed');
    const isDisabled = u.status !== 'none' && u.status !== 'incoming';
    
    const html = `
      <li class="bg-brand-panel border border-brand-border p-3 rounded-xl flex items-center justify-between hover:border-zinc-600 transition-all animate-fade-in">
        <div class="flex items-center gap-3 overflow-hidden">
           <img src="${window.getAvatar(u)}" class="w-10 h-10 rounded-full object-cover border border-zinc-800 flex-shrink-0">
           <div class="min-w-0">
              <h4 class="font-bold text-white text-sm truncate">${u.nickname}</h4>
              <span class="text-xs text-zinc-500">Gợi ý</span>
           </div>
        </div>
        <button class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${btnClass} action-btn ml-2 flex-shrink-0" ${isDisabled ? 'disabled' : ''} data-id="${u._id}">
           ${statusText}
        </button>
      </li>
    `;
    container.insertAdjacentHTML('beforeend', html);
    
    const li = container.lastElementChild;
    const btn = li.querySelector('.action-btn');
    if (u.status === 'none') btn.addEventListener('click', () => window.sendRequest(u._id, btn));
    if (u.status === 'incoming') btn.addEventListener('click', () => window.respondRequest(u.reqId, 'accept', btn));
  });
};

window.displayRequests = function(requests, container) {
    if(!container) return;
    container.innerHTML = '';
    requests.forEach(r => {
        const html = `
        <li class="bg-brand-panel border border-brand-border p-3 rounded-xl flex items-center justify-between animate-fade-in">
            <div class="flex items-center gap-3">
                <img src="${window.getAvatar(r)}" class="w-10 h-10 rounded-full object-cover">
                <div>
                    <h4 class="font-bold text-white text-sm">${r.nickname}</h4>
                    <span class="text-xs text-brand-purple">Đã gửi lời mời</span>
                </div>
            </div>
            <div class="flex gap-2">
                <button class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold accept-btn">Đồng ý</button>
                <button class="px-3 py-1.5 bg-zinc-700 hover:bg-red-900/50 text-zinc-300 hover:text-red-400 rounded-lg text-xs reject-btn">Xóa</button>
            </div>
        </li>`;
        container.insertAdjacentHTML('beforeend', html);
        const li = container.lastElementChild;
        li.querySelector('.accept-btn').addEventListener('click', () => window.respondRequest(r.reqId || r.requestId, 'accept', li));
        li.querySelector('.reject-btn').addEventListener('click', () => window.respondRequest(r.reqId || r.requestId, 'reject', li));
    });
};