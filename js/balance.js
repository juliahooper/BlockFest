// Import ethers.js v6 from CDN
import { ethers } from "https://esm.sh/ethers@6.7.0";

// Import contract utilities
import { getContract, formatAddress, formatSETH } from "../js/contract.js";

// ---------------------------------------------------------------------
// Global Variables
// ---------------------------------------------------------------------

let attendeeContract = null;
let countdownInterval = null;
let realTimeListeners = [];

// ---------------------------------------------------------------------
// DOM Element References
// ---------------------------------------------------------------------

const connectAttendeeBtn = document.getElementById('connectAttendeeBtn');
const attendeeInfo = document.getElementById('attendeeInfo');
const attendeeAddress = document.getElementById('attendeeAddress');
const ticketStatus = document.getElementById('ticketStatus');
const sethBalance = document.getElementById('sethBalance');
const groupStatus = document.getElementById('groupStatus');
const groupId = document.getElementById('groupId');
const paidCount = document.getElementById('paidCount');
const totalMembers = document.getElementById('totalMembers');
const countdownTimer = document.getElementById('countdownTimer');
const groupState = document.getElementById('groupState');
const refreshAttendeeBtn = document.getElementById('refreshAttendeeBtn');
const realTimeIndicator = document.getElementById('realTimeIndicator');
const messageArea = document.getElementById('messageArea');

// ---------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------

connectAttendeeBtn.addEventListener('click', connectAttendee);
refreshAttendeeBtn.addEventListener('click', connectAttendee);

// Auto-connect on load if MetaMask is already connected
document.addEventListener('DOMContentLoaded', async () => {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                await connectAttendee();
            }
        } catch (e) {
            console.error('Auto-connect failed:', e);
        }
    }
});

if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            await connectAttendee();
        }
    });
}

// ---------------------------------------------------------------------
// Attendee Logic
// ---------------------------------------------------------------------

async function connectAttendee() {
    console.log('[balance] connectAttendee called');
    try {
        showMessage('Connecting to MetaMask...', 'info');

        const { contract, userAddress, provider } = await getContract();
        attendeeContract = contract;

        // Fetch all attendee data
        const [ticketBalance, sethBalance, account] = await Promise.all([
            contract.balanceOf(userAddress),
            provider.getBalance(userAddress),
            contract.getAccount(userAddress)
        ]);

        let group = null;
        let members = null;
        if (account.groupId > 0) {
            [group, members] = await Promise.all([
                contract.getGroup(account.groupId),
                contract.getGroupMembers(account.groupId)
            ]);
        }

        // Update display
        updateAttendeeDisplay(userAddress, ticketBalance, sethBalance, account, group, members);

        // Set up real-time updates
        setupAttendeeRealTimeUpdates(contract, userAddress);

        showMessage('Connected successfully!', 'success');

    } catch (error) {
        showMessage(`Connection failed: ${error.message}`, 'error');
        console.error('Attendee connection error:', error);
    }
}

function updateAttendeeDisplay(userAddress, ticketBalance, sethBalanceWei, account, group, members) {
    attendeeAddress.textContent = formatAddress(userAddress);
    sethBalance.textContent = formatSETH(sethBalanceWei);

    // Ticket status
    if (ticketBalance >= 1) {
        ticketStatus.textContent = 'YOU HAVE A VALID TICKET';
        ticketStatus.className = 'status-indicator valid';
    } else {
        ticketStatus.textContent = 'NO TICKET';
        ticketStatus.className = 'status-indicator invalid';
    }

    // Group status
    if (account.groupId > 0 && group) {
        groupStatus.classList.remove('hidden');
        groupId.textContent = account.groupId;
        paidCount.textContent = group.paidCount;
        totalMembers.textContent = members ? members.length : 0;
        groupState.textContent = ['None', 'Active', 'Completed', 'Cancelled'][group.state];

        // Start countdown if active
        if (group.state === 1) {
            startCountdown(group.deadline);
        } else {
            clearInterval(countdownInterval);
            countdownTimer.textContent = 'N/A';
        }
    } else {
        groupStatus.classList.add('hidden');
        clearInterval(countdownInterval);
    }

    attendeeInfo.classList.remove('hidden');
}

function setupAttendeeRealTimeUpdates(contract, userAddress) {
    // Clear existing listeners
    cleanupListeners();

    // Listen for transfers involving the user
    const transferFilter = contract.filters.Transfer(null, userAddress);
    const transferListener = (from, to, value, event) => {
        connectAttendee();
    };
    contract.on(transferFilter, transferListener);
    realTimeListeners.push(() => contract.off(transferFilter, transferListener));
}

function startCountdown(deadline) {
    clearInterval(countdownInterval);

    const updateTimer = () => {
        const now = Math.floor(Date.now() / 1000);
        const remaining = deadline - now;

        if (remaining <= 0) {
            countdownTimer.textContent = 'EXPIRED';
            clearInterval(countdownInterval);
            return;
        }

        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        countdownTimer.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

// ---------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------

function showMessage(message, type = 'info') {
    messageArea.textContent = message;
    messageArea.className = `message-area ${type}`;
    messageArea.style.display = message ? 'block' : 'none';
}

function cleanupListeners() {
    realTimeListeners.forEach(cleanup => cleanup());
    realTimeListeners = [];
}
