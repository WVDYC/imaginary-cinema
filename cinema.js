const welcome = document.getElementById('welcome');
const hall = document.getElementById('hall-view');
const enter = document.getElementById('enter');
const number = document.getElementById('leader-number');
const sweep = document.getElementById('sweep');
const status = document.getElementById('intro-status');
const map = document.getElementById('seat-map');
const selection = document.getElementById('selection-text');
const confirmSelection = document.getElementById('confirm');
const confirmGesture = document.getElementById('confirm-gesture');
const gestureDialog = document.getElementById('gesture-dialog');
const gesturePortrait = document.getElementById('gesture-portrait');
const resultDialog = document.getElementById('result-dialog');
const resultSeats = document.getElementById('result-seats');
const shareStatus = document.getElementById('share-status');
const notificationStatus = document.getElementById('notification-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const notificationEndpoint = document.querySelector('meta[name="seat-notification-endpoint"]').content;
const notifications = new Map();

const seatsPerRow = 12;
const rowCount = 12;
let selectedPair = null;
let displayedPortraitKey = null;
let pendingPortraitKey = null;

function currentInvitation() {
  if (!notificationEndpoint) return null;
  const key = new URLSearchParams(location.hash.slice(1)).get('invite');
  return key && /^[A-Za-z0-9_-]{43}$/.test(key) ? key : null;
}

function updateConfirmationLabels() {
  const label = currentInvitation() ? 'Подтвердить и отправить' : 'Подтвердить места';
  confirmGesture.textContent = label;
  confirmSelection.textContent = selectedPair?.start === 6 ? 'Точно уверена?' : label;
}

window.addEventListener('hashchange', () => {
  updateConfirmationLabels();
  if (displayedPortraitKey !== currentInvitation()) clearGesturePortrait();
  if (gestureDialog.open) loadGesturePortrait();
});
updateConfirmationLabels();

function clearGesturePortrait() {
  const imageUrl = gesturePortrait.getAttribute('src');
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  gesturePortrait.removeAttribute('src');
  gesturePortrait.hidden = true;
  gesturePortrait.parentElement.classList.remove('has-portrait');
  displayedPortraitKey = null;
}

async function loadGesturePortrait() {
  const key = currentInvitation();
  if (!key || key === displayedPortraitKey || key === pendingPortraitKey) return;

  pendingPortraitKey = key;
  try {
    const response = await fetch('./portrait.enc', { signal: AbortSignal.timeout(6500) });
    if (!response.ok) return;
    const encrypted = new Uint8Array(await response.arrayBuffer());
    const material = new TextEncoder().encode('imaginary-cinema-portrait-v1:' + key);
    const digest = await crypto.subtle.digest('SHA-256', material);
    const portraitKey = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
    const decoded = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.subarray(0, 12) },
      portraitKey,
      encrypted.subarray(12),
    );
    if (key !== currentInvitation()) return;
    clearGesturePortrait();
    gesturePortrait.src = URL.createObjectURL(new Blob([decoded], { type: 'image/webp' }));
    gesturePortrait.hidden = false;
    gesturePortrait.parentElement.classList.add('has-portrait');
    displayedPortraitKey = key;
  } catch {
    // The animated emoji can still be shown if the portrait fails to load.
  } finally {
    if (pendingPortraitKey === key) pendingPortraitKey = null;
  }
}

for (let row = 0; row < 3; row++) {
  const line = document.createElement('div');
  line.className = 'chair-row';

  for (let seat = 0; seat < 16; seat++) {
    const chair = document.createElement('span');
    chair.className = 'cinema-chair';
    line.append(chair);
  }
  document.getElementById('chairs').append(line);
}

function showHall() {
  welcome.hidden = true;
  hall.hidden = false;
  document.body.dataset.view = 'hall';
  document.getElementById('hall-title').focus({ preventScroll: true });
  window.scrollTo(0, 0);
  // Render the dark hall before switching on the projector.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.add('lights-on'));
  });
}

function darkenRoom() {
  welcome.dataset.phase = 'blackout';
  status.textContent = 'Свет погас';
  setTimeout(showHall, 680);
}

