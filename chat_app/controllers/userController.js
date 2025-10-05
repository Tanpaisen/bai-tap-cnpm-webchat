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
exports.updateNickname = async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    if (!nickname || nickname.trim() === '') {
      return res.status(400).json({ error: 'Nickname không hợp lệ' });
    }

    const avatarUrl = avatar?.startsWith('/uploads/avatars/')
      ? avatar
      : 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png';

    const updatedUser = await User.findByIdAndUpdate(
      req.session.tempUserId,
      { nickname, avatar: avatarUrl },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng để cập nhật' });
    }

    req.session.user = {
      _id: updatedUser._id,
      nickname: updatedUser.nickname,
      avatar: updatedUser.avatar
    };

    delete req.session.tempUserId;
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi updateNickname:', err);
    res.status(500).json({ error: 'Lỗi server' });
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

