const socket = io({ autoConnect: false });

const input = document.getElementById('chat-input');
const btn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages-container');
const actions = document.getElementById('actions');

const newContactInput = document.getElementById('new-contact-input');
const newContactBtn = document.getElementById('new-contact-button');
const newGroupBtn = document.getElementById('new-group-button');
const contactList = document.getElementById('contact-list');

const messages = new Map();
const contacts = new Map();
let selectedChat = '';
let selfID;
let user;

function selectUser() {
    user = prompt('Elige un nombre de usuario');
    if (!Boolean(user)) selectUser();
}

const sessionID = JSON.parse(localStorage.getItem('sessionID'));
if (sessionID) {
    socket.auth = { sessionID }
    socket.connect();
}
else {
    selectUser();
    socket.auth = { username: user }
    socket.connect();
}

function displayMessage(data) {
    let li = document.createElement('li');
    li.innerHTML = data;
    messagesContainer.appendChild(li);
}

function displayLoadedMessages(messagesStore, currentChat) {
    messagesContainer.innerHTML = '';
    if (messagesStore.has(currentChat)) {
        for (const msg of messagesStore.get(currentChat)) {
            if (msg.from === user) displayMessage(`${msg.from} (Tu): ${msg.msg}`);
            else displayMessage(`${msg.from}: ${msg.msg}`);
        }
    }
}

function saveMessages(messagesStore, currentChat, data) {
    if (!messagesStore.has(currentChat)) messagesStore.set(currentChat, [{ from: data.from, msg: data.msg }]);
    else messagesStore.get(currentChat).push({ from: data.from, msg: data.msg });
}

function handleNewContacts(contactName, contactType) {
    if (contactName) {
        if (contacts.has(selfID)) {
            if (contacts.get(selfID).some(contact => contact.name === contactName && contact.type === contactType)) return socket.emit('error', 002);
        }
        else contacts.set(selfID, []);

        const li = document.createElement('li');
        const newButton = document.createElement('button');

        if (contactType === 'private') newButton.innerHTML = contactName === user ? `${contactName} (Tu)` : contactName;
        else newButton.innerHTML = `${contactName} (Grupo)`;

        newButton.setAttribute('data-user', contactName);
        newButton.setAttribute('data-user-type', contactType);
        contacts.get(selfID).push({ name: contactName, type: contactType });
        socket.emit('add-contact', { name: contactName, type: contactType });

        li.appendChild(newButton);
        contactList.appendChild(li);

        const button = li.getElementsByTagName('button')[0];
        const name = button.getAttribute('data-user');

        const bg = button.style;
        li.addEventListener('click', () => {
            for (let li of contactList.getElementsByTagName('li')) {
                const button = li.getElementsByTagName('button')[0];
                button.style = `background: rgb(0, 0, 0)`;
            }
            bg.background = 'rgb(34, 30, 70)';
            socket.emit('select-user', { selectedChat: name, type: contactType });
        });

        if (contactType === 'private') {
            li.addEventListener('typing', () => button.innerHTML += ' está escribiendo...');
            li.addEventListener('typing-stop', () => button.innerHTML = name === user ? `${name} (Tu)` : name);
        }
        else {
            li.addEventListener('typing', e => button.innerHTML += `<br>${e.detail.username} está escribiendo...`);
            li.addEventListener('typing-stop', () => button.innerHTML = `${name} (Grupo)`);
        }

        li.addEventListener('mouseover', () => {
            if (bg.background !== 'rgb(34, 30, 70)') bg.background = 'rgb(31, 31, 31)';
        });

        li.addEventListener('mouseout', () => {
            if (bg.background !== 'rgb(34, 30, 70)') bg.background = 'rgb(0, 0, 0)';
        });
    }
}

function handleTypingEvent(data, event) {
    if (data.to === selfID || data.chat.type === 'group') {
        const typingEvent = new CustomEvent(event, { detail: { username: data.from.username } });
        if (selectedChat) {
            if ((data.from.ID === selectedChat.to.ID && data.to === selfID) || data.to === selectedChat.to.groupName) actions.dispatchEvent(typingEvent);
        }

        const contacts = contactList.getElementsByTagName('li');
        for (let li of contacts) {
            const button = li.getElementsByTagName('button')[0];
            const contactName = button.getAttribute('data-user');
            const contactType = button.getAttribute('data-user-type');
            if ((contactName === data.from.username && contactType === data.chat.type) || (contactName === data.to && contactType === data.chat.type)) {
                li.dispatchEvent(typingEvent);
            }
        }
    }
}

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

newContactBtn.addEventListener('click', e => {
    e.preventDefault();
    handleNewContacts(newContactInput.value, 'private');
});

