/* ================ INITIALIZATION ================ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. Đảm bảo Socket được khởi tạo
    if (!window.socket)
      window.socket = io(window.location.origin, {
        withCredentials: true,
        autoConnect: true,
      });

    await loadSessionUser();
    if (window.checkPasswordChangeHint) window.checkPasswordChangeHint();

    // 2. Cài đặt sự kiện
    setupSidebarEvents();
    setupInputEvents();
    setupSettingsEvents();
    setupSocketEvents();
    setupSearchEvents();
    attachProfileEvents();
    setupChatHeaderEvents();
    setupGroupEvents();

    await loadChatList(true);

    // 3. Khôi phục trạng thái
    const bg = localStorage.getItem("mainContentBg");
    if (bg && window.applyBackground) window.applyBackground(bg);

    const savedStatus = localStorage.getItem("userStatus");
    const statusToggle = document.getElementById("incoming-status-toggle");
    if (savedStatus && statusToggle)
      statusToggle.checked = savedStatus === "online";

    const storedChat = sessionStorage.getItem("currentChatTo");
    if (storedChat) {
      sessionStorage.removeItem("currentChatTo");
      await window.startChatWith(storedChat);
    }
  } catch (err) {
    console.error("Init Error:", err);
    if (String(err.message).includes("401")) location.href = "/login";
  }
});

/* ================ CORE LOGIC FUNCTIONS ================ */

async function loadSessionUser() {
  try {
    const user = await window.tryFetchJson(["/api/users/profile"]);
    if (!user || !user._id) throw new Error("401");

    if (!user.nickname?.trim()) return (location.href = "/setup-nickname");

    window.MINE_ID = user._id;

    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.src = window.getAvatar(user);

    loadProfile();
    await loadFriends();
  } catch (e) {
    if (String(e.message).includes("401")) location.href = "/login";
  }
}

// ✅ FIX: HÀM MỞ CHAT THÔNG MINH (QUAN TRỌNG)
window.startChatWith = async function (targetId) {
  if (!targetId || !window.MINE_ID) return;

  // 1. Tìm xem targetId là User hay Group trong danh sách đã load
  let existingChat = window.ALL_CHATS.find(
    (c) => c._id === targetId || c.partnerId === targetId
  );

  // Nếu không tìm thấy trong chat list, tìm trong friend list (chỉ dành cho User)
  if (!existingChat) {
    const friend = window.ALL_FRIENDS.find((f) => (f._id || f.id) === targetId);
    if (friend) {
      // Tạo object giả lập để xử lý như chat 1-1
      existingChat = {
        ...friend,
        isGroup: false,
        partnerId: friend._id || friend.id,
      };
    }
  }

  const isGroup = existingChat ? existingChat.isGroup : false;

  // 2. Thiết lập Room ID & Chat To
  if (isGroup) {
    // 👉 LÀ NHÓM: RoomID = GroupID
    window.currentRoomId = existingChat._id;
    window.currentChatTo = null; // Chat nhóm không có partner cụ thể
  } else {
    // 👉 LÀ USER: RoomID = "ID1_ID2" (hoặc ChatID nếu đã có)
    window.currentChatTo = targetId;
    if (existingChat && existingChat._id && existingChat._id !== targetId) {
      // Nếu đã có đoạn chat 1-1 thực sự trong DB
      window.currentRoomId = existingChat._id;
    } else {
      // Tạo ID tạm cho socket join
      window.currentRoomId = [window.MINE_ID, targetId].sort().join("_");
    }
  }

  // Lưu session
  if (window.currentRoomId)
    sessionStorage.setItem("currentRoomId", window.currentRoomId);
  if (window.currentChatTo)
    sessionStorage.setItem("currentChatTo", window.currentChatTo);

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
        // ============================================================
        // 👉 FIX LOGIC NHÓM: ONLINE KHI CÓ THÀNH VIÊN KHÁC ONLINE
        // ============================================================
        let isGroupOnline = false;
        
        if (Array.isArray(existingChat.members)) {
            // Kiểm tra có ai online (trừ bản thân mình)
            isGroupOnline = existingChat.members.some(m => 
                String(m._id) !== String(window.MINE_ID) && m.online
            );
        }

        // Text hiển thị: Nếu online thì hiện "Đang hoạt động", nếu không thì hiện số thành viên
        const statusText = isGroupOnline 
            ? "Đang hoạt động" 
            : `Thành viên: ${existingChat.members ? existingChat.members.length : '?'}`;

        updateHeaderUI(
            existingChat.groupName,
            window.getAvatar(existingChat),
            isGroupOnline, // True/False dựa trên logic trên
            statusText
        );
    } else {
        // 👉 USER 1-1: Dùng trạng thái online thực tế
        updateHeaderUI(
            existingChat.nickname,
            window.getAvatar(existingChat),
            existingChat.online,
            existingChat.online ? "Đang hoạt động" : "Ngoại tuyến"
        );
    }
  } else {
    // Fallback gọi API lấy info user (Giữ nguyên)
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
  await loadHistory();
};

// ✅ FIX: LOAD HISTORY DÙNG ROOM ID
async function loadHistory(prepend = false) {
  try {
    // Quan trọng: Gửi roomId thay vì user1/user2 để hỗ trợ cả nhóm
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
    else {
      msgEl.appendChild(container);
      msgEl.scrollTop = msgEl.scrollHeight;
    }
    window.skip += msgs.length;
  } catch (e) {
    console.error(e);
  }
}

