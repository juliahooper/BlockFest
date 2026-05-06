// Import ethers.js v6 from CDN
import { ethers } from "https://esm.sh/ethers@6.7.0";

// Import contract utilities
import { getContract, CONTRACT_ADDRESS, formatAddress, formatSETH } from "../js/contract.js";

// ---------------------------------------------------------------------
// Global Variables
// ---------------------------------------------------------------------

let contract = null; // Contract instance
let userAddress = null; // Connected user address
let ticketPrice = 0n; // Ticket price in wei

// ---------------------------------------------------------------------
// DOM Element References
// ---------------------------------------------------------------------

const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const connectWalletBtn = document.getElementById('connectWalletBtn');
const ticketPriceDisplay = document.getElementById('ticketPriceDisplay');
const friendsContainer = document.getElementById('friendsContainer');
const addFriendBtn = document.getElementById('addFriendBtn');
const deadlineHours = document.getElementById('deadlineHours');
const totalCostDisplay = document.getElementById('totalCostDisplay');
const createGroupBtn = document.getElementById('createGroupBtn');
const successPanel = document.getElementById('successPanel');
const createdGroupId = document.getElementById('createdGroupId');
const buyTicketLink = document.getElementById('buyTicketLink');
const etherscanLink = document.getElementById('etherscanLink');
const messageArea = document.getElementById('messageArea');

// ---------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------

/**
 * Initialize the page on load.
 * Attempts silent MetaMask connection and fetches contract data.
 */
async function init() {
    // Set up event listeners first so buttons always work
    setupEventListeners();

    try {
        // Try silent connection
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                await connectWallet();
            }
        }

        // Fetch ticket price even without connection
        await fetchTicketPrice();

    } catch (error) {
        console.error('Initialization error:', error);
    }
}

// Run init when page loads
document.addEventListener('DOMContentLoaded', init);

// ---------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------

function setupEventListeners() {
    connectWalletBtn.addEventListener('click', connectWallet);
    addFriendBtn.addEventListener('click', addFriendField);
    createGroupBtn.addEventListener('click', createGroup);

    // Listen for account changes
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length > 0) {
                await connectWallet();
            } else {
                disconnectWallet();
            }
        });
    }

    // Update total cost when deadline changes
    deadlineHours.addEventListener('input', updateTotalCost);
}

// ---------------------------------------------------------------------
// Wallet Connection Functions
// ---------------------------------------------------------------------

/**
 * Connects to MetaMask and initializes contract connection.
 * Updates UI to show connected status and enables group creation.
 */
async function connectWallet() {
    console.log('[group] connectWallet called');
    try {
        showMessage('Connecting to MetaMask...', 'info');

        const { contract: contractInstance, userAddress: address } = await getContract();
        contract = contractInstance;
        userAddress = address;

        // Update connection status
        statusText.textContent = `Connected: ${formatAddress(userAddress)}`;
        connectWalletBtn.style.display = 'none';

        // Enable create group button
        createGroupBtn.disabled = false;

        // Fetch ticket price
        await fetchTicketPrice();

        showMessage('Wallet connected successfully!', 'success');

    } catch (error) {
        showMessage(`Connection failed: ${error.message}`, 'error');
        console.error('Wallet connection error:', error);
    }
}

/**
 * Disconnects wallet when accounts change.
 */
function disconnectWallet() {
    contract = null;
    userAddress = null;
    statusText.textContent = 'Not Connected';
    connectWalletBtn.style.display = 'inline-block';
    createGroupBtn.disabled = true;
    showMessage('Wallet disconnected.', 'info');
}

/**
 * Fetches ticket price from contract and updates display.
 */
