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
  if (req.session?.user?._id) return next();
  console.warn('🔒 Chặn truy cập API: chưa đăng nhập');
  return res.status(401).json({ error: 'Chưa đăng nhập' });
}

module.exports = {
  ensureLoggedIn,
  ensureLoggedInJSON
};
