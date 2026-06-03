const mongoose = require("mongoose");

const inviteSchema = new mongoose.Schema({

    token: {
        type: String,
        required: true,
        unique: true
    },

    used: {
        type: Boolean,
        default: false
    },

    usedBy: {
        type: String,
        default: null
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Invite", inviteSchema);