async function sendMessage() {
  if (window.isSending) return;
  const input = document.getElementById("message-input");
  const text = input.value.trim();
  const fileInput = document.getElementById("file-input");

  if (!text && !fileInput.files.length) return;
  window.isSending = true;

  let fileUrl = null,
    fileKey = null;
  if (fileInput.files.length) {
    const f = fileInput.files[0];
    const form = new FormData();
    const key = f.type.startsWith("image/") ? "image" : "file";
    form.append(key, f);
    try {
      const res = await fetch(`/api/upload/${key}`, {
        method: "POST",
        body: form,
      });
      const d = await res.json();
      if (d.url) {
        fileUrl = d.url;
        fileKey = key;
      }
    } catch (e) {
      window.isSending = false;
      return alert("Upload lỗi");
    }
  }

  const payload = {
    receiver: window.currentChatTo,
    roomId: window.currentRoomId,
    text,
    ...(fileUrl && { [fileKey]: fileUrl }),
  };

  try {
    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const savedMsg = await res.json();

    const msgNode = window.buildMessageNode(savedMsg, true);
    document.getElementById("messages").appendChild(msgNode);
    document.getElementById("messages").scrollTop =
      document.getElementById("messages").scrollHeight;

    window.socket.emit("newMessage", savedMsg);

    input.value = "";
    input.style.height = "auto";
    fileInput.value = "";
    document.getElementById("file-preview").style.display = "none";
    document.getElementById("file-preview").classList.add("hidden");

    // Nếu là tin nhắn đầu tiên của cuộc trò chuyện mới, reload list để cập nhật ID
    if (savedMsg.roomId && savedMsg.roomId !== window.currentRoomId) {
      window.currentRoomId = savedMsg.roomId;
      await loadChatList();
    }
  } catch (e) {
    console.error(e);
  } finally {
    window.isSending = false;
  }
}

/* ================ DATA LOADERS ================ */

async function loadChatList(force = false) {
  if (window.ALL_CHATS.length && !force) return;
  try {
    // 1. Load chats
    const chats = await window.tryFetchJson(["/api/chat/chats"]);
    window.ALL_CHATS = Array.isArray(chats) ? chats : [];

    // 2. Load friends
    const friends = await window.tryFetchJson(["/api/friends"]);
    window.ALL_FRIENDS = Array.isArray(friends) ? friends : [];

    // 3. Gộp danh sách (Chat + Bạn bè chưa chat)
    const existingChatIds = new Set(
      window.ALL_CHATS.map((c) => c.partnerId || c._id)
    );
    const friendsNotInChat = window.ALL_FRIENDS.filter(
      (f) => !existingChatIds.has(f._id || f.id)
    ).map((f) => ({
      _id: f._id || f.id,
      partnerId: f._id || f.id,
      nickname: f.nickname,
      avatar: f.avatar,
      online: f.online,
      isGroup: false,
    }));

    const combinedList = [...window.ALL_CHATS, ...friendsNotInChat];
    // Sort theo tin nhắn mới nhất
    combinedList.sort((a, b) => {
      const tA = a.lastMessage
        ? new Date(a.lastMessage.createdAt)
        : new Date(0);
      const tB = b.lastMessage
        ? new Date(b.lastMessage.createdAt)
        : new Date(0);
      return tB - tA;
    });

    window.displayChats(
      combinedList,
      document.getElementById("friend-list-chat")
    );

    // 4. Render List Nhóm riêng
    const groups = window.ALL_CHATS.filter((c) => c.isGroup);

    const groupSidebarList = document.getElementById("group-list");
    if (groupSidebarList) {
      groupSidebarList.innerHTML = groups.length
        ? ""
        : '<li class="text-center text-xs text-gray-500 mt-4">Chưa tham gia nhóm nào</li>';
      groups.forEach((g) =>
        groupSidebarList.insertAdjacentHTML(
          "beforeend",
          window.createChatItemHTML(g)
        )
      );
    }

    const groupGrid = document.getElementById("group-grid-list");
    if (groupGrid) {
      groupGrid.innerHTML = groups.length
        ? ""
        : '<div class="col-span-full text-center text-gray-500 mt-10">Chưa tham gia nhóm nào</div>';
      groups.forEach((g) => {
        const html = `<li class="bg-white dark:bg-brand-panel border border-gray-200 dark:border-brand-border p-4 rounded-2xl flex flex-col items-center gap-3 hover:border-brand-purple transition-all shadow-sm cursor-pointer" onclick="window.startChatWith('${
          g._id
        }')"><img src="${window.getAvatar(
          g
        )}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-zinc-800"><div class="text-center"><h4 class="font-bold text-gray-800 dark:text-white truncate max-w-[150px]">${
          g.nickname
        }</h4><span class="text-xs text-gray-500 dark:text-zinc-500">Thành viên: ${
          g.members ? g.members.length : "?"
        }</span></div></li>`;
        groupGrid.insertAdjacentHTML("beforeend", html);
      });
    }
  } catch (e) {}
}

// Hàm này chỉ để load vào tab "Bạn bè" riêng biệt, không can thiệp tab Chat nữa
async function loadFriends(full = false) {
  try {
    const friends = await window.tryFetchJson(["/api/friends"]);
    window.ALL_FRIENDS = Array.isArray(friends) ? friends : [];
    if (full && window.displayFriends) {
      window.displayFriends(
        window.ALL_FRIENDS,
        document.getElementById("friend-list-friends")
      );
    }
  } catch (e) {}
}

async function loadAllUsers() {
  try {
    const users = await window.tryFetchJson(["/api/friends/all-users"]);
    window.ALL_USERS = Array.isArray(users) ? users : [];
    window.displayAllUsers(
      window.ALL_USERS,
      document.getElementById("all-user-list")
    );
  } catch (e) {}
}

async function loadRequests() {
  try {
    const reqs = await window.tryFetchJson(["/api/friends/requests"]);
    window.displayRequests(reqs, document.getElementById("requests-list"));
  } catch (e) {}
}

