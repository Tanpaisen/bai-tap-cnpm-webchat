/* ================ CHAT & GROUP LOGIC ================ */

window.startChatWith = async function (targetId) {
  if (!targetId || !window.MINE_ID) return;

  // 1. Tìm xem targetId là User hay Group
  let existingChat = window.ALL_CHATS.find((c) => c._id === targetId || c.partnerId === targetId);

  if (!existingChat) {
    const friend = window.ALL_FRIENDS.find((f) => (f._id || f.id) === targetId);
    if (friend) {
      existingChat = { ...friend, isGroup: false, partnerId: friend._id || friend.id };
    }
  }

  const isGroup = existingChat ? existingChat.isGroup : false;

  // 2. Thiết lập Room ID
  if (isGroup) {
    window.currentRoomId = existingChat._id;
    window.currentChatTo = null;
  } else {
    window.currentChatTo = targetId;
    if (existingChat && existingChat._id && existingChat._id !== targetId) {
      window.currentRoomId = existingChat._id;
    } else {
      window.currentRoomId = [window.MINE_ID, targetId].sort().join("_");
    }
  }

  // Lưu session
  if (window.currentRoomId) sessionStorage.setItem("currentRoomId", window.currentRoomId);
  if (window.currentChatTo) sessionStorage.setItem("currentChatTo", window.currentChatTo);

  window.skip = 0;
  window.renderedMessageIds.clear();

  // 3. Cập nhật Header UI
  const nameEl = document.getElementById("chat-name");
  const avatarEl = document.getElementById("chat-avatar");
  const statusTextEl = document.getElementById("header-status-text");
  const statusDotEl = document.getElementById("header-status-dot");

  const updateHeaderUI = (name, avatar, isOnline, statusText) => {
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.src = avatar;
    if (statusTextEl && statusDotEl) {
      if (isOnline) {
        statusTextEl.textContent = statusText || "Đang hoạt động";
        statusTextEl.className = "text-[11px] text-brand-purple font-medium";
        statusDotEl.classList.remove("hidden");
      } else {
        statusTextEl.textContent = statusText || "Ngoại tuyến";
        statusTextEl.className = "text-[11px] text-zinc-500 dark:text-zinc-400 font-medium";
        statusDotEl.classList.add("hidden");
      }
    }
  };

  if (existingChat) {
    if (isGroup) {
        let isGroupOnline = false;
        if (Array.isArray(existingChat.members)) {
            isGroupOnline = existingChat.members.some(m => String(m._id) !== String(window.MINE_ID) && m.online);
        }
        const statusText = isGroupOnline ? "Đang hoạt động" : `Thành viên: ${existingChat.members ? existingChat.members.length : '?'}`;
        updateHeaderUI(existingChat.groupName, window.getAvatar(existingChat), isGroupOnline, statusText);
    } else {
        updateHeaderUI(existingChat.nickname, window.getAvatar(existingChat), existingChat.online, existingChat.online ? "Đang hoạt động" : "Ngoại tuyến");
    }
  } else {
    try {
      const u = await window.tryFetchJson([`/api/users/info/${targetId}`]);
      if (u) updateHeaderUI(u.nickname, window.getAvatar(u), u.online);
    } catch (e) {}
  }

  document.getElementById("messages").innerHTML = "";
  window.showMainSection("section-chat");
  const inputWrapper = document.getElementById("chat-input-wrapper");
  if (inputWrapper) {
    inputWrapper.style.display = "block";
    inputWrapper.classList.remove("hidden");
  }

  window.socket.emit("joinRoom", window.currentRoomId);
  await window.loadHistory();
};

window.loadHistory = async function(prepend = false) {
  try {
    const url = `/api/chat/history?roomId=${window.currentRoomId}&limit=${window.limit}&skip=${window.skip}`;
    const msgs = await window.tryFetchJson([url]);
    if (!Array.isArray(msgs) || !msgs.length) return;

    const list = msgs.reverse();
    const container = document.createDocumentFragment();
    let lastDate = null;

    for (const m of list) {
      const dstr = new Date(m.createdAt).toLocaleDateString("vi-VN");
      if (dstr !== lastDate) {
        lastDate = dstr;
        container.appendChild(window.createDateSeparator(dstr));
      }
      if (window.renderedMessageIds.has(m._id)) continue;
      window.renderedMessageIds.add(m._id);
      const isSelf = (m.sender._id || m.sender) === window.MINE_ID;
      container.appendChild(window.buildMessageNode(m, isSelf));
    }

    const msgEl = document.getElementById("messages");
    if (prepend) msgEl.prepend(container);
    else { msgEl.appendChild(container); msgEl.scrollTop = msgEl.scrollHeight; }
    window.skip += msgs.length;
  } catch (e) { console.error(e); }
};

