const mongoose = require('mongoose');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');

async function listFriends(req, res) {
  try {
    const userId = req.session?.user?._id;
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({ error: 'Chưa đăng nhập hoặc ID không hợp lệ' });
    }

    const me = await User.findById(userId)
      .populate({ path: 'friends', select: '_id nickname avatar' })
      .lean();

    if (!me) return res.status(404).json({ error: 'User không tồn tại' });

    // 🔧 Loại bỏ trùng lặp
    const uniqueFriends = [
      ...new Map((me.friends || []).map(u => [u._id.toString(), u])).values()
    ];

    const friends = uniqueFriends.map(u => ({
      id: u._id,
      nickname: u.nickname,
      avatar: u.avatar || 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png'
    }));

    res.json(friends);
  } catch (err) {
    console.error('❌ Lỗi listFriends:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

async function listAllUsers(req, res) {
  try {
    const meId = req.session?.user?._id;
    if (!meId || !mongoose.isValidObjectId(meId)) {
      return res.status(401).json({ error: 'Chưa đăng nhập hoặc ID không hợp lệ' });
    }

    const me = await User.findById(meId).lean();
    const myFriends = me?.friends || [];

    const allUsers = await User.find({ _id: { $ne: meId } })
      .select('_id nickname avatar')
      .lean();

    const requests = await FriendRequest.find({
      $or: [{ from: meId }, { to: meId }]
    }).select('from to').lean();

    const result = allUsers.map(u => {
      let status = 'none';
      if (myFriends.some(id => id.equals(u._id))) status = 'friend';
      else if (requests.find(r => r.from.equals(meId) && r.to.equals(u._id))) status = 'pending';
      else if (requests.find(r => r.to.equals(meId) && r.from.equals(u._id))) status = 'incoming';

      return {
        id: u._id,
        nickname: u.nickname,
        avatar: u.avatar || 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png',
        status
      };
    });

    res.json(result);
  } catch (err) {
    console.error('❌ Lỗi listAllUsers:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

async function sendRequest(req, res) {
  try {
    const from = req.session?.user?._id;
    const { to } = req.body;

    if (!from || !to || from === to || !mongoose.isValidObjectId(to)) {
      return res.status(400).json({ error: 'Yêu cầu không hợp lệ' });
    }

    const alreadyFriend = await User.exists({ _id: from, friends: to });
    if (alreadyFriend) {
      return res.status(400).json({ error: 'Hai người đã là bạn bè' });
    }

    const exists = await FriendRequest.findOne({ from, to });
    if (exists) return res.json({ success: true });

    await FriendRequest.create({ from, to });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Lỗi sendRequest:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

async function listRequests(req, res) {
  try {
    const meId = req.session?.user?._id;
    if (!meId || !mongoose.isValidObjectId(meId)) {
      return res.status(401).json({ error: 'Chưa đăng nhập hoặc ID không hợp lệ' });
    }

    const arr = await FriendRequest.find({ to: meId })
      .populate('from', '_id nickname avatar')
      .lean();

    const result = arr.map(r => ({
      reqId: r._id,
      id: r.from._id,
      nickname: r.from.nickname,
      avatar: r.from.avatar || 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png'
    }));

    res.json(result);
  } catch (err) {
    console.error('❌ Lỗi listRequests:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

async function respondRequest(req, res) {
  try {
    const meId = req.session?.user?._id;
    const { requestId, action } = req.body;

    if (!meId || !requestId || !['accept', 'reject'].includes(action) || !mongoose.isValidObjectId(requestId)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }

    const reqDoc = await FriendRequest.findById(requestId);
    if (!reqDoc) return res.status(404).json({ error: 'Không tìm thấy lời mời' });

    if (action === 'accept') {
      const fromUser = await User.findById(reqDoc.from);
      const toUser = await User.findById(reqDoc.to);
      if (!fromUser || !toUser) return res.status(404).json({ error: 'Người dùng không tồn tại' });

      // ✅ thêm bạn 2 chiều, có kiểm tra trùng
      if (!fromUser.friends.includes(toUser._id)) fromUser.friends.push(toUser._id);
      if (!toUser.friends.includes(fromUser._id)) toUser.friends.push(fromUser._id);
      await fromUser.save();
      await toUser.save();
    }

    await reqDoc.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Lỗi respondRequest:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

async function removeFriend(req, res) {
  try {
    const meId = req.session?.user?._id;
    const { targetId } = req.body;

    if (!meId || !targetId || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }

    await User.findByIdAndUpdate(meId, { $pull: { friends: targetId } });
    await User.findByIdAndUpdate(targetId, { $pull: { friends: meId } });

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Lỗi removeFriend:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

module.exports = {
  listFriends,
  listAllUsers,
  sendRequest,
  listRequests,
  respondRequest,
  removeFriend
};
