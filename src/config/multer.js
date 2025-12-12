// btl/chat_app/config/multer.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

function ensureDirExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    console.error('❌ Không tạo được thư mục upload:', dirPath, err);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder = 'files';
    if (file.fieldname === 'avatar') subfolder = 'avatars';
    else if (file.fieldname === 'image' || file.fieldname === 'background') subfolder = 'images';

    const uploadPath = path.resolve(__dirname, '..', 'uploads', subfolder);
    ensureDirExists(uploadPath);

    console.log('📂 [Multer] Lưu vào:', uploadPath);
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
  const baseName = path.basename(file.originalname, ext);

// Loại bỏ ký tự có dấu & ký tự đặc biệt
const safeName = baseName
  .normalize('NFD') // tách ký tự dấu
  .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
  .replace(/[^a-zA-Z0-9_-]/g, '_') // giữ lại ký tự an toàn
  .replace(/_+/g, '_'); // gộp dấu gạch dưới thừa

cb(null, `${safeName}_${Date.now()}${ext}`);

  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (file.fieldname === 'avatar' || file.fieldname === 'image') {
      if (!allowedImage.includes(file.mimetype)) {
        return cb(new Error('Chỉ được upload ảnh (jpg, png, gif, webp)'));
      }
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 2MB
  }
});

module.exports = upload;
