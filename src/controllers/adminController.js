// chat_app/controllers/adminController.js

const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const AdminLog = require('../models/AdminLog');
const Message = require('../models/Message'); // GIẢ ĐỊNH Model Message tồn tại
const AccessLog = require('../models/AccessLog');
const socketManager = require('../socket/socketManager');

// Hàm tiện ích để ngắt kết nối Socket.IO của người dùng
const disconnectUser = async (userId, reason, message) => {
    try {
        const io = socketManager.getIo();
        const targetSocketId = socketManager.onlineUsers.get(userId);

        if (targetSocketId) {
            // Gửi lệnh đăng xuất buộc đến client
            io.to(targetSocketId).emit('forceLogout', { reason, message }); 

            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.disconnect(true);
                // Cập nhật trạng thái offline trong DB nếu cần
                await User.findByIdAndUpdate(userId, { online: false }); 
            }
            socketManager.removeOnlineUser(userId); // Xóa khỏi danh sách online
        }
    } catch (error) {
        console.error(`❌ Lỗi khi ngắt kết nối người dùng ${userId}:`, error);
    }
};

// =======================================================
// ✅ 1. QUẢN LÝ NGƯỜI DÙNG (USER MANAGEMENT)
// =======================================================

/**
 * Lấy danh sách tất cả người dùng
 * (Chức năng: 1.1)
 */
exports.getAllUsers = async (req, res) => {
    try {
        const { role, status, search } = req.query;
        const filter = {};

        // 1. Lọc theo Vai trò (Role)
        if (role && role !== 'all') {
            // Vai trò trong DB là 'user', 'admin', 'superadmin'
            filter.role = role; 
        }

        // 2. Lọc theo Trạng thái (Status)
        if (status && status !== 'all') {
            if (status === 'banned') {
                filter.isBanned = true;
            } else if (status === 'active') {
                filter.isBanned = false;
            }
        }
        
        // 3. Tìm kiếm theo Username/Nickname (Search)
        if (search) {
            // Sử dụng $or để tìm kiếm trong cả username và nickname
            // Dùng RegExp với 'i' (case-insensitive)
            const searchRegex = new RegExp(search, 'i');
            filter.$or = [
                { username: { $regex: searchRegex } },
                { nickname: { $regex: searchRegex } }
            ];
        }

        // Thực hiện truy vấn với filter đã xây dựng
        const users = await User.find(filter)
            .select('_id username nickname isBanned role createdAt bannedAt banReason')
            .sort({ createdAt: -1 }); // Sắp xếp mặc định theo người dùng mới nhất

        return res.json({ success: true, users });
    } catch (err) {
        console.error('Lỗi tải danh sách người dùng:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi tải danh sách người dùng.' });
    }
};

/**
 * Chức năng: Khóa tài khoản người dùng
 * (Chức năng: 1.2)
 */
exports.banUser = async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.session.user._id;
    const adminRole = req.session.user.role;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ success: false, error: 'Phải cung cấp lý do khóa tài khoản.' });
    }

    try {
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng.' });
        }

        // ... (LOGIC KIỂM TRA QUYỀN ) ...
        if (user.role === 'superadmin') {
            if (adminRole !== 'superadmin' || adminId.toString() !== user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Không thể khóa tài khoản Super Admin.' });
            }
        }
        if (user.role === 'admin' && adminRole !== 'superadmin') {
            return res.status(403).json({ success: false, error: 'Admin không có quyền khóa Admin khác.' });
        }
        if (adminId.toString() === userId) {
            return res.status(403).json({ success: false, error: 'Bạn không thể tự khóa tài khoản của mình.' });
        }
        if (user.isBanned) {
            return res.status(400).json({ success: false, error: 'Người dùng này đã bị khóa rồi.' });
        }

        // Cập nhật trạng thái khóa trong Database
        user.isBanned = true;
        user.banReason = reason;
        user.bannedBy = adminId;
        user.bannedAt = new Date();
        await user.save();

        // ✅ ÁP DỤNG HÀM TIỆN ÍCH
        await disconnectUser(
            userId, 
            'Account Banned', 
            `Tài khoản của bạn đã bị khóa. Lý do: ${reason}`
        );
        
        // GHI LỊCH SỬ HÀNH ĐỘNG (AUDIT LOG)
        if (AdminLog) {
            await AdminLog.create({ action: 'BAN', targetUser: userId, admin: adminId, reason: reason });
        }

        return res.json({ success: true, message: `Người dùng ${user.username} đã bị khóa.`, user: user.toJSON() });

    } catch (err) {
        console.error('❌ Lỗi chi tiết khi khóa người dùng:', err.message, err.stack);
        return res.status(500).json({ success: false, error: 'Lỗi server không xác định khi khóa tài khoản.' });
    }
};

