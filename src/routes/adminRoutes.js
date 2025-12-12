// chat_app/routes/adminRoutes.js (Phiên bản CẬP NHẬT)

const express = require('express');
const path = require('path'); // ✅ CẦN PATH ĐỂ TRUY CẬP FILE HTML
const router = express.Router();
const adminController = require('../controllers/adminController');
// Sử dụng ensureLoggedIn cho UI và đảm bảo có ensureAdmin
const { ensureLoggedIn, ensureAdmin, ensureLoggedInJSON, ensureSuperAdmin } = require('../middleware/auth');

// =======================================================
// ✅ 1. ROUTE PHỤC VỤ GIAO DIỆN ADMIN DASHBOARD (UI)
// =======================================================
router.get('/admin', ensureLoggedIn, ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'chat', 'html', 'admin-dashboard.html'));
});

// =======================================================
// 2. CÁC ROUTE API DÀNH CHO ADMIN
// =======================================================

// Lấy danh sách tất cả người dùng (chức năng 1.1)
router.get('/users', ensureLoggedInJSON, ensureAdmin, adminController.getAllUsers);

// Lấy thông tin chi tiết của một người dùng cụ thể
router.get('/users/:userId', ensureLoggedInJSON, ensureAdmin, adminController.getSingleUser);

// Khóa tài khoản người dùng (chức năng 1.2)
router.post('/users/ban/:userId', ensureLoggedInJSON, ensureAdmin, adminController.banUser);

// Mở khóa tài khoản người dùng (chức năng 1.2)
router.post('/users/unban/:userId', ensureLoggedInJSON, ensureAdmin, adminController.unbanUser);

//Thay đổi vai trò người dùng
router.post('/users/role/:userId', ensureLoggedInJSON, ensureSuperAdmin, adminController.changeUserRole);

// Lấy nhật ký hoạt động (chức năng 5.2.1)
router.get('/logs', ensureLoggedInJSON, ensureAdmin, adminController.getAdminLogs);

// Tải cấu hình hệ thống (Bộ lọc từ cấm)
router.get('/config', ensureLoggedInJSON, ensureAdmin, adminController.getSystemConfig);

// Cập nhật cấu hình hệ thống
router.post('/config', ensureLoggedInJSON, ensureAdmin, adminController.updateSystemConfig);

// Lấy tổng quan thống kê (Tổng người dùng, tin nhắn,...)
router.get('/stats', ensureLoggedInJSON, ensureAdmin, adminController.getStatsSummary);
router.get('/access-stats', ensureAdmin, adminController.getAccessStats);

// Xóa người dùng (chức năng 1.3)
router.delete('/users/:userId', ensureLoggedInJSON, ensureSuperAdmin, adminController.deleteUser);

module.exports = router;