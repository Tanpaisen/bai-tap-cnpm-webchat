//models/Message.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  sender:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  room:     { type: String, required: true },
  content: { type: String, maxlength: 5000 },
  image:    { type: String },
  file:     { type: String }
}, { timestamps: true });


module.exports = mongoose.model('Message', messageSchema);
