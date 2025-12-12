/* ================ INITIALIZATION & CORE ================ */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. Đảm bảo Socket được khởi tạo
    if (!window.socket)
      window.socket = io(window.location.origin, {
        withCredentials: true,
        autoConnect: true,
      });

    await window.loadSessionUser();
    if (window.checkPasswordChangeHint) window.checkPasswordChangeHint();

    // 2. Cài đặt sự kiện từ các file khác
    window.setupSidebarEvents();
    window.setupInputEvents();      // Từ chat.js
    window.setupSettingsEvents();   // Từ profile.js
    window.setupSocketEvents();     // Tại file này
    window.setupSearchEvents();     // Từ social.js
    window.attachProfileEvents();   // Từ profile.js
    window.setupChatHeaderEvents(); // Từ chat.js
    window.setupGroupEvents();      // Từ chat.js

    await window.loadChatList(true); // Từ chat.js

    // 3. Khôi phục trạng thái
    const bg = localStorage.getItem("mainContentBg");
    if (bg && window.applyBackground) window.applyBackground(bg);

    const savedStatus = localStorage.getItem("userStatus");
    const statusToggle = document.getElementById("incoming-status-toggle");
    if (savedStatus && statusToggle) {
      statusToggle.checked = savedStatus === "online";
      if (savedStatus === "offline") document.body.classList.add("ghost-mode");
    }

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

window.loadSessionUser = async function() {
  try {
    const user = await window.tryFetchJson(["/api/users/profile"]);
    if (!user || !user._id) throw new Error("401");

    if (!user.nickname?.trim()) return (location.href = "/setup-nickname");

    window.MINE_ID = user._id;

    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.src = window.getAvatar(user);

    window.loadProfile();
    await window.loadFriends();
  } catch (e) {
    if (String(e.message).includes("401")) location.href = "/login";
  }
};

window.setupSidebarEvents = function() {
  document.querySelectorAll(".sidebar-left button[data-func]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const func = btn.dataset.func;

        document.querySelectorAll(".sidebar-left button").forEach((b) => {
          b.classList.remove("bg-brand-purple", "text-white", "shadow-lg", "shadow-purple-500/30");
          b.classList.add("text-zinc-400");
        });
        btn.classList.remove("text-zinc-400");
        btn.classList.add("bg-brand-purple", "text-white", "shadow-lg", "shadow-purple-500/30");

        document.querySelectorAll(".list-section").forEach((el) => el.classList.remove("active"));

        if (func === "chat") {
          document.getElementById("list-chat").classList.add("active");
          if (window.currentChatTo) window.showMainSection("section-chat");
          else window.showMainSection("section-welcome");
        } else if (func === "friends") {
          document.getElementById("list-friends").classList.add("active");
          window.showMainSection("section-friends");
          window.loadFriends(true);
        } else if (func === "profile") {
          window.showMainSection("section-profile");
          window.loadProfile();
        } else if (func === "setting") {
          document.getElementById("list-settings").classList.add("active");
          window.showMainSection("section-settings");
          const statusTab = document.querySelector('#settings-menu li[data-menu="status"]');
          if (statusTab) statusTab.click();
        } else if (func === "groups") {
          document.getElementById("list-groups").classList.add("active");
          window.showMainSection("section-groups");
          window.loadChatList();
        }
      });
    });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    if (confirm("Đăng xuất khỏi hệ thống?")) {
      await fetch("/logout");
      location.href = "/login";
    }
  });
};

window.setupSocketEvents = function() {
  // Sự kiện nhận tin nhắn mới (chuyển việc hiển thị cho chat.js xử lý sau, nhưng logic nhận để đây ok)
  window.socket.on("newMessage", (msg) => {
    if (msg.roomId === window.currentRoomId && (msg.sender._id || msg.sender) !== window.MINE_ID) {
      if (window.renderedMessageIds.has(msg._id)) return;
      window.renderedMessageIds.add(msg._id);
      const node = window.buildMessageNode(msg, false);
      document.getElementById("messages").appendChild(node);
      document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
    }
  });

  // Sự kiện Typing (Logic hiển thị UI)
  window.socket.on("typing", (data) => {
    if (data.roomId === window.currentRoomId && data.from !== window.MINE_ID) {
      const ind = document.getElementById("typing-indicator-container");
      if (ind) {
        ind.style.display = "flex";
        clearTimeout(window.roomTypingTimers[data.roomId]);
        window.roomTypingTimers[data.roomId] = setTimeout(() => (ind.style.display = "none"), 3000);
        document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
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

  // Sự kiện User Status (Online/Offline)
  window.socket.on("userStatusUpdate", (data) => {
    // 1. Cập nhật data trong mảng cache
    const updateList = (list) => {
      const item = list.find((u) => String(u._id || u.id) === String(data.userId));
      if (item) item.online = data.status === "online";
    };
    updateList(window.ALL_FRIENDS);
    window.ALL_CHATS.forEach(chat => {
        if (chat.isGroup && Array.isArray(chat.members)) {
            const member = chat.members.find(m => String(m._id) === String(data.userId));
            if (member) member.online = data.status === "online";
        } else if (!chat.isGroup && String(chat.partnerId || chat._id) === String(data.userId)) {
             chat.online = data.status === "online";
        }
    });

    // 2. Cập nhật Header
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

    // 3. Cập nhật Profile Sidebar (Logic FIX cũ của bạn)
    const chatProfile = document.getElementById('chat-profile');
    if (chatProfile && chatProfile.offsetWidth > 0 && String(chatProfile.dataset.viewingId) === String(data.userId)) {
        const avatarContainer = document.getElementById('profile-avatar-preview').parentElement;
        const existingDot = avatarContainer.querySelector('.online-indicator');
        if (existingDot) existingDot.remove(); 

        if (data.status === "online") {
            const dot = document.createElement('div');
            dot.className = 'online-indicator absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-4 border-white dark:border-brand-panel rounded-full';
            avatarContainer.appendChild(dot);
        }
    }

    // 4. Render lại list chat
    if (document.getElementById("friend-list-chat") && window.displayChats)
      window.displayChats(window.ALL_CHATS, document.getElementById("friend-list-chat"));
  });
};