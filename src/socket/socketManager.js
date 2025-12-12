const socketIO = require('socket.io');

let io = null;

// 🧠 Thay đổi cấu trúc: Map lưu UserID -> Set(các SocketID)
// Ví dụ: User A mở 3 tab => Set có 3 socketId khác nhau
const userSockets = new Map();

module.exports = {
    /**
     * Khởi tạo Socket.IO instance
     */
    init: (httpServer, options) => {
        io = socketIO(httpServer, options);
        return io;
    },

    /**
     * Trả về instance Socket.IO đã khởi tạo
     */
    getIO: () => {
        if (!io) {
            throw new Error('Socket.io not initialized. Call init() first.');
        }
        return io;
    },

    /**
     * Thêm user vào danh sách online (Hỗ trợ đa tab)
     * @param {string} userId 
     * @param {string} socketId 
     */
    addOnlineUser: (userId, socketId) => {
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        // Thêm socket mới vào danh sách các socket của user đó
        userSockets.get(userId).add(socketId);
        
        // Log kiểm tra
        // console.log(`➕ User ${userId} connected on socket ${socketId}. Tabs open: ${userSockets.get(userId).size}`);
    },

    /**
     * Xóa 1 socket cụ thể của user (Khi đóng 1 tab)
     * @param {string} userId 
     * @param {string} socketId 
     */
    removeOnlineUser: (userId, socketId) => {
        if (userSockets.has(userId)) {
            const sockets = userSockets.get(userId);
            sockets.delete(socketId); // Chỉ xóa socket của tab vừa đóng

            // Nếu không còn socket nào (đóng hết tab) -> Xóa user khỏi Map
            if (sockets.size === 0) {
                userSockets.delete(userId);
                // console.log(`🔴 User ${userId} went completely offline.`);
            } else {
                // console.log(`➖ User ${userId} closed a tab. Remaining tabs: ${sockets.size}`);
            }
        }
    },

    /**
     * ✅ HÀM QUAN TRỌNG ĐỂ SỬA LỖI
     * Kiểm tra xem user có còn online ở bất kỳ tab nào không
     */
    isUserOnline: (userId) => {
        return userSockets.has(userId) && userSockets.get(userId).size > 0;
    },

    /**
     * Lấy danh sách TẤT CẢ socketId của một User (để gửi thông báo cho tất cả các tab)
     * @param {string} userId 
     * @returns {Array} Mảng các socketId
     */
    getUserSockets: (userId) => {
        if (userSockets.has(userId)) {
            return Array.from(userSockets.get(userId));
        }
        return [];
    },
    
    // Getter lấy toàn bộ Map (dùng cho debug/admin nếu cần)
    get onlineUsers() {
        return userSockets;
    }
};