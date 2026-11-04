
import { db, auth } from './firebase.js';
import {
  ref,
  set,
  get,
  update,
  onValue
} from 'firebase/database';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

export async function createRoom(playerName) {
  const uid = auth.currentUser.uid;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const roomRef = ref(db, `rooms/${code}`);

    const snapshot = await get(roomRef);

    if (snapshot.exists()) continue;

    await set(roomRef, {
      host: uid,
      status: 'waiting',
      createdAt: Date.now(),
      players: {
        [uid]: {
          name: playerName,
          role: 'host',
          joinedAt: Date.now()
        }
      }
    });

    return code;
  }

  throw new Error('Could not generate a unique room code.');
}

export async function joinRoom(code, playerName) {
  const uid = auth.currentUser.uid;
  code = code.trim().toUpperCase();

  const roomRef = ref(db, `rooms/${code}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('Room does not exist.');
  }

  const room = snapshot.val();

  if (room.status !== 'waiting') {
    throw new Error('Game has already started.');
  }

  await update(ref(db, `rooms/${code}/players/${uid}`), {
    name: playerName,
    role: 'hider',
    joinedAt: Date.now()
  });

  return code;
}

export function listenToRoom(code, callback) {
  return onValue(ref(db, `rooms/${code}`), snapshot => {
    callback(snapshot.val());
  });
}
