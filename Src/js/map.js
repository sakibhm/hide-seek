
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from './firebase.js';
import { ref, onValue } from 'firebase/database';

let map = null;
let markers = {};
let locationListener = null;
let zoneListener = null;
let zoneCircle = null;
let centeredOnPlayer = false;
let zoneFitted = false;

let playerLocations = {};
let roomPlayers = {};
let ownUid = null;

// Escape player names before inserting into marker HTML
function escapeHTML(value) {
  return String(value ?? 'Player').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

// Custom player marker


function createPlayerIcon(player, uid) {
  const isSeeker = player?.role === 'seeker';
  const isYou = uid === ownUid;

  const color = isSeeker ? '#ff3b30' : '#3478f6';
  const label = isYou ? 'YOU' : '';

  return L.divIcon({
    className: 'custom-player-marker',

    html: `
      <div style="
        width:90px;
        height:45px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:flex-end;
        pointer-events:none;
      ">
        ${label ? `
          <div style="
            background:${color};
            color:white;
            padding:4px 9px;
            border-radius:7px;
            font-size:12px;
            font-weight:700;
            white-space:nowrap;
            border:1px solid white;
            margin-bottom:5px;
          ">YOU</div>
        ` : ''}

        <div style="
          width:20px;
          height:20px;
          box-sizing:border-box;
          background:${color};
          border:3px solid white;
          border-radius:50%;
          box-shadow:0 2px 8px #0005;
          flex-shrink:0;
        "></div>
      </div>
    `,

    iconSize: [90, 45],
    iconAnchor: [45, 45]
  });
}


// Refresh all player markers
function updatePlayerMarkers() {
  if (!map) return;

  Object.entries(playerLocations).forEach(([uid, location]) => {
    const position = [
      location.latitude,
      location.longitude
    ];

    const player = roomPlayers[uid] || {};

// Hiders cannot see the seeker
const myRole = roomPlayers[ownUid]?.role;

if (myRole === 'hider' && player.role === 'seeker') {
  if (markers[uid]) {
    map.removeLayer(markers[uid]);
    delete markers[uid];
  }

  return;
}

const icon = createPlayerIcon(player, uid);

    if (!markers[uid]) {
      markers[uid] = L.marker(position, {
        icon,
        zIndexOffset: uid === ownUid ? 1000 : 0
      }).addTo(map);
    } else {
      markers[uid].setLatLng(position);
      markers[uid].setIcon(icon);
    }
  });

  // Remove markers for players without live locations
  Object.keys(markers).forEach(uid => {
    if (!playerLocations[uid]) {
      map.removeLayer(markers[uid]);
      delete markers[uid];
    }
  });
}

export function initGameMap(roomCode, playerUid) {
  if (map) {
    destroyGameMap();
  }

  markers = {};
  playerLocations = {};
  roomPlayers = {};
  centeredOnPlayer = false;
  zoneFitted = false;
  ownUid = playerUid;

  map = L.map('map', {
    minZoom: 3
  }).setView([19.0760, 72.8777], 13);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // PLAYER LOCATIONS
  locationListener = onValue(
    ref(db, `rooms/${roomCode}/locations`),
    snapshot => {
      playerLocations = snapshot.val() || {};

      updatePlayerMarkers();

      // Initially center on yourself
      const ownLocation = playerLocations[ownUid];

      if (ownLocation && !centeredOnPlayer) {
        map.setView([
          ownLocation.latitude,
          ownLocation.longitude
        ], 17);

        centeredOnPlayer = true;
      }
    }
  );

  // ROOM DATA: player names, roles, and zone
  zoneListener = onValue(
    ref(db, `rooms/${roomCode}`),
    snapshot => {
      const room = snapshot.val();

      if (!room) return;

      roomPlayers = room.players || {};
      updatePlayerMarkers();

      if (!room.zoneCenter || !room.settings?.zoneRadius) {
        return;
      }

      const center = [
        room.zoneCenter.latitude,
        room.zoneCenter.longitude
      ];

      const radius = room.settings.zoneRadius;

      if (!zoneCircle) {
        zoneCircle = L.circle(center, {
          radius,
          color: '#ff3b30',
          fillColor: '#ff3b30',
          fillOpacity: 0.08,
          weight: 3,
          dashArray: '8 6'
        }).addTo(map);
      } else {
        zoneCircle.setLatLng(center);
        zoneCircle.setRadius(radius);
      }

      // Fit the complete zone only once
      if (!zoneFitted) {
        map.fitBounds(zoneCircle.getBounds(), {
          padding: [35, 35]
        });

        zoneFitted = true;
      }
    }
  );

  // Fix rendering after the game screen becomes visible
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      map?.invalidateSize();
    });
  });
}

export function destroyGameMap() {
  if (locationListener) {
    locationListener();
    locationListener = null;
  }

  if (zoneListener) {
    zoneListener();
    zoneListener = null;
  }

  if (map) {
    map.remove();
    map = null;
  }

  markers = {};
  playerLocations = {};
  roomPlayers = {};
  zoneCircle = null;
  centeredOnPlayer = false;
  zoneFitted = false;
  ownUid = null;
}