/**
 * Chức năng: Mở khóa tài khoản người dùng
 * (Chức năng: 1.2)
 */
exports.unbanUser = async (req, res) => {
    const { userId } = req.params;
    const adminId = req.session.user._id;

    try {
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng.' });
        }

        if (!user.isBanned) {
            return res.status(400).json({ success: false, error: 'Người dùng này không bị khóa.' });
        }

        user.isBanned = false;
        user.banReason = null;
        user.bannedBy = null;
        user.bannedAt = null;
        await user.save();

        // GHI LỊCH SỬ HÀNH ĐỘNG (AUDIT LOG)
        if (AdminLog) {
            await AdminLog.create({ action: 'UNBAN', targetUser: userId, admin: adminId, reason: 'Đã mở khóa' });
        }

        return res.json({ success: true, message: `Người dùng ${user.username} đã được mở khóa.`, user: user.toJSON() });

    } catch (err) {
        console.error('Lỗi khi mở khóa người dùng:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi mở khóa tài khoản.' });
    }
};

/**
 * Chức năng: Thay đổi vai trò (role) của người dùng (chỉ Super Admin được phép)
 * (Chức năng: 1.3)
 */
exports.changeUserRole = async (req, res) => {
    // ... (Kiểm tra quyền, tìm user, cập nhật role ) ...
    const { userId } = req.params;
    const { newRole } = req.body;
    const adminId = req.session.user._id;
    const adminRole = req.session.user.role;

    if (adminRole !== 'superadmin') {
        return res.status(403).json({ success: false, error: 'Chỉ Super Admin mới có quyền thay đổi vai trò.' });
    }
    if (!['admin', 'user'].includes(newRole)) {
        return res.status(400).json({ success: false, error: 'Vai trò mới không hợp lệ. Chỉ chấp nhận "admin" hoặc "user".' });
    }
    if (adminId.toString() === userId) {
        return res.status(403).json({ success: false, error: 'Super Admin không thể tự thay đổi vai trò của mình.' });
    }

    try {
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng.' });
        }
        if (user.role === 'superadmin' && newRole === 'user') {
            return res.status(403).json({ success: false, error: 'Bạn không thể hạ cấp một tài khoản Super Admin.' });
        }

        user.role = newRole;
        await user.save();

        // GHI LỊCH SỬ HÀNH ĐỘNG (AUDIT LOG)
        if (AdminLog) {
            await AdminLog.create({
                action: 'CHANGE_ROLE',
                targetUser: userId,
                admin: adminId,
                reason: `Đã thay đổi vai trò thành: ${newRole}`
            });
        }

        // ✅ ÁP DỤNG HÀM TIỆN ÍCH
        await disconnectUser(
            userId, 
            'Role Changed', 
            `Vai trò của bạn đã được thay đổi thành: ${newRole}. Vui lòng đăng nhập lại.`
        );

        return res.json({ success: true, message: `Vai trò của ${user.username} đã được cập nhật thành: ${newRole}.`, user: user.toJSON() });

    } catch (err) {
        console.error('Lỗi khi thay đổi vai trò:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi thay đổi vai trò người dùng.' });
    }
};
/**
 * Chức năng: Xóa tài khoản người dùng vĩnh viễn (chỉ Super Admin được phép)
 * (Chức năng: 1.4)
 */
