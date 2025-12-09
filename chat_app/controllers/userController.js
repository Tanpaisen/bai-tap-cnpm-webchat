// controllers/userController.js
const User = require('../models/User');
const Message = require('../models/Message');
const FriendRequest = require('../models/FriendRequest');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

// =========================================================
//  🧩 1. Lấy thông tin người dùng hiện tại
// =========================================================
exports.getProfile = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!userId) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const user = await User.findById(userId).select(
      '_id username nickname avatar online isIncomingEnabled mainBackground dateOfBirth gender'
    );

    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    res.json(user);
  } catch (err) {
    console.error('❌ getProfile error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  🧩 2. Cập nhật nickname
// =========================================================
exports.updateNickname = async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    if (!nickname || nickname.trim() === '') {
      return res.status(400).json({ error: 'Nickname không hợp lệ' });
    }

    const userId = req.session?.tempUserId || req.session?.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const update = { nickname: nickname.trim() };
    if (avatar?.startsWith('/uploads/avatars/')) update.avatar = avatar;

    const updatedUser = await User.findByIdAndUpdate(userId, update, { new: true });
    if (!updatedUser) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    // Cập nhật session
    req.session.user = {
      _id: updatedUser._id,
      nickname: updatedUser.nickname,
      avatar: updatedUser.avatar
    };

    if (req.session.tempUserId) delete req.session.tempUserId;

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('❌ updateNickname error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  🧩 3. Cập nhật avatar
// =========================================================
exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Không có file ảnh hợp lệ' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.session.user._id,
      { avatar: avatarUrl },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    req.session.user.avatar = user.avatar;
    res.json({ success: true, avatar: user.avatar });
  } catch (err) {
    console.error('❌ updateAvatar error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  🧩 4. Đổi mật khẩu
// =========================================================
exports.updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword !== confirmPassword)
      return res.status(400).json({ error: 'Sai dữ liệu đầu vào' });

    const user = await User.findById(req.session.user._id).select('+password');
    if (!user) return res.status(404).json({ error: 'Người dùng không tồn tại' });

    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('❌ updatePassword error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  🧩 5. Lấy profile người khác
// =========================================================
exports.getUserProfile = async (req, res) => {
  try {
    const meId = req.session?.user?._id;
    const targetId = req.params.userId;

    if (!mongoose.isValidObjectId(targetId))
      return res.status(400).json({ error: 'ID không hợp lệ' });

    if (String(meId) === String(targetId)) {
      const me = await User.findById(meId).select('_id nickname avatar');
      return res.json({ ...me.toObject(), status: 'self' });
    }

    const me = await User.findById(meId).select('friends');
    const target = await User.findById(targetId).select('_id nickname avatar');

    if (!target) return res.status(404).json({ error: 'Người dùng không tồn tại' });

    let status = 'none';
    if (me.friends.includes(target._id)) status = 'friend';
    else {
      const reqDoc = await FriendRequest.findOne({
        $or: [{ from: meId, to: targetId }, { from: targetId, to: meId }]
      });
      if (reqDoc) status = reqDoc.from.equals(meId) ? 'pending' : 'incoming';
    }

    res.json({ ...target.toObject(), status });
  } catch (err) {
    console.error('❌ getUserProfile error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  🧩 6. Cập nhật toàn bộ Profile (nickname, avatar, ngày sinh, giới tính)
// =========================================================
exports.updateProfile = async (req, res) => {
  try {
    const { nickname, avatar, dateOfBirth, gender } = req.body;
    const userId = req.session?.user?._id;
    if (!userId) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const allowedGenders = ['male', 'female', 'other'];
    if (gender && !allowedGenders.includes(gender))
      return res.status(400).json({ error: 'Giới tính không hợp lệ' });

    const update = {
      nickname: nickname?.trim(),
      avatar: avatar || undefined,
      gender,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined
    };

    const updatedUser = await User.findByIdAndUpdate(userId, update, { new: true });
    if (!updatedUser) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    req.session.user = {
      _id: updatedUser._id,
      nickname: updatedUser.nickname,
      avatar: updatedUser.avatar,
      dateOfBirth: updatedUser.dateOfBirth,
      gender: updatedUser.gender,
      isIncomingEnabled: updatedUser.isIncomingEnabled,
      mainBackground: updatedUser.mainBackground
    };
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('❌ updateProfile error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  ⚙️ 7. Trạng thái hoạt động
// =========================================================
exports.updateIncomingStatus = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    const { isIncomingEnabled } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isIncomingEnabled },
      { new: true }
    );
    res.json({ success: true, isIncomingEnabled: user.isIncomingEnabled });
  } catch (err) {
    console.error('❌ updateIncomingStatus error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  🖼️ 8. Cập nhật hình nền
// =========================================================
exports.updateBackground = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file hình nền' });

    const backgroundUrl = `/uploads/backgrounds/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.session.user._id,
      { mainBackground: backgroundUrl },
      { new: true }
    );

    res.json({ success: true, mainBackground: user.mainBackground });
  } catch (err) {
    console.error('❌ updateBackground error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  💬 9. Xóa lịch sử chat
// =========================================================
exports.deleteChatHistory = async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.session?.user?._id;
    if (!mongoose.isValidObjectId(friendId))
      return res.status(400).json({ error: 'ID người bạn không hợp lệ' });

    const result = await Message.deleteMany({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId }
      ]
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('❌ deleteChatHistory error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// =========================================================
//  🎂 10. Cập nhật ngày sinh & giới tính riêng
// =========================================================
exports.updatePersonalInfo = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    const { dateOfBirth, gender } = req.body;

    const allowedGenders = ['male', 'female', 'other'];
    if (gender && !allowedGenders.includes(gender))
      return res.status(400).json({ error: 'Giới tính không hợp lệ' });

    const update = {};
    if (dateOfBirth) update.dateOfBirth = new Date(dateOfBirth);
    if (gender) update.gender = gender;

    const updatedUser = await User.findByIdAndUpdate(userId, update, { new: true });
    req.session.user = updatedUser;
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('❌ updatePersonalInfo error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};
