const mongoose = require('mongoose');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const socketManager = require('../socket/socketManager');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

const friendController = {
  // 1. Lấy danh sách bạn bè
  listFriends: async (req, res) => {
    try {
      const userId = req.session?.user?._id;
      if (!userId || !mongoose.isValidObjectId(userId)) {
        return res.status(401).json({ error: 'Chưa đăng nhập hoặc ID không hợp lệ' });
      }

      const me = await User.findById(userId)
        .populate({ path: 'friends', select: '_id nickname avatar online' })
        .lean();

      if (!me) return res.status(404).json({ error: 'User không tồn tại' });

      // Lọc bỏ giá trị null và trùng lặp
      const validFriends = (me.friends || []).filter(f => f && f._id);
      const uniqueFriends = [
        ...new Map(validFriends.map(u => [u._id.toString(), u])).values()
      ];

      const friends = uniqueFriends.map(u => ({
        id: u._id,
        _id: u._id,
        nickname: u.nickname || u.username,
        avatar: u.avatar || 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png',
        online: u.online || false
      }));

      res.json(friends);
    } catch (err) {
      console.error('❌ Lỗi listFriends:', err);
      res.status(500).json({ error: 'Lỗi server' });
    }
  },

  // 2. Lấy danh sách tất cả user (Gợi ý kết bạn)
  listAllUsers: async (req, res) => {
    try {
      const meId = req.session?.user?._id;
      if (!meId) return res.status(401).json({ error: 'Chưa đăng nhập' });

      const me = await User.findById(meId).lean();
      // Chuyển friends ID sang string để so sánh
      const myFriends = (me?.friends || []).map(id => id.toString());
      
      // Loại trừ: chính mình, bạn bè hiện tại, và admin
      const excludeIds = [meId.toString(), ...myFriends];

      const allUsers = await User.find({ 
          _id: { $nin: excludeIds }, 
          role: { $ne: 'admin' } 
      })
      .select('_id nickname avatar username isBanned')
      .limit(50)
      .lean();

      // Lấy các request liên quan đến mình (để hiển thị trạng thái)
      const requests = await FriendRequest.find({
        $or: [{ from: meId }, { to: meId }]
      }).select('from to').lean();

      const result = allUsers.map(u => {
        const uIdStr = u._id.toString();
        let status = 'none';
        let reqId = null;

        // Kiểm tra xem có request nào giữa 2 người không
        // Thêm check null an toàn cho r.from và r.to
        const req = requests.find(r => {
            if (!r || !r.from || !r.to) return false; 
            return (r.from.toString() === meId && r.to.toString() === uIdStr) || 
                   (r.to.toString() === meId && r.from.toString() === uIdStr);
        });

        if (req) {
            if (req.from.toString() === meId) status = 'pending'; // Mình đã gửi
            else { 
                status = 'incoming'; // Họ gửi cho mình
                reqId = req._id;
            }
        }

        return {
          id: u._id,
          _id: u._id,
          nickname: u.nickname || u.username,
          avatar: u.avatar || 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png',
          status,
          reqId
        };
      });

      res.json(result);
    } catch (err) {
      console.error('❌ Lỗi listAllUsers:', err);
      res.status(500).json({ error: 'Lỗi server', detail: err.message });
    }
  },

  // 3. Gửi lời mời
  sendRequest: async (req, res) => {
    try {
      const from = req.session?.user?._id;
      const { to } = req.body;

      if (!from || !to || from === to || !mongoose.isValidObjectId(to)) {
        return res.status(400).json({ error: 'Yêu cầu không hợp lệ' });
      }

      // Kiểm tra xem đã là bạn chưa
      const user = await User.findById(from);
      if (user.friends.includes(to)) {
        return res.status(400).json({ error: 'Hai người đã là bạn bè' });
      }

      const exists = await FriendRequest.findOne({
        $or: [
          { from: from, to: to },
          { from: to, to: from } 
        ]
      });

      if (exists) {
        if (exists.to.toString() === from.toString()) {
          return res.status(400).json({ error: 'Người dùng này đã gửi lời mời cho bạn.' });
        }
        return res.json({ success: true, message: 'Đã gửi lại yêu cầu' }); 
      }

      await FriendRequest.create({ from, to, status: 'pending' });
      res.json({ success: true, message: 'Gửi lời mời thành công' });
    } catch (err) {
      console.error('❌ Lỗi sendRequest:', err);
      res.status(500).json({ error: 'Server error', detail: err.message });
    }
  },

  // 4. ✅ Lấy danh sách lời mời đến (Đã FIX lỗi null và crash)
  listRequests: async (req, res) => {
    try {
      const meId = req.session?.user?._id;
      if (!meId) return res.status(401).json({ error: 'Chưa đăng nhập' });

      // Tìm request gửi TỚI mình
      const arr = await FriendRequest.find({ to: meId, status: 'pending' })
        .populate('from', '_id nickname username avatar') 
        .lean();

      // 🌟 QUAN TRỌNG: Lọc bỏ các request mà 'from' bị null (người gửi đã bị xóa)
      // Sử dụng .filter() trước khi .map()
      const validRequests = arr.filter(r => r && r.from && r.from._id);

      const result = validRequests.map(r => ({
        reqId: r._id,
        requestId: r._id,
        id: r.from._id, 
        username: r.from.username,
        nickname: r.from.nickname || r.from.username,
        avatar: r.from.avatar || 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png',
        createdAt: r.createdAt
      }));

      res.json(result);
    } catch (err) {
      console.error('❌ Lỗi listRequests:', err);
      res.status(500).json({ error: 'Server error', detail: err.message });
    }
  },

  // 5. Phản hồi (Accept/Reject)
  respondRequest: async (req, res) => {
    try {
      const meId = req.session?.user?._id;
      const { requestId, action } = req.body;

      if (!requestId || !['accept', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
      }

      const reqDoc = await FriendRequest.findById(requestId);
      if (!reqDoc) return res.status(404).json({ error: 'Không tìm thấy lời mời' });

      // Chỉ xử lý khi mình là người nhận (to)
      if (reqDoc.to.toString() !== meId) {
        return res.status(403).json({ error: 'Bạn không có quyền chấp nhận lời mời này.' });
      }

      if (action === 'accept') {
        await User.findByIdAndUpdate(reqDoc.from, { $addToSet: { friends: reqDoc.to } });
        await User.findByIdAndUpdate(reqDoc.to, { $addToSet: { friends: reqDoc.from } });
        await FriendRequest.findByIdAndDelete(requestId);

        const accepterId = reqDoc.to.toString(); // Người chấp nhận (chính mình)
        const requesterId = reqDoc.from.toString(); // Người gửi lời mời
        const io = req.app.get('io');
        
        if (io) {
            // 1. Gửi cho người chấp nhận (Me): Cập nhật list chat/friend
            io.to(accepterId).emit('friendStatusUpdate', { 
                action: 'accepted', 
                partnerId: requesterId 
            });
            // 2. Gửi cho người gửi lời mời: Cập nhật list chat/friend
            io.to(requesterId).emit('friendStatusUpdate', { 
                action: 'accepted', 
                partnerId: accepterId 
            });
            console.log(`[Socket] Accepted: Emitted friendStatusUpdate to ${accepterId} & ${requesterId}`);
        }

        res.json({ success: true, message: 'Đã kết bạn' });
      } else {
        await FriendRequest.findByIdAndDelete(requestId);
        res.json({ success: true, message: 'Đã từ chối' });
      }
    } catch (err) {
      console.error('Respond Error:', err);
      res.status(500).json({ error: 'Lỗi server' });
    }
  },

  // 6. Hủy kết bạn
  removeFriend: async (req, res) => {
    try {
      const meId = req.session?.user?._id;
      const { targetId } = req.body;

      if (!targetId) return res.status(400).json({ error: 'Thiếu targetId' });

      await User.findByIdAndUpdate(meId, { $pull: { friends: targetId } });
      await User.findByIdAndUpdate(targetId, { $pull: { friends: meId } });

      // Xóa luôn các request cũ nếu còn sót lại
      await FriendRequest.deleteMany({
          $or: [
              { from: meId, to: targetId },
              { from: targetId, to: meId }
          ]
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Remove Friend Error:', err);
      res.status(500).json({ error: 'Lỗi server' });
    }
  },


// 7 Xóa đoạn chat
  deleteConversation: async (req, res) => {
      try {
        const { chatId } = req.body;
        const userId = req.session.user._id; // Lấy ID người dùng từ session

        if (!chatId) {
          return res.status(400).json({ error: "Thiếu Chat ID" });
        }

        // 1. Tìm đoạn chat
        const chat = await Chat.findById(chatId);
        if (!chat) {
          return res.status(404).json({ error: "Cuộc trò chuyện không tồn tại" });
        }

        // 2. Kiểm tra quyền (User phải là thành viên của chat đó mới được xóa)
        // Lưu ý: member trong DB là ObjectId, cần so sánh dạng chuỗi hoặc dùng .includes()
        const isMember = chat.members.some(m => m.toString() === userId.toString());
        
        if (!isMember) {
          return res.status(403).json({ error: "Bạn không có quyền xóa cuộc trò chuyện này" });
        }

        // 3. Xóa toàn bộ tin nhắn của chat này
        await Message.deleteMany({ chat: chatId });

        // 4. Xóa Chat Room
        await Chat.findByIdAndDelete(chatId);

        res.json({ success: true });
      } catch (err) {
        console.error("Delete Chat Error:", err);
        res.status(500).json({ error: "Lỗi server khi xóa trò chuyện" });
      }
    },
};

module.exports = friendController;