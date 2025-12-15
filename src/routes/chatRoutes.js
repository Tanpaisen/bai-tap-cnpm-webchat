const express = require('express');
const router = express.Router();
const { ensureLoggedInJSON } = require('../middleware/auth');
const chatController = require('../controllers/chatController');


//=====================TEST MOCK====================//
// router.get('/chats', (req, res) => {
//     res.json([]); // Trả về mảng rỗng
// });
// // ✅ Mock API: Lấy lịch sử tin nhắn
// router.get('/history', (req, res) => {
//     res.json([]); // Trả về mảng rỗng (chưa có tin nhắn cũ)
// });
// // ✅ API Gửi tin nhắn (Giả lập trả về tin nhắn vừa gửi)
// router.post('/send', (req, res) => {
//     const { text, roomId, receiver } = req.body;
//     // Trả về đúng format tin nhắn để frontend vẽ ra
//     res.json({
//         _id: "msg_" + Date.now(),
//         sender: req.session.user._id, // ID của người đang login giả
//         receiver: receiver,
//         content: text,
//         type: 'text',
//         roomId: roomId,
//         createdAt: new Date()
//     });
// });
//=====================END TEST MOCK====================//
// 1. Lấy danh sách chat
router.get('/chats', ensureLoggedInJSON, chatController.getChatList);

// 2. Lấy lịch sử tin nhắn
router.get('/history', ensureLoggedInJSON, chatController.getChatHistory);

// 3. Gửi tin nhắn
router.post('/send', ensureLoggedInJSON, chatController.sendMessage);

// 4. Tạo nhóm
router.post('/create-group', ensureLoggedInJSON, chatController.createGroup);

// 5. Lấy thông tin nhóm
router.get('/group/:id', ensureLoggedInJSON, chatController.getGroupInfo);

// 6. Thêm thành viên vào nhóm
router.post('/group/add-member', ensureLoggedInJSON, chatController.addMemberToGroup);

// 7. Đổi tên nhóm
router.post('/group/rename', ensureLoggedInJSON, chatController.renameGroup);

// ✅ 8. NEW: Xóa nhóm (Chỉ admin)
router.post('/group/delete', ensureLoggedInJSON, chatController.deleteGroup);

// ✅ 9. NEW: Xóa thành viên (Chỉ admin)
router.post('/group/remove-member', ensureLoggedInJSON, chatController.removeMemberFromGroup);

// 10. Đặt biệt danh
router.post('/group/set-nickname', ensureLoggedInJSON, chatController.setMemberNickname);

module.exports = router;