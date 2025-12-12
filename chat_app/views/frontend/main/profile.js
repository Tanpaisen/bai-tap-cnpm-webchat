/* ================ PROFILE & SETTINGS ================ */

window.loadProfile = async function() {
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
    document.getElementById("current-display-name-profile").textContent = u.nickname;
    document.getElementById("current-birthdate-profile").textContent = formattedDate;
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
};

window.setupSettingsEvents = function() {
  // Tab menu settings
  document.getElementById("settings-menu")?.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;

    document.querySelectorAll("#settings-menu li").forEach((el) => {
      el.classList.remove("active", "bg-brand-purple/10", "border-brand-purple/30", "border");
      el.querySelector("i").classList.remove("text-brand-purple");
    });
    li.classList.add("active", "bg-brand-purple/10", "border-brand-purple/30", "border");
    li.querySelector("i").classList.add("text-brand-purple");

    window.showMainSection("section-settings");
    const menu = li.dataset.menu;
    document.querySelectorAll(".setting-content").forEach((el) => el.classList.remove("active"));

    const targetContent = document.getElementById(`settings-${menu}`);
    if (targetContent) targetContent.classList.add("active");

    if (menu === "security") window.loadProfile();
  });

  // Toggle Online/Offline
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

      // Logic vẽ lại list chat sau khi đổi status
      if (document.getElementById("friend-list-chat")) {
          const existingChatIds = new Set((window.ALL_CHATS || []).map((c) => c.partnerId || c._id));
          const friendsNotInChat = (window.ALL_FRIENDS || []).filter((f) => !existingChatIds.has(f._id || f.id))
          .map((f) => ({ _id: f._id || f.id, partnerId: f._id || f.id, nickname: f.nickname, avatar: f.avatar, online: f.online, isGroup: false, lastMessage: null }));
          const fullList = [...(window.ALL_CHATS || []), ...friendsNotInChat];
          fullList.sort((a, b) => {
             const tA = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
             const tB = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
             return tB - tA;
          });
          window.displayChats(fullList, document.getElementById("friend-list-chat"));
      }
      
      // Vẽ lại Sidebar Group
      const groupSidebarList = document.getElementById("group-list");
      if (groupSidebarList && window.ALL_CHATS) {
          const groups = window.ALL_CHATS.filter((c) => c.isGroup);
          groupSidebarList.innerHTML = groups.length ? "" : '<li class="text-center text-xs text-gray-500 mt-4">Chưa tham gia nhóm nào</li>';
          groups.forEach((g) => groupSidebarList.insertAdjacentHTML("beforeend", window.createChatItemHTML(g)));
      }
    });
  }

  // Dark Mode
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

  // Upload Background
  document.getElementById("background-upload-btn")?.addEventListener("click", async () => {
      const file = document.getElementById("background-input")?.files?.[0];
      if (!file) return alert("Vui lòng chọn ảnh!");
      const form = new FormData();
      form.append("background", file);
      try {
        const res = await fetch("/api/upload/background", { method: "POST", body: form, credentials: "include" });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        window.applyBackground(data.url);
        alert("Cập nhật hình nền thành công!");
      } catch (e) { alert("Lỗi cập nhật hình nền: " + e.message); }
    });
};

window.attachProfileEvents = function() {
  const editBtn = document.getElementById("edit-personal-info-btn");
  const cancelBtn = document.getElementById("cancel-update-btn");
  const updateForm = document.getElementById("update-form-section");

  editBtn?.addEventListener("click", () => {
    if (updateForm) updateForm.style.display = "block";
    const currentName = document.getElementById("current-display-name")?.textContent;
    if (document.getElementById("nickname-input-security"))
      document.getElementById("nickname-input-security").value = currentName;
  });

  cancelBtn?.addEventListener("click", () => {
    if (updateForm) updateForm.style.display = "none";
  });

  document.getElementById("update-personal-info-btn")?.addEventListener("click", async () => {
      const nick = document.getElementById("nickname-input-security").value;
      const dob = document.getElementById("dob-input").value;
      const gender = document.getElementById("gender-input").value;
      if (!nick || !dob) return alert("Vui lòng nhập đủ thông tin");
      try {
        const res = await fetch("/api/users/settings/update-personal-info", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nick, dateOfBirth: dob, gender }),
        });
        const d = await res.json();
        if (d.success) { alert("Cập nhật thành công"); await window.loadProfile(); cancelBtn.click(); } else alert(d.error);
      } catch (e) { alert("Lỗi cập nhật: " + e.message); }
    });

  ["avatar-upload-input", "avatar-upload-input-profile-section"].forEach((id) => {
      const input = document.getElementById(id);
      input?.addEventListener("change", async () => {
        const f = input.files?.[0];
        if (!f) return;
        const form = new FormData();
        form.append("avatar", f);
        try {
          const res = await fetch("/api/users/update-avatar", { method: "POST", body: form, credentials: "include" });
          const data = await res.json();
          if (!data.success) throw new Error("Upload failed");
          await window.loadProfile();
          alert("Cập nhật ảnh đại diện thành công!");
        } catch (e) { alert("Lỗi upload ảnh"); }
      });
    });

  const pwModal = document.getElementById("password-modal");
  document.getElementById("open-password-modal-from-settings")?.addEventListener("click", () => (pwModal.style.display = "flex"));
  document.getElementById("close-password-modal-btn")?.addEventListener("click", () => (pwModal.style.display = "none"));

  document.getElementById("submit-password-change-btn")?.addEventListener("click", async () => {
      const oldPass = document.getElementById("old-password-input").value;
      const newPass = document.getElementById("new-password-input").value;
      const msg = document.getElementById("password-msg");
      if (newPass.length < 6) return (msg.textContent = "Mật khẩu mới phải từ 6 ký tự");
      try {
        const res = await fetch("/api/users/update-password", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
        });
        const d = await res.json();
        if (d.success) {
          alert("Đổi mật khẩu thành công!");
          pwModal.style.display = "none";
          document.getElementById("old-password-input").value = "";
          document.getElementById("new-password-input").value = "";
        } else msg.textContent = d.error;
      } catch (e) { msg.textContent = "Lỗi server"; }
    });

  document.getElementById("redirect-to-security-settings")?.addEventListener("click", () => {
      document.querySelector('.sidebar-left button[data-func="setting"]')?.click();
      setTimeout(() => { document.querySelector('#settings-menu li[data-menu="security"]')?.click(); }, 100);
    });
};