function countDown() {
  const started = performance.now();
  let previous = 0;
  welcome.dataset.phase = 'countdown';

  function drawFrame(now) {
    const elapsed = now - started;
    if (elapsed >= 5000) {
      darkenRoom();
      return;
    }

    const digit = 5 - Math.floor(elapsed / 1000);
    if (digit !== previous) {
      number.textContent = String(digit);
      status.textContent = String(digit);
      previous = digit;
    }
    if (!reducedMotion.matches) {
      sweep.style.setProperty('--sweep', ((elapsed % 1000) / 1000) * 360 + 'deg');
    }
    requestAnimationFrame(drawFrame);
  }
  drawFrame(started);
}

enter.addEventListener('click', () => {
  enter.disabled = true;
  welcome.classList.add('is-playing');
  welcome.dataset.phase = 'opening';
  status.textContent = 'Шторы открываются';
  enter.hidden = true;
  setTimeout(countDown, reducedMotion.matches ? 140 : 2230);
});

for (let row = 1; row <= rowCount; row++) {
  const line = document.createElement('div');
  line.className = 'seat-row';
  line.style.setProperty('--row-index', row - 1);

  const rowNumber = document.createElement('span');
  rowNumber.className = 'row-num';
  rowNumber.textContent = row;
  rowNumber.setAttribute('aria-hidden', 'true');
  line.append(rowNumber);

  for (let seat = 1; seat <= seatsPerRow; seat++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seat';
    button.disabled = row <= 4 || row === rowCount;
    button.dataset.row = row;
    button.dataset.seat = seat;
    button.setAttribute('aria-label', `Ряд ${row}, место ${seat}${button.disabled ? ', пропускаем' : ''}`);
    button.setAttribute('aria-pressed', 'false');

    const label = document.createElement('span');
    label.textContent = seat;
    button.append(label);
    button.addEventListener('click', () => choose(row, seat));
    line.append(button);
  }

  line.append(rowNumber.cloneNode(true));
  map.append(line);
}

function choose(row, seat) {
  const start = Math.min(seat, seatsPerRow - 1);
  selectedPair = { row, start };

  for (const button of map.querySelectorAll('.seat')) {
    const position = Number(button.dataset.seat);
    const selected = Number(button.dataset.row) === row && (position === start || position === start + 1);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  selection.textContent = formatPair(selectedPair);
  updateConfirmationLabels();
  confirmSelection.hidden = false;
}

function formatPair({ row, start }) {
  return `Ряд ${row} · места ${start} и ${start + 1}`;
}

function showResult() {
  const pair = selectedPair;
  resultSeats.textContent = formatPair(pair);
  shareStatus.hidden = true;
  shareStatus.textContent = '';
  notificationStatus.hidden = true;
  notificationStatus.textContent = '';
  resultDialog.showModal();
  const key = currentInvitation();
  if (key) notifyOrganizer(pair, key);
}

async function notifyOrganizer(pair, key) {
  const choice = formatPair(pair);
  const notificationId = key + ':' + choice;
  notificationStatus.hidden = false;
  notificationStatus.textContent = 'Отправляем выбор организатору…';

  if (!notifications.has(notificationId)) {
    const notification = fetch(notificationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(pair),
      signal: AbortSignal.timeout(8500),
    }).then(response => response.ok, () => false);
    notifications.set(notificationId, notification);
  }

  const sent = await notifications.get(notificationId);
  if (!sent) notifications.delete(notificationId);
  if (resultDialog.open && resultSeats.textContent === choice && currentInvitation() === key) {
    notificationStatus.textContent = sent
      ? 'Выбор отправлен организатору.'
      : 'Не удалось отправить выбор. Используй «Поделиться».';
  }
}

confirmSelection.addEventListener('click', () => {
  if (selectedPair.start === 6) {
    gestureDialog.showModal();
    loadGesturePortrait();
  } else {
    showResult();
  }
});

confirmGesture.addEventListener('click', () => {
  gestureDialog.close();
  showResult();
});

document.getElementById('share-selection').addEventListener('click', async () => {
  const text = resultSeats.textContent;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  shareStatus.hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    shareStatus.textContent = 'Скопировано. Вставь в сообщение.';
  } catch {
    shareStatus.textContent = 'Скопируй строку с рядом и местами вручную.';
  }
});
