// Định nghĩa các biến toàn cục cho Firebase (sẽ được môi trường Canvas cung cấp)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Khai báo các biến Firebase/Firestore (sẽ được khởi tạo trong DOMContentLoaded)
let app, db, auth, userId, isAuthReady = false;

function debounce(func, delay = 500) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
        // Lưu ID timeout để có thể hủy bỏ nếu cần (ví dụ: khi nhấn Enter)
        debounce.timeoutId = timeoutId;
    };
}
document.addEventListener('DOMContentLoaded', () => {
    // 1. Khai báo các điểm neo (DOM elements)
    const userTableBody = document.getElementById('userList');
    const auditLogList = document.getElementById('auditLogList');
    const profanityFilterTextarea = document.getElementById('profanityFilter');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const userFilterRole = document.getElementById('userFilterRole');
    const userFilterStatus = document.getElementById('userFilterStatus');
    const userSearchInput = document.getElementById('userSearchInput');
    // Các điểm neo cho Stats
    const totalUsersSpan = document.getElementById('totalUsers');
    const newUsersSpan = document.getElementById('newUsers');
    const totalMessagesSpan = document.getElementById('totalMessages');
    const serverStatusSpan = document.getElementById('serverStatus');
    const uniqueUsersWeekSpan = document.getElementById('uniqueUsersWeek');
    const accessDaysCountSpan = document.getElementById('accessDaysCount');
    const avgVisitsSpan = document.getElementById('avgVisits');
    const frequencyList = document.getElementById('frequencyList');

    // Khai báo cho Modal
    const userDetailsModal = document.getElementById('userDetailsModal');
    const modalContent = document.getElementById('modalContent');
    const closeModalBtn = document.getElementById('closeModalBtn');

    // ===============================================
    // 1. CHỨC NĂNG CHUYỂN ĐỔI TAB (UI LOGIC)
    // ===============================================
    function setupTabSwitching() {
        // Loại bỏ nút Đăng xuất khỏi logic chuyển tab
        const navLinks = document.querySelectorAll('.admin-header nav a:not(.logout-btn)');
        const sections = document.querySelectorAll('.dashboard-section');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const targetId = link.getAttribute('href').substring(1);
                e.preventDefault();

                // 1. Ẩn tất cả các sections
                sections.forEach(section => {
                    section.classList.remove('active');
                    section.style.display = 'none';
                });

                // 2. Hiển thị section mục tiêu và thêm class 'active'
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.classList.add('active');
                    // Sử dụng 'block' hoặc 'flex' tùy theo CSS của bạn
                    targetSection.style.display = 'block';

                    // 3. Highlight link active
                    navLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');

                    // 4. Tải dữ liệu cho tab vừa mở
                    switch (targetId) {
                        case 'users':
                            fetchUsers();
                            break;
                        case 'stats':
                            fetchAdminLogs(); // Tải Log cho tab Stats
                            fetchStatsSummary();
                            fetchAccessStats();
                            break;
                        case 'reports':
                            fetchSystemConfig();
                            break;
                        default:
                            break;
                    }
                }
            });
        });

        // TỰ ĐỘNG HIỂN THỊ TAB MẶC ĐỊNH KHI LOAD TRANG
        const defaultSection = document.getElementById('users');
        const defaultLink = document.querySelector('.admin-header nav a[href="#users"]');
        if (defaultSection && defaultLink) {
            defaultSection.classList.add('active');
            defaultSection.style.display = 'block';
            defaultLink.classList.add('active');
            fetchUsers(); // Tải dữ liệu mặc định
        }
    }

    // ===============================================
    // 2. QUẢN LÝ NGƯỜI DÙNG (USERS)
    // ===============================================

    /**
     * Hàm gọi API để tải danh sách người dùng (API THỰC TẾ)
     */
    async function fetchUsers() {
        if (!userTableBody) return;
        userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Đang tải danh sách người dùng...</td></tr>';

        const search = userSearchInput ? userSearchInput.value.trim() : '';
        const role = userFilterRole ? userFilterRole.value : 'all';
        const status = userFilterStatus ? userFilterStatus.value : 'all';

        // Tạo chuỗi query string
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (role !== 'all') params.append('role', role);
        if (status !== 'all') params.append('status', status);

        const queryString = params.toString() ? `?${params.toString()}` : '';

        try {
            // GỌI API GET /api/admin/users
            const response = await fetch(`/api/admin/users${queryString}`, { method: 'GET' });

            if (response.status === 403) {
                userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--error-color);">Lỗi: Bạn không có quyền truy cập chức năng này.</td></tr>';
                return;
            }

            if (!response.ok) throw new Error('Không thể tải dữ liệu người dùng.');

            const data = await response.json();
            // data.users phải là mảng người dùng
            renderUserTable(data.users);

        } catch (error) {
            console.error('Lỗi tải người dùng:', error);
            userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--error-color);">Lỗi kết nối hoặc tải dữ liệu.</td></tr>';
        }
    }

    /**
     * Hàm hiển thị danh sách người dùng lên bảng
     */
    function renderUserTable(users) {
        if (!users || users.length === 0) {
            userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Không tìm thấy người dùng nào.</td></tr>';
            return;
        }

        // ⭐ CẦN ĐỊNH NGHĨA KHI TẢI TRANG: Vai trò và ID của Admin đang đăng nhập.
        const currentAdminRole = window.currentAdminRole;
        const currentAdminId = window.currentAdminId;

        userTableBody.innerHTML = users.map(user => {
            const status = user.isBanned ? 'ĐÃ KHÓA' : 'Hoạt động';
            const statusClass = user.isBanned ? 'status-banned' : 'status-active';
            const actionText = user.isBanned ? 'Mở khóa' : 'Khóa';
            const actionClass = user.isBanned ? 'btn-unban' : 'btn-ban';

            const isSuperAdmin = user.role === 'superadmin';
            const isSelf = user._id === currentAdminId;
            const roleText = user.role ? user.role.toUpperCase() : 'USER';

            // Không cho phép Khóa/Mở khóa chính mình hoặc Super Admin khác
            const banDisable = isSuperAdmin || isSelf ? 'disabled' : '';

            // Logic nút Thăng/Hạ cấp (Chỉ Super Admin được phép, không áp dụng cho chính mình hoặc Super Admin khác)
            let roleButtonHTML = '';
            if (currentAdminRole === 'superadmin' && !isSelf) {
                if (user.role === 'user') {
                    roleButtonHTML = `<button class="action-btn btn-promote" data-user-id="${user._id}" data-action="change-role" data-new-role="admin">Thăng Admin</button>`;
                } else if (user.role === 'admin') {
                    roleButtonHTML = `<button class="action-btn btn-demote" data-user-id="${user._id}" data-action="change-role" data-new-role="user">Hạ User</button>`;
                }
            }

            const canDelete = currentAdminRole === 'superadmin' && !isSelf && !isSuperAdmin;

            const deleteButtonHTML = canDelete ? `
            <button class="action-btn btn-delete" data-user-id="${user._id}" data-action="delete">
                Xóa vĩnh viễn
            </button>
        ` : '';

            return `
            <tr>
                <td>${user._id.substring(0, 8)}...</td>
                <td>${user.username}</td>
                <td>${user.nickname || 'N/A'}</td>
                <td>${roleText}</td>
                <td><span class="${statusClass}">${status}</span></td>
                <td>
                    <button 
                        class="action-btn ${actionClass}" 
                        data-user-id="${user._id}" 
                        data-action="${user.isBanned ? 'unban' : 'ban'}"
                        ${banDisable}
                    >
                        ${actionText}
                    </button>
                    
                    ${roleButtonHTML}
                    
                    ${deleteButtonHTML}

                    <button class="action-btn btn-view" data-user-id="${user._id}" data-action="view">Xem chi tiết</button>
                </td>
            </tr>
        `;
        }).join('');
    }

    // ===============================================
    // HÀM TIỆN ÍCH MODAL/LOADING
    // ===============================================

    // Xử lý đóng Modal
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            userDetailsModal.style.display = 'none';
        });
    }
    window.addEventListener('click', (event) => {
        if (event.target === userDetailsModal) {
            userDetailsModal.style.display = 'none';
        }
    });


    /**
     * Hàm gọi API lấy chi tiết người dùng và hiển thị Modal
     */
    async function viewUserDetails(userId) {
        if (!userDetailsModal || !modalContent) {
            console.error('Không tìm thấy Modal UI.');
            alert('Lỗi UI: Không tìm thấy modal để hiển thị chi tiết.');
            return;
        }

        // Hiển thị modal loading
        modalContent.innerHTML = `<p style="text-align:center;">Đang tải chi tiết người dùng ID: ${userId.substring(0, 8)}...</p>`;
        userDetailsModal.style.display = 'block';

        try {
            // Gọi API GET /api/admin/users/:userId
            const response = await fetch(`/api/admin/users/${userId}`, { method: 'GET' });
            const result = await response.json();

            if (response.ok && result.success) {
                // Xử lý dữ liệu và hiển thị lên modal
                renderDetailModal(result.user);
            } else {
                modalContent.innerHTML = `<p style="color:var(--error-color); text-align:center;">Lỗi: ${result.error || 'Không thể tải chi tiết người dùng.'}</p>`;
            }
        } catch (error) {
            console.error('Lỗi tải chi tiết người dùng:', error);
            modalContent.innerHTML = '<p style="color:var(--error-color); text-align:center;">Lỗi kết nối server khi tải chi tiết.</p>';
        }
    }

    /**
     * Hàm hiển thị chi tiết người dùng lên Modal
     */
    function renderDetailModal(user) {
        if (!modalContent) return;

        // Chỉ lấy 10 log gần nhất nếu có
        const historyHTML = user.logHistory && user.logHistory.length > 0
            ? user.logHistory.slice(0, 10).map(log => ` 
                <li>
                    <strong>${log.action}</strong>: ${log.reason || 'N/A'} (Admin: ${log.admin}) - ${new Date(log.date).toLocaleString('vi-VN')}
                </li>
            `).join('')
            : '<li>Không có lịch sử hành động quản trị nào gần đây.</li>';


        modalContent.innerHTML = `
            <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">Chi Tiết Tài Khoản: ${user.username}</h3>
            <div style="display: flex; gap: 40px; margin-bottom: 20px;">
                <div>
                    <h4>Thông tin cơ bản</h4>
                    <p><strong>ID:</strong> ${user._id}</p>
                    <p><strong>Nickname:</strong> ${user.nickname || 'N/A'}</p>
                    <p><strong>Email:</strong> ${user.email || 'Không công khai'}</p>
                    <p><strong>Ngày tham gia:</strong> ${new Date(user.createdAt).toLocaleDateString('vi-VN')}</p>
                </div>
                <div>
                    <h4>Trạng thái & Quyền hạn</h4>
                    <p><strong>Vai trò:</strong> <span style="font-weight: bold; color: ${user.role === 'superadmin' ? 'red' : user.role === 'admin' ? 'orange' : 'green'};">${user.role.toUpperCase()}</span></p>
                    <p><strong>Trạng thái:</strong> <span style="font-weight: bold; color: ${user.isBanned ? 'red' : 'green'};">${user.isBanned ? 'ĐÃ KHÓA' : 'HOẠT ĐỘNG'}</span></p>
                    ${user.isBanned ? `
                        <p><strong>Lý do Khóa:</strong> ${user.banReason || 'N/A'}</p>
                        <p><strong>Thời gian Khóa:</strong> ${new Date(user.bannedAt).toLocaleString('vi-VN')}</p>
                    ` : ''}
                </div>
            </div>
            
            <h4>Lịch sử Hành động Quản trị gần đây (10 lần)</h4>
            <ul style="list-style-type: none; padding-left: 0;">
                ${historyHTML}
            </ul>
        `;
    }

    // ===============================================
    // 3. XỬ LÝ HÀNH ĐỘNG TRÊN BẢNG (BAN, UNBAN, ROLE, DELETE, VIEW)
    // ===============================================

    if (userTableBody) {
        userTableBody.addEventListener('click', async (e) => {
            const target = e.target;
            // Chỉ xử lý các nút hành động không bị disabled
            if (!target.classList.contains('action-btn') || target.hasAttribute('disabled')) return;

            const userId = target.dataset.userId;
            const action = target.dataset.action; // 'ban', 'unban', 'change-role', 'delete', 'view'

            let endpoint = '';
            let body = {};
            let method = 'POST';
            let confirmMessage = '';
            let successMessage = '';
            let errorMessage = 'Thao tác thất bại:';

            // 1. Xử lý Xem chi tiết
            if (action === 'view') {
                await viewUserDetails(userId);
                return;
            }

            // 2. Xử lý các hành động cần API call
            if (action === 'ban') {
                const reason = prompt('Nhập lý do khóa tài khoản:');
                if (!reason) return;
                endpoint = `/api/admin/users/ban/${userId}`;
                body = { reason: reason };
                successMessage = 'Tài khoản đã được khóa thành công.';
                method = 'POST';  // Phương thức POST cho hành động ban
            } else if (action === 'unban') {
                confirmMessage = 'Bạn có chắc chắn muốn mở khóa tài khoản này không?';
                endpoint = `/api/admin/users/unban/${userId}`;
                successMessage = 'Tài khoản đã được mở khóa thành công.';
                method = 'POST';  // Phương thức POST cho hành động unban
            } else if (action === 'change-role') {
                const newRole = target.dataset.newRole;
                const roleAction = newRole === 'admin' ? 'THĂNG CẤP' : 'HẠ CẤP';
                confirmMessage = `Bạn có chắc chắn muốn ${roleAction} tài khoản này thành ${newRole.toUpperCase()} không?`;
                endpoint = `/api/admin/users/role/${encodeURIComponent(userId)}`;
                body = { newRole: newRole };
                successMessage = `Tài khoản đã được ${roleAction} thành ${newRole.toUpperCase()} thành công.`;
                method = 'POST';  // Phương thức POST cho thay đổi vai trò
            } else if (action === 'delete') {
                confirmMessage = 'CẢNH BÁO: Xóa vĩnh viễn sẽ mất hết dữ liệu. Bạn có chắc chắn muốn xóa tài khoản này không?';
                endpoint = `/api/admin/users/${userId}`;
                method = 'DELETE';  // Phương thức DELETE cho xóa người dùng
                successMessage = 'Tài khoản đã được xóa vĩnh viễn thành công.';
            }
            else {
                return;
            }


            // Thực hiện confirm trước khi gọi API
            if (confirmMessage && !confirm(confirmMessage)) {
                return;
            }

            // Gọi API
            try {
                const response = await fetch(endpoint, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        // Nếu cần Authorization header, hãy thêm vào
                        // 'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Lỗi từ server: ${response.status} - ${errorData.message || response.statusText}`);
                }

                const result = await response.json();
                if (result.success) {
                    alert('Thay đổi vai trò thành công!');
                    fetchUsers();  // Refresh users list
                } else {
                    alert(`Lỗi: ${result.error}`);
                }

            } catch (error) {
                console.error('Lỗi khi gửi yêu cầu:', error);
                alert(`Đã xảy ra lỗi: ${error.message}`);
            }

        });
    }

    // ===============================================
    // 4. AUDIT LOGS (LỊCH SỬ HOẠT ĐỘNG ADMIN)
    // ===============================================

    /**
    * Hàm gọi API để tải Audit Log (API THỰC TẾ)
    */
    async function fetchAdminLogs() {
        if (!auditLogList) return;
        auditLogList.innerHTML = '<li>Đang tải nhật ký...</li>';

        try {
            // GỌI API GET /api/admin/logs
            const response = await fetch('/api/admin/logs', { method: 'GET' });

            if (!response.ok) throw new Error('Không thể tải Audit Log.');

            const data = await response.json();
            // data.logs phải là mảng lịch sử hoạt động
            renderAuditLog(data.logs);

        } catch (error) {
            console.error('Lỗi tải Audit Log:', error);
            auditLogList.innerHTML = '<li class="status-banned">Lỗi tải nhật ký hoạt động.</li>';
        }
    }

    /**
     * Hàm hiển thị Audit Log lên danh sách
     */
    function renderAuditLog(logs) {
        if (!auditLogList) return;
        if (!logs || logs.length === 0) {
            auditLogList.innerHTML = '<li>Không có hoạt động quản trị nào gần đây.</li>';
            return;
        }

        auditLogList.innerHTML = logs.map(log => {
            const time = new Date(log.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const date = new Date(log.time).toLocaleDateString('vi-VN');

            let message = '';

            switch (log.action) {
                case 'BAN':
                    message = `Admin <strong>${log.admin}</strong> đã <strong>KHÓA</strong> tài khoản <strong>${log.target}</strong>. Lý do: <em>${log.reason}</em>`;
                    break;
                case 'UNBAN':
                    message = `Admin <strong>${log.admin}</strong> đã <strong>MỞ KHÓA</strong> tài khoản <strong>${log.target}</strong>.`;
                    break;
                case 'CHANGE_ROLE':
                    // 💡 ĐÃ SỬA: Lấy vai trò mới từ log.reason.
                    // Log.reason có dạng: "Đã thay đổi vai trò thành: admin"
                    const newRoleText = log.reason.replace('Đã thay đổi vai trò thành: ', '').toUpperCase();
                    message = `Admin <strong>${log.admin}</strong> đã <strong>THAY ĐỔI VAI TRÒ</strong> của <strong>${log.target}</strong> thành <strong>${newRoleText}</strong>.`;
                    break;
                case 'DELETE_USER':
                    message = `Super Admin <strong>${log.admin}</strong> đã <strong>XÓA VĨNH VIỄN</strong> tài khoản <strong>${log.target}</strong>.`;
                    break;
                case 'SYSTEM_CONFIG':
                    message = `Admin <strong>${log.admin}</strong> đã <strong>CẬP NHẬT CẤU HÌNH</strong> hệ thống.`;
                    break;
                case 'DELETE_MESSAGE':
                    message = `Admin <strong>${log.admin}</strong> đã <strong>XÓA TIN NHẮN</strong> của <strong>${log.target}</strong>. Lý do: <em>${log.reason}</em>`;
                    break;
                default:
                    message = `Admin <strong>${log.admin}</strong> thực hiện hành động <strong>${log.action}</strong> lên <strong>${log.target}</strong>.`;
                    break;
            }

            return `
            <li>
                <span class="log-time">[${date} ${time}]</span>
                ${message}
            </li>
        `;
        }).join('');
    }

    // ===============================================
    // 5. CẤU HÌNH HỆ THỐNG (REPORTS)
    // ===============================================

    /**
     * Tải cấu hình hệ thống hiện tại (API THỰC TẾ)
     */
    async function fetchSystemConfig() {
        if (!profanityFilterTextarea) return;
        profanityFilterTextarea.value = 'Đang tải...';

        try {
            // GỌI API GET /api/admin/config
            const response = await fetch('/api/admin/config');
            if (!response.ok) throw new Error('Không thể tải cấu hình.');

            const data = await response.json();
            if (data.success && data.config) {
                profanityFilterTextarea.value = data.config.profanityBlacklist;
            } else {
                profanityFilterTextarea.value = 'Lỗi tải cấu hình. Vui lòng kiểm tra server.';
            }

        } catch (error) {
            console.error('Lỗi tải cấu hình:', error);
            profanityFilterTextarea.value = 'Lỗi kết nối server khi tải cấu hình.';
        }
    }

    /**
     * Lưu cấu hình hệ thống (API THỰC TẾ)
     */
    async function saveSystemConfig() {
        if (!profanityFilterTextarea) return;

        const blacklist = profanityFilterTextarea.value.trim();

        try {
            // GỌI API POST /api/admin/config
            const response = await fetch('/api/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profanityBlacklist: blacklist
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert('Cấu hình đã được lưu thành công!');
                fetchAdminLogs(); // Tải lại log
            } else {
                alert(`Lưu cấu hình thất bại: ${result.error || 'Lỗi không xác định.'}`);
            }

        } catch (error) {
            console.error('Lỗi khi lưu cấu hình:', error);
            alert('Lỗi kết nối server khi lưu cấu hình.');
        }
    }

    /**
     * Lưu cấu hình hệ thống
     */
    async function saveSystemConfig() {
        if (!profanityFilterTextarea) return;

        const blacklist = profanityFilterTextarea.value.trim();

        try {
            const response = await fetch('/api/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profanityBlacklist: blacklist
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert('Cấu hình đã được lưu thành công!');
                fetchAdminLogs();
            } else {
                alert(`Lưu cấu hình thất bại: ${result.error || 'Lỗi không xác định.'}`);
            }

        } catch (error) {
            console.error('Lỗi khi lưu cấu hình:', error);
            alert('Lỗi kết nối server khi lưu cấu hình.');
        }
    }

    // ===============================================
    // 6. THỐNG KÊ (STATS)
    // ===============================================

    /**
     * Tải tóm tắt thống kê (API THỰC TẾ)
     */
    async function fetchStatsSummary() {
        if (!totalUsersSpan || !newUsersSpan || !totalMessagesSpan || !serverStatusSpan) return;

        // Đặt trạng thái đang tải
        totalUsersSpan.textContent = '...';
        newUsersSpan.textContent = '...';
        totalMessagesSpan.textContent = '...';
        serverStatusSpan.textContent = 'Đang kiểm tra...';
        serverStatusSpan.className = '';

        try {
            // GỌI API GET /api/admin/stats
            const response = await fetch('/api/admin/stats', { method: 'GET' });

            if (!response.ok) throw new Error(`Lỗi HTTP: ${response.status}`);

            const data = await response.json();

            if (data.success && data.stats) {
                const stats = data.stats;

                totalUsersSpan.textContent = stats.totalUsers.toLocaleString('en-US');
                newUsersSpan.textContent = stats.newUsers24h.toLocaleString('en-US');
                totalMessagesSpan.textContent = stats.totalMessages.toLocaleString('en-US');
                serverStatusSpan.textContent = stats.serverStatus;

                serverStatusSpan.className = stats.isStable ? 'status-active' : 'status-banned';
            } else {
                throw new Error(data.error || 'Dữ liệu trả về không hợp lệ.');
            }

        } catch (error) {
            console.error('Lỗi tải thống kê:', error);
            serverStatusSpan.textContent = 'Lỗi Server';
            serverStatusSpan.className = 'status-banned';
        }
    }

    /**
     * Tải thống kê lịch sử truy cập (API THỰC TẾ)
     */
    async function fetchAccessStats() {
        if (!accessDaysCountSpan || !avgVisitsSpan || !frequencyList || !uniqueUsersWeekSpan) return;

        frequencyList.innerHTML = '<li>Đang tải...</li>';

        try {
            // GỌI API GET /api/admin/access-stats
            const response = await fetch('/api/admin/access-stats');
            if (!response.ok) throw new Error('Không thể tải thống kê truy cập.');

            const data = await response.json();

            if (data.success && data.data) {
                const stats = data.data;

                uniqueUsersWeekSpan.textContent = stats.totalUniqueUsers.toLocaleString('en-US');
                accessDaysCountSpan.textContent = `${stats.totalDaysInLastWeek} ngày`;
                avgVisitsSpan.textContent = stats.averageDailyVisits;

                frequencyList.innerHTML = stats.frequencyDistribution.map(item => {
                    const message = `Có <strong>${item.totalDays} ngày</strong> mà người dùng truy cập ${item._id} lần.`;
                    return `<li>${message}</li>`;
                }).join('');

            } else {
                throw new Error(data.error || 'Dữ liệu thống kê truy cập không hợp lệ.');
            }

        } catch (error) {
            console.error('Lỗi tải thống kê truy cập:', error);
            accessDaysCountSpan.textContent = 'Lỗi!';
            avgVisitsSpan.textContent = 'Lỗi!';
            frequencyList.innerHTML = '<li class="status-banned">Lỗi tải phân phối tần suất.</li>';
        }
    }

    /**
     * Tải thống kê lịch sử truy cập
     */
    async function fetchAccessStats() {
        if (!accessDaysCountSpan || !avgVisitsSpan || !frequencyList || !uniqueUsersWeekSpan) return;

        frequencyList.innerHTML = '<li>Đang tải...</li>';

        try {
            const response = await fetch('/api/admin/access-stats');
            if (!response.ok) throw new Error('Không thể tải thống kê truy cập.');

            const data = await response.json();

            if (data.success && data.data) {
                const stats = data.data;

                uniqueUsersWeekSpan.textContent = stats.totalUniqueUsers.toLocaleString('en-US');
                accessDaysCountSpan.textContent = `${stats.totalDaysInLastWeek} ngày`;
                avgVisitsSpan.textContent = stats.averageDailyVisits;

                frequencyList.innerHTML = stats.frequencyDistribution.map(item => {
                    const message = `Có <strong>${item.totalDays} ngày</strong> mà người dùng truy cập ${item._id} lần.`;
                    return `<li>${message}</li>`;
                }).join('');

            } else {
                throw new Error(data.error || 'Dữ liệu thống kê truy cập không hợp lệ.');
            }

        } catch (error) {
            console.error('Lỗi tải thống kê truy cập:', error);
            accessDaysCountSpan.textContent = 'Lỗi!';
            avgVisitsSpan.textContent = 'Lỗi!';
            frequencyList.innerHTML = '<li class="status-banned">Lỗi tải phân phối tần suất.</li>';
        }
    }

    // ===============================================
    // 7. KHỞI TẠO PHIÊN ADMIN (LẤY THÔNG TIN NGƯỜI ĐANG ĐĂNG NHẬP)
    // ===============================================

    let currentAdminId = null;
    let currentAdminRole = null;

    async function initAdminSession() {
        try {
            const response = await fetch('/api/admin/me'); // 🔹 Endpoint trả về user đang đăng nhập
            const data = await response.json();

            if (!response.ok || !data.success) {
                alert('Bạn chưa đăng nhập hoặc không có quyền truy cập trang quản trị.');
                window.location.href = '/login';
                return;
            }

            // Gán thông tin vào biến toàn cục
            currentAdminId = data.user._id;
            currentAdminRole = data.user.role;

            // Gán vào window để các hàm khác dùng được
            window.currentAdminId = currentAdminId;
            window.currentAdminRole = currentAdminRole;

            console.log('✅ Đăng nhập với vai trò:', currentAdminRole);

            // Khởi tạo UI sau khi xác thực thành công
            setupTabSwitching();

        } catch (error) {
            console.error('Lỗi khi lấy thông tin phiên đăng nhập:', error);
            alert('Không thể kết nối server. Vui lòng thử lại sau.');
            window.location.href = '/login';
        }
    }

    // Gọi hàm khởi tạo
    initAdminSession();

    // ===============================================
    // 8. GẮN SỰ KIỆN CƠ BẢN
    // ===============================================
    if (userFilterRole) userFilterRole.addEventListener('change', fetchUsers);
    if (userFilterStatus) userFilterStatus.addEventListener('change', fetchUsers);
    if (saveConfigBtn) saveConfigBtn.addEventListener('click', saveSystemConfig);

    // 🔍 Tìm kiếm có debounce
    if (userSearchInput) {
        const debouncedFetchUsers = debounce(fetchUsers, 500);
        userSearchInput.addEventListener('input', debouncedFetchUsers);
        userSearchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                if (debounce.timeoutId) clearTimeout(debounce.timeoutId);
                fetchUsers();
            }
        });
    }
})