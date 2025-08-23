// script.js (updated)

/*
  P2P Tic Tac Toe using Firebase Realtime Database for signaling (no game server).
  - Offline mode: hot-seat
  - Online mode: Host shares link (?room=XXXXXX)
  - After signaling completes, peers communicate over WebRTC DataChannel.
*/

// ===== Firebase (modular) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase, ref, set, push, onValue, remove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA-CqzH2yUjTnE81C2QQkjf6Bf93FiR15Y",
  authDomain: "tic-tac-toe-949a9.firebaseapp.com",
  databaseURL: "https://tic-tac-toe-949a9-default-rtdb.firebaseio.com",
  projectId: "tic-tac-toe-949a9",
  storageBucket: "tic-tac-toe-949a9.appspot.com",
  messagingSenderId: "35189818535",
  appId: "1:35189818535:web:18fa13df172f32f98ec782",
  measurementId: "G-KDBDBP8N03"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ====== Game State ======
let board = Array(9).fill('');
let currentPlayer = 'X';
let gameActive = true;
let xScore = 0, oScore = 0, drawScore = 0;

const gameBoard = document.getElementById('game-board');
const statusDiv = document.getElementById('status');
const playerX = document.getElementById('player-x');
const playerO = document.getElementById('player-o');
const banner = document.getElementById('winner-banner');
const linkArea = document.getElementById('link-area');

// Confetti
const confettiCanvas = document.getElementById('confetti-canvas');
const ctx = confettiCanvas.getContext('2d');
confettiCanvas.width = window.innerWidth;
confettiCanvas.height = window.innerHeight;
let confetti = [];
let confettiAnimation;
let confettiActive = false;

// Mode & P2P
let gameMode = 'offline';     // 'offline' | 'online'
let playerSymbol = 'X';
let roomId = null;
let pc = null;
let channel = null;

// STUN server
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// ====== UI Setup ======
function renderBoard() {
  gameBoard.innerHTML = '';
  board.forEach((cell, index) => {
    const cellDiv = document.createElement('div');
    cellDiv.classList.add('cell');
    cellDiv.innerText = cell;
    cellDiv.addEventListener('click', () => handleClick(index));
    gameBoard.appendChild(cellDiv);
  });
}

function updateIndicator() {
  if (currentPlayer === 'X') {
    playerX.classList.add('active');
    playerO.classList.remove('active');
  } else {
    playerO.classList.add('active');
    playerX.classList.remove('active');
  }
}

function updateScore() {
  document.getElementById('x-score').innerText = xScore;
  document.getElementById('o-score').innerText = oScore;
  document.getElementById('draw-score').innerText = drawScore;
}

function resetGame() {
  board = Array(9).fill('');
  currentPlayer = 'X';
  gameActive = true;
  statusDiv.innerText = "X's turn";
  updateIndicator();
  renderBoard();
  stopConfetti();
  banner.classList.add('hidden');
}

function startOver() {
  xScore = 0; oScore = 0; drawScore = 0;
  updateScore();
  resetGame();
}

// ====== Game Logic ======
function handleClick(index) {
  if (!gameActive || board[index] !== '') return;

  if (gameMode === 'offline') {
    // existing offline logic unchanged
    board[index] = currentPlayer;
    checkResult();
    if (gameActive) {
      currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
      updateIndicator();
      statusDiv.innerText = `${currentPlayer}'s turn`;
    }
    renderBoard();
    return;
  }

  // ===== Online mode strict turns =====
  if (gameMode === 'online') {
    if (currentPlayer !== playerSymbol) return; // block if not your turn

    // place symbol
    board[index] = playerSymbol;
    renderBoard();
    checkResult();

    if (gameActive) {
      // lock self until opponent moves
      currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
      updateIndicator();
      statusDiv.innerText = `Waiting for ${currentPlayer}…`;
    }

    // send to peer
    sendMove({ index, symbol: playerSymbol });
  }
}




function checkResult() {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (const pattern of wins) {
    const [a,b,c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      showWinner(`${board[a]} Wins!`, pattern);
      if (board[a] === 'X') xScore++; else oScore++;
      updateScore();
      return;
    }
  }

  if (!board.includes('')) {
    showWinner("It's a Draw!");
    drawScore++;
    updateScore();
  }
}

function showWinner(msg, pattern = []) {
  gameActive = false;

  // friendlier messages
  let fullMsg = msg;
  if (msg.includes("X Wins")) {
    fullMsg = "Player X wins! Player O loses.";
  } else if (msg.includes("O Wins")) {
    fullMsg = "Player O wins! Player X loses.";
  } else if (msg.includes("Draw")) {
    fullMsg = "It's a draw! No one wins.";
  }

  statusDiv.innerText = fullMsg;
  banner.innerText = fullMsg;
  banner.classList.remove('hidden');

  if (pattern.length) {
    const cells = document.querySelectorAll('.cell');
    pattern.forEach(i => cells[i].classList.add('winning-cell'));
  }

  startConfetti();
  setTimeout(() => {
    banner.classList.add('hidden');
    fadeOutConfetti();
  }, 2800);
}

// ====== Confetti ======
function startConfetti() {
  confetti = [];
  confettiActive = true;
  for (let i = 0; i < 420; i++) {
    confetti.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height - confettiCanvas.height,
      r: Math.random() * 6 + 2,
      d: Math.random() * 0.5 + 0.5,
      color: `hsl(${Math.random() * 360}, 100%, 50%)`
    });
  }
  confettiAnimation = requestAnimationFrame(drawConfetti);
}

