// server.js
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const waitingPlayers = {};
const playerRooms = {};

const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*", // Allow all origins (for development)
    methods: ["GET", "POST"],
  },
});
const roomScores = {}; //

let waitingPlayer = null;

io.on("connection", (socket) => {
  console.log("A player connected:", socket.id);

  socket.on("findMatch", async ({ category }) => {
    if (!waitingPlayers[category]) waitingPlayers[category] = [];
    waitingPlayers[category].push(socket);

    // If there are at least 2 players waiting for this category, pair them
    if (waitingPlayers[category].length >= 2) {
      const player1 = waitingPlayers[category].shift();
      const player2 = waitingPlayers[category].shift();
      const room = `room-${player1.id}-${player2.id}`;
      player1.join(room);
      player2.join(room);

      // Track which room each player is in
      playerRooms[player1.id] = room;
      playerRooms[player2.id] = room;

      function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
      }

      // Fetch questions from the API
      const apiUrl = `https://opentdb.com/api.php?amount=10&category=${category}&type=multiple`;
      let questions = [];
      try {
        const res = await fetch(apiUrl);
        const data = await res.json();
        questions = data.results.map((q) => {
          const options = shuffleArray([
            q.correct_answer,
            ...q.incorrect_answers,
          ]);
          return { ...q, options };
        });
        
      } catch (err) {
        console.error("Failed to fetch questions:", err);
      }

      // Send questions to both players
      io.to(room).emit("startGame", { room, questions });
      console.log(
        `Paired ${player1.id} and ${player2.id} in room ${room} for category ${category}`
      );
    } else {
      console.log(
        `${socket.id} is waiting for an opponent in category ${category}`
      );
    }
  });

  socket.on("answer", ({ room, answer }) => {
    // Broadcast the answer to the room
    io.to(room).emit("playerAnswered", { playerId: socket.id, answer });
  });
  socket.on("submitScore", ({ room, score }) => {
    if (!roomScores[room]) roomScores[room] = {};
    roomScores[room][socket.id] = score;

    // If both players have submitted scores
    if (Object.keys(roomScores[room]).length === 2) {
      // Send both scores to both players
      io.to(room).emit("finalScores", roomScores[room]);
      // Clean up the scroes
      delete roomScores[room];
    }
  });
  socket.on("disconnect", () => {
    const room = playerRooms[socket.id];
    if (room) {
      socket.to(room).emit("opponentDisconnected");
      delete playerRooms[socket.id];
    }
    // ... rest of your disconnect logic ...
  });
  //socket.on('disconnect', () => {
  // If this player was waiting, clear the waitingPlayer
  //  if (waitingPlayer === socket) waitingPlayer = null;

  // Find all rooms this socket was in
  //  const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
  //  rooms.forEach(room => {
  // Notify the other player in the room
  //      socket.to(room).emit('opponentDisconnected');
  //  });
  //});
});

server.listen(3000, () => {
  console.log("Server listening on port 3000");
});
