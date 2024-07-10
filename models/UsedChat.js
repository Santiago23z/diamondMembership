const mongoose = require('mongoose');

const userChatSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('UserChat', userChatSchema);
