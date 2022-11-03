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

function saveMessages(messagesStore, currentChat, data) {
    if (!messagesStore.has(currentChat)) messagesStore.set(currentChat, [{ from: data.from, msg: data.msg }]);
    else messagesStore.get(currentChat).push({ from: data.from, msg: data.msg });
}

app.use(express.static(path.join(__dirname, '/app')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'app/views/index.html')));

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
    if (!Boolean(username) || connectedUsers.has(username)) {
        return next(new Error());
    }

    socket.sessionID = randomId();
    socket.userID = randomId();
    socket.username = username;
    
    next();
});

io.on('connection', socket => {
    socket.join(socket.userID);

    connectedUsers.set(socket.username, socket.userID);

    const messagesObject = Object.fromEntries(messages);
    socket.emit('session', { sessionID: socket.sessionID, userID: socket.userID, messages: messagesObject });

    const contactsObject = Object.fromEntries(contacts);
    socket.emit('load-contacts', { contacts: contactsObject });

    socket.on('add-contact', data => {
        if (!contacts.has(socket.userID)) contacts.set(socket.userID, [{ name: data.name, type: data.type }]);
        else contacts.get(socket.userID).push({ name: data.name, type: data.type });
    });

    socket.on('select-user', data => {
        if (data.type === 'private') {
            if (connectedUsers.get(data.selectedChat)) {
                socket.selectedChat = connectedUsers.get(data.selectedChat);
                socket.emit('load-messages', { from: { ID: socket.userID }, to: { ID: socket.selectedChat, username: data.selectedChat }, chat: { type: 'private' }});
                return;
            }
            socket.emit('error', 001);
        }
        else {
            socket.selectedChat = data.selectedChat;
            socket.emit('load-messages', { from: { ID: socket.userID }, to: { groupName: socket.selectedChat }, chat: { type: 'group' }});
        }
    });

    socket.on('chat-message', data => {
        if (socket.selectedChat) {
            const currentChat = data.type === 'private' ? getChatID(socket.userID, socket.selectedChat) : socket.selectedChat;
            saveMessages(messages, currentChat, { from: data.from, msg: data.msg });
            if (data.type === 'private') io.emit('private-message', { msg: data.msg, from: { username: data.from, ID: socket.userID }, to: { ID: socket.selectedChat }});
            else io.emit('group-message', { msg: data.msg, from: { username: data.from, ID: socket.userID }, to: { groupName: currentChat }});
        }
    });

    socket.on('typing-start', data => io.emit('typing-start', { from: { ID: data.userID, username: data.username }, to: socket.selectedChat, chat: { type: data.type } }));
    socket.on('typing-stop', data => io.emit('typing-stop', { from: { ID: data.userID, username: data.username }, to: socket.selectedChat, chat: { type: data.type } }));

    socket.on('error', errorID => socket.emit('error', errorID));

    socket.on('disconnect', async () => {
        io.emit('user-disconnection', { ID: socket.userID, username: socket.username });
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