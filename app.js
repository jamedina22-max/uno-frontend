const ws = new WebSocket('wss://uno-bakend.onrender.com');

// DOM Elements - Screens
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');

// DOM Elements - Lobby
const joinForm = document.getElementById('join-form');
const usernameInput = document.getElementById('username');
const joinBtn = joinForm.querySelector('button');
const waitingRoom = document.getElementById('waiting-room');
const playersList = document.getElementById('players-list');
const playerCount = document.getElementById('player-count');

// DOM Elements - Game Board
const currentTurnEl = document.getElementById('current-turn');
const actionLogEl = document.getElementById('action-log');
const directionIndicator = document.getElementById('direction-indicator');
const discardPileEl = document.getElementById('discard-pile');
const myHandEl = document.getElementById('my-hand');
const drawCardBtn = document.getElementById('draw-card-btn');
const btnUno = document.getElementById('btn-uno');
const btnCorte = document.getElementById('btn-corte');
const opponentsContainer = document.getElementById('opponents-container');

// DOM Elements - Modals
const colorPickerModal = document.getElementById('color-picker-modal');
const alertModal = document.getElementById('alert-modal');
const alertTitle = document.getElementById('alert-title');
const alertMessage = document.getElementById('alert-message');
const alertOkBtn = document.getElementById('alert-ok-btn');
const toastContainer = document.getElementById('toast-container');

// State
let myName = '';
let isMyTurnLocal = false;
let pendingPlayCardIndex = -1;
let savedPlayersList = [];

// --- WEBSOCKET HANDLERS ---

ws.onopen = () => {
    console.log('Connected to server');
};

ws.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data);
    console.log('Received:', type, data);

    switch (type) {
        case 'waitingRoom':
            handleWaitingRoom(data);
            break;
        case 'gameState':
            handleGameState(data);
            break;
        case 'errorMsg':
            alert(data);
            break;
        case 'showPopup':
            showPopup('Penalización', data);
            break;
        case 'gameOver':
            showPopup('Fin del Juego', data, () => {
                // Return to lobby
                lobbyScreen.classList.remove('hidden');
                lobbyScreen.classList.add('active');
                gameScreen.classList.add('hidden');
                gameScreen.classList.remove('active');
                waitingRoom.classList.add('hidden');
                joinBtn.disabled = false;
                usernameInput.disabled = false;
            });
            break;
    }
};

ws.onclose = () => {
    showToast('Desconectado del servidor. Refresca la página.', true);
};

// --- EVENT LISTENERS ---

joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = usernameInput.value.trim();
    if (!name) return;
    
    myName = name;
    ws.send(JSON.stringify({ type: 'joinGame', data: name }));
    
    joinBtn.disabled = true;
    usernameInput.disabled = true;
    waitingRoom.classList.remove('hidden');
});

drawCardBtn.addEventListener('click', () => {
    if (isMyTurnLocal) {
        ws.send(JSON.stringify({ type: 'drawCard' }));
    } else {
        alert('No es tu turno.');
    }
});

btnUno.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'cantarUno' }));
    btnUno.classList.add('hidden'); // Hide after clicking
});

btnCorte.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'cantarCorte' }));
});

alertOkBtn.addEventListener('click', () => {
    alertModal.classList.add('hidden');
    // If it was just a game over or something else, we might not need to resolvePopup
    // But the server expects resolvePopup when showPopup is sent to resume the game.
    // If it's paused, we must resolve.
    ws.send(JSON.stringify({ type: 'resolvePopup' }));
});

// Color picker for wildcards
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const chosenColor = e.target.getAttribute('data-color');
        colorPickerModal.classList.add('hidden');
        if (pendingPlayCardIndex !== -1) {
            ws.send(JSON.stringify({
                type: 'playCard',
                data: { index: pendingPlayCardIndex, chosenColor }
            }));
            pendingPlayCardIndex = -1;
        }
    });
});

// --- RENDER FUNCTIONS ---

function handleWaitingRoom(players) {
    savedPlayersList = players;
    playerCount.textContent = players.length;
    playersList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p;
        playersList.appendChild(li);
    });
}

