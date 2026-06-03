const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./models/User");
const Message = require("./models/Message");
const Invite = require("./models/Invite");
const { v4: uuidv4 } = require("uuid");

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.use(express.json());
app.use(express.static("public"));

mongoose.connect(process.env.MONGO_URI)
.then(async () => {

    console.log("MongoDB Connected");

    const admin = await User.findOne({
        email: process.env.ADMIN_EMAIL
    });

    if (!admin) {

        const hashedPassword = await bcrypt.hash(
            process.env.ADMIN_PASSWORD,
            10
        );

        await User.create({
            name: "Bahubali",
            email: process.env.ADMIN_EMAIL,
            password: hashedPassword,
            role: "admin"
        });

        console.log("Bahubali Admin Created");
    }

})
.catch((err) => {
    console.error("MongoDB Error");
    console.error(err);
});

app.post("/api/register", async (req, res) => {

    try {

        const { name, email, password, inviteToken } = req.body;

        if (email !== process.env.ADMIN_EMAIL) {

            if (!inviteToken) {
                return res.status(403).json({
                    message: "Invite link required"
                });
            }

            const invite = await Invite.findOne({
                token: inviteToken
            });

            if (!invite) {
                return res.status(400).json({
                    message: "Invalid invite link"
                });
            }

            if (invite.used) {
                return res.status(400).json({
                    message: "Invite link already used"
                });
            }
        }

        const existingUser = await User.findOne({
            email
        });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(
            password,
            10
        );

        await User.create({
            name,
            email,
            password: hashedPassword
        });

        if (email !== process.env.ADMIN_EMAIL) {

            await Invite.findOneAndUpdate(
                { token: inviteToken },
                {
                    used: true,
                    usedBy: email
                }
            );
        }

        res.json({
            message: "Registration Successful"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

app.post("/api/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                message: "Invalid Email"
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                message: "Invalid Password"
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.json({
            token,
            user: {
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

app.post("/api/create-invite", async (req, res) => {

    try {

        const { role } = req.body;

        if (role !== "admin") {
            return res.status(403).json({
                message: "Only Bahubali can create invite links"
            });
        }

        const token = uuidv4();

        await Invite.create({
            token
        });

        res.json({
            message: "Invite Created",
            link: `${req.protocol}://${req.get("host")}/register.html?invite=${token}`
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

app.get("/api/check-invite/:token", async (req, res) => {

    try {

        const invite = await Invite.findOne({
            token: req.params.token
        });

        if (!invite) {
            return res.status(404).json({
                valid: false,
                message: "Invalid Invite Link"
            });
        }

        if (invite.used) {
            return res.status(400).json({
                valid: false,
                message: "Invite Link Already Used"
            });
        }

        res.json({
            valid: true,
            message: "Invite Link Valid"
        });

    } catch (err) {

        res.status(500).json({
            valid: false,
            message: "Server Error"
        });

    }

});

let onlineUsers = [];

io.on("connection", (socket) => {

    console.log("User Connected");

    socket.on("user-online", (username) => {

        if (!username) return;

        console.log("ONLINE USER:", username);

        socket.username = username;

        if (!onlineUsers.includes(username)) {
            onlineUsers.push(username);
        }

        console.log("ALL ONLINE:", onlineUsers);

        io.emit("online-users", onlineUsers);

    });

    socket.on("typing", (username) => {

        if (!username) return;

        socket.broadcast.emit(
            "typing",
            username
        );

    });

    socket.on("message-seen", async (id) => {

        try {

            if (!id) return;

            console.log("SEEN EVENT:", id);

            const message = await Message.findByIdAndUpdate(
                id,
                {
                    seen: true
                },
                {
                    new: true
                }
            );

            io.emit(
                "message-seen-update",
                message
            );

        } catch (err) {

            console.log(err);

        }

    });

    socket.on("chat-message", async (data) => {

        try {

            if (!data.message || data.message.trim() === "") {
                return;
            }

            const msg = await Message.create({
                sender: data.user,
                text: data.message,
                time: data.time,
                seen: false
            });

            io.emit("chat-message", msg);

        } catch (err) {

            console.log(err);

        }

    });

    socket.on("disconnect", () => {

        if (socket.username) {

            onlineUsers = onlineUsers.filter(
                user => user !== socket.username
            );

            io.emit("online-users", onlineUsers);
        }

        console.log("User Disconnected");

    });

});

app.get("/api/messages", async (req, res) => {

    try {

        const messages = await Message.find()
            .sort({ _id: 1 })
            .limit(100);

        res.json(messages);

    } catch (err) {

        res.status(500).json({
            message: "Server Error"
        });

    }

});

app.put("/api/messages/:id", async (req, res) => {

    try {

        const { text } = req.body;

        const message = await Message.findByIdAndUpdate(
            req.params.id,
            {
                text: text,
                edited: true
            },
            { new: true }
        );

        io.emit("message-updated", message);

        res.json(message);

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

app.get("/favicon.ico", (req, res) => {
    res.status(204).end();
});

app.get("/", (req, res) => {

    res.sendFile(
        __dirname + "/public/index.html"
    );

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log(`Server Running On ${PORT}`);

});