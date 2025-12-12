const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");

const chatController = {
  // 1. TẠO NHÓM CHAT
  createGroup: async (req, res) => {
    try {
      const { name, members } = req.body;
      const adminId = req.session.user._id;

      if (
        !name ||
        !members ||
        !Array.isArray(members) ||
        members.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "Tên nhóm và thành viên là bắt buộc" });
      }

      const allMembers = [...new Set([...members, adminId])];

      const newChat = new Chat({
        isGroup: true,
        name: name,
        members: allMembers,
        admin: adminId,
        avatar: "https://cdn-icons-png.flaticon.com/512/166/166258.png",
      });

      await newChat.save();

      const sysMsg = new Message({
        chat: newChat._id,
        sender: adminId,
        content: `đã tạo nhóm "${name}"`,
        type: "system",
      });
      await sysMsg.save();

      newChat.lastMessage = sysMsg._id;
      await newChat.save();

      res.json({ success: true, groupId: newChat._id });
    } catch (err) {
      console.error("Create Group Error:", err);
      res.status(500).json({ error: "Lỗi server khi tạo nhóm" });
    }
  },

// 2. LẤY DANH SÁCH CHAT
getChatList: async (req, res) => {
    try {
      const userId = req.session.user._id;
      
      // ✅ THAY ĐỔI 1: Populate thêm trường isBanned và banReason
      const chats = await Chat.find({ members: userId })
        .populate({ path: 'members', select: 'username nickname avatar online isBanned banReason' }) // <- THÊM isBanned, banReason
        .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'nickname username' } })
        .sort({ updatedAt: -1 })
        .lean();

      const formattedChats = chats.map(chat => {
        
        // 🚨 XỬ LÝ CHAT 1-1 (Nơi lỗi "Deleted" xảy ra)
        if (!chat.isGroup) {
          const partner = chat.members.find(m => m._id.toString() !== userId);
          
          if (partner) {
            // ✅ THAY ĐỔI 2: Nếu đối tác bị BAN
            if (partner.isBanned) {
                 return {
                    _id: chat._id,
                    partnerId: partner._id,
                    // Gắn cờ và đổi tên hiển thị
                    nickname: 'Deleted', 
                    avatar: '/uploads/banned.png', // Avatar mặc định
                    online: false,
                    isBanned: true, // Gắn cờ QUAN TRỌNG cho Frontend
                    banReason: partner.banReason,
                    lastMessage: chat.lastMessage,
                    isGroup: false
                 };
            }
            
            // Nếu user bình thường
            return {
                _id: chat._id,
                partnerId: partner._id,
                nickname: partner.nickname || partner.username,
                avatar: partner.avatar,
                online: partner.online,
                lastMessage: chat.lastMessage,
                isGroup: false
            };
          }
        }
        
        // Xử lý Group Chat hoặc các trường hợp khác
        return {
          ...chat,
          partnerId: chat.isGroup ? chat._id : null, // Fix partnerId cho group
          nickname: chat.isGroup ? chat.name : (chat.nickname || chat.username)
        };
      });
      
      // ✅ THAY ĐỔI 3: Lọc ra khỏi danh sách nếu tài khoản bị khóa VÀ không có tin nhắn gần đây
      const filteredChats = formattedChats.filter(chat => {
          // Nếu bị banned VÀ không có tin nhắn cuối cùng (để dọn dẹp list cũ) thì ẩn
          if (chat.isBanned && !chat.lastMessage) return false;
          
          // Giữ lại chat group và các chat có tin nhắn gần đây
          return true;
      });

      res.json(filteredChats);
    } catch (err) { 
      console.error('Get Chat List Error:', err);
      res.status(500).json({ error: 'Lỗi server' }); 
    }
},

  getChatHistory: async (req, res) => {
    try {
      const { roomId, limit = 50, skip = 0 } = req.query;
      const userId = req.session.user._id;
      let chat;
      if (mongoose.isValidObjectId(roomId)) {
        chat = await Chat.findById(roomId);
        if (!chat)
          chat = await Chat.findOne({
            isGroup: false,
            members: { $all: [userId, roomId], $size: 2 },
          });
      } else if (roomId && roomId.includes("_")) {
        const userIds = roomId.split("_");
        if (userIds.length === 2) {
          chat = await Chat.findOne({
            isGroup: false,
            members: { $all: userIds, $size: 2 },
          });
        }
      }

      if (!chat) return res.json([]);

      const messages = await Message.find({ chat: chat._id })
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .populate("sender", "username nickname avatar")
        .lean(); // Nếu là nhóm chat, áp dụng biệt danh cho người gửi

      if (chat.isGroup) {
        messages.forEach((msg) => {
          if (msg.sender) {
            const senderId = msg.sender._id.toString();
            const groupNickname = chat.memberNicknames?.[senderId];
            if (groupNickname) {
              msg.sender.nickname = groupNickname;
            }
          }
        });
      }

      res.json(messages);
    } catch (err) {
      console.error("Get Chat History Error:", err);
      res.status(500).json({ error: "Lỗi server" });
    }
  }, // 4. GỬI TIN NHẮN

  sendMessage: async (req, res) => {
    try {
      const { receiver, roomId, text, image, file } = req.body;
      const senderId = req.session.user._id;
      let chat;

      if (mongoose.isValidObjectId(roomId)) {
        chat = await Chat.findById(roomId);
      }

      if (!chat && receiver) {
        chat = await Chat.findOne({
          isGroup: false,
          members: { $all: [senderId, receiver], $size: 2 },
        });

        if (!chat) {
          chat = new Chat({
            isGroup: false,
            members: [senderId, receiver],
          });
          await chat.save();
        }
      }

      if (!chat)
        return res
          .status(400)
          .json({ error: "Không thể xác định cuộc trò chuyện" });

      const newMessage = new Message({
        chat: chat._id,
        sender: senderId,
        content: text || "",
        image: image,
        file: file,
        type: image || file ? "media" : "text",
      });

      await newMessage.save();
      chat.lastMessage = newMessage._id;
      await chat.save();
      await newMessage.populate("sender", "username nickname avatar");
      const responseMsg = newMessage.toObject();
      responseMsg.roomId = chat._id; // Áp dụng biệt danh nếu là nhóm chat
      if (chat.isGroup) {
        const groupNickname = chat.memberNicknames?.[senderId.toString()];
        if (groupNickname) {
          responseMsg.sender.nickname = groupNickname;
        }
      }

      res.json(responseMsg);
    } catch (err) {
      res.status(500).json({ error: "Lỗi server" });
    }
  }, // 5. LẤY THÔNG TIN NHÓM

  getGroupInfo: async (req, res) => {
    try {
      const { id } = req.params; // Lấy cả memberNicknames để client có thể sử dụng
      const chat = await Chat.findById(id)
        .populate("members", "username nickname avatar")
        .lean();
      if (!chat || !chat.isGroup)
        return res.status(404).json({ error: "Nhóm không tồn tại" }); // Áp dụng biệt danh cho danh sách thành viên trả về
      if (chat.memberNicknames && chat.members) {
        chat.members.forEach((member) => {
          const nickname = chat.memberNicknames[member._id.toString()];
          if (nickname) {
            member.groupNickname = nickname; // Thêm trường groupNickname
          }
        });
      }
      res.json(chat);
    } catch (err) {
      res.status(500).json({ error: "Lỗi server" });
    }
  }, // 6. THÊM THÀNH VIÊN

  addMemberToGroup: async (req, res) => {
    try {
      const { groupId, memberId } = req.body;
      const chat = await Chat.findById(groupId);
      if (!chat) return res.status(404).json({ error: "Nhóm không tồn tại" });
      if (chat.members.includes(memberId))
        return res.status(400).json({ error: "Thành viên đã có trong nhóm" });

      chat.members.push(memberId);
      await chat.save();

      const sysMsg = new Message({
        chat: chat._id,
        sender: req.session.user._id,
        content: `đã thêm thành viên mới`,
        type: "system",
      });
      await sysMsg.save();
      chat.lastMessage = sysMsg._id;
      await chat.save();

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Lỗi server" });
    }
  }, // 7. ĐỔI TÊN NHÓM

  renameGroup: async (req, res) => {
    try {
      const { groupId, newName } = req.body;
      await Chat.findByIdAndUpdate(groupId, { name: newName });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Lỗi server" });
    }
  }, // 8. XÓA NHÓM

  deleteGroup: async (req, res) => {
    try {
      const { groupId } = req.body;
      const userId = req.session.user._id;
      const chat = await Chat.findById(groupId);
      if (!chat) return res.status(404).json({ error: "Nhóm không tồn tại" });
      if (chat.admin.toString() !== userId)
        return res
          .status(403)
          .json({ error: "Chỉ trưởng nhóm mới có quyền xóa nhóm" }); // Xóa tin nhắn và nhóm (đã đảm bảo xóa cả biệt danh)
      await Message.deleteMany({ chat: groupId });
      await Chat.findByIdAndDelete(groupId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Lỗi server" });
    }
  }, // ✅ 9. XÓA THÀNH VIÊN KHỎI NHÓM (Chỉ Admin)

  removeMemberFromGroup: async (req, res) => {
    try {
      const { groupId, memberId } = req.body;
      const adminId = req.session.user._id;
      const chat = await Chat.findById(groupId);
      if (!chat) return res.status(404).json({ error: "Nhóm không tồn tại" }); // Kiểm tra quyền Admin
      if (chat.admin.toString() !== adminId) {
        return res
          .status(403)
          .json({ error: "Chỉ trưởng nhóm mới có quyền xóa thành viên" });
      } // Không cho phép tự xóa chính mình (dùng chức năng giải tán hoặc rời nhóm)
      if (memberId === adminId.toString()) {
        return res
          .status(400)
          .json({ error: "Không thể tự xóa chính mình ở đây" });
      } // Lọc bỏ thành viên khỏi mảng
      chat.members = chat.members.filter((m) => m.toString() !== memberId); // Xóa biệt danh của thành viên đó khỏi nhóm (đảm bảo dọn dẹp data)
      const updatePath = `memberNicknames.${memberId}`;
      await Chat.updateOne({ _id: groupId }, { $unset: { [updatePath]: "" } });

      await chat.save(); // Lấy thông tin người bị xóa để tạo thông báo
      const removedUser = await User.findById(memberId);
      const removedName = removedUser
        ? removedUser.nickname || removedUser.username
        : "một thành viên"; // Tạo tin nhắn hệ thống
      const sysMsg = new Message({
        chat: chat._id,
        sender: adminId,
        content: `đã mời ${removedName} ra khỏi nhóm`,
        type: "system",
      });
      await sysMsg.save();
      chat.lastMessage = sysMsg._id;
      await chat.save();
      res.json({ success: true });
    } catch (err) {
      console.error("Remove Member Error:", err);
      res.status(500).json({ error: "Lỗi server" });
    }
  }, // 10. ĐẶT BIỆT DANH

  setMemberNickname: async (req, res) => {
    try {
      const { groupId, memberId, newNickname } = req.body;
      const callerId = req.session.user._id;

      if (
        !groupId ||
        !memberId ||
        newNickname === undefined ||
        newNickname === null
      ) {
        return res
          .status(400)
          .json({
            error: "Thông tin nhóm, thành viên và biệt danh là bắt buộc",
          });
      }
      const chat = await Chat.findById(groupId);

      if (!chat) return res.status(404).json({ error: "Nhóm không tồn tại" }); // Kiểm tra thành viên
      if (
        !chat.members.map((m) => m.toString()).includes(callerId.toString())
      ) {
        return res
          .status(403)
          .json({ error: "Bạn không phải là thành viên của nhóm này" });
      }
      if (
        !chat.members.map((m) => m.toString()).includes(memberId.toString())
      ) {
        return res
          .status(400)
          .json({ error: "Thành viên này không có trong nhóm" });
      } // 1. Cập nhật biệt danh

      const updatePath = `memberNicknames.${memberId}`;
      const trimmedNickname = (newNickname || "").trim();
      let mongoUpdate;

      if (trimmedNickname.length === 0) {
        // Xóa biệt danh (trả về nickname/username mặc định)
        mongoUpdate = { $unset: { [updatePath]: "" } };
      } else {
        mongoUpdate = { $set: { [updatePath]: trimmedNickname } };
      }

      await Chat.updateOne({ _id: groupId }, mongoUpdate); // 2. Tạo thông báo hệ thống

      const targetUser = await User.findById(memberId);
      const callerUser = await User.findById(callerId);

      const targetUserCurrentName = targetUser
        ? targetUser.nickname || targetUser.username
        : "một thành viên";
      const callerName = callerUser
        ? callerUser.nickname || callerUser.username
        : "ai đó";

      let content;
      if (trimmedNickname.length === 0) {
        // Thông báo đặt lại tên (về tên mặc định)
        if (memberId === callerId.toString()) {
          content = `${callerName} đã đặt lại tên hiển thị của mình trong nhóm.`;
        } else {
          content = `${callerName} đã đặt lại tên hiển thị của ${targetUserCurrentName} trong nhóm.`;
        }
      } else {
        // Thông báo đặt biệt danh mới
        if (memberId === callerId.toString()) {
          // Người đặt biệt danh cho chính mình
          content = `${callerName} đã tự đặt biệt danh trong nhóm là **"${trimmedNickname}"**`;
        } else {
          // Người đặt biệt danh cho người khác
          content = `${callerName} đã đặt biệt danh cho ${targetUserCurrentName} là **"${trimmedNickname}"**`;
        }
      } // 3. Tạo tin nhắn hệ thống & Cập nhật lastMessage
      const sysMsg = new Message({
        chat: groupId,
        sender: callerId,
        content: content,
        type: "system",
      });
      await sysMsg.save();
      await Chat.findByIdAndUpdate(groupId, { lastMessage: sysMsg._id });
      res.json({ success: true, newNickname: trimmedNickname });
    } catch (err) {
      console.error("Set Nickname Error:", err);
      res.status(500).json({ error: "Lỗi server khi đặt biệt danh" });
    }
  },
};

module.exports = chatController;