function handleGameState(state) {
    // Transition to game screen if not already
    if (lobbyScreen.classList.contains('active')) {
        lobbyScreen.classList.remove('active');
        lobbyScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        gameScreen.classList.add('active');
        setupOpponents();
    }

    isMyTurnLocal = state.isMyTurn;

    // Update Board Info
    currentTurnEl.textContent = `Turno de: ${state.currentTurnName}`;
    actionLogEl.textContent = state.log;
    directionIndicator.textContent = state.direction;

    // Highlight current turn opponent
    document.querySelectorAll('.opponent').forEach(el => {
        if (el.dataset.name === state.currentTurnName) {
            el.classList.add('active-turn');
        } else {
            el.classList.remove('active-turn');
        }
    });

    // Render Top Card
    discardPileEl.innerHTML = '';
    if (state.topCard) {
        const topCardEl = createCardElement(state.topCard);
        discardPileEl.appendChild(topCardEl);
    }

    // Render Hand
    myHandEl.innerHTML = '';
    state.hand.forEach((card, index) => {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'card-wrapper';
        if (!state.isMyTurn || state.isPaused) {
            cardWrapper.classList.add('disabled');
        }

        const cardEl = createCardElement(card);
        cardWrapper.appendChild(cardEl);

        cardWrapper.addEventListener('click', () => {
            if (!state.isMyTurn || state.isPaused) return;

            // Check if valid locally to avoid spamming server
            const top = state.topCard;
            const esComodin = card.color === 'Comodín' || card.isComodinReal;
            const esValido = esComodin || card.color === top.color || card.value === top.value;

            if (!esValido) {
                alert('Movimiento inválido. Debe coincidir color o valor.');
                return;
            }

            if (card.color === 'Comodín') {
                pendingPlayCardIndex = index;
                colorPickerModal.classList.remove('hidden');
            } else {
                ws.send(JSON.stringify({
                    type: 'playCard',
                    data: { index, chosenColor: null }
                }));
            }
        });

        myHandEl.appendChild(cardWrapper);
    });

    // Buttons Visibility
    if (state.mostrarBotoneraUno) {
        btnCorte.classList.remove('hidden');
        // If I have 1 card and haven't said UNO, show UNO button
        if (state.hand.length === 1 && !state.dijoUno) {
            btnUno.classList.remove('hidden');
        } else {
            btnUno.classList.add('hidden');
        }
    } else {
        btnUno.classList.add('hidden');
        btnCorte.classList.add('hidden');
    }
}

function setupOpponents() {
    // Basic rendering of opponents based on the initial savedPlayersList
    // Since backend doesn't send opponent hands, we just show names
    const opponents = savedPlayersList.filter(p => p !== myName);
    const slots = ['opp-left', 'opp-top', 'opp-right'];
    
    // Hide all initially
    document.querySelectorAll('.opponent').forEach(el => el.classList.add('hidden'));

    opponents.forEach((opp, i) => {
        if (i < slots.length) {
            const el = document.querySelector(`.opponent-${slots[i].split('-')[1]}`);
            el.classList.remove('hidden');
            el.dataset.name = opp;
            document.getElementById(`${slots[i]}-name`).textContent = opp;
            document.getElementById(`${slots[i]}-cards`).textContent = ''; // Hidden since backend doesn't provide
        }
    });
}

function createCardElement(cardData) {
    const div = document.createElement('div');
    div.className = `card ${cardData.color}`;
    
    // For wildcard that changed color
    if (cardData.isComodinReal) {
        div.className = `card ${cardData.color}`;
        div.innerHTML = `<span>${cardData.value}</span>`;
    } else {
        div.innerHTML = `<span>${cardData.value === 'Bloqueo' ? '⊘' : cardData.value === 'CambioSentido' ? '⇄' : cardData.value}</span>`;
    }
    
    return div;
}

function showPopup(title, message, onClose = null) {
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    alertModal.classList.remove('hidden');
    
    if (onClose) {
        const handler = () => {
            onClose();
            alertOkBtn.removeEventListener('click', handler);
        };
        alertOkBtn.addEventListener('click', handler);
    }
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (isError) toast.style.borderLeftColor = 'var(--danger)';
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse forwards';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}