async function fetchTicketPrice() {
    try {
        if (!contract) {
            // Try to create a read-only contract for price fetching
            const provider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
            const readOnlyContract = new ethers.Contract(
                CONTRACT_ADDRESS,
                [
                    {"type": "function", "name": "ticketPrice", "inputs": [], "outputs": [{"type": "uint256"}], "stateMutability": "view"}
                ],
                provider
            );
            ticketPrice = await readOnlyContract.ticketPrice();
        } else {
            ticketPrice = await contract.ticketPrice();
        }

        ticketPriceDisplay.textContent = formatSETH(ticketPrice);
        updateTotalCost();

        try {
            let available;
            if (!contract) {
                const provider = new ethers.JsonRpcProvider(
                    'https://rpc.sepolia.org');
                const readOnlyContract = new ethers.Contract(
                    CONTRACT_ADDRESS,
                    [{"type": "function", "name":
                    "availableTickets", "inputs": [],
                    "outputs": [{"type": "uint256"}],
                    "stateMutability": "view"}],
                    provider
                );
                available = await readOnlyContract.availableTickets();
            } else {
                available = await contract.availableTickets();
            }
            const availableDisplay = document.getElementById(
                'availableTicketsDisplay');
            if (availableDisplay) {
                availableDisplay.textContent =
                    available.toString() + ' tickets remaining';
            }
        } catch (e) {
            console.warn('Could not fetch available tickets:', e);
        }

    } catch (error) {
        ticketPriceDisplay.textContent = 'Error loading price';
        console.error('Error fetching ticket price:', error);
    }
}

// ---------------------------------------------------------------------
// Friend Management Functions
// ---------------------------------------------------------------------

/**
 * Adds a new friend address input field.
 * Maximum of 3 friends (4 total including creator).
 */
function addFriendField() {
    const friendFields = friendsContainer.querySelectorAll('.friend-field');
    if (friendFields.length >= 3) return; // Max 3 friends

    const friendField = document.createElement('div');
    friendField.className = 'friend-field';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = "Friend's wallet address";
    input.className = 'friend-input';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-friend-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeFriendField(removeBtn));

    friendField.appendChild(input);
    friendField.appendChild(removeBtn);
    friendsContainer.appendChild(friendField);

    updateTotalCost();

    // Disable add button if at max
    if (friendsContainer.querySelectorAll('.friend-field').length >= 3) {
        addFriendBtn.disabled = true;
    }
}

/**
 * Removes a friend address input field.
 */
function removeFriendField(button) {
    const friendField = button.parentElement;
    friendField.remove();
    updateTotalCost();

    // Re-enable add button if below max
    if (friendsContainer.querySelectorAll('.friend-field').length < 3) {
        addFriendBtn.disabled = false;
    }
}

/**
 * Updates the total cost display based on current group size.
 */
function updateTotalCost() {
    const friendCount = friendsContainer.querySelectorAll('.friend-field').length;
    const groupSize = friendCount + 1; // +1 for creator
    const totalCost = ticketPrice * BigInt(groupSize);
    totalCostDisplay.textContent = formatSETH(totalCost);
}

// ---------------------------------------------------------------------
// Group Creation Function
// ---------------------------------------------------------------------

/**
 * Creates a new group with the specified friends and deadline.
 * Handles comprehensive validation and transaction management.
 */
