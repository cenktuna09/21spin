import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import CasinoRoom from './CasinoRoom.js';

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.get('/health', (_, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const room = new CasinoRoom(io);

io.on('connection', (socket) => {
  room.handleConnection(socket);
});

httpServer.listen(PORT, () => {
  console.log(`[21-spin server] listening on :${PORT}`);
});
