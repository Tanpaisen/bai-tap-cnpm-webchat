//controllers/userControllers.js
const User   = require('../models/User');
const bcrypt = require('bcrypt');

// Lấy thông tin người dùng hiện tại
exports.getProfile = async (req, res) => {
  try {
    if (!req.session?.user?._id) {
      return res.status(401).json({ error: 'Chưa đăng nhập' });
    }

    const user = await User.findById(req.session.user._id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    res.json({
      _id:      user._id,
      username: user.username,
      nickname: user.nickname,
      avatar:   user.avatar
    });
  } catch (err) {
    console.error('Lỗi getProfile:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// Cập nhật nickname và avatar (sau khi đăng nhập lần đầu)
// controllers/userControllers.js
exports.updateNickname = async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    if (!nickname || nickname.trim() === '') {
      return res.status(400).json({ error: 'Nickname không hợp lệ' });
    }

    // Chọn userId: ưu tiên tempUserId (khi setup lần đầu), ngược lại dùng session.user._id
    const userId = req.session?.tempUserId || req.session?.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const avatarUrl = avatar?.startsWith('/uploads/avatars/')
      ? avatar
      : undefined; // nếu không truyền avatar thì không cập nhật avatar

    const update = { nickname: nickname.trim() };
    if (avatarUrl) update.avatar = avatarUrl;

    // Chỉ cập nhật các trường trong `update` (không chạm username)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng để cập nhật' });
    }

    // Cập nhật session.user: chỉ overwrite nickname và avatar, giữ nguyên username và các trường khác
    if (!req.session.user) req.session.user = {};
    req.session.user._id = updatedUser._id;
    req.session.user.nickname = updatedUser.nickname;
    req.session.user.avatar = updatedUser.avatar;

    // Nếu dùng tempUserId (flow setup), xóa tempUserId
    if (req.session?.tempUserId) delete req.session.tempUserId;

    return res.json({ success: true, nickname: updatedUser.nickname, avatar: updatedUser.avatar });
  } catch (err) {
    console.error('Lỗi updateNickname:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
};


// Cập nhật avatar riêng (nếu cần)
exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      console.log('❌ Không có file trong req.file');
      return res.status(400).json({ error: 'Không có file avatar' });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Chỉ được upload ảnh làm avatar' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.session.user._id,
      { avatar: avatarUrl },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng để cập nhật avatar' });
    }

    req.session.user.avatar = user.avatar;
    console.log('📦 File nhận được:', req.file);

    res.json({ success: true, avatar: user.avatar }); 
  } catch (err) {
    console.error('❌ Lỗi updateAvatar:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
};


exports.updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Sai định dạng hoặc mới/confirm không khớp' });
    }

    // Tải bản ghi có hash mật khẩu
    const user = await User.findById(req.session.user._id).select('+password');
    if (!user) return res.status(404).json({ error: 'Người dùng không tồn tại' });

    // So khớp mật khẩu cũ
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });

    // Lưu mật khẩu mới
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('❌ updatePassword error:', err);
    res.status(500).json({ error: 'Lỗi server khi cập nhật mật khẩu' });
  }
};