async function createGroup() {
    try {
        if (!contract || !userAddress) {
            throw new Error('Please connect your MetaMask wallet first.');
        }

        showMessage('Validating group details...', 'info');

        // Collect friend addresses
        const friendInputs = friendsContainer.querySelectorAll('.friend-input');
        const members = [];
        const errors = [];

        for (let i = 0; i < friendInputs.length; i++) {
            const address = friendInputs[i].value.trim();

            if (!address) {
                errors.push(`Friend ${i + 1}: Address cannot be empty`);
                continue;
            }

            if (!ethers.isAddress(address)) {
                errors.push(`Friend ${i + 1}: Invalid Ethereum address format`);
                continue;
            }

            if (address.toLowerCase() === userAddress.toLowerCase()) {
                errors.push(`Friend ${i + 1}: Cannot add yourself as a friend`);
                continue;
            }

            if (members.some(m => m.toLowerCase() === address.toLowerCase())) {
                errors.push(`Friend ${i + 1}: Duplicate address`);
                continue;
            }

            members.push(address);
        }

        // Validate deadline
        const deadline = parseInt(deadlineHours.value);
        if (isNaN(deadline) || deadline < 1 || deadline > 168) {
            errors.push('Deadline must be between 1 and 168 hours');
        }

        // Show all validation errors
        if (errors.length > 0) {
            throw new Error('Validation errors:\n' + errors.join('\n'));
        }

        // Show pending state
        createGroupBtn.disabled = true;
        createGroupBtn.textContent = 'Creating Group...';

        showMessage('Submitting transaction...', 'info');

        // Call contract function
        const tx = await contract.createGroup(members, deadline);
        showMessage('Transaction submitted. Waiting for confirmation...', 'info');

        // Wait for confirmation
        const receipt = await tx.wait();

        // Parse GroupCreated event
        const groupCreatedEvent = receipt.logs.find(log => {
            try {
                const parsed = contract.interface.parseLog(log);
                return parsed.name === 'GroupCreated';
            } catch {
                return false;
            }
        });

        if (!groupCreatedEvent) {
            throw new Error('Group creation event not found in transaction receipt');
        }

        const parsedEvent = contract.interface.parseLog(groupCreatedEvent);
        const groupId = parsedEvent.args.groupId;

        // Show success
        showSuccess(groupId, tx.hash);

    } catch (error) {
        const friendlyError = parseContractError(error);
        showMessage(`Group creation failed: ${friendlyError}`, 'error');
        console.error('Group creation error:', error);
    } finally {
        // Reset button state
        createGroupBtn.disabled = false;
        createGroupBtn.textContent = 'Create Group';
    }
}

/**
 * Shows the success panel with group details.
 */
function showSuccess(groupId, txHash) {
    createdGroupId.textContent = groupId;
    buyTicketLink.href = `buy.html?groupId=${groupId}`;
    etherscanLink.href = `https://sepolia.etherscan.io/tx/${txHash}`;

    successPanel.classList.remove('hidden');
    document.getElementById('groupForm').style.display = 'none';

    showMessage('Group created successfully!', 'success');
}

/**
 * Parses contract errors into user-friendly messages.
 */
function parseContractError(error) {
    if (error.code === 4001) {
        return 'Transaction rejected by user.';
    }

    if (error.code === 4902) {
        return 'Please add the Sepolia test network to MetaMask.';
    }

    if (error.message.includes('network')) {
        return 'Please switch MetaMask to the Sepolia test network.';
    }

    // Try to parse contract revert reasons
    if (error.data) {
        try {
            // Decode error data if available
            const decoded = contract.interface.parseError(error.data);
            if (decoded) {
                return decoded.name + ': ' + decoded.args.join(', ');
            }
        } catch {
            // Ignore parsing errors
        }
    }

    // Common contract error patterns
    const message = error.message || error.toString();
    if (message.includes('Group must have at least one other member')) {
        return 'You must add at least one friend to create a group.';
    }
    if (message.includes('Group size exceeds maximum')) {
        return 'Maximum group size is 4 members (including you).';
    }
    if (message.includes('Deadline must be at least 1 hour')) {
        return 'Deadline must be at least 1 hour.';
    }
    if (message.includes('Deadline cannot exceed 168 hours')) {
        return 'Deadline cannot exceed 168 hours (1 week).';
    }
    if (message.includes('You are already in an active group')) {
        return 'You are already a member of an active group.';
    }
    if (message.includes('You already own a ticket')) {
        return 'You already own a ticket.';
    }
    if (message.includes('A member is already in an active group')) {
        return 'One of your friends is already in an active group.';
    }
    if (message.includes('A member already owns a ticket')) {
        return 'One of your friends already owns a ticket.';
    }

    return message;
}

// ---------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------

/**
 * Displays a message to the user in the message area.
 */
function showMessage(message, type = 'info') {
    messageArea.textContent = message;
    messageArea.className = `message-area ${type}`;
    messageArea.style.display = message ? 'block' : 'none';
}