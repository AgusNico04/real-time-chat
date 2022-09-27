const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');

const crypto = require('node:crypto');
const randomId = () => crypto.randomBytes(8).toString("hex");

const connectedUsers = new Map();
const messages = new Map();
const contacts = new Map();
const SessionStore = require('./server/sessionStore');
const sessionStore = new SessionStore();

function getChatID(fromID, to) {
    if (fromID === to) return fromID;
    else if (fromID.length !== to.length) {
        return fromID.length > to.length ? `${fromID}-${to}` : `${to}-${fromID}`;
    }
    else if (fromID.charCodeAt(0) > to.charCodeAt(0)) {
        return `${fromID}-${to}`;
    }
    else if (fromID.charCodeAt(0) < to.charCodeAt(0)) {
        return `${to}-${fromID}`;
    }
    
    for (let i = 1; i < fromID.length; i++) {
        if (fromID.charCodeAt(i) > to.charCodeAt(i)) {
            return `${fromID}-${to}`
        }
        else if (fromID.charCodeAt(i) < to.charCodeAt(i)) {
            return `${to}-${fromID}`;
        }
    }
}

app.use(express.urlencoded({ extended:false }));
app.use(express.json());

app.use(express.static(path.join(__dirname, '/app/public')));

app.get('/', (req, res) => {
    res.sendFile('/workspaces/real-time-chat/app/views/index.html');
});

io.use((socket, next) => {
    const sessionID = socket.handshake.auth.sessionID;
    if (sessionID) {
        const session = sessionStore.findSession(sessionID);
        if (session) {
            socket.sessionID = sessionID;
            socket.userID = session.userID;
            socket.username = session.username;
            socket.emit('get-self-username', { username: socket.username });
            return next();
        }
    }

    const username = socket.handshake.auth.username;
    if (!username) socket.emit('select-username');

    socket.sessionID = randomId();
    socket.userID = randomId();
    
    next();
});

io.on('connection', socket => {
    socket.join(socket.userID);

    socket.on('username-selected', data => {
        if (!socket.username) socket.username = data.username;
        connectedUsers.set(socket.username, socket.userID);
    });

    let messagesObject = Object.fromEntries(messages);
    socket.emit('session', { sessionID: socket.sessionID, userID: socket.userID, messages: messagesObject });

    let contactsObject = Object.fromEntries(contacts);
    socket.emit('load-contacts', { contacts: contactsObject });

    socket.on('add-contact', data => {
        if (!contacts.has(socket.userID)) contacts.set(socket.userID, [data.contact]);
        else contacts.get(socket.userID).push(data.contact);
    });

    socket.on('select-user', data => {
        if (connectedUsers.get(data.selectedUser)) {
            socket.selectedUser = connectedUsers.get(data.selectedUser);
            socket.emit('load-messages', { from: { ID: socket.userID }, to: { ID: socket.selectedUser, username: data.selectedUser }});
            return;
        }
        socket.emit('error', 001);
    });

    socket.on('chat-message', data => {
        if (socket.selectedUser) {
            let currentChat = getChatID(socket.userID, socket.selectedUser);
            console.log(currentChat, messages.get(currentChat));
            if (!messages.has(currentChat)) {
                messages.set(currentChat, [{ from: data.from, msg: data.msg }]);
            }
            else {
                messages.get(currentChat).push({ from: data.from, msg: data.msg });
            }

            io.emit('chat-message', { msg: data.msg, from: { username: data.from, ID: socket.userID }, to: { ID: socket.selectedUser }});
        }
    });

    socket.on('typing-start', data => io.emit('typing-start', { from: data.user, to: socket.selectedUser }));
    socket.on('typing-stop', data => io.emit('typing-stop', { from: data.user, to: socket.selectedUser }));

    socket.on('error', errorID => {
        socket.emit('error', errorID);
    });

    socket.on('disconnect', async () => {
        io.emit('typing-stop', { from: socket.username, to: socket.selectedUser });
        const matchingSockets = await io.in(socket.userID).allSockets();
        const isDisconnected = matchingSockets.size === 0;
        if (isDisconnected) {
            sessionStore.saveSession(socket.sessionID, {
                userID: socket.userID,
                username: socket.username
            });
        }
    });
});

server.listen(3000);