async function loadProfile() {
  try {
    const u = await window.tryFetchJson(["/api/users/profile"]);
    if (!u) return;

    let formattedDate = "Chưa cập nhật";
    let dateISO = "";
    if (u.dateOfBirth) {
      dateISO = u.dateOfBirth.split("T")[0];
      const d = new Date(u.dateOfBirth);
      formattedDate = d.toLocaleDateString("vi-VN");
    }
    const gMap = { male: "Nam", female: "Nữ", other: "Khác" };
    const genderText = gMap[u.gender] || "Chưa cập nhật";

    const mainAvatar = document.getElementById("main-profile-avatar-display");
    if (mainAvatar) mainAvatar.src = window.getAvatar(u);
    document.getElementById("current-display-name-profile").textContent =
      u.nickname;
    document.getElementById("current-birthdate-profile").textContent =
      formattedDate;
    document.getElementById("current-gender-profile").textContent = genderText;

    const secAvatar = document.getElementById("security-profile-avatar");
    if (secAvatar) secAvatar.src = window.getAvatar(u);
    document.getElementById("current-display-name").textContent = u.nickname;

    const nickInput = document.getElementById("nickname-input-security");
    if (nickInput) nickInput.value = u.nickname;
    const dobInput = document.getElementById("dob-input");
    if (dobInput) dobInput.value = dateISO;
    const genderInput = document.getElementById("gender-input");
    if (genderInput) genderInput.value = u.gender || "male";

    const sideAvatar = document.getElementById("profile-avatar");
    if (sideAvatar) sideAvatar.src = window.getAvatar(u);
  } catch (e) {
    console.error("Load Profile Err:", e);
  }
}

/* ================ EVENTS ================ */

function setupSidebarEvents() {
  document
    .querySelectorAll(".sidebar-left button[data-func]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const func = btn.dataset.func;

        document.querySelectorAll(".sidebar-left button").forEach((b) => {
          b.classList.remove(
            "bg-brand-purple",
            "text-white",
            "shadow-lg",
            "shadow-purple-500/30"
          );
          b.classList.add("text-zinc-400");
        });
        btn.classList.remove("text-zinc-400");
        btn.classList.add(
          "bg-brand-purple",
          "text-white",
          "shadow-lg",
          "shadow-purple-500/30"
        );

        document
          .querySelectorAll(".list-section")
          .forEach((el) => el.classList.remove("active"));

        if (func === "chat") {
          document.getElementById("list-chat").classList.add("active");
          if (window.currentChatTo) window.showMainSection("section-chat");
          else window.showMainSection("section-welcome");
        } else if (func === "friends") {
          document.getElementById("list-friends").classList.add("active");
          window.showMainSection("section-friends");
          loadFriends(true);
        } else if (func === "profile") {
          window.showMainSection("section-profile");
          loadProfile();
        } else if (func === "setting") {
          document.getElementById("list-settings").classList.add("active");
          window.showMainSection("section-settings");
          const statusTab = document.querySelector(
            '#settings-menu li[data-menu="status"]'
          );
          if (statusTab) statusTab.click();
        } else if (func === "groups") {
          document.getElementById("list-groups").classList.add("active");
          window.showMainSection("section-groups");
          loadChatList();
        }
      });
    });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    if (confirm("Đăng xuất khỏi hệ thống?")) {
      await fetch("/logout");
      location.href = "/login";
    }
  });
}

function setupInputEvents() {
  const input = document.getElementById("message-input");
  const sendAction = () => {
    sendMessage();
    input.style.height = "auto";
  };

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAction();
    }
  });
  document.getElementById("send-btn")?.addEventListener("click", sendAction);
  input?.addEventListener("input", handleTypingInput);

  const fileInput = document.getElementById("file-input");
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) {
      document.getElementById("file-preview").classList.remove("hidden");
      document.getElementById("file-preview").style.display = "flex";
      document.getElementById("preview-content").textContent = `${
        file.name
      } (${(file.size / 1024).toFixed(1)} KB)`;
    }
  });
  document
    .getElementById("remove-preview-btn")
    ?.addEventListener("click", () => {
      fileInput.value = "";
      document.getElementById("file-preview").classList.add("hidden");
      document.getElementById("file-preview").style.display = "none";
    });

  // Click chat list
  document
    .getElementById("friend-list-chat")
    ?.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li && li.dataset._id) {
        window.startChatWith(li.dataset._id);
      }
    });

  // Click danh sách nhóm
  document.getElementById("group-list")?.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li && li.dataset._id) {
      window.startChatWith(li.dataset._id);
    }
  });

  const msgEl = document.getElementById("messages");
  const inputWrapper = document.getElementById("chat-input-wrapper");
  msgEl?.addEventListener("scroll", () => {
    const scrollTop = msgEl.scrollTop;
    const atTop = scrollTop === 0;
    const gap = msgEl.scrollHeight - msgEl.clientHeight - scrollTop;

    if (inputWrapper) {
      if (scrollTop > window.lastScrollTop + 10)
        inputWrapper.classList.add("hidden");
      if (scrollTop < window.lastScrollTop - 10 || gap > 100)
        inputWrapper.classList.remove("hidden");
    }
    window.lastScrollTop = scrollTop;

    if (atTop && !window.loadingHistory && window.currentRoomId) {
      window.loadingHistory = true;
      loadHistory(true).finally(() => (window.loadingHistory = false));
    }
  });
}

function handleTypingInput() {
  const input = document.getElementById("message-input");
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
  if (!window.currentRoomId) return;
  window.socket.emit("typing", {
    roomId: window.currentRoomId,
    to: window.currentChatTo,
  });
  clearTimeout(window.typingTimer);
  window.typingTimer = setTimeout(() => {
    window.socket.emit("stopTyping", {
      roomId: window.currentRoomId,
      to: window.currentChatTo,
    });
  }, window.TYPING_DEBOUNCE);
}

function setupSearchEvents() {
  document
    .getElementById("chat-search-input")
    ?.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase();
      const filtered = window.ALL_CHATS.filter((c) =>
        (c.nickname || c.groupName || "").toLowerCase().includes(val)
      );
      window.displayChats(
        filtered,
        document.getElementById("friend-list-chat")
      );
    });
  document
    .getElementById("friend-search-input")
    ?.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase();
      const filtered = window.ALL_FRIENDS.filter((u) =>
        (u.nickname || "").toLowerCase().includes(val)
      );
      window.displayFriends(
        filtered,
        document.getElementById("friend-list-friends")
      );
    });
}

