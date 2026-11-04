
import { db } from './firebase.js';
import { ref, get, update, serverTimestamp } from 'firebase/database';

export async function startGame(roomCode, settings, zoneCenter) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('Room not found.');
  }

  const room = snapshot.val();
  const players = Object.keys(room.players || {});

  if (players.length < 2) {
    throw new Error('At least 2 players are required.');
  }

  const updates = {};

  players.forEach(uid => {
    updates[`players/${uid}/role`] =
      uid === room.host ? 'seeker' : 'hider';
  });

  updates.status = 'hiding';
  updates.settings = {
    hidingTime: settings.hidingTime,
    zoneRadius: settings.zoneRadius
  };

  updates.zoneCenter = {
    latitude: zoneCenter.latitude,
    longitude: zoneCenter.longitude
  };

  updates.hidingStartedAt = serverTimestamp();

  await update(roomRef, updates);
}
