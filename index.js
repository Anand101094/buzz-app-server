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
    origin: "https://netlify-buzzer-app.netlify.app",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  // create room
  socket.on("create_room", ({ roomId, userData }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [userData],
      };
    }

    if (!users[socket.id]) {
      users[socket.id] = userData;
    }
    socket.join(roomId);
  });

  // Join room
  socket.on("join_room", ({ roomId, userData }) => {
    // adding room entry
    if (rooms[roomId]) {
      rooms[roomId].users.push(userData);

      // adding user Entry
      if (!users[socket.id]) {
        users[socket.id] = userData;
      }

      socket.join(roomId);
      socket.emit("room_joined");
      io.to(roomId).emit("new_user_connection", rooms[roomId].users);
    } else {
      socket.emit("invalid_room");
    }
  });

  // Incoming buzzer
  socket.on("send_buzzer", ({ roomId, userData }) => {
    if (
      rooms[roomId] &&
      rooms[roomId].hasOwnProperty("firstBuzz") &&
      rooms[roomId].hasOwnProperty("buzzLocked")
    ) {
      return;
    }
    const currentSocketIndex =
      rooms[roomId] &&
      rooms[roomId].users.findIndex((user) => user.userId === socket.id);

    if (currentSocketIndex !== -1) {
      if (rooms[roomId] && rooms[roomId].hasOwnProperty("firstBuzz")) {
        rooms[roomId]["buzzLocked"] = true;
        io.to(roomId).emit("buzzer_locked_by", { socketId: socket.id });
      }

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
    if(rooms[roomId] && rooms[roomId]["firstBuzz"]) {
      io.to(roomId).emit("buzzer_unlocked");
    }
  });

  socket.on("kick_player", async ({ roomId, socketId }) => {
    if (roomId && socketId) {
      // get all the sockets in that room, find the kicked out player and disconnect his/her socket.
      const sockets = await io.in(roomId).fetchSockets();
      for (const socket of sockets) {
        if (socket.id === socketId) {
          // delete the user
          delete users[socketId];

          const getSocketIndexToRemove =
            rooms[roomId] &&
            rooms[roomId].users.findIndex((user) => {
              return socketId === user.userId;
            });

          rooms[roomId] &&
            rooms[roomId].users.splice(getSocketIndexToRemove, 1);

          socket.emit("kicked_out", { socketId });
          // socket.disconnect(true);
        }
      }
    }
  });

  // activate first buzz
  socket.on("first_buzz_activate", ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId]["firstBuzz"] = true;
    }
  });

  // deactivate first buzz
  socket.on("first_buzz_deactivate", ({ roomId }) => {
    if (rooms[roomId]) {
      delete rooms[roomId]["firstBuzz"];
      delete rooms[roomId]["buzzLocked"];
      io.to(roomId).emit("buzzer_unlocked");
    }
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
