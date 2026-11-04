
import { initializePlayer, auth, db } from './firebase.js';
import { createRoom, joinRoom, listenToRoom } from './room.js';
import { startGame } from './game.js';
import { ref, update, onValue, remove, get} from 'firebase/database';
import { getCurrentLocation, trackLocation, stopTracking } from './location.js';
import { initGameMap, destroyGameMap } from './map.js';

let mapInitializedRoom = null;

let locationWatchId = null;

const playerReady = initializePlayer();

let serverOffset = 0;

onValue(ref(db, '.info/serverTimeOffset'), snapshot => {
  serverOffset = snapshot.val() || 0;
});

function getServerTime() {
  return Date.now() + serverOffset;
}

const createButton = document.getElementById('create-room');
const joinButton = document.getElementById('join-room');

let currentRoom = null;
let unsubscribe = null;
let timerInterval = null;

// ---------------- LOCATION TRACKING ----------------

function startLocationTracking() {
  if (locationWatchId !== null || !currentRoom) return;

  try {
    locationWatchId = trackLocation(currentRoom);
    console.log('Location tracking started.');
  } catch (error) {
    console.error('Could not start location tracking:', error);
    alert(error.message);
  }
}

function stopLocationTracking() {
  if (locationWatchId !== null) {
    stopTracking(locationWatchId);
    locationWatchId = null;
    console.log('Location tracking stopped.');
  }
}

// ---------------- LOBBY ----------------

const lobby = document.createElement('section');
lobby.id = 'lobby';
lobby.style.display = 'none';

lobby.innerHTML = `
  <h2>Room Lobby</h2>
  <p>Room Code: <strong id="room-code"></strong>
     <button id="copy-code">Copy</button>
  </p>
  <p id="room-status">Waiting for players...</p>
  <h3>Players</h3>
  <ul id="player-list" style="list-style:none;padding:0"></ul>
  <button id="start-game">Start Game</button>
  <button id="leave-room">Leave Room</button>
`;

document.querySelector('.hero').appendChild(lobby);

// ---------------- SETUP ----------------

const setup = document.createElement('div');
setup.style.display = 'none';

setup.innerHTML = `
  <h2>Game Setup</h2>

  <label>Seekers:
    <select id="seeker-count">
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
    </select>
  </label>

  <br><br>

  <label>Hiding time:
    <select id="hiding-time">
      <option value="60">1 minute</option>
      <option value="120" selected>2 minutes</option>
      <option value="180">3 minutes</option>
      <option value="300">5 minutes</option>
    </select>
  </label>

  <br><br>

  <label>Zone radius:
    <select id="zone-radius">
      <option value="250">250 m</option>
      <option value="500" selected>500 m</option>
      <option value="1000">1 km</option>
    </select>
  </label>

  <br><br>

  <button id="confirm-start">Confirm & Start</button>
  <button id="cancel-setup">Cancel</button>
`;

lobby.appendChild(setup);

// ---------------- GAME SCREEN ----------------

const gameScreen = document.createElement('section');
gameScreen.id = 'game-screen';
gameScreen.style.display = 'none';


gameScreen.innerHTML = `
  <h2 id="game-role">Your Role</h2>
  <h1 id="game-message">Preparing game...</h1>
  <h2 id="game-countdown">--:--</h2>
  <p id="game-details"></p>

  <div id="map" style="height: 400px; width: 100%;"></div>

  <div class="game-actions">
  <button id="back-to-lobby">Back to Lobby</button>
  <button id="leave-game" class="leave-button">Leave Game</button>
</div>
`;


document.querySelector('.hero').appendChild(gameScreen);

const roomCodeElement = document.getElementById('room-code');
const playerList = document.getElementById('player-list');
const roomStatus = document.getElementById('room-status');
const startButton = document.getElementById('start-game');

const gameRole = document.getElementById('game-role');
const gameMessage = document.getElementById('game-message');
const gameCountdown = document.getElementById('game-countdown');
const gameDetails = document.getElementById('game-details');

// ---------------- SCREEN CONTROL ----------------

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function showLobbyScreen() {
  lobby.style.display = 'block';
  setup.style.display = 'none';
  gameScreen.style.display = 'none';
}

function showGameScreen() {
  lobby.style.display = 'none';
  gameScreen.style.display = 'block';
}

// ---------------- ROOM LISTENER ----------------