window.sendMessage = async function() {
  if (window.isSending) return;
  const input = document.getElementById("message-input");
  const text = input.value.trim();
  const fileInput = document.getElementById("file-input");

  if (!text && !fileInput.files.length) return;
  window.isSending = true;

  let fileUrl = null, fileKey = null;
  if (fileInput.files.length) {
    const f = fileInput.files[0];
    const form = new FormData();
    const key = f.type.startsWith("image/") ? "image" : "file";
    form.append(key, f);
    try {
      const res = await fetch(`/api/upload/${key}`, { method: "POST", body: form });
      const d = await res.json();
      if (d.url) { fileUrl = d.url; fileKey = key; }
    } catch (e) { window.isSending = false; return alert("Upload lỗi"); }
  }

  const payload = {
    receiver: window.currentChatTo,
    roomId: window.currentRoomId,
    text,
    ...(fileUrl && { [fileKey]: fileUrl }),
  };

  try {
    const res = await fetch("/api/chat/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const savedMsg = await res.json();
    const msgNode = window.buildMessageNode(savedMsg, true);
    document.getElementById("messages").appendChild(msgNode);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;

    window.socket.emit("newMessage", savedMsg);
    input.value = ""; input.style.height = "auto"; fileInput.value = "";
    document.getElementById("file-preview").style.display = "none";
    document.getElementById("file-preview").classList.add("hidden");

    if (savedMsg.roomId && savedMsg.roomId !== window.currentRoomId) {
      window.currentRoomId = savedMsg.roomId;
      await window.loadChatList();
    }
  } catch (e) { console.error(e); } finally { window.isSending = false; }
};

window.loadChatList = async function(force = false) {
  if (window.ALL_CHATS.length && !force) return;
  try {
    const chats = await window.tryFetchJson(["/api/chat/chats"]);
    window.ALL_CHATS = Array.isArray(chats) ? chats : [];

    const friends = await window.tryFetchJson(["/api/friends"]);
    window.ALL_FRIENDS = Array.isArray(friends) ? friends : [];

    const existingChatIds = new Set(window.ALL_CHATS.map((c) => c.partnerId || c._id));
    const friendsNotInChat = window.ALL_FRIENDS.filter((f) => !existingChatIds.has(f._id || f.id))
      .map((f) => ({ _id: f._id || f.id, partnerId: f._id || f.id, nickname: f.nickname, avatar: f.avatar, online: f.online, isGroup: false }));

    const combinedList = [...window.ALL_CHATS, ...friendsNotInChat];
    combinedList.sort((a, b) => {
      const tA = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
      const tB = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
      return tB - tA;
    });

    window.displayChats(combinedList, document.getElementById("friend-list-chat"));

    const groups = window.ALL_CHATS.filter((c) => c.isGroup);
    const groupSidebarList = document.getElementById("group-list");
    if (groupSidebarList) {
      groupSidebarList.innerHTML = groups.length ? "" : '<li class="text-center text-xs text-gray-500 mt-4">Chưa tham gia nhóm nào</li>';
      groups.forEach((g) => groupSidebarList.insertAdjacentHTML("beforeend", window.createChatItemHTML(g)));
    }

    const groupGrid = document.getElementById("group-grid-list");
    if (groupGrid) {
      groupGrid.innerHTML = groups.length ? "" : '<div class="col-span-full text-center text-gray-500 mt-10">Chưa tham gia nhóm nào</div>';
      groups.forEach((g) => {
        const html = `<li class="bg-white dark:bg-brand-panel border border-gray-200 dark:border-brand-border p-4 rounded-2xl flex flex-col items-center gap-3 hover:border-brand-purple transition-all shadow-sm cursor-pointer" onclick="window.startChatWith('${g._id}')"><img src="${window.getAvatar(g)}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-zinc-800"><div class="text-center"><h4 class="font-bold text-gray-800 dark:text-white truncate max-w-[150px]">${g.nickname}</h4><span class="text-xs text-gray-500 dark:text-zinc-500">Thành viên: ${g.members ? g.members.length : "?"}</span></div></li>`;
        groupGrid.insertAdjacentHTML("beforeend", html);
      });
    }
  } catch (e) {}
};

window.setupInputEvents = function() {
  const input = document.getElementById("message-input");
  const sendAction = () => { window.sendMessage(); input.style.height = "auto"; };

  input?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAction(); } });
  document.getElementById("send-btn")?.addEventListener("click", sendAction);
  input?.addEventListener("input", window.handleTypingInput);

  const fileInput = document.getElementById("file-input");
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) {
      document.getElementById("file-preview").classList.remove("hidden");
      document.getElementById("file-preview").style.display = "flex";
      document.getElementById("preview-content").textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }
  });
  document.getElementById("remove-preview-btn")?.addEventListener("click", () => {
      fileInput.value = "";
      document.getElementById("file-preview").classList.add("hidden");
      document.getElementById("file-preview").style.display = "none";
    });

  document.getElementById("friend-list-chat")?.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li && li.dataset._id) window.startChatWith(li.dataset._id);
    });

  document.getElementById("group-list")?.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li && li.dataset._id) window.startChatWith(li.dataset._id);
  });

  const msgEl = document.getElementById("messages");
  const inputWrapper = document.getElementById("chat-input-wrapper");
  msgEl?.addEventListener("scroll", () => {
    const scrollTop = msgEl.scrollTop;
    const atTop = scrollTop === 0;
    const gap = msgEl.scrollHeight - msgEl.clientHeight - scrollTop;
    if (inputWrapper) {
      if (scrollTop > window.lastScrollTop + 10) inputWrapper.classList.add("hidden");
      if (scrollTop < window.lastScrollTop - 10 || gap > 100) inputWrapper.classList.remove("hidden");
    }
    window.lastScrollTop = scrollTop;
    if (atTop && !window.loadingHistory && window.currentRoomId) {
      window.loadingHistory = true;
      window.loadHistory(true).finally(() => (window.loadingHistory = false));
    }
  });
};