newGroupBtn.addEventListener('click', e => {
    e.preventDefault();
    handleNewContacts(newContactInput.value, 'group');
});

actions.addEventListener('typing', e => {
    let p = actions.getElementsByTagName('p')[0];
    p.innerHTML += selectedChat.chat.type === 'private' ? ' está escribiendo...' : ` (${e.detail.username} está escribiendo)`;
    actions.addEventListener('typing-stop', () => {
        if (selectedChat.chat.type === 'private') p.innerHTML = selectedChat.to.username === user ? `${selectedChat.to.username} (Tu)` : selectedChat.to.username;
        else p.innerHTML = `${selectedChat.to.groupName}`;
    });
});

btn.addEventListener('click', e => {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat-message', { msg: input.value, from: user, type: selectedChat.chat.type });
        socket.emit('typing-stop', { userID: selfID, username: user, type: selectedChat.chat.type });
        input.value = '';
        window.scrollTo(0, document.body.scrollHeight + 1000);
    }
});

input.addEventListener('keypress', e => {
    if (e.keyCode === 13 && input.value) {
        socket.emit('chat-message', { msg: input.value, from: user, type: selectedChat.chat.type });
        input.value = '';
        window.scrollTo(0, document.body.scrollHeight + 1000);
    }
});

input.addEventListener('focus', () => socket.emit('typing-start', { userID: selfID, username: user, type: selectedChat.chat.type }));
input.addEventListener('focusout', () => socket.emit('typing-stop', { userID: selfID, username: user, type: selectedChat.chat.type }));

socket.on('get-self-username', data => user = data.username);

socket.on('session', data => {
    socket.auth = { sessionID: data.sessionID }
    localStorage.setItem('sessionID', JSON.stringify(data.sessionID));
    selfID = data.userID;

    for (const [key, value] of Object.entries(data.messages)) {
        messages.set(key, value);
    }
});

socket.on('private-message', data => {
    if (data.from.ID === selfID || data.to.ID === selfID) {
        saveMessages(messages, getChatID(data.from.ID, data.to.ID), { from: data.from.username, msg: data.msg });

        if (data.from.ID === selfID && selectedChat) displayMessage(`${data.from.username} (Tu): ${data.msg}`);
        else if (data.from.ID === selectedChat.to.ID && data.to.ID === selfID) displayMessage(`${data.from.username}: ${data.msg}`);
    }
});

socket.on('group-message', data => {
    if (data.from.ID === selfID || data.to.groupName === selectedChat.to.groupName) {
        saveMessages(messages, data.to.groupName, { from: data.from.username, msg: data.msg });

        if (data.from.ID === selfID && selectedChat) displayMessage(`${data.from.username} (Tu): ${data.msg}`);
        else displayMessage(`${data.from.username}: ${data.msg}`);
    }
});

socket.on('load-messages', data => {
    const p = actions.getElementsByTagName('p')[0];
    if (data.chat.type === 'private') {
        selectedChat = { to: { ID: data.to.ID, username: data.to.username }, chat: { type: data.chat.type } }
        displayLoadedMessages(messages, getChatID(data.from.ID, data.to.ID));

        p.innerHTML = selectedChat.to.username === user ? `${selectedChat.to.username} (Tu)` : selectedChat.to.username;
    }
    else if (data.chat.type === 'group') {
        selectedChat = { to: { groupName: data.to.groupName }, chat: { type: data.chat.type } }
        displayLoadedMessages(messages, data.to.groupName);

        p.innerHTML = selectedChat.to.groupName;
    }
    window.scrollTo(0, document.body.scrollHeight);
});

socket.on('load-contacts', data => {
    for (const [key, values] of Object.entries(data.contacts)) {
        if (key === selfID) {
            for (const contactInfo of values) {
                if (contacts.has(selfID)) {
                    if (contacts.get(selfID).some(contact => contact.name === contactInfo.name && contact.type === contactInfo.type)) continue;
                }
                else contacts.set(selfID, []);

                handleNewContacts(contactInfo.name, contactInfo.type);
            }
        }
    }
});

socket.on('typing-start', data => {
    handleTypingEvent(data, 'typing');
});

socket.on('typing-stop', data => {
    handleTypingEvent(data, 'typing-stop');
});

socket.on('error', errorID => {
    switch (errorID) {
        case 001:
            alert('Error: User does not exist');
            break;

        case 002:
            alert('Error: User already in contact list');
            break;

        default:
            alert('Unknown error');
            break;
    }
});

socket.on('user-disconnection', data => {
    socket.emit('typing-stop', { userID: data.ID, username: data.username, type: selectedChat.chat.type });
});

socket.on('connect_error', () => {
    alert('Error: Username is taken or blank');
    selectUser();
    socket.auth = { username: user }
    socket.connect();
});