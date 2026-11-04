
import { db, auth } from './firebase.js';
import { ref, set } from 'firebase/database';

// Get one location
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      error => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

// Track location continuously
export function trackLocation(roomCode) {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported.');
  }

  const uid = auth.currentUser.uid;
  const locationRef = ref(db, `rooms/${roomCode}/locations/${uid}`);

  return navigator.geolocation.watchPosition(
    async position => {
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: Date.now()
      };

      try {
        await set(locationRef, location);
        console.log('Location updated:', location);
      } catch (error) {
        console.error('Firebase location update failed:', error);
      }
    },
    error => {
      console.error('Location tracking error:', error.code, error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    }
  );
}

// Stop tracking
export function stopTracking(watchId) {
  navigator.geolocation.clearWatch(watchId);
}
