//btl/chat_app/routes/chatRoutes.js
const express = require('express') 
const router = express.Router() 
const { ensureLoggedInJSON } = require('../middleware/auth')
const chatController = require('../controllers/chatController')

// Lấy lịch sử chat 
router.get(
    '/history', 
    ensureLoggedInJSON, 
    chatController.getHistory ) 

// Lưu và broadcast tin nhắn mới 

router.post( 
    '/send', 
    ensureLoggedInJSON, 
    chatController.sendMessageREST 
) 
module.exports = router