exports.deleteUser = async (req, res) => {
    const { userId } = req.params;
    const adminId = req.session.user._id;

    try {
        const user = await User.findById(userId);
        
        // Kiểm tra sự tồn tại của người dùng
        if (!user) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng.' });
        }

        // Kiểm tra quyền và loại tài khoản cần xóa
        if (adminId.toString() === userId) {
            return res.status(403).json({ success: false, error: 'Bạn không thể tự xóa tài khoản của mình.' });
        }

        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, error: 'Không thể xóa tài khoản Super Admin.' });
        }

        const username = user.username;
        const deleteResult = await User.deleteOne({ _id: userId });
        await Message.deleteMany({ sender: userId }); 
        await AccessLog.deleteMany({ user: userId });

        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'Lỗi xóa: Tài khoản không tồn tại hoặc đã bị xóa.' });
        }

        // Ghi log xóa tài khoản
        await AdminLog.create({
            action: 'DELETE_USER',  // Action mới
            targetUser: userId,
            admin: adminId,
            reason: `Đã xóa vĩnh viễn tài khoản: ${username}`
        });

        // Tiện ích ngắt kết nối người dùng sau khi xóa tài khoản
        await disconnectUser(userId, 'Account Deleted', `Tài khoản của bạn đã bị xóa vĩnh viễn khỏi hệ thống.`);

        return res.json({ 
            success: true, 
            message: `Tài khoản "${username}" đã bị xóa vĩnh viễn.`, 
        });

    } catch (err) {
        console.error('Lỗi khi xóa tài khoản:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi xóa tài khoản người dùng.' });
    }
};


// -------------------------------------------------------
// ✅ THÊM: CHỨC NĂNG XEM CHI TIẾT NGƯỜI DÙNG (GET SINGLE USER)
// -------------------------------------------------------
/**
 * Chức năng: Lấy thông tin chi tiết của một người dùng cụ thể
 * (Chức năng: 1.5)
 */
exports.getSingleUser = async (req, res) => {
    const { userId } = req.params;

    try {
        // Lấy tất cả thông tin cần thiết, KHÔNG lấy password!
        const user = await User.findById(userId)
            .select('-password -__v'); 

        if (!user) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng.' });
        }
        
        // Lấy lịch sử Ban/Role gần đây 
        const logHistory = await AdminLog.find({ 
            targetUser: userId, 
            action: { $in: ['BAN', 'UNBAN', 'CHANGE_ROLE'] }
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('admin', 'username');

        // Gửi thông tin người dùng và lịch sử về Frontend
        return res.json({ 
            success: true, 
            user: {
                ...user.toJSON(),
                logHistory: logHistory.map(log => ({
                    action: log.action,
                    reason: log.reason,
                    admin: log.admin.username,
                    date: log.createdAt
                }))
            }
        });

    } catch (err) {
        console.error('Lỗi khi lấy chi tiết người dùng:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi lấy chi tiết người dùng.' });
    }
};

// =======================================================
// 2. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIG)
// =======================================================

/**
 * Lấy cấu hình hệ thống hiện tại (Bộ lọc từ cấm)
 * (Chức năng: 3.1)
 */
exports.getSystemConfig = async (req, res) => {
    try {
        // Chỉ tìm kiếm, không tự động tạo.
        const config = await SystemConfig.findOne({ key: 'CONFIG' }).select('-__v'); 

        // Nếu không tìm thấy (lần đầu tiên), trả về object rỗng để FE xử lý.
        return res.json({ success: true, config: config || {} }); 
    } catch (err) {
        console.error('Lỗi tải cấu hình hệ thống:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi tải cấu hình.' });
    }
};

/**
 * Cập nhật cấu hình hệ thống
 * (Chức năng: 3.2)
 */
exports.updateSystemConfig = async (req, res) => {
    const { profanityBlacklist, maxMessageLength } = req.body;
    const adminId = req.session.user._id;

    try {
        const updateData = {};
        if (profanityBlacklist !== undefined) {
            updateData.profanityBlacklist = profanityBlacklist.trim();
        }
        if (maxMessageLength !== undefined) {
            updateData.maxMessageLength = maxMessageLength;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, error: 'Không có dữ liệu cấu hình nào để cập nhật.' });
        }

        // Cập nhật hoặc chèn (upsert) cấu hình
        const updatedConfig = await SystemConfig.findOneAndUpdate(
            { key: 'CONFIG' },
            updateData,
            { new: true, upsert: true }
        );

        // GHI LỊCH SỬ HÀNH ĐỘNG (AUDIT LOG)
        if (AdminLog) {
            await AdminLog.create({
                action: 'SYSTEM_CONFIG',
                targetUser: null,
                admin: adminId,
                reason: 'Cập nhật cấu hình hệ thống'
            });
        }

        return res.json({
            success: true,
            message: 'Cấu hình hệ thống đã được cập nhật.',
            config: updatedConfig
        });

    } catch (err) {
        console.error('Lỗi cập nhật cấu hình hệ thống:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi cập nhật cấu hình.' });
    }
};

