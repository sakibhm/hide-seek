
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

export function initGameMap(roomCode, ownUid) {
  if (map) {
    destroyGameMap();
  }

  markers = {};
  centeredOnPlayer = false;

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
      const locations = snapshot.val() || {};

      Object.entries(locations).forEach(([uid, location]) => {
        const position = [
          location.latitude,
          location.longitude
        ];

        if (!markers[uid]) {
          markers[uid] = L.marker(position).addTo(map);

          markers[uid].bindPopup(
            uid === ownUid ? 'You' : 'Player'
          );
        } else {
          markers[uid].setLatLng(position);
        }

        if (uid === ownUid && !centeredOnPlayer) {
          map.setView(position, 17);
          centeredOnPlayer = true;
        }
      });

      Object.keys(markers).forEach(uid => {
        if (!locations[uid]) {
          map.removeLayer(markers[uid]);
          delete markers[uid];
        }
      });
    }
  );

  // GAME ZONE
  zoneListener = onValue(
    ref(db, `rooms/${roomCode}`),
    snapshot => {
      const room = snapshot.val();

      if (!room?.zoneCenter || !room?.settings?.zoneRadius) {
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
          color: '#e63946',
          fillColor: '#e63946',
          fillOpacity: 0.12,
          weight: 3
        }).addTo(map);
      } else {
        zoneCircle.setLatLng(center);
        zoneCircle.setRadius(radius);
      }

      // Fit map to show the complete zone
      map.fitBounds(zoneCircle.getBounds(), {
        padding: [25, 25]
      });
    }
  );

  // Fix map rendering after game screen becomes visible
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
  zoneCircle = null;
  centeredOnPlayer = false;
}
