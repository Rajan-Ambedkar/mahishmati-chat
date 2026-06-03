const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({

    sender: {
        type: String,
        required: true
    },

    text: {
        type: String,
        required: true
    },

    time: {
        type: String
    },

    edited: {
        type: Boolean,
        default: false
    },

    seen: {
        type: Boolean,
        default: false
    },
    replyTo: {
    sender: String,
    text: String
}

}, {
    timestamps: true
});

module.exports = mongoose.model("Message", messageSchema);