const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.urlencoded({extended:false}));
app.use(express.json());

app.use('/resources', express.static('public'));
app.use('/resources', express.static(__dirname + 'public'));

app.use('view engine', 'ejs');
app.use('views', 'views');

app.get('/', (req, res) => {
    res.send('index');
});

io.on('connection', socket => {
    socket.on('chat message', msg => {
        console.log('Message: ' + msg);
    });
});

app.listen(3000, (req, res) => {
    console.log('Server listening on port 3000');
});