/* ================ SOCIAL NETWORK LOGIC ================ */

window.loadFriends = async function(full = false) {
  try {
    const friends = await window.tryFetchJson(["/api/friends"]);
    window.ALL_FRIENDS = Array.isArray(friends) ? friends : [];
    if (full && window.displayFriends) {
      window.displayFriends(window.ALL_FRIENDS, document.getElementById("friend-list-friends"));
    }
  } catch (e) {}
};

window.loadAllUsers = async function() {
  try {
    const users = await window.tryFetchJson(["/api/friends/all-users"]);
    window.ALL_USERS = Array.isArray(users) ? users : [];
    window.displayAllUsers(window.ALL_USERS, document.getElementById("all-user-list"));
  } catch (e) {}
};

window.loadRequests = async function() {
  try {
    const reqs = await window.tryFetchJson(["/api/friends/requests"]);
    window.displayRequests(reqs, document.getElementById("requests-list"));
  } catch (e) {}
};

window.setupSearchEvents = function() {
  document.getElementById("chat-search-input")?.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase();
      const filtered = window.ALL_CHATS.filter((c) => (c.nickname || c.groupName || "").toLowerCase().includes(val));
      window.displayChats(filtered, document.getElementById("friend-list-chat"));
    });
  document.getElementById("friend-search-input")?.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase();
      const filtered = window.ALL_FRIENDS.filter((u) => (u.nickname || "").toLowerCase().includes(val));
      window.displayFriends(filtered, document.getElementById("friend-list-friends"));
    });

  // Sidebar Menu Friend
  document.getElementById("friend-menu")?.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    document.querySelectorAll("#friend-menu li").forEach((el) => {
      el.classList.remove("bg-zinc-800", "border-brand-purple/50", "text-white");
      el.classList.add("hover:bg-zinc-700");
    });
    li.classList.add("bg-zinc-800", "border-brand-purple/50", "text-white");

    const menu = li.dataset.menu;
    if (menu === "friends") {
      window.showMainSection("section-friends");
      window.loadFriends(true);
    } else if (menu === "requests") {
      window.showMainSection("section-requests");
      window.loadRequests();
    } else if (menu === "all-user") {
      window.showMainSection("section-all-users");
      window.loadAllUsers();
    }
  });
};

window.sendRequest = async function (id, btn) {
  await fetch("/api/friends/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: id }),
  });
  btn.textContent = "Đã gửi"; btn.disabled = true; btn.classList.replace("bg-brand-purple", "bg-zinc-700");
};

window.respondRequest = async function (reqId, action, btnWrapper) {
  await fetch("/api/friends/requests/respond", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: reqId, action }),
  });
  btnWrapper.remove();
  if (action === "accept") window.loadFriends(true);
};

window.removeFriend = async function (id, li) {
  if (!confirm("Hủy kết bạn?")) return;
  try {
    const res = await fetch("/api/friends/remove", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: id }),
    });
    const data = await res.json();
    if (data.success) {
      li.remove();
      await window.loadFriends(true);
      await window.loadAllUsers();
      if (window.currentChatTo === id) {
        window.currentChatTo = null; window.currentRoomId = null;
        window.showMainSection("section-welcome");
        document.getElementById("chat-profile").style.width = "0px";
      }
      alert("Đã hủy kết bạn.");
    } else alert(data.error || "Lỗi hủy kết bạn");
  } catch (e) { alert("Lỗi server"); }
};

window.handleRemoveFriendFromSidebar = async function (id) {
  try {
    const res = await fetch("/api/friends/remove", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: id }),
    });
    const data = await res.json();
    if (data.success) {
      alert("Đã hủy kết bạn.");
      document.getElementById("chat-profile").style.width = "0px";
      document.getElementById("chat-profile").classList.remove("border-l");
      window.currentChatTo = null; window.currentRoomId = null;
      window.showMainSection("section-welcome");
      await window.loadFriends(true);
    } else alert(data.error);
  } catch (e) { alert("Lỗi server"); }
};