window.handleTypingInput = function() {
  const input = document.getElementById("message-input");
  input.style.height = "auto"; input.style.height = input.scrollHeight + "px";
  if (!window.currentRoomId) return;
  window.socket.emit("typing", { roomId: window.currentRoomId, to: window.currentChatTo });
  clearTimeout(window.typingTimer);
  window.typingTimer = setTimeout(() => {
    window.socket.emit("stopTyping", { roomId: window.currentRoomId, to: window.currentChatTo });
  }, window.TYPING_DEBOUNCE);
};

window.setupChatHeaderEvents = function() {
  const openProfile = () => {
    const targetId = window.currentChatTo || window.currentRoomId;
    if (targetId) window.openProfileHandler(targetId);
  };
  document.getElementById("chat-avatar")?.addEventListener("click", (e) => { e.stopPropagation(); openProfile(); });
  document.getElementById("chat-name")?.addEventListener("click", (e) => { e.stopPropagation(); openProfile(); });
  document.querySelector(".chat-header button:last-child")?.addEventListener("click", (e) => { e.stopPropagation(); openProfile(); });
};

/* ================ GROUP HANDLERS ================ */

window.openProfileHandler = async function (targetId) {
  const chatGroup = window.ALL_CHATS.find((c) => c._id === targetId && c.isGroup);
  if (chatGroup) await window.handleGroupProfile(targetId);
  else await window.handleUserProfile(targetId);
};

