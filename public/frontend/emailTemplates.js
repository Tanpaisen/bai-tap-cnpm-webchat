

const getOtpEmailTemplate = (otpCode, nickname) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Mã xác thực OTP</title>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: #ffffff; }
            .header h1 { margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px; }
            .content { padding: 30px; color: #333333; line-height: 1.6; }
            .greeting { font-size: 16px; margin-bottom: 20px; }
            .otp-box { 
                border: 2px dashed #764ba2; 
                background-color: #f8f9fa;
                padding: 20px;
                text-align: center;
                margin: 25px 0;
                border-radius: 8px;
            }
            .otp-code { 
                font-size: 32px; 
                font-weight: bold; 
                color: #764ba2; 
                letter-spacing: 5px;
                display: block;
                margin-bottom: 10px;
            }
            .copy-text { font-size: 14px; color: #666; }
            .footer { background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; }
            .warning { color: #d9534f; font-weight: bold; }
        </style>
    </head>
    <body>
        <div style="padding: 20px; background-color: #f4f4f4;">
            <div class="container">
                <div class="header">
                    <h1>Evelyn Chat</h1>
                </div>
                <div class="content">
                    <p class="greeting">Xin chào <strong>${nickname}</strong>,</p>
                    <p>Bạn (hoặc ai đó) vừa yêu cầu đăng nhập vào tài khoản Evelyn Chat thông qua Google. Để hoàn tất, vui lòng nhập mã xác thực dưới đây:</p>
                    <div class="otp-box">
                        <span class="otp-code">${otpCode}</span>
                        <div class="copy-text">Hoặc copy mã này: <strong>${otpCode}</strong></div>
                        <div style="font-size: 12px; color: #999; margin-top: 5px;">(Mã gồm 6 chữ số, không có khoảng trắng)</div>
                    </div>
                    <p>Mã này có hiệu lực trong <span class="warning">5 phút</span>.</p>
                    <p>Nếu bạn không yêu cầu đăng nhập, vui lòng bỏ qua email này.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2025 Evelyn Chat Application.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};

// Xuất module để dùng được trong authController.js
module.exports = { getOtpEmailTemplate };