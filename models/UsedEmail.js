const mongoose = require('mongoose');

const UsedEmailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
});

const UsedEmail = mongoose.model("usedemails", UsedEmailSchema);

module.exports = UsedEmail;