function drawConfetti() {
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confetti.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, false);
    ctx.fillStyle = p.color;
    ctx.fill();
  });
  confetti.forEach(p => {
    p.y += p.d * 10; // fast
    if (p.y > confettiCanvas.height) {
      p.y = -10;
      p.x = Math.random() * confettiCanvas.width;
    }
  });
  if (confettiActive) confettiAnimation = requestAnimationFrame(drawConfetti);
}

function stopConfetti() {
  confettiActive = false;
  cancelAnimationFrame(confettiAnimation);
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

function fadeOutConfetti() {
  let opacity = 1;
  const fade = setInterval(() => {
    ctx.globalAlpha = opacity;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    opacity -= 0.08;
    if (opacity <= 0) {
      clearInterval(fade);
      ctx.globalAlpha = 1;
      stopConfetti();
    }
  }, 40);
}

// ====== Buttons ======
document.getElementById('restart-btn').addEventListener('click', resetGame);
document.getElementById('startover-btn').classList.add('danger');
document.getElementById('startover-btn').addEventListener('click', startOver);

document.getElementById('offline-btn').addEventListener('click', () => {
  gameMode = 'offline';
  linkArea.classList.add('hidden');
  resetGame();
  statusDiv.innerText = "Offline Mode: X's turn";
});

document.getElementById('host-btn').addEventListener('click', hostOnline);

// Auto-join if URL has ?room=
const params = new URLSearchParams(window.location.search);
if (params.has('room')) {
  joinOnline(params.get('room'));
}

// ====== P2P with Firebase signaling ======

async function hostOnline() {
  gameMode = 'online';
  linkArea.classList.remove('hidden');
  resetGame();
  playerSymbol = 'X';
  currentPlayer = 'X';
  updateIndicator();
  statusDiv.innerText = 'Creating room…';

  roomId = Math.random().toString(36).slice(2, 8);
  const roomRef = ref(db, `rooms/${roomId}`);
  const offerCandidatesRef = ref(db, `rooms/${roomId}/offerCandidates`);
  const answerCandidatesRef = ref(db, `rooms/${roomId}/answerCandidates`);

  pc = new RTCPeerConnection(rtcConfig);
  channel = pc.createDataChannel('moves');
  channel.onmessage = (e) => handleRemoteMove(JSON.parse(e.data));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const newRef = push(offerCandidatesRef);
      set(newRef, event.candidate.toJSON());
    }
  };

  const offerDesc = await pc.createOffer();
  await pc.setLocalDescription(offerDesc);

  await set(ref(db, `rooms/${roomId}/offer`), {
    type: offerDesc.type,
    sdp: offerDesc.sdp
  });

  const url = `${location.origin}${location.pathname}?room=${roomId}`;
  linkArea.innerHTML = `Share this link with your friend:<br><a href="${url}" target="_blank">${url}</a>`;

  onValue(ref(db, `rooms/${roomId}/answer`), async (snapshot) => {
    const data = snapshot.val();
    if (!data || pc.currentRemoteDescription) return;
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    statusDiv.innerText = 'Connected! You are X.';

    startOver(); // reset scores & board when connection established
    linkArea.classList.add('hidden'); // hide link after connect
  });

  onValue(answerCandidatesRef, (snapshot) => {
    snapshot.forEach(child => {
      const candidate = child.val();
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    });
  });

  window.addEventListener('beforeunload', () => remove(roomRef));
}


async function joinOnline(id) {
  gameMode = 'online';
  linkArea.classList.add('hidden');
  resetGame();
  playerSymbol = 'O';
  currentPlayer = 'X';
  updateIndicator();
  statusDiv.innerText = 'Joining room…';
  roomId = id;

  const roomRef = ref(db, `rooms/${roomId}`);
  const offerRef = ref(db, `rooms/${roomId}/offer`);
  const answerRef = ref(db, `rooms/${roomId}/answer`);
  const offerCandidatesRef = ref(db, `rooms/${roomId}/offerCandidates`);
  const answerCandidatesRef = ref(db, `rooms/${roomId}/answerCandidates`);

  let offerSnapshotHandled = false;
  onValue(offerRef, async (snapshot) => {
    if (offerSnapshotHandled) return;
    const offer = snapshot.val();
    if (!offer) return;

    offerSnapshotHandled = true;

    pc = new RTCPeerConnection(rtcConfig);
    pc.ondatachannel = (event) => {
      channel = event.channel;
      channel.onmessage = (e) => handleRemoteMove(JSON.parse(e.data));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const newRef = push(answerCandidatesRef);
        set(newRef, event.candidate.toJSON());
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answerDesc = await pc.createAnswer();
    await pc.setLocalDescription(answerDesc);

    await set(answerRef, {
      type: answerDesc.type,
      sdp: answerDesc.sdp
    });

    statusDiv.innerText = 'Connected! You are O.';

    onValue(offerCandidatesRef, (snapshot) => {
      snapshot.forEach(child => {
        const candidate = child.val();
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      });
    });

    window.addEventListener('beforeunload', () => remove(roomRef));
  });
}

// ====== DataChannel helpers ======
function sendMove(move) {
  if (channel && channel.readyState === 'open') {
    channel.send(JSON.stringify(move));
  }
}

function handleRemoteMove(move) {
  if (board[move.index] !== '') return;
  board[move.index] = move.symbol;
  checkResult();
  renderBoard();

  if (gameActive) {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateIndicator();
    statusDiv.innerText = `${currentPlayer}'s turn`;
  }
}

// ====== Init ======
renderBoard();
updateIndicator();
updateScore();