window.handleUserProfile = async function(userId) {
    if(userId === window.MINE_ID) { window.showMainSection('section-profile'); window.loadProfile(); return; }
    const chatProfile = document.getElementById('chat-profile'); if (!chatProfile) return;
    
    chatProfile.dataset.viewingId = userId; 

    try {
        const u = await window.tryFetchJson([`/api/users/info/${userId}`]);
        if(u) {
            const friendInList = window.ALL_FRIENDS.find(f => String(f._id || f.id) === String(userId)) || 
                                 window.ALL_CHATS.find(c => String(c.partnerId || c._id) === String(userId));
            const isOnline = friendInList ? friendInList.online : u.online;

            document.getElementById('profile-name').textContent = u.nickname || u.username;
            document.getElementById('profile-avatar-preview').src = window.getAvatar(u);
            
            const avatarContainer = document.getElementById('profile-avatar-preview').parentElement;
            const oldDots = avatarContainer.querySelectorAll('div');
            oldDots.forEach(dot => dot.remove());

            if (isOnline) {
                const dot = document.createElement('div');
                dot.className = 'online-indicator absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-4 border-white dark:border-brand-panel rounded-full';
                avatarContainer.appendChild(dot);
            }

            const actionsContainer = document.getElementById('profile-actions');
            actionsContainer.innerHTML = `
                <button id="profile-call-btn" class="w-full py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-white rounded-xl text-sm font-medium border border-gray-300 dark:border-zinc-700 flex items-center justify-center gap-2 transition-colors"><i class="fa-solid fa-phone"></i> Gọi điện</button>
                <button id="profile-create-group-sidebar-btn" class="w-full py-3 bg-blue-50 dark:bg-brand-purple/10 hover:bg-blue-100 dark:hover:bg-brand-purple/20 text-blue-600 dark:text-brand-purple rounded-xl text-sm font-medium border border-blue-200 dark:border-brand-purple/30 flex items-center justify-center gap-2 transition-colors"><i class="fa-solid fa-users"></i> Tạo nhóm</button>
                <button id="profile-remove-friend-btn" class="w-full py-3 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 dark:text-red-400 rounded-xl text-sm font-medium border border-red-200 dark:border-red-500/20 flex items-center justify-center gap-2 transition-colors"><i class="fa-solid fa-user-minus"></i> Hủy kết bạn</button>
            `;
            
            document.getElementById('profile-remove-friend-btn').onclick = () => { if(confirm(`Hủy kết bạn với ${u.nickname}?`)) window.handleRemoveFriendFromSidebar(userId); };
            document.getElementById('profile-create-group-sidebar-btn').onclick = () => { window.targetGroupMemberId = userId; window.openCreateGroupModal(); };
            
            chatProfile.style.width = '300px'; chatProfile.classList.add('border-l');
        }
    } catch(e) { console.error('Lỗi profile user:', e); }
};