// =======================================================
// 3. THỐNG KÊ HỆ THỐNG (STATS)
// =======================================================

/**
 * Lấy tóm tắt thống kê hệ thống
 * (Chức năng: 5.1)
 */
exports.getStatsSummary = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({});
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const newUsers24h = await User.countDocuments({ createdAt: { $gte: yesterday } });
        const totalMessages = await Message.countDocuments({});

        return res.json({
            success: true,
            stats: {
                totalUsers: totalUsers,
                newUsers24h: newUsers24h,
                totalMessages: totalMessages,
                serverStatus: 'Ổn định',
                isStable: true
            }
        });
    } catch (err) {
        console.error('Lỗi tải thống kê:', err);
        return res.json({
            success: true,
            stats: {
                totalUsers: 0, newUsers24h: 0, totalMessages: 0,
                serverStatus: 'Lỗi Database/Server', isStable: false
            }
        });
    }
};


/**
 * Lấy thống kê lịch sử truy cập (Số ngày truy cập/tuần, Tần suất truy cập/ngày)
 */
exports.getAccessStats = async (req, res) => {
    try {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // 1. Tổng số Người dùng Duy nhất trong 7 ngày (WAU)
        const uniqueUsersAgg = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: oneWeekAgo } } },
            { $group: { _id: null, uniqueUsers: { $addToSet: '$user' } } }
        ]);
        const totalUniqueUsers = uniqueUsersAgg[0] ? uniqueUsersAgg[0].uniqueUsers.length : 0;

        // 2. Số ngày truy cập trong 7 ngày gần nhất
        const dailyAgg = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: oneWeekAgo } } },
            { $group: { _id: '$dateString' } },
            { $group: { _id: null, totalDays: { $sum: 1 } } }
        ]);
        const totalAccessDays = dailyAgg[0] ? dailyAgg[0].totalDays : 0;

        // 3. Tần suất truy cập trung bình (Số lần/ngày)
        const frequencyAgg = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: oneWeekAgo } } },
            { $group: { _id: { userId: '$user', date: '$dateString' }, accessCount: { $sum: 1 } } },
            { $group: { _id: '$accessCount', totalDays: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const totalAccessCount = frequencyAgg.reduce((acc, curr) => acc + curr._id * curr.totalDays, 0);
        const totalDaysLogged = frequencyAgg.reduce((acc, curr) => acc + curr.totalDays, 0);
        const avgFrequency = totalDaysLogged > 0 ? (totalAccessCount / totalDaysLogged).toFixed(2) : 0;

        return res.json({
            success: true,
            data: {
                totalUniqueUsers: totalUniqueUsers,
                totalDaysInLastWeek: totalAccessDays,
                frequencyDistribution: frequencyAgg,
                averageDailyVisits: avgFrequency
            }
        });

    } catch (err) {
        console.error('Lỗi khi tải thống kê truy cập:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi tải thống kê truy cập.' });
    }
};

/**
 * Lấy danh sách nhật ký hoạt động của Admin (Audit Log)
 * (Chức năng: 5.2.1)
 */
exports.getAdminLogs = async (req, res) => {
    try {
        const limit = 50;
        const logs = await AdminLog.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('admin', 'username nickname')
            .populate('targetUser', 'username nickname')
            .select('-__v');

        const formattedLogs = logs.map(log => {
            const adminName = log.admin?.nickname || log.admin?.username || 'Admin ẩn danh';
            let targetName = 'Hệ thống';

            if (log.targetUser) {
                targetName = log.targetUser.nickname || log.targetUser.username;
            }

            return {
                id: log._id,
                time: log.createdAt,
                action: log.action,
                admin: adminName,
                target: targetName,
                reason: log.reason,
                rawUserId: log.targetUser?._id,
            };
        });

        return res.json({ success: true, logs: formattedLogs, count: formattedLogs.length });

    } catch (err) {
        console.error('Lỗi khi tải Audit Log:', err);
        return res.status(500).json({ success: false, error: 'Lỗi server khi tải nhật ký hoạt động.' });
    }
};