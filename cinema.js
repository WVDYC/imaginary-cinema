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
const resultDialog = document.getElementById('result-dialog');
const resultTitle = document.getElementById('result-title');
const resultSeats = document.getElementById('result-seats');
const closeResult = document.getElementById('close-result');
const resultConfetti = document.getElementById('result-confetti');
const notificationStatus = document.getElementById('notification-status');
const verificationPanel = document.getElementById('visitor-verification');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const notificationEndpoint = document.querySelector('meta[name="seat-notification-endpoint"]').content;
const verificationSitekey = document.querySelector('meta[name="seat-verification-sitekey"]').content;
const notifications = new Map();

const seatsPerRow = 12;
const rowCount = 12;
let selectedPair = null;
let currentResult = null;
let verificationScript = null;
let activeVerification = null;

function currentInvitation() {
  if (!notificationEndpoint) return null;
  const key = new URLSearchParams(location.hash.slice(1)).get('invite');
  return key && /^[A-Za-z0-9_-]{43}$/.test(key) ? key : null;
}

function updateConfirmationLabels() {
  const label = notificationEndpoint && (currentInvitation() || verificationSitekey)
    ? 'Подтвердить и отправить'
    : 'Подтвердить места';
  confirmGesture.textContent = label;
  confirmSelection.textContent = selectedPair?.start === 6 ? 'Точно уверена?' : label;
}

window.addEventListener('hashchange', updateConfirmationLabels);
updateConfirmationLabels();

function loadVerificationWidget() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (verificationScript) return verificationScript;

  verificationScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onCinemaTurnstileLoad';
    script.async = true;
    const timeout = setTimeout(failed, 10000);
    function failed() {
      clearTimeout(timeout);
      delete window.onCinemaTurnstileLoad;
      script.remove();
      verificationScript = null;
      reject(new Error('Verification script unavailable'));
    }
    script.addEventListener('error', failed, { once: true });
    window.onCinemaTurnstileLoad = () => {
      if (!window.turnstile?.render) return failed();
      clearTimeout(timeout);
      delete window.onCinemaTurnstileLoad;
      resolve(window.turnstile);
    };
    document.head.append(script);
  });
  return verificationScript;
}

async function getVisitorProof(pair) {
  const controller = new AbortController();
  const { signal } = controller;
  activeVerification = controller;
  try {
    const turnstile = await loadVerificationWidget();
    if (signal.aborted) throw new DOMException('Verification cancelled', 'AbortError');
    return await new Promise((resolve, reject) => {
      verificationPanel.hidden = false;
      let widgetId;
      let settled = false;
      const timeout = setTimeout(() => complete(), 120000);
      function complete(proof) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        if (widgetId != null) turnstile.remove(widgetId);
        verificationPanel.hidden = true;
        if (proof) resolve(proof);
        else reject(new Error('Visitor verification incomplete'));
      }
      function cancel() { complete(); }
      signal.addEventListener('abort', cancel, { once: true });
      try {
        widgetId = turnstile.render(verificationPanel, {
          sitekey: verificationSitekey,
          action: 'seat-confirmation',
          cData: `r${pair.row}-s${pair.start}`,
          language: 'ru',
          appearance: 'interaction-only',
          size: 'flexible',
          'response-field': false,
          callback: complete,
          'error-callback': () => { complete(); return true; },
          'expired-callback': cancel,
          'timeout-callback': cancel,
        });
      } catch {
        complete();
      }
    });
  } finally {
    if (activeVerification === controller) activeVerification = null;
  }
}

resultDialog.addEventListener('close', () => {
  activeVerification?.abort();
  resultConfetti.replaceChildren();
});

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

function celebrateSelection() {
  if (reducedMotion.matches) return;

  const colors = ['#f5cb86', '#fff0d1', '#f17069', '#ee9ab6', '#ceaff0'];
  const { left, right, bottom } = resultDialog.getBoundingClientRect();
  const spread = Math.min(window.innerWidth * 0.46, 280);

  for (let index = 0; index < 42; index++) {
    const direction = index % 2 === 0 ? 1 : -1;
    const drift = (Math.random() - 0.27) * spread * direction;
    const rise = 95 + Math.random() * 175;
    const spin = (140 + Math.random() * 360) * direction;

    const piece = document.createElement('span');
    piece.style.left = (direction === 1 ? left + 26 : right - 26) + 'px';
    piece.style.top = (bottom - 38) + 'px';
    piece.style.width = (5 + Math.random() * 6) + 'px';
    piece.style.backgroundColor = colors[index % colors.length];
    resultConfetti.append(piece);

    const animation = piece.animate([
      { transform: 'scale(.35)', opacity: 0, easing: 'cubic-bezier(.1,.55,.35,1)' },
      { transform: `translate(${drift}px, ${-rise}px) rotate(${spin}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
      { transform: `translate(${drift * 1.45}px, 120px) rotate(${spin * 1.6}deg)`, opacity: 0 },
    ], { duration: 1250 + Math.random() * 500, delay: Math.random() * 100, fill: 'both' });
    animation.onfinish = () => piece.remove();
  }
}

async function showResult() {
  const pair = selectedPair;
  const key = currentInvitation();
  const confirmation = { pair, key };
  currentResult = confirmation;
  const shouldNotify = notificationEndpoint && (key || verificationSitekey);

  resultTitle.textContent = shouldNotify ? 'Подтверждаем места…' : 'Места выбраны';
  resultSeats.textContent = formatPair(pair);
  closeResult.textContent = shouldNotify ? 'Отмена' : 'Закрыть';
  notificationStatus.hidden = true;
  notificationStatus.textContent = '';
  resultDialog.showModal();

  const outcome = shouldNotify ? await notifyOrganizer(pair, key) : 204;
  if (!resultDialog.open || currentResult !== confirmation) return;

  resultTitle.textContent = 'Места выбраны';
  closeResult.textContent = 'Закрыть';
  if (outcome === 204) {
    celebrateSelection();
    return;
  }

  if (outcome === 429) {
    notificationStatus.textContent = 'Слишком много отправок. Попробуй через минуту.';
  } else if (outcome === 403 && !key) {
    notificationStatus.textContent = 'Проверка не завершилась. Попробуй подтвердить места ещё раз.';
  } else {
    notificationStatus.textContent = 'Не удалось отправить выбор. Попробуй подтвердить места ещё раз.';
  }
  notificationStatus.hidden = false;
}

async function submitNotification(pair, key) {
  const headers = { 'Content-Type': 'application/json' };
  let body = pair;
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  } else {
    try {
      body = { ...pair, proof: await getVisitorProof(pair) };
    } catch {
      return 403;
    }
  }
  return fetch(notificationEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(13000),
  }).then(response => response.status, () => 0);
}

async function notifyOrganizer(pair, key) {
  const notificationId = key + ':' + formatPair(pair);

  if (!notifications.has(notificationId)) {
    notifications.set(notificationId, submitNotification(pair, key).catch(() => 0));
  }

  const request = notifications.get(notificationId);
  const outcome = await request;
  if (outcome !== 204 && notifications.get(notificationId) === request) notifications.delete(notificationId);
  return outcome;
}

confirmSelection.addEventListener('click', () => {
  if (selectedPair.start === 6) {
    gestureDialog.showModal();
  } else {
    showResult();
  }
});

confirmGesture.addEventListener('click', () => {
  gestureDialog.close();
  showResult();
});
