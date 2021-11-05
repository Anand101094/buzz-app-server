const express = require("express");
const app = express();
const { createServer } = require("http");
const httpServer = createServer(app);
const cors = require("cors");
app.use(cors());

const rooms = {};

/*

// room schema

const rooms = {
  roomId: {
    users: [
      {
        userId: socket.id,
        userName: userName,
        joinedRoom: roomId,
        timeStamp: timeStamp,   // optional
        host: true,             // optional
      },
    ],
  },
};

*/

const users = {};

const getRoomNo = () => {
  return Math.floor(Math.random() * 90000) + 10000;
};

const getRoomKey = () => {
  return Math.random().toString(36).slice(2);
};

const io = require("socket.io")(httpServer, {
  cors: {
    origin: ["http://localhost:8080", "https://netlify-buzzer-app.netlify.app"],
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  // Join room

  socket.on("join_room", ({ roomId, userData }) => {
    // adding room entry
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [userData],
      };
    } else {
      rooms[roomId].users.push(userData);
    }

    // adding user Entry
    if (!users[socket.id]) {
      users[socket.id] = userData;
    }

    socket.join(roomId);

    io.to(roomId).emit("new_user_connection", rooms[roomId].users);
  });

  // Incoming buzzer

  socket.on("send_buzzer", ({ roomId, userData }) => {
    const currentSocketIndex =
      rooms[roomId] &&
      rooms[roomId].users.findIndex((user) => user.userId === socket.id);
    if (currentSocketIndex !== -1) {
      rooms[roomId].users[currentSocketIndex] = userData;
      io.to(roomId).emit("buzzer_clicked", rooms[roomId].users);
    }
  });

  // Reset buzzers

  socket.on("reset_buzzers", ({ roomId }) => {
    // remove all the timestamps from mentioned roomId
    rooms[roomId] &&
      rooms[roomId].users.forEach((user) => {
        if (user.timeStamp) delete user.timeStamp;
      });

    io.to(roomId).emit("buzzer_reset", rooms[roomId].users);
  });

  socket.on("disconnect", (reason) => {
    // find the room disconected socket belongs to
    const disconnectedSocketRoomId =
      users[socket.id] && users[socket.id].joinedRoom;

    // delete the user
    delete users[socket.id];

    // delete the entry from room list
    const getSocketIndexToRemove =
      rooms[disconnectedSocketRoomId] &&
      rooms[disconnectedSocketRoomId].users.findIndex((user) => {
        return socket.id === user.userId;
      });

    if (getSocketIndexToRemove !== -1) {
      // if it's host, remove the room 
      if (
        rooms[disconnectedSocketRoomId] &&
        rooms[disconnectedSocketRoomId].users[getSocketIndexToRemove].host
      ) {
        io.to(disconnectedSocketRoomId).emit("host_disconected");
        delete rooms[disconnectedSocketRoomId];
      } else {
        // else delete the connected user

        rooms[disconnectedSocketRoomId] &&
          rooms[disconnectedSocketRoomId].users.splice(
            getSocketIndexToRemove,
            1
          );
        // send the update to other users in the room
        if (
          rooms[disconnectedSocketRoomId] &&
          rooms[disconnectedSocketRoomId].users
        ) {
          io.to(disconnectedSocketRoomId).emit(
            "user_disconected",
            rooms[disconnectedSocketRoomId].users
          );
        }
      }
    }
  });
});

app.get("/host", (req, res) => {
  const randomId = getRoomNo();

  res.send({
    roomId: randomId,
  });
});

httpServer.listen(process.env.PORT || 3000, () => {
  console.log("listening to port 3000");
});
