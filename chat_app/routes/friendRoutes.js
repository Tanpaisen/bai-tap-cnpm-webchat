//routes/friendRoutes.js
const express = require('express');
const router = express.Router();
const { ensureLoggedInJSON } = require('../middleware/auth');
const friendController = require('../controllers/friendController');

// ✅ Lấy danh sách bạn bè hiện tại
router.get('/', ensureLoggedInJSON, friendController.listFriends);

// ✅ Alias: /api/friends/list
router.get('/list', ensureLoggedInJSON, friendController.listFriends);

// ✅ Lấy tất cả user để mời kết bạn
router.get('/all', ensureLoggedInJSON, friendController.listAllUsers);

// ✅ Gửi lời mời kết bạn
router.post('/send', ensureLoggedInJSON, friendController.sendRequest);

// ✅ Lấy danh sách lời mời đến
router.get('/requests', ensureLoggedInJSON, friendController.listRequests);

// ✅ Phản hồi lời mời: accept hoặc reject
router.post('/requests/respond', ensureLoggedInJSON, friendController.respondRequest);

// ✅ Gợi ý mở rộng: hủy kết bạn
router.post('/remove', ensureLoggedInJSON, friendController.removeFriend); // cần thêm controller

// hủy bạn
router.post('/remove', ensureLoggedInJSON, friendController.removeFriend);


module.exports = router;