function setupSettingsEvents() {
  document.getElementById("friend-menu")?.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    document.querySelectorAll("#friend-menu li").forEach((el) => {
      el.classList.remove(
        "bg-zinc-800",
        "border-brand-purple/50",
        "text-white"
      );
      el.classList.add("hover:bg-zinc-700");
    });
    li.classList.add("bg-zinc-800", "border-brand-purple/50", "text-white");

    const menu = li.dataset.menu;
    if (menu === "friends") {
      window.showMainSection("section-friends");
      loadFriends(true);
    } else if (menu === "requests") {
      window.showMainSection("section-requests");
      loadRequests();
    } else if (menu === "all-user") {
      window.showMainSection("section-all-users");
      loadAllUsers();
    }
  });

  document.getElementById("settings-menu")?.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;

    document.querySelectorAll("#settings-menu li").forEach((el) => {
      el.classList.remove(
        "active",
        "bg-brand-purple/10",
        "border-brand-purple/30",
        "border"
      );
      el.querySelector("i").classList.remove("text-brand-purple");
    });
    li.classList.add(
      "active",
      "bg-brand-purple/10",
      "border-brand-purple/30",
      "border"
    );
    li.querySelector("i").classList.add("text-brand-purple");

    window.showMainSection("section-settings");
    const menu = li.dataset.menu;
    document
      .querySelectorAll(".setting-content")
      .forEach((el) => el.classList.remove("active"));

    const targetContent = document.getElementById(`settings-${menu}`);
    if (targetContent) targetContent.classList.add("active");

    if (menu === "security") loadProfile();
  });

  const statusToggle = document.getElementById("incoming-status-toggle");
  if (statusToggle) {
    const savedStatus = localStorage.getItem("userStatus") || "online";
    statusToggle.checked = savedStatus === "online";
    if (savedStatus === "offline") document.body.classList.add("ghost-mode");

    statusToggle.addEventListener("change", () => {
      const newStatus = statusToggle.checked ? "online" : "offline";
      localStorage.setItem("userStatus", newStatus);
      if (newStatus === "offline") {
        document.body.classList.add("ghost-mode");
        if (window.socket.connected)  window.socket.emit("updateStatus", { status: "offline" });
      } else {
        document.body.classList.remove("ghost-mode");
        if (window.socket.connected)  window.socket.emit("updateStatus", { status: "online" });
      }

      if (document.getElementById("friend-list-chat")) {
          // 1. Lấy danh sách ID đã có trong Chat
          const existingChatIds = new Set(
             (window.ALL_CHATS || []).map((c) => c.partnerId || c._id)
          );
          
          // 2. Lấy danh sách bạn bè CHƯA có trong Chat để gộp vào
          const friendsNotInChat = (window.ALL_FRIENDS || []).filter(
             (f) => !existingChatIds.has(f._id || f.id)
          ).map((f) => ({
             _id: f._id || f.id,
             partnerId: f._id || f.id,
             nickname: f.nickname,
             avatar: f.avatar,
             online: f.online,
             isGroup: false,
             lastMessage: null 
          }));

          // 3. Tạo danh sách đầy đủ
          const fullList = [...(window.ALL_CHATS || []), ...friendsNotInChat];

          // 4. Sắp xếp lại (Tin mới nhất lên đầu)
          fullList.sort((a, b) => {
             const tA = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
             const tB = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
             return tB - tA;
          });

          // 5. Vẽ lại danh sách đầy đủ
          window.displayChats(
             fullList,
             document.getElementById("friend-list-chat")
          );
      }

      // Vẽ lại danh sách Nhóm (Sidebar Tab Nhóm)
      const groupSidebarList = document.getElementById("group-list");
      if (groupSidebarList && window.ALL_CHATS) {
          const groups = window.ALL_CHATS.filter((c) => c.isGroup);
          groupSidebarList.innerHTML = groups.length
            ? ""
            : '<li class="text-center text-xs text-gray-500 mt-4">Chưa tham gia nhóm nào</li>';
          groups.forEach((g) =>
            groupSidebarList.insertAdjacentHTML(
              "beforeend",
              window.createChatItemHTML(g)
            )
          );
      }
    });
  }

  const darkModeToggle = document.getElementById("dark-mode-toggle");
  if (darkModeToggle) {
    const isDark = document.documentElement.classList.contains("dark");
    darkModeToggle.checked = isDark;
    darkModeToggle.addEventListener("change", () => {
      if (darkModeToggle.checked) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    });
  }

  document
    .getElementById("background-upload-btn")
    ?.addEventListener("click", async () => {
      const file = document.getElementById("background-input")?.files?.[0];
      if (!file) return alert("Vui lòng chọn ảnh!");
      const form = new FormData();
      form.append("background", file);
      try {
        const res = await fetch("/api/upload/background", {
          method: "POST",
          body: form,
          credentials: "include",
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        window.applyBackground(data.url);
        alert("Cập nhật hình nền thành công!");
      } catch (e) {
        alert("Lỗi cập nhật hình nền: " + e.message);
      }
    });
}

function attachProfileEvents() {
  const editBtn = document.getElementById("edit-personal-info-btn");
  const cancelBtn = document.getElementById("cancel-update-btn");
  const updateForm = document.getElementById("update-form-section");

  editBtn?.addEventListener("click", () => {
    if (updateForm) updateForm.style.display = "block";
    const currentName = document.getElementById(
      "current-display-name"
    )?.textContent;
    if (document.getElementById("nickname-input-security"))
      document.getElementById("nickname-input-security").value = currentName;
  });

  cancelBtn?.addEventListener("click", () => {
    if (updateForm) updateForm.style.display = "none";
  });

  document
    .getElementById("update-personal-info-btn")
    ?.addEventListener("click", async () => {
      const nick = document.getElementById("nickname-input-security").value;
      const dob = document.getElementById("dob-input").value;
      const gender = document.getElementById("gender-input").value;
      if (!nick || !dob) return alert("Vui lòng nhập đủ thông tin");
      try {
        const res = await fetch("/api/users/settings/update-personal-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nick, dateOfBirth: dob, gender }),
        });
        const d = await res.json();
        if (d.success) {
          alert("Cập nhật thành công");
          await loadProfile();
          cancelBtn.click();
        } else alert(d.error);
      } catch (e) {
        alert("Lỗi cập nhật: " + e.message);
      }
    });

  ["avatar-upload-input", "avatar-upload-input-profile-section"].forEach(
    (id) => {
      const input = document.getElementById(id);
      input?.addEventListener("change", async () => {
        const f = input.files?.[0];
        if (!f) return;
        const form = new FormData();
        form.append("avatar", f);
        try {
          const res = await fetch("/api/users/update-avatar", {
            method: "POST",
            body: form,
            credentials: "include",
          });
          const data = await res.json();
          if (!data.success) throw new Error("Upload failed");
          await loadProfile();
          alert("Cập nhật ảnh đại diện thành công!");
        } catch (e) {
          alert("Lỗi upload ảnh");
        }
      });
    }
  );

  const pwModal = document.getElementById("password-modal");
  document
    .getElementById("open-password-modal-from-settings")
    ?.addEventListener("click", () => (pwModal.style.display = "flex"));
  document
    .getElementById("close-password-modal-btn")
    ?.addEventListener("click", () => (pwModal.style.display = "none"));

  document
    .getElementById("submit-password-change-btn")
    ?.addEventListener("click", async () => {
      const oldPass = document.getElementById("old-password-input").value;
      const newPass = document.getElementById("new-password-input").value;
      const msg = document.getElementById("password-msg");
      if (newPass.length < 6)
        return (msg.textContent = "Mật khẩu mới phải từ 6 ký tự");
      try {
        const res = await fetch("/api/users/update-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
        });
        const d = await res.json();
        if (d.success) {
          alert("Đổi mật khẩu thành công!");
          pwModal.style.display = "none";
          document.getElementById("old-password-input").value = "";
          document.getElementById("new-password-input").value = "";
        } else msg.textContent = d.error;
      } catch (e) {
        msg.textContent = "Lỗi server";
      }
    });

  document
    .getElementById("redirect-to-security-settings")
    ?.addEventListener("click", () => {
      document
        .querySelector('.sidebar-left button[data-func="setting"]')
        ?.click();
      setTimeout(() => {
        document
          .querySelector('#settings-menu li[data-menu="security"]')
          ?.click();
      }, 100);
    });
}

