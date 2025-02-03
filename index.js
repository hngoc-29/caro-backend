const express = require("express");
const cors = require("cors");
const { platform } = require("process");
require('dotenv').config();

const app = express();

// ✅ Cấu hình CORS
app.use(cors());

const server = require("http").Server(app);
server.listen(3001, () => console.log("Server is running on port 3001"));

// ✅ Cấu hình Socket.IO với CORS
const allowedOrigins = ["https://caro-frontend.onrender.com", "https://caro-0u7d.onrender.com", "http://localhost:3000"];
const io = require("socket.io")(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        methods: ["GET", "POST"],
    },
});

const randomCode = () => {
    let code = '';
    while (code.length < 6) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

let userWait = [];
let userNameWait = {};
const listPlayer = {};
const room = {};
const listUserName = [];

//fnc handle

const handleClose = (socket) => {
    const code = listPlayer[socket.id];
    if (code) {
        delete listPlayer[socket.id];
        delete room[code];
        userWait = userWait.filter(id => id !== socket.id);
        delete userNameWait[socket.id];
    }
}

const updateUserName = (socket, username, preUserName) => {
    if (username !== preUserName) {
        if (listUserName.indexOf(username) >= 0 || username.trim() === '') {
            socket.emit('error', 'Tên không hợp lệ hoặc đã được sử dụng');
            return false;
        } else {
            listUserName.push(username);
            socket.username = username;
            if (preUserName) {
                listUserName.splice(listUserName.indexOf(preUserName), 1);
            }
            return true;
        }
    } else {
        return true;
    }
}

const outRoom = async (socket) => {
    const code = listPlayer[socket.id];
    socket.emit('error', 'Bạn đã thua do rời trận');
    room[code].splice(room[code].indexOf(socket.id), 1);
    io.to(room[code][0]).emit('return-kq', 'WIN');
    delete listPlayer[room[code][0]];
    delete listPlayer[socket.id];
}

// ✅ Lắng nghe sự kiện kết nối
io.on("connection", (socket) => {
    console.log("🟢 Có người kết nối:", socket.id);
    socket.on('find-player', (username) => {
        if (updateUserName(socket, username, socket.username)) {
            if (userWait.length === 0) {
                const code = randomCode();
                listPlayer[socket.id] = code;
                userWait.push(socket.id);
                userNameWait[socket.id] = username;
                socket.join(code);
                room[code] = [socket.id];
                socket.emit('find-player-wait');
                console.log(`User ${socket.id} joined room: ${code}`);
            } else {
                const waitingUser = userWait.shift();
                const roomId = listPlayer[waitingUser];
                socket.join(roomId);
                room[roomId].push(socket.id);
                listPlayer[socket.id] = listPlayer[waitingUser];
                console.log(`User ${socket.id} joined room: ${roomId}`);
                io.to(roomId).emit('find-player-success', {
                    roomId: roomId,
                    player1: userNameWait[waitingUser],
                    player2: username
                });
                userNameWait = {};
                userWait = [];
            }
        }
    });

    socket.on('close-wait', () => {
        handleClose(socket);
    });

    socket.on('create-room', (username) => {
        if (updateUserName(socket, username, socket.username)) {
            const code = randomCode();
            listPlayer[socket.id] = code;
            userNameWait[socket.id] = username;
            socket.join(code);
            room[code] = [socket.id];
            console.log(`User ${socket.id} created room: ${code}`);
            socket.emit('room-created', { roomId: code, player1: username, ower: username });
        }
    });

    socket.on('join-room', ({ username, roomId }) => {
        if (updateUserName(socket, username, socket.username)) {
            if (room[roomId] && room[roomId].length === 1) {
                socket.join(roomId);
                room[roomId].push(socket.id);
                listPlayer[socket.id] = roomId;
                console.log(`User ${socket.id} joined room: ${roomId}`);
                socket.emit('join-success', Math.floor(Math.random() * 10) + '');
                io.to(roomId).emit('find-player-success', {
                    ower: userNameWait[room[roomId][0]],
                    roomId: roomId,
                    player1: userNameWait[room[roomId][0]],
                    player2: username,
                });
            } else {
                socket.emit('error', 'Room not found or already full');
            }
        }
    });

    socket.on('start-game', (roomId) => {
        const icon = Math.floor(Math.random() * 2);
        socket.player1 = Math.floor(Math.random() * 2);
        socket.player2 = socket.player1 ? 0 : 1;
        const isXNext = Math.floor(Math.random() * 2);
        io.to(roomId).emit('start-game-success', {
            ower: false,
            board: Array(9).fill(null),
            icon: icon,
            player1: socket.player1,
            isXNext,
            time: 10
        });
    });

    socket.on('update-board', (data) => {
        const { isDraw, winner } = calculateWinner(data.board);
        if (winner) {
            console.log(data.board, winner, data.player1)
            const icon = [data.player1, data.player2];
            room[data.roomId].forEach((element, index) => {
                io.to(element).emit('return-kq', winner === icon[index] ? 'WIN' : 'LOSE');

            });
        } else if (isDraw) {
            io.to(data.roomId).emit('update-board-success', {
                board: Array(9).fill(null),
                isXNext: data.isXNext,
                timeLeft: 10
            });
        } else {
            io.to(data.roomId).emit('update-board-success', {
                board: data.board,
                isXNext: data.isXNext,
                timeLeft: 10
            });
        }
    });

    socket.on("update-time", ({ time, roomId }) => {
        if (room[roomId]) {
            room[roomId].timeLeft = time;
            io.to(roomId).emit("update-time-noti", time);
        }
    });

    socket.on('out-room', () => {
        outRoom(socket);
        io.sockets.adapter.rooms.delete(socket);
    });

    socket.on("send_message", ({ room, message }) => {
        io.to(room).emit("receive_message", message);
    });

    socket.on("disconnect", () => {
        console.log("🔴 Người dùng đã thoát", socket.id);
        const code = listPlayer[socket.id];
        if (socket.username) {
            listUserName.splice(listUserName.indexOf(socket.username), 1);
            io.sockets.adapter.rooms.delete(socket);
        }
        if (room[code] && room[code].length === 2) {
            outRoom(socket);
            io.sockets.adapter.rooms.delete(socket);
            return;
        } else {
            handleClose(socket);
        }
    });
});

// Helper function to calculate the winner
const calculateWinner = (squares) => {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];
    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return { winner: squares[a] };
        }
    }
    const isDraw = squares.every(square => square !== null);

    return { winner: null, isDraw };
};