window.handleGroupProfile = async function(groupId) {
    const chatProfile = document.getElementById('chat-profile'); if (!chatProfile) return;
    try {
        const group = await window.tryFetchJson([`/api/chat/group/${groupId}`]);
        if(group) {
            document.getElementById('profile-name').textContent = group.name;
            document.getElementById('profile-avatar-preview').src = group.avatar || 'https://cdn-icons-png.flaticon.com/512/166/166258.png';
            
            const avatarContainer = document.getElementById('profile-avatar-preview').parentElement;
            const oldDots = avatarContainer.querySelectorAll('div');
            oldDots.forEach(dot => dot.remove());
            
            const actionsContainer = document.getElementById('profile-actions');
            let membersHTML = `<div class="w-full text-left mt-4"><h4 class="text-xs font-bold text-zinc-500 uppercase mb-2">Thành viên (${group.members.length})</h4><ul class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">`;
            
            group.members.forEach(m => { 
                const isAdmin = m._id === group.admin;
                const adminBadge = isAdmin ? '<i class="fa-solid fa-crown text-yellow-500 ml-2 text-xs" title="Chủ phòng"></i>' : '';
                let removeAction = '';
                if (group.admin === window.MINE_ID && m._id !== window.MINE_ID) {
                    removeAction = `<button onclick="window.removeMemberFromGroup('${group._id}', '${m._id}')" class="ml-2 text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors" title="Xóa khỏi nhóm"><i class="fa-solid fa-xmark text-xs"></i></button>`;
                }
                membersHTML += `<li class="flex items-center gap-2 p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"><img src="${window.getAvatar(m)}" class="w-8 h-8 rounded-full object-cover"><span class="text-sm text-gray-800 dark:text-white truncate flex-1">${m.nickname || m.username} ${adminBadge}</span>${removeAction}</li>`;
            });
            membersHTML += `</ul></div>`;
            
            let deleteBtnHTML = '';
            if (group.admin === window.MINE_ID) { deleteBtnHTML = `<button id="group-delete-btn" class="w-full py-3 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 dark:text-red-400 rounded-xl text-sm font-medium border border-red-200 dark:border-red-500/20 flex items-center justify-center gap-2 transition-colors mt-2"><i class="fa-solid fa-trash-can"></i> Giải tán nhóm</button>`; } else { deleteBtnHTML = `<button class="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 flex items-center justify-center gap-2 cursor-not-allowed mt-2" title="Chỉ trưởng nhóm mới được xóa"><i class="fa-solid fa-user-shield"></i> Chỉ trưởng nhóm xóa được</button>`; }
            actionsContainer.innerHTML = ` <button id="group-rename-btn" class="w-full py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-white rounded-xl text-sm font-medium border border-gray-300 dark:border-zinc-700 flex items-center justify-center gap-2 transition-colors mb-2"><i class="fa-solid fa-pen"></i> Đổi tên nhóm</button> <button id="group-add-member-btn" class="w-full py-3 bg-blue-50 dark:bg-brand-purple/10 hover:bg-blue-100 dark:hover:bg-brand-purple/20 text-blue-600 dark:text-brand-purple rounded-xl text-sm font-medium border border-blue-200 dark:border-brand-purple/30 flex items-center justify-center gap-2 transition-colors"><i class="fa-solid fa-user-plus"></i> Thêm thành viên</button> ${deleteBtnHTML} ${membersHTML} `;
            document.getElementById('group-rename-btn').onclick = async () => { const newName = prompt("Nhập tên nhóm mới:", group.name); if (newName && newName !== group.name) { await fetch('/api/chat/group/rename', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ groupId, newName }) }); window.loadChatList(true); window.handleGroupProfile(groupId); document.getElementById('chat-name').textContent = newName; } };
            document.getElementById('group-add-member-btn').onclick = () => { window.currentAddingGroupId = groupId; document.getElementById('add-member-modal').style.display = 'flex'; window.loadFriendsForGroupAdd(); };
            if(document.getElementById('group-delete-btn')) { document.getElementById('group-delete-btn').onclick = async () => { if (confirm(`CẢNH BÁO: Bạn có chắc muốn giải tán nhóm "${group.name}"?`)) { try { const res = await fetch('/api/chat/group/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ groupId }) }); const data = await res.json(); if (data.success) { alert('Đã giải tán nhóm.'); document.getElementById('chat-profile').style.width = '0px'; document.getElementById('chat-profile').classList.remove('border-l'); window.currentChatTo = null; window.showMainSection('section-welcome'); await window.loadChatList(true); } else { alert(data.error); } } catch (err) { alert('Lỗi kết nối server'); } } }; }
            
            chatProfile.style.width = '300px'; chatProfile.classList.add('border-l');
        }
    } catch(e) { console.error('Lỗi profile group:', e); }
};

window.removeMemberFromGroup = async function(groupId, memberId) {
    if(!confirm("Bạn có chắc chắn muốn mời thành viên này ra khỏi nhóm?")) return;
    try {
        const res = await fetch('/api/chat/group/remove-member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId, memberId }) });
        const data = await res.json();
        if(data.success) { await window.handleGroupProfile(groupId); } else { alert(data.error || 'Không thể xóa thành viên'); }
    } catch(e) { console.error(e); alert('Lỗi kết nối server'); }
};

window.openCreateGroupModal = async function() {
    const modal = document.getElementById('create-group-modal');
    const nameInput = document.getElementById('group-name-input');
    const friendListContainer = document.getElementById('create-group-friend-list');

    if (!modal) return console.error("Không tìm thấy modal #create-group-modal");
    modal.style.display = 'flex';
    if(nameInput) nameInput.value = '';

    if (friendListContainer) {
        friendListContainer.innerHTML = '<p class="text-center text-gray-500 dark:text-zinc-500 text-sm py-4">Đang tải danh sách...</p>';
        try {
            const friendsRes = await window.tryFetchJson(['/api/friends']);
            window.ALL_FRIENDS = Array.isArray(friendsRes) ? friendsRes : (friendsRes.data || []);
            friendListContainer.innerHTML = '';
            if (!window.ALL_FRIENDS || window.ALL_FRIENDS.length === 0) {
                friendListContainer.innerHTML = '<p class="text-center text-gray-500 dark:text-zinc-500 text-sm py-4">Bạn chưa có bạn bè nào.</p>';
            } else {
                window.ALL_FRIENDS.forEach(f => {
                    const isChecked = window.targetGroupMemberId === (f._id || f.id) ? 'checked' : '';
                    const html = `<label class="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors select-none border-b border-gray-100 dark:border-zinc-800/50 last:border-0"><div class="flex items-center gap-3"><img src="${window.getAvatar(f)}" class="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-zinc-700"><span class="text-sm font-medium text-gray-800 dark:text-white">${f.nickname}</span></div><input type="checkbox" value="${f._id || f.id}" class="w-5 h-5 rounded border-gray-300 dark:border-zinc-600 text-brand-purple focus:ring-brand-purple bg-transparent transition-all" ${isChecked}></label>`;
                    friendListContainer.insertAdjacentHTML('beforeend', html);
                });
            }
        } catch(e) { console.error(e); friendListContainer.innerHTML = '<p class="text-center text-red-500 text-sm py-4">Lỗi tải danh sách</p>'; }
    }
    if(nameInput) setTimeout(() => nameInput.focus(), 100);
};

window.setupGroupEvents = function() {
    const modal = document.getElementById('create-group-modal');
    const confirmBtn = document.getElementById('confirm-create-group-btn');
    const cancelBtn = document.getElementById('cancel-group-modal-btn');
    const nameInput = document.getElementById('group-name-input');
    if (!modal || !confirmBtn || !cancelBtn) return;

    const openBtnSidebar = document.querySelector('#list-groups button'); 
    if (openBtnSidebar) { openBtnSidebar.removeAttribute('onclick'); openBtnSidebar.addEventListener('click', () => { window.openCreateGroupModal(); }); }

    const openBtnWelcome = document.querySelector('#section-welcome button:nth-child(2)');
    if (openBtnWelcome) { openBtnWelcome.removeAttribute('onclick'); openBtnWelcome.addEventListener('click', () => { window.openCreateGroupModal(); }); }

    cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; if(nameInput) nameInput.value = ''; window.targetGroupMemberId = null; });

    confirmBtn.addEventListener('click', async () => {
        const groupName = nameInput.value.trim();
        const friendListContainer = document.getElementById('create-group-friend-list');
        const selectedCheckboxes = friendListContainer ? friendListContainer.querySelectorAll('input[type="checkbox"]:checked') : [];
        const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);

        if (!groupName) return alert('Vui lòng nhập tên nhóm');
        if (selectedIds.length === 0) return alert('Vui lòng chọn ít nhất 1 thành viên');

        try {
            const res = await fetch('/api/chat/create-group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: groupName, members: selectedIds }) });
            const data = await res.json();
            if(data.success) {
                alert('Tạo nhóm thành công!'); modal.style.display = 'none'; nameInput.value = ''; window.targetGroupMemberId = null;
                const chatProfile = document.getElementById('chat-profile'); if(chatProfile) { chatProfile.style.width = '0px'; chatProfile.classList.remove('border-l'); }
                await window.loadChatList(true); if(data.groupId) window.startChatWith(data.groupId);
            } else { alert(data.error || 'Tạo nhóm thất bại'); }
        } catch(e) { console.error(e); alert('Lỗi kết nối server'); }
    });
};

window.loadFriendsForGroupAdd = async function() {
  const listContainer = document.getElementById("add-member-list");
  if (!listContainer) return;
  listContainer.innerHTML = '<p class="text-center text-gray-500 text-sm">Đang tải...</p>';
  try {
    const friends = await window.tryFetchJson(["/api/friends"]);
    const group = await window.tryFetchJson([`/api/chat/group/${window.currentAddingGroupId}`]);
    const existingIds = group.members.map((m) => m._id);
    const availableFriends = friends.filter((f) => !existingIds.includes(f._id || f.id));

    listContainer.innerHTML = "";
    if (availableFriends.length === 0) { listContainer.innerHTML = '<p class="text-center text-gray-500 text-sm">Không còn bạn bè nào để thêm.</p>'; return; }

    availableFriends.forEach((f) => {
      const div = document.createElement("div");
      div.className = "flex items-center justify-between p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer";
      div.innerHTML = `<div class="flex items-center gap-3"><img src="${window.getAvatar(f)}" class="w-10 h-10 rounded-full"><span class="text-sm font-medium text-gray-800 dark:text-white">${f.nickname}</span></div><i class="fa-solid fa-plus text-brand-purple"></i>`;
      div.onclick = () => window.confirmAddMember(f._id || f.id);
      listContainer.appendChild(div);
    });
  } catch (e) { console.error(e); }
};

window.confirmAddMember = async function(memberId) {
  try {
    const res = await fetch("/api/chat/group/add-member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: window.currentAddingGroupId, memberId }) });
    const data = await res.json();
    if (data.success) { alert("Đã thêm thành viên!"); document.getElementById("add-member-modal").style.display = "none"; window.handleGroupProfile(window.currentAddingGroupId); } else alert(data.error);
  } catch (e) { alert("Lỗi server"); }
};