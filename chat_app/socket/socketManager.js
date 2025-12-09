// socket/socketManager.js

let io;
// Map để lưu trữ ánh xạ: { userId: socketId }
const onlineUsers = new Map();

module.exports = {
    /**
     * Khởi tạo Socket.IO instance
     * @param {object} httpServer - Instance của HTTP server
     * @param {object} options - Các tùy chọn cấu hình cho Socket.IO
     * @returns {object} - Instance của Socket.IO
     */
    init: (httpServer, options) => {
        io = require('socket.io')(httpServer, options);
        return io;
    },

    /**
     * Trả về instance Socket.IO đã khởi tạo
     * @returns {object} - Instance của Socket.IO
     */
    getIo: () => {
        if (!io) {
            throw new Error('Socket.io not initialized. Call init() first.');
        }
        return io;
    },

    /**
     * Thêm user vào danh sách online
     * @param {string} userId - ID của người dùng
     * @param {string} socketId - ID của socket kết nối
     */
    addOnlineUser: (userId, socketId) => {
        // Xử lý trường hợp người dùng đã có socketId cũ (refresh/kết nối lại)
        if (onlineUsers.has(userId)) {
            const oldSocketId = onlineUsers.get(userId);
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket && oldSocket.id !== socketId) {
                // Tùy chọn: ngắt kết nối socket cũ
                oldSocket.disconnect(true);
            }
        }
        onlineUsers.set(userId, socketId);
        console.log(`[SocketManager] User ${userId} online. Total: ${onlineUsers.size}`);
    },

    /**
     * Xóa user khỏi danh sách online
     * @param {string} userId - ID của người dùng
     */
    removeOnlineUser: (userId) => {
        onlineUsers.delete(userId);
        console.log(`[SocketManager] User ${userId} offline. Total: ${onlineUsers.size}`);
    },
    
    /**
     * Lấy Socket ID của người dùng
     * @param {string} userId - ID của người dùng
     * @returns {string | undefined} - Socket ID
     */
    getSocketId: (userId) => {
        return onlineUsers.get(userId);
    },

    // Export Map để adminController có thể truy cập nếu cần (thay vì getSocketId)
    onlineUsers: onlineUsers 
};