function showLobby(code) {
  currentRoom = code;

  createButton.style.display = 'none';
  joinButton.style.display = 'none';

  roomCodeElement.textContent = code;
  showLobbyScreen();

  if (unsubscribe) unsubscribe();

  unsubscribe = listenToRoom(code, room => {
    if (!room){
  exitRoomLocally();
  return;
}

    if (room.status === 'hiding' || room.status === 'active') {
      renderGame(room);
      return;
    }

    stopTimer();
    stopLocationTracking();
    showLobbyScreen();

    roomStatus.textContent = 'Waiting for players...';
    playerList.innerHTML = '';

    Object.entries(room.players || {}).forEach(([uid, player]) => {
      const li = document.createElement('li');
      li.style.margin = '8px';
      li.textContent =
        `${player.name}${uid === room.host ? ' (HOST)' : ''}`;
      playerList.appendChild(li);
    });

    startButton.style.display =
      auth.currentUser.uid === room.host ? 'inline-block' : 'none';

    startButton.disabled = room.status !== 'waiting';
  });
}

// ---------------- GAME RENDERING ----------------

function renderGame(room) {
  showGameScreen();
  stopTimer();

  startLocationTracking();

  if (mapInitializedRoom !== currentRoom) {
    initGameMap(currentRoom, auth.currentUser.uid);
    mapInitializedRoom = currentRoom;
  }

  const uid = auth.currentUser.uid;
  const player = room.players?.[uid];

  if (!player) {
    gameMessage.textContent = 'Player not found in room.';
    return;
  }

  const isSeeker = player.role === 'seeker';
  const hidingDuration = room.settings.hidingTime;
  const deadline = room.hidingStartedAt + hidingDuration * 1000;

  gameRole.textContent = isSeeker ? '🔎 SEEKER' : '🏃 HIDER';
  gameDetails.textContent = `Zone radius: ${room.settings.zoneRadius} m`;

  function updateCountdown() {
    const remaining = Math.max(
      0,
      Math.ceil((deadline - getServerTime()) / 1000)
    );

    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');

    gameCountdown.textContent = `${minutes}:${seconds}`;

    if (remaining > 0) {
      gameMessage.textContent = isSeeker
        ? 'Hiders are hiding...'
        : 'Find a hiding spot!';
    } else {
      gameMessage.textContent = isSeeker
        ? 'HUNT STARTED! Find the hiders!'
        : 'HIDE! The seekers are released!';
    }

    // Host advances room state after hiding countdown
    if (remaining === 0 && room.status === 'hiding' && uid === room.host) {
      update(ref(db, `rooms/${currentRoom}`), {
        status: 'active'
      }).catch(console.error);
    }
  }

  updateCountdown();
  timerInterval = setInterval(updateCountdown, 1000);
}

// ---------------- CREATE ROOM ----------------


 // ---------------- PLAYER INPUT ----------------

const playerInput = document.createElement('section');
playerInput.style.display = 'none';

playerInput.innerHTML = `
  <h2 id="input-title">Enter Details</h2>

  <input id="player-name" placeholder="Your player name" maxlength="20">

  <input id="room-code-input" placeholder="Room code"
         maxlength="6"
         style="display:none;text-transform:uppercase">

  <br><br>

  <button id="input-confirm">Continue</button>
  <button id="input-cancel">Cancel</button>

  <p id="input-error" style="color:red"></p>
`;

document.querySelector('.hero').appendChild(playerInput);

const playerNameInput = playerInput.querySelector('#player-name');
const roomCodeInput = playerInput.querySelector('#room-code-input');
const inputTitle = playerInput.querySelector('#input-title');
const inputConfirm = playerInput.querySelector('#input-confirm');
const inputError = playerInput.querySelector('#input-error');

let inputMode = null;

function showPlayerInput(mode) {
  inputMode = mode;

  playerInput.style.display = 'block';
  playerNameInput.value = '';
  roomCodeInput.value = '';
  inputError.textContent = '';

  roomCodeInput.style.display =
    mode === 'join' ? 'inline-block' : 'none';

  inputTitle.textContent =
    mode === 'create' ? 'Create Room' : 'Join Room';

  inputConfirm.textContent =
    mode === 'create' ? 'Create' : 'Join';

  createButton.style.display = 'none';
  joinButton.style.display = 'none';
}

function hidePlayerInput() {
  playerInput.style.display = 'none';
  createButton.style.display = 'inline-block';
  joinButton.style.display = 'inline-block';
}

