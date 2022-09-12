const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');

const connectedUsers = new Map();

app.use(express.urlencoded({ extended:false }));
app.use(express.json());

app.use(express.static(path.join(__dirname, '/app/public')));

app.get('/', (req, res) => {
    res.sendFile('/workspaces/real-time-chat/app/views/index.html');
});

io.on('connection', socket => {
    socket.on('get-self-id', data => socket.emit('get-self-id', { ID: connectedUsers.get(data.user) }));

    socket.on('username-selected', data => {
        connectedUsers.set(data.username, socket.id);
    });

    socket.on('select-user', data => {
        if (connectedUsers.get(data.selectedUser)) {
            if (socket.rooms) socket.leave(socket.selectedUser);
            socket.join(connectedUsers.get(data.selectedUser));
            socket.selectedUser = connectedUsers.get(data.selectedUser);
            socket.emit('load-messages', { fromID: socket.id, to: socket.selectedUser });
            return;
        }
        socket.emit('error', 001);
    });

    socket.on('chat-message', data => {
        if (socket.selectedUser) {
            io.emit('chat-message', { msg: data.msg, from: data.from, fromID: socket.id, to: socket.selectedUser });
        }
    });

    socket.on('typing-start', data => io.emit('typing-start', { user: data.user, to: socket.selectedUser }));
    socket.on('typing-stop', data => io.emit('typing-stop', { user: data.user, to: socket.selectedUser }));
});

server.listen(3000, (req, res) => {
    console.log('Server listening on port 3000', 'http://localhost:3000');
});