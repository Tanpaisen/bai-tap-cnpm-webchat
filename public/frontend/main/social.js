/* ================ SOCIAL NETWORK LOGIC ================ */

// //====================Giữ liệu giả định ======================================================================================//

// // 1. Tạo danh sách bạn bè giả (ID phải khớp với ID trong app.js để chat được)
// const mockFriends = [
//     {
//         _id: "65f2d6c12345678912345678", // ID của Tester A
//         nickname: "Tester A (User 1)",
//         avatar: "https://ui-avatars.com/api/?name=User+A&background=random",
//         status: "online"
//     },
//     {
//         _id: "65f2d6c12345678912349999", // ID của Tester B
//         nickname: "Tester B (User 2)",
//         avatar: "https://ui-avatars.com/api/?name=User+B&background=0D8ABC&color=fff",
//         status: "online"
//     }
// ];

// // 2. Chạy khi trang web load xong
// document.addEventListener('DOMContentLoaded', () => {
//     console.log("🚀 Đang chạy chế độ Test Giao diện (Mock Data)");
    
//     // Gọi hàm vẽ danh sách
//     renderFriendList(mockFriends);
// });

// // 3. Hàm vẽ danh sách ra HTML
// function renderFriendList(friends) {
//     // Render vào Tab Chat (dạng rút gọn)
//     const chatList = document.getElementById('friend-list-chat');
//     if (chatList) {
//         chatList.innerHTML = friends.map(f => `
//             <li onclick="selectChat('${f._id}', '${f.nickname}', '${f.avatar}')" class="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer flex items-center gap-3">
//                 <img src="${f.avatar}" class="w-10 h-10 rounded-full object-cover">
//                 <div>
//                     <h4 class="text-sm font-bold text-gray-800 dark:text-white">${f.nickname}</h4>
//                     <p class="text-xs text-gray-500">Tin nhắn mới...</p>
//                 </div>
//             </li>
//         `).join('');
//     }

//     // Render vào Tab Bạn bè (dạng Grid đầy đủ)
//     const friendGrid = document.getElementById('friend-list-friends');
//     if (friendGrid) {
//         friendGrid.innerHTML = friends.map(f => `
//             <li class="bg-white dark:bg-brand-panel p-4 rounded-xl border border-gray-200 dark:border-brand-border flex flex-col items-center gap-3">
//                 <img src="${f.avatar}" class="w-20 h-20 rounded-full object-cover">
//                 <h4 class="font-bold text-gray-800 dark:text-white">${f.nickname}</h4>
//                 <button onclick="selectChat('${f._id}', '${f.nickname}', '${f.avatar}')" class="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100">Nhắn tin</button>
//             </li>
//         `).join('');
//     }
// }

// function selectChat(userId, nickname, avatar) {
//     console.log(`💬 Click vào: ${nickname} (ID: ${userId})`);
    
//     // 👇 QUAN TRỌNG: Gọi hàm logic chính bên file chat.js
//     if (window.startChatWith) {
//         window.startChatWith(userId); 
//     } else {
//         console.error("❌ Lỗi: Không tìm thấy hàm window.startChatWith (Kiểm tra file chat.js đã load chưa)");
//     }
// }
// function loadFriendList() {
//     // Thay vì fetch('/api/friends'), ta dùng mockFriends luôn
//     console.log("⚠️ Đang dùng dữ liệu bạn bè giả để test giao diện");
//     renderFriendList(mockFriends); 
// }
// // Gọi hàm này khi trang web load xong
// document.addEventListener('DOMContentLoaded', loadFriendList);
//=========================================END MOCK=================================================================================================//

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