function setupSocketEvents() {
  window.socket.on("newMessage", (msg) => {
    if (
      msg.roomId === window.currentRoomId &&
      (msg.sender._id || msg.sender) !== window.MINE_ID
    ) {
      if (window.renderedMessageIds.has(msg._id)) return;
      window.renderedMessageIds.add(msg._id);
      const node = window.buildMessageNode(msg, false);
      document.getElementById("messages").appendChild(node);
      document.getElementById("messages").scrollTop =
        document.getElementById("messages").scrollHeight;
    }
  });

  window.socket.on("typing", (data) => {
    if (data.roomId === window.currentRoomId && data.from !== window.MINE_ID) {
      const ind = document.getElementById("typing-indicator-container");
      if (ind) {
        ind.style.display = "flex";
        clearTimeout(window.roomTypingTimers[data.roomId]);
        window.roomTypingTimers[data.roomId] = setTimeout(
          () => (ind.style.display = "none"),
          3000
        );
        document.getElementById("messages").scrollTop =
          document.getElementById("messages").scrollHeight;
      }
    }
  });

  window.socket.on("stopTyping", (data) => {
    if (data.roomId === window.currentRoomId) {
      const ind = document.getElementById("typing-indicator-container");
      if (ind) ind.style.display = "none";
    }
  });

  window.socket.on("forceLogout", (data) => {
    alert(`🚨 TÀI KHOẢN BỊ KHÓA 🚨\n\nLý do: ${data.message}`);
    window.location.href = "/logout";
  });

  window.socket.on("userStatusUpdate", (data) => {
    // 1. Cập nhật data trong mảng cache
    const updateList = (list) => {
      const item = list.find((u) => String(u._id || u.id) === String(data.userId)); // Fix: Ép kiểu String
      if (item) item.online = data.status === "online";
    };
    updateList(window.ALL_FRIENDS);
    window.ALL_CHATS.forEach(chat => {
        if (chat.isGroup && Array.isArray(chat.members)) {
            const member = chat.members.find(m => String(m._id) === String(data.userId));
            if (member) {
                member.online = data.status === "online";
            }
        } else if (!chat.isGroup && String(chat.partnerId || chat._id) === String(data.userId)) {
             chat.online = data.status === "online";
        }
    });

    // 2. Cập nhật Header (như cũ)
    if (window.currentChatTo === data.userId) {
      const statusTextEl = document.getElementById("header-status-text");
      const statusDotEl = document.getElementById("header-status-dot");
      if (data.status === "online") {
        if (statusTextEl) {
          statusTextEl.textContent = "Đang hoạt động";
          statusTextEl.className = "text-[11px] text-brand-purple font-medium";
        }
        if (statusDotEl) statusDotEl.classList.remove("hidden");
      } else {
        if (statusTextEl) {
          statusTextEl.textContent = "Ngoại tuyến";
          statusTextEl.className = "text-[11px] text-zinc-500 dark:text-zinc-400 font-medium";
        }
        if (statusDotEl) statusDotEl.classList.add("hidden");
      }
    }

    // ✅ FIX 3: Cập nhật Profile Sidebar nếu đang mở đúng User đó
    const chatProfile = document.getElementById('chat-profile');
    // Kiểm tra xem Sidebar có đang mở user này không (dựa vào dataset đã thêm ở Bước 1)
    if (chatProfile && chatProfile.offsetWidth > 0 && String(chatProfile.dataset.viewingId) === String(data.userId)) {
        const avatarContainer = document.getElementById('profile-avatar-preview').parentElement;
        const existingDot = avatarContainer.querySelector('.online-indicator');
        if (existingDot) existingDot.remove(); // Xóa dot cũ

        if (data.status === "online") {
            const dot = document.createElement('div');
            dot.className = 'online-indicator absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-4 border-white dark:border-brand-panel rounded-full';
            avatarContainer.appendChild(dot);
        }
    }

    // 4. Render lại list chat (như cũ)
    if (document.getElementById("friend-list-chat") && window.displayChats)
      window.displayChats(
        window.ALL_CHATS,
        document.getElementById("friend-list-chat")
      );
  });
}

/* ================ ✅ PROFILE HANDLER: USER & GROUP ================ */
window.openProfileHandler = async function (targetId) {
  const chatGroup = window.ALL_CHATS.find(
    (c) => c._id === targetId && c.isGroup
  );
  if (chatGroup) {
    await handleGroupProfile(targetId);
  } else {
    await handleUserProfile(targetId);
  }
};

window.removeMemberFromGroup = async function(groupId, memberId) {
    if(!confirm("Bạn có chắc chắn muốn mời thành viên này ra khỏi nhóm?")) return;
    
    try {
        const res = await fetch('/api/chat/group/remove-member', { // Cần đảm bảo Backend có API này
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, memberId })
        });
        
        const data = await res.json();
        if(data.success) {
            // Load lại profile nhóm để cập nhật danh sách
            await handleGroupProfile(groupId);
        } else {
            alert(data.error || 'Không thể xóa thành viên');
        }
    } catch(e) {
        console.error(e);
        alert('Lỗi kết nối server');
    }
};

window.openCreateGroupModal = async function() {
    const modal = document.getElementById('create-group-modal');
    const nameInput = document.getElementById('group-name-input');
    
    // Tìm container danh sách MỚI NHẤT từ DOM mỗi lần gọi hàm
    const friendListContainer = document.getElementById('create-group-friend-list');

    if (!modal) return console.error("Không tìm thấy modal #create-group-modal");
    
    modal.style.display = 'flex';
    if(nameInput) nameInput.value = '';

    if (friendListContainer) {
        friendListContainer.innerHTML = '<p class="text-center text-gray-500 dark:text-zinc-500 text-sm py-4">Đang tải danh sách...</p>';
        
        try {
            // Luôn fetch mới để đảm bảo dữ liệu đúng
            const friendsRes = await window.tryFetchJson(['/api/friends']);
            window.ALL_FRIENDS = Array.isArray(friendsRes) ? friendsRes : (friendsRes.data || []);

            friendListContainer.innerHTML = '';
            if (!window.ALL_FRIENDS || window.ALL_FRIENDS.length === 0) {
                friendListContainer.innerHTML = '<p class="text-center text-gray-500 dark:text-zinc-500 text-sm py-4">Bạn chưa có bạn bè nào.</p>';
            } else {
                window.ALL_FRIENDS.forEach(f => {
                    // Auto-check người được chọn từ profile
                    const isChecked = window.targetGroupMemberId === (f._id || f.id) ? 'checked' : '';
                    
                    const html = `
                        <label class="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors select-none border-b border-gray-100 dark:border-zinc-800/50 last:border-0">
                            <div class="flex items-center gap-3">
                                <img src="${window.getAvatar(f)}" class="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-zinc-700">
                                <span class="text-sm font-medium text-gray-800 dark:text-white">${f.nickname}</span>
                            </div>
                            <input type="checkbox" value="${f._id || f.id}" class="w-5 h-5 rounded border-gray-300 dark:border-zinc-600 text-brand-purple focus:ring-brand-purple bg-transparent transition-all" ${isChecked}>
                        </label>
                    `;
                    friendListContainer.insertAdjacentHTML('beforeend', html);
                });
            }
        } catch(e) {
            console.error(e);
            friendListContainer.innerHTML = '<p class="text-center text-red-500 text-sm py-4">Lỗi tải danh sách</p>';
        }
    } else {
        console.error("Không tìm thấy thẻ div danh sách: #create-group-friend-list");
    }
    
    if(nameInput) setTimeout(() => nameInput.focus(), 100);
};

// ✅ 2. SETUP SỰ KIỆN NÚT BẤM (CHỈ CHẠY 1 LẦN)
function setupGroupEvents() {
    const modal = document.getElementById('create-group-modal');
    const confirmBtn = document.getElementById('confirm-create-group-btn');
    const cancelBtn = document.getElementById('cancel-group-modal-btn');
    const nameInput = document.getElementById('group-name-input');

    if (!modal || !confirmBtn || !cancelBtn) return;

    // 1. Nút dấu cộng (+) ở Sidebar nhóm
    const openBtnSidebar = document.querySelector('#list-groups button'); 
    if (openBtnSidebar) {
        // Gỡ bỏ onclick cũ trong HTML (nếu có) và thay bằng hàm load dữ liệu
        openBtnSidebar.removeAttribute('onclick'); 
        openBtnSidebar.addEventListener('click', () => {
            window.openCreateGroupModal();
        });
    }

    // 2. Nút "Tạo nhóm" ở màn hình Welcome
    const openBtnWelcome = document.querySelector('#section-welcome button:nth-child(2)');
    if (openBtnWelcome) {
        openBtnWelcome.removeAttribute('onclick');
        openBtnWelcome.addEventListener('click', () => {
            window.openCreateGroupModal();
        });
    }

    // Nút Hủy
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if(nameInput) nameInput.value = '';
        window.targetGroupMemberId = null;
    });

    // Nút Tạo Nhóm
    confirmBtn.addEventListener('click', async () => {
        const groupName = nameInput.value.trim();
        
        // Tìm lại container để lấy checkbox
        const friendListContainer = document.getElementById('create-group-friend-list');
        const selectedCheckboxes = friendListContainer ? friendListContainer.querySelectorAll('input[type="checkbox"]:checked') : [];
        const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);

        if (!groupName) return alert('Vui lòng nhập tên nhóm');
        if (selectedIds.length === 0) return alert('Vui lòng chọn ít nhất 1 thành viên');

        try {
            const res = await fetch('/api/chat/create-group', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: groupName, members: selectedIds })
            });
            
            const data = await res.json();
            if(data.success) {
                alert('Tạo nhóm thành công!');
                modal.style.display = 'none';
                nameInput.value = '';
                window.targetGroupMemberId = null;
                
                // Reset Sidebar Profile
                const chatProfile = document.getElementById('chat-profile');
                if(chatProfile) {
                    chatProfile.style.width = '0px'; 
                    chatProfile.classList.remove('border-l');
                }

                await loadChatList(true); 
                if(data.groupId) window.startChatWith(data.groupId);
            } else {
                alert(data.error || 'Tạo nhóm thất bại');
            }
        } catch(e) {
            console.error(e);
            alert('Lỗi kết nối server');
        }
    });
}
async function handleUserProfile(userId) {
    if(userId === window.MINE_ID) { window.showMainSection('section-profile'); loadProfile(); return; }
    const chatProfile = document.getElementById('chat-profile'); if (!chatProfile) return;
    
    // ✅ FIX 1: Lưu ID người đang xem vào dataset để Socket biết đường update
    chatProfile.dataset.viewingId = userId; 

    try {
        const u = await window.tryFetchJson([`/api/users/info/${userId}`]);
        if(u) {
            // ✅ FIX 2: Ép kiểu String để tìm chính xác trong cache (nơi chứa status realtime)
            const friendInList = window.ALL_FRIENDS.find(f => String(f._id || f.id) === String(userId)) || 
                                 window.ALL_CHATS.find(c => String(c.partnerId || c._id) === String(userId));
            
            // Logic status: Ưu tiên cache socket > API
            const isOnline = friendInList ? friendInList.online : u.online;

            document.getElementById('profile-name').textContent = u.nickname || u.username;
            document.getElementById('profile-avatar-preview').src = window.getAvatar(u);
            
            // ============================================================
            // ✅ FIX 3: XÓA SẠCH DOT CŨ (BAO GỒM CẢ DOT CỨNG TRONG HTML)
            // ============================================================
            const avatarContainer = document.getElementById('profile-avatar-preview').parentElement;
            
            // Thay vì tìm class '.online-indicator', ta tìm tất cả thẻ div (là các chấm status) trong container này và xóa hết
            const oldDots = avatarContainer.querySelectorAll('div');
            oldDots.forEach(dot => dot.remove());

            // Sau khi xóa sạch, nếu Online thật thì mới tạo dot mới
            if (isOnline) {
                const dot = document.createElement('div');
                dot.className = 'online-indicator absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-4 border-white dark:border-brand-panel rounded-full';
                avatarContainer.appendChild(dot);
            }
            // ============================================================

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
}

// Profile Group
async function handleGroupProfile(groupId) {
    const chatProfile = document.getElementById('chat-profile'); if (!chatProfile) return;
    try {
        const group = await window.tryFetchJson([`/api/chat/group/${groupId}`]);
        if(group) {
            document.getElementById('profile-name').textContent = group.name;
            document.getElementById('profile-avatar-preview').src = group.avatar || 'https://cdn-icons-png.flaticon.com/512/166/166258.png';
            
            // ============================================================
            // ✅ FIX MỚI: XÓA CÁI CHẤM XANH CỨNG ĐẦU TRONG HTML
            // ============================================================
            const avatarContainer = document.getElementById('profile-avatar-preview').parentElement;
            // Tìm và xóa mọi thẻ div (chấm xanh) trong khung avatar
            const oldDots = avatarContainer.querySelectorAll('div');
            oldDots.forEach(dot => dot.remove());
            
            // Lưu ý: Với Group Profile, ta KHÔNG thêm lại chấm xanh nữa để tránh rối.
            // ============================================================

            const actionsContainer = document.getElementById('profile-actions');
            // ... (Phần code hiển thị thành viên và nút bấm bên dưới giữ nguyên) ...
            let membersHTML = `<div class="w-full text-left mt-4"><h4 class="text-xs font-bold text-zinc-500 uppercase mb-2">Thành viên (${group.members.length})</h4><ul class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">`;
            
            group.members.forEach(m => { 
                const isAdmin = m._id === group.admin;
                const adminBadge = isAdmin ? '<i class="fa-solid fa-crown text-yellow-500 ml-2 text-xs" title="Chủ phòng"></i>' : '';
                
                // Logic nút xóa thành viên
                let removeAction = '';
                if (group.admin === window.MINE_ID && m._id !== window.MINE_ID) {
                    removeAction = `
                    <button onclick="window.removeMemberFromGroup('${group._id}', '${m._id}')" class="ml-2 text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors" title="Xóa khỏi nhóm">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>`;
                }

                membersHTML += `
                <li class="flex items-center gap-2 p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <img src="${window.getAvatar(m)}" class="w-8 h-8 rounded-full object-cover">
                    <span class="text-sm text-gray-800 dark:text-white truncate flex-1">${m.nickname || m.username} ${adminBadge}</span>
                    ${removeAction}
                </li>`;
            });
            membersHTML += `</ul></div>`;
            
            // ... (Phần render các nút Rename, Add Member, Delete Group giữ nguyên) ...
            let deleteBtnHTML = '';
            if (group.admin === window.MINE_ID) { deleteBtnHTML = `<button id="group-delete-btn" class="w-full py-3 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 dark:text-red-400 rounded-xl text-sm font-medium border border-red-200 dark:border-red-500/20 flex items-center justify-center gap-2 transition-colors mt-2"><i class="fa-solid fa-trash-can"></i> Giải tán nhóm</button>`; } else { deleteBtnHTML = `<button class="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 flex items-center justify-center gap-2 cursor-not-allowed mt-2" title="Chỉ trưởng nhóm mới được xóa"><i class="fa-solid fa-user-shield"></i> Chỉ trưởng nhóm xóa được</button>`; }
            actionsContainer.innerHTML = ` <button id="group-rename-btn" class="w-full py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-white rounded-xl text-sm font-medium border border-gray-300 dark:border-zinc-700 flex items-center justify-center gap-2 transition-colors mb-2"><i class="fa-solid fa-pen"></i> Đổi tên nhóm</button> <button id="group-add-member-btn" class="w-full py-3 bg-blue-50 dark:bg-brand-purple/10 hover:bg-blue-100 dark:hover:bg-brand-purple/20 text-blue-600 dark:text-brand-purple rounded-xl text-sm font-medium border border-blue-200 dark:border-brand-purple/30 flex items-center justify-center gap-2 transition-colors"><i class="fa-solid fa-user-plus"></i> Thêm thành viên</button> ${deleteBtnHTML} ${membersHTML} `;
            document.getElementById('group-rename-btn').onclick = async () => { const newName = prompt("Nhập tên nhóm mới:", group.name); if (newName && newName !== group.name) { await fetch('/api/chat/group/rename', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ groupId, newName }) }); window.loadChatList(true); handleGroupProfile(groupId); document.getElementById('chat-name').textContent = newName; } };
            document.getElementById('group-add-member-btn').onclick = () => { window.currentAddingGroupId = groupId; document.getElementById('add-member-modal').style.display = 'flex'; loadFriendsForGroupAdd(); };
            if(document.getElementById('group-delete-btn')) { document.getElementById('group-delete-btn').onclick = async () => { if (confirm(`CẢNH BÁO: Bạn có chắc muốn giải tán nhóm "${group.name}"?`)) { try { const res = await fetch('/api/chat/group/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ groupId }) }); const data = await res.json(); if (data.success) { alert('Đã giải tán nhóm.'); document.getElementById('chat-profile').style.width = '0px'; document.getElementById('chat-profile').classList.remove('border-l'); window.currentChatTo = null; window.showMainSection('section-welcome'); await window.loadChatList(true); } else { alert(data.error); } } catch (err) { alert('Lỗi kết nối server'); } } }; }
            
            chatProfile.style.width = '300px'; chatProfile.classList.add('border-l');
        }
    } catch(e) { console.error('Lỗi profile group:', e); }
}

// Helper
async function loadFriendsForGroupAdd() {
  const listContainer = document.getElementById("add-member-list");
  if (!listContainer) return;
  listContainer.innerHTML =
    '<p class="text-center text-gray-500 text-sm">Đang tải...</p>';

  try {
    const friends = await window.tryFetchJson(["/api/friends"]);
    const group = await window.tryFetchJson([
      `/api/chat/group/${window.currentAddingGroupId}`,
    ]);
    const existingIds = group.members.map((m) => m._id);

    const availableFriends = friends.filter(
      (f) => !existingIds.includes(f._id || f.id)
    );

    listContainer.innerHTML = "";
    if (availableFriends.length === 0) {
      listContainer.innerHTML =
        '<p class="text-center text-gray-500 text-sm">Không còn bạn bè nào để thêm.</p>';
      return;
    }

    availableFriends.forEach((f) => {
      const div = document.createElement("div");
      div.className =
        "flex items-center justify-between p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer";
      div.innerHTML = `<div class="flex items-center gap-3"><img src="${window.getAvatar(
        f
      )}" class="w-10 h-10 rounded-full"><span class="text-sm font-medium text-gray-800 dark:text-white">${
        f.nickname
      }</span></div><i class="fa-solid fa-plus text-brand-purple"></i>`;
      div.onclick = () => confirmAddMember(f._id || f.id);
      listContainer.appendChild(div);
    });
  } catch (e) {
    console.error(e);
  }
}

async function confirmAddMember(memberId) {
  try {
    const res = await fetch("/api/chat/group/add-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: window.currentAddingGroupId, memberId }),
    });
    const data = await res.json();
    if (data.success) {
      alert("Đã thêm thành viên!");
      document.getElementById("add-member-modal").style.display = "none";
      handleGroupProfile(window.currentAddingGroupId);
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert("Lỗi server");
  }
}

window.handleRemoveFriendFromSidebar = async function (id) {
  try {
    const res = await fetch("/api/friends/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: id }),
    });
    const data = await res.json();
    if (data.success) {
      alert("Đã hủy kết bạn.");
      document.getElementById("chat-profile").style.width = "0px";
      document.getElementById("chat-profile").classList.remove("border-l");
      window.currentChatTo = null;
      window.currentRoomId = null;
      window.showMainSection("section-welcome");
      await loadFriends(true);
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert("Lỗi server");
  }
};

function setupChatHeaderEvents() {
  const openProfile = () => {
    const targetId = window.currentChatTo || window.currentRoomId;
    if (targetId) window.openProfileHandler(targetId);
  };

  document.getElementById("chat-avatar")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openProfile();
  });
  document.getElementById("chat-name")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openProfile();
  });
  const optionsBtn = document.querySelector(".chat-header button:last-child");
  optionsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    openProfile();
  });
}
// Actions Wrappers
window.sendRequest = async function (id, btn) {
  await fetch("/api/friends/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: id }),
  });
  btn.textContent = "Đã gửi";
  btn.disabled = true;
  btn.classList.replace("bg-brand-purple", "bg-zinc-700");
};
window.respondRequest = async function (reqId, action, btnWrapper) {
  await fetch("/api/friends/requests/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: reqId, action }),
  });
  btnWrapper.remove();
  if (action === "accept") loadFriends(true);
};
window.removeFriend = async function (id, li) {
  if (!confirm("Hủy kết bạn?")) return;
  try {
    const res = await fetch("/api/friends/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: id }),
    });
    const data = await res.json();
    if (data.success) {
      li.remove();
      await loadFriends(true);
      await loadAllUsers();
      if (window.currentChatTo === id) {
        window.currentChatTo = null;
        window.currentRoomId = null;
        window.showMainSection("section-welcome");
        document.getElementById("chat-profile").style.width = "0px";
      }
      alert("Đã hủy kết bạn.");
    } else {
      alert(data.error || "Lỗi hủy kết bạn");
    }
  } catch (e) {
    alert("Lỗi server");
  }
};
