//chat_app/socket/chatSocker.js
module.exports = (io, chatController) => {
  io.on('connection', socket => {
    const sess = socket.request.session?.user || {};
    const userId = sess._id?.toString();
    const avatar = sess.avatar;
    const nickname = sess.nickname;

    if (!userId) return;

    socket.on('joinRoom', roomId => {
      socket.join(roomId);
    });

    socket.on('sendMessage', async msg => {
      const { to, roomId, content, file, image } = msg;
      if (!to || !roomId || (!content && !file && !image)) return;

      try {
        const saved = await chatController.saveMessage({
          sender: userId,
          receiver: to,
          room: roomId,
          content,
          file,
          image
        });

        if (!saved) return;

        await saved.populate('sender', '_id avatar nickname online');
        const full = saved.toObject();

        io.in(roomId).emit('newMessage', full);
      } catch (err) {
        console.error('❌ socket sendMessage error:', err);
      }
    });
  });
};
