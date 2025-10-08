const mongoose = require('mongoose');

/**
 * Middleware bảo vệ các route frontend:
 * Nếu đã login (có req.session.user._id) → next()
 * Nếu chưa, redirect về /login
 */
function ensureLoggedIn(req, res, next) {
  if (req.session?.user?._id) return next();
  console.warn('🔒 Chặn truy cập frontend: chưa đăng nhập');
  return res.redirect('/login');
}

/**
 * Middleware bảo vệ các API JSON:
 * Chỉ cho phép người dùng đã đăng nhập đầy đủ (có user._id)
 */
function ensureLoggedInJSON(req, res, next) {
    const userId = req.session?.user?._id;

    if (!userId) {
        console.warn('🔒 Chặn truy cập API: Chưa đăng nhập');
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
const userIdString = userId.toString(); 

    // 💡 Sửa lỗi: Nếu ID tồn tại nhưng không hợp lệ (Bị hỏng) -> Xóa session và yêu cầu đăng nhập lại (401)
    if (!mongoose.Types.ObjectId.isValid(userIdString)) {
        // Xóa session bị lỗi để buộc người dùng đăng nhập lại
        req.session.destroy(err => {
            if (err) console.error('Lỗi khi xóa session bị hỏng:', err);
        });
        
        console.warn(`🔒 Chặn truy cập API: ID session '${userIdString}' không hợp lệ. Đã xóa session.`);
        // Trả về 401 để client hiểu cần phải đăng nhập lại
        return res.status(401).json({ error: 'ID người dùng trong Session không hợp lệ. Vui lòng đăng nhập lại.' });
    }

    return next();
}

module.exports = {
  ensureLoggedIn,
  ensureLoggedInJSON
};
