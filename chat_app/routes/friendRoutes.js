const express = require('express');
const router = express.Router();
const { ensureLoggedInJSON } = require('../middleware/auth');
const friendController = require('../controllers/friendController');

// 1. Lấy danh sách bạn bè
router.get('/', ensureLoggedInJSON, friendController.listFriends);
router.get('/list', ensureLoggedInJSON, friendController.listFriends); // Alias

// 2. route all-users
router.get('/all-users', ensureLoggedInJSON, friendController.listAllUsers);
router.get('/all', ensureLoggedInJSON, friendController.listAllUsers); // Alias cũ

// 3. Gửi lời mời
router.post('/send', ensureLoggedInJSON, friendController.sendRequest);

// 4. Lấy danh sách lời mời (Fix lỗi 500 ở controller)
router.get('/requests', ensureLoggedInJSON, friendController.listRequests);

// 5. Phản hồi lời mời
router.post('/requests/respond', ensureLoggedInJSON, friendController.respondRequest);

// 6. Hủy kết bạn
router.post('/remove', ensureLoggedInJSON, friendController.removeFriend);

module.exports = router;