createButton.addEventListener('click', () => showPlayerInput('create'));
joinButton.addEventListener('click', () => showPlayerInput('join'));

document.getElementById('input-cancel').addEventListener('click', hidePlayerInput);

inputConfirm.addEventListener('click', async () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();

  inputError.textContent = '';

  if (!name) {
    inputError.textContent = 'Enter your player name.';
    return;
  }

  if (inputMode === 'join' && !code) {
    inputError.textContent = 'Enter the room code.';
    return;
  }

  inputConfirm.disabled = true;

  try {
    await playerReady;

    if (inputMode === 'create') {
      const newCode = await createRoom(name);
      playerInput.style.display = 'none';
      showLobby(newCode);
    } else {
      await joinRoom(code, name);
      playerInput.style.display = 'none';
      showLobby(code);
    }
  } catch (error) {
    inputError.textContent = error.message;
    console.error(error);
  } finally {
    inputConfirm.disabled = false;
  }
});

// ---------------- COPY CODE ----------------

document.getElementById('copy-code').addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentRoom);
  alert('Room code copied!');
});

// ---------------- START GAME ----------------

startButton.addEventListener('click', () => {
  setup.style.display = 'block';
});

document.getElementById('cancel-setup').addEventListener('click', () => {
  setup.style.display = 'none';
});


document.getElementById('confirm-start').addEventListener('click', async () => {
  try {
    const zoneCenter = await getCurrentLocation();

    await startGame(currentRoom, {
      hidingTime: Number(document.getElementById('hiding-time').value),
      zoneRadius: Number(document.getElementById('zone-radius').value)
    }, zoneCenter);

    startLocationTracking();
  } catch (error) {
    alert(error.message);
    console.error(error);
  }
});


 // ---------------- LEAVE ROOM ----------------


 // ---------------- LEAVE ROOM ----------------

function exitRoomLocally() {
  stopTimer();
  stopLocationTracking();

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  destroyGameMap();
  mapInitializedRoom = null;
  currentRoom = null;

  lobby.style.display = 'none';
  setup.style.display = 'none';
  gameScreen.style.display = 'none';
  playerInput.style.display = 'none';

  createButton.style.display = 'inline-block';
  joinButton.style.display = 'inline-block';
}

async function leaveCurrentRoom() {
  if (!currentRoom || !auth.currentUser) return;

  const uid = auth.currentUser.uid;
  const roomCode = currentRoom;

  try {
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      exitRoomLocally();
      return;
    }

    const room = snapshot.val();

    // HOST: Destroy the entire room
    if (uid === room.host) {
      await remove(roomRef);
    } else {
      // HIDER: Remove only this player
      await Promise.all([
        remove(ref(db, `rooms/${roomCode}/players/${uid}`)),
        remove(ref(db, `rooms/${roomCode}/locations/${uid}`))
      ]);
    }

    exitRoomLocally();

  } catch (error) {
    console.error('Could not leave room:', error);
    alert(error.message);
  }
}

document.getElementById('leave-room')
  .addEventListener('click', leaveCurrentRoom);

document.getElementById('leave-game')
  .addEventListener('click', leaveCurrentRoom);



// ---------------- BACK TO LOBBY ----------------

document.getElementById('back-to-lobby').addEventListener('click', () => {
  stopTimer();
  stopLocationTracking();
  destroyGameMap();
  mapInitializedRoom = null;
  showLobbyScreen();
});

// ---------------- TEST GPS ----------------

document.getElementById('test-gps')?.addEventListener('click', async () => {
  const button = document.getElementById('test-gps');

  button.textContent = 'Getting GPS...';
  button.disabled = true;

  try {
    await playerReady;
    const location = await getCurrentLocation();

    alert(
      `GPS WORKING!\n\nLatitude: ${location.latitude}\nLongitude: ${location.longitude}\nAccuracy: ${Math.round(location.accuracy)} meters`
    );

    console.log('GPS location:', location);
  } catch (error) {
    const messages = {
      1: 'Location permission denied.',
      2: 'GPS position unavailable.',
      3: 'GPS request timed out.'
    };

    alert(`GPS ERROR (code ${error.code}):\n${messages[error.code] || 'Unknown error'}`);
    console.error('GPS error:', error);
  } finally {
    button.textContent = 'Test GPS';
    button.disabled = false;
  }
});

// ---------------- INITIALIZE ----------------

playerReady
  .then(user => console.log('Firebase connected:', user.uid))
  .catch(console.error);
