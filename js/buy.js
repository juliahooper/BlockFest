// Import ethers.js v6 from CDN
import { ethers } from "https://esm.sh/ethers@6.7.0";

// Import contract utilities
import { getContract, CONTRACT_ADDRESS, CONTRACT_ABI, formatAddress, formatSETH } from "../js/contract.js";

// ---------------------------------------------------------------------
// Global Variables
// ---------------------------------------------------------------------

let contract = null; // Contract instance
let userAddress = null; // Connected user address
let ticketPrice = 0n; // Ticket price in wei
let currentGroupId = null; // Current loaded group ID
let currentGroup = null; // Current group data
let groupMembers = []; // Current group members
let countdownInterval = null; // Countdown timer interval

// ---------------------------------------------------------------------
// DOM Element References
// ---------------------------------------------------------------------

const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const connectWalletBtn = document.getElementById('connectWalletBtn');
const soloToggle = document.getElementById('soloToggle');
const groupToggle = document.getElementById('groupToggle');
const soloSection = document.getElementById('soloSection');
const groupSection = document.getElementById('groupSection');
const groupIdInput = document.getElementById('groupIdInput');
const loadGroupBtn = document.getElementById('loadGroupBtn');
const groupDetails = document.getElementById('groupDetails');
const displayGroupId = document.getElementById('displayGroupId');
const paidCount = document.getElementById('paidCount');
const totalMembers = document.getElementById('totalMembers');
const countdownTimer = document.getElementById('countdownTimer');
const ticketPriceDisplay = document.getElementById('ticketPrice');
const groupState = document.getElementById('groupState');
const memberList = document.getElementById('memberList');
const purchaseSection = document.getElementById('purchaseSection');
const amountToPay = document.getElementById('amountToPay');
const buyTicketBtn = document.getElementById('buyTicketBtn');
const transactionStatus = document.getElementById('transactionStatus');
const successPanel = document.getElementById('successPanel');
const successMessage = document.getElementById('successMessage');
const ticketBalance = document.getElementById('ticketBalance');
const finalGroupStatus = document.getElementById('finalGroupStatus');
const etherscanLink = document.getElementById('etherscanLink');
const messageArea = document.getElementById('messageArea');
const buySoloBtn = document.getElementById('buySoloBtn');
const soloTransactionStatus = document.getElementById('soloTransactionStatus');

// ---------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------

/**
 * Initialize the page on load.
 * Checks for groupId URL parameter and auto-loads if present.
 * Attempts silent MetaMask connection.
 */
async function init() {
    // Set up event listeners first so buttons always work
    setupEventListeners();

    try {
        // Check URL for groupId parameter
        const urlParams = new URLSearchParams(window.location.search);
        const groupIdParam = urlParams.get('groupId');
        if (groupIdParam) {
            const groupId = parseInt(groupIdParam);
            if (groupId > 0) {
                groupIdInput.value = groupId;
                await loadGroup();
            }
        }

        // Try silent connection
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                await connectWallet();
            }
        }

        await fetchSoloDisplayData();

    } catch (error) {
        console.error('Initialization error:', error);
    }
}

/**
 * Fetches ticket price and availability via a read-only provider so the
 * solo card populates without requiring MetaMask to be connected.
 */
async function fetchSoloDisplayData() {
    try {
        let available;

        if (contract) {
            ticketPrice = await contract.ticketPrice();
            available = await contract.availableTickets();
        } else {
            const provider = new ethers.JsonRpcProvider(
                'https://rpc.sepolia.org');
            const readOnly = new ethers.Contract(
                CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            ticketPrice = await readOnly.ticketPrice();
            available = await readOnly.availableTickets();
        }

        const soloPrice = document.getElementById('soloTicketPrice');
        const soloAvail = document.getElementById('soloAvailableTickets');

        if (soloPrice) soloPrice.textContent = formatSETH(ticketPrice) + ' SETH';
        if (soloAvail) soloAvail.textContent = available.toString() + ' remaining';

    } catch (e) {
        console.warn('Could not fetch solo data:', e);
    }
}

// Run init when page loads
document.addEventListener('DOMContentLoaded', init);

// ---------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------

function setupEventListeners() {
    connectWalletBtn.addEventListener('click', connectWallet);
    loadGroupBtn.addEventListener('click', loadGroup);
    buyTicketBtn.addEventListener('click', buyTicket);
    if (buySoloBtn) buySoloBtn.addEventListener('click', buySolo);

    soloToggle.addEventListener('click', () => {
        soloToggle.classList.add('active');
        groupToggle.classList.remove('active');
        if (soloSection) soloSection.classList.remove('hidden');
        if (groupSection) groupSection.classList.add('hidden');
    });

    groupToggle.addEventListener('click', () => {
        groupToggle.classList.add('active');
        soloToggle.classList.remove('active');
        if (groupSection) groupSection.classList.remove('hidden');
        if (soloSection) soloSection.classList.add('hidden');
    });

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
}

// ---------------------------------------------------------------------
// Wallet Connection Functions
// ---------------------------------------------------------------------

/**
 * Connects to MetaMask and initializes contract connection.
 * Updates UI and reloads group data if a group is currently loaded.
 */
async function connectWallet() {
    console.log('[buy] connectWallet called');
    try {
        showMessage('Connecting to MetaMask...', 'info');

        const { contract: contractInstance, userAddress: address } = await getContract();
        contract = contractInstance;
        userAddress = address;

        // Update connection status
        statusText.textContent = `Connected: ${formatAddress(userAddress)}`;
        connectWalletBtn.style.display = 'none';

        // Reload group data if a group is loaded
        if (currentGroupId) {
            await loadGroup();
        }

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
    purchaseSection.classList.add('hidden');
    showMessage('Wallet disconnected.', 'info');
}

// ---------------------------------------------------------------------
// Group Loading Functions
// ---------------------------------------------------------------------

/**
 * Loads group data from the contract.
 * Can work with or without MetaMask connection (read-only mode).
 */
async function loadGroup() {
    try {
        const groupId = parseInt(groupIdInput.value);
        if (!groupId || groupId <= 0) {
            throw new Error('Please enter a valid Group ID.');
        }

        showMessage('Loading group...', 'info');

        // Create contract instance (read-only if not connected)
        let contractInstance;
        if (contract) {
            contractInstance = contract;
        } else {
            const provider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
            contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        }

        // Fetch group data
        const [group, members] = await Promise.all([
            contractInstance.getGroup(groupId),
            contractInstance.getGroupMembers(groupId)
        ]);

        // Fetch ticket price
        ticketPrice = await contractInstance.ticketPrice();

        const available = await contractInstance.availableTickets();
        const availableDisplay = document.getElementById(
            'availableTicketsDisplay');
        if (availableDisplay) {
            availableDisplay.textContent =
                available.toString() + ' tickets remaining';
        }

        // Validate group exists
        if (group.creator === ethers.ZeroAddress) {
            throw new Error('Group does not exist.');
        }

        // Check group state
        const now = Math.floor(Date.now() / 1000);
        const isExpired = now > group.deadline;
        const isCompleted = group.state === 2; // Completed
        const isActive = group.state === 1; // Active

        if (isCompleted) {
            throw new Error('This group is already complete.');
        }

        if (isExpired && !isActive) {
            throw new Error('This group has expired.');
        }

        // Store current group data
        currentGroupId = groupId;
        currentGroup = group;
        groupMembers = members;

        // Display group details
        await displayGroupDetails(group, members);

        // Start countdown if active
        if (isActive) {
            startCountdown(group.deadline);
        }

        // Set up real-time updates
        setupRealTimeUpdates(contractInstance, groupId);

        // Check user status for purchase section
        await checkUserPurchaseStatus();

        showMessage('Group loaded successfully!', 'success');

    } catch (error) {
        showMessage(`Failed to load group: ${error.message}`, 'error');
        console.error('Group loading error:', error);
    }
}

/**
 * Displays group details in the UI.
 * Shows member list with payment status.
 */
async function displayGroupDetails(group, members) {
    displayGroupId.textContent = currentGroupId;
    totalMembers.textContent = members.length;
    paidCount.textContent = group.paidCount;
    ticketPriceDisplay.textContent = formatSETH(ticketPrice);

    // Group state
    const stateNames = ['None', 'Active', 'Completed', 'Cancelled'];
    groupState.textContent = stateNames[group.state];

    // Member list
    memberList.innerHTML = '';
    for (const member of members) {
        const li = document.createElement('li');
        li.className = 'member-item';

        const addressSpan = document.createElement('span');
        addressSpan.textContent = formatAddress(member);
        li.appendChild(addressSpan);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'member-status';

        try {
            // Check payment status
            let account;
            if (contract) {
                account = await contract.getAccount(member);
            } else {
                const provider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
                const readOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
                account = await readOnlyContract.getAccount(member);
            }

            if (account.escrowBalance >= ticketPrice) {
                statusSpan.textContent = 'Paid';
                statusSpan.className += ' paid';
            } else {
                statusSpan.textContent = 'Unpaid';
                statusSpan.className += ' unpaid';
            }
        } catch (error) {
            statusSpan.textContent = 'Unknown';
        }

        li.appendChild(statusSpan);
        memberList.appendChild(li);
    }

    groupDetails.classList.remove('hidden');
}

/**
 * Sets up real-time event listeners for group updates.
 */
function setupRealTimeUpdates(contractInstance, groupId) {
    // Clear existing listeners if any
    // Note: In a full implementation, you'd track and clean up listeners

    // Listen for MemberJoined events for this group
    if (contractInstance.listenerCount && contractInstance.listenerCount('MemberJoined') === 0) {
        contractInstance.on('MemberJoined', (eventGroupId, member, paidCount) => {
            if (eventGroupId === groupId) {
                // Refresh group data
                loadGroup();
            }
        });
    }
}

/**
 * Checks if the connected user can purchase a ticket for this group.
 */
async function checkUserPurchaseStatus() {
    if (!userAddress || !currentGroupId) return;

    try {
        // Check if user is a member
        const isMember = groupMembers.some(member => member.toLowerCase() === userAddress.toLowerCase());
        if (!isMember) {
            purchaseSection.classList.add('hidden');
            return;
        }

        // Check if user has already paid
        const account = await contract.getAccount(userAddress);
        const hasPaid = account.escrowBalance >= ticketPrice;

        if (hasPaid) {
            purchaseSection.classList.add('hidden');
            showMessage('You have already purchased a ticket for this group.', 'info');
            return;
        }

        // Check if group is still active
        const now = Math.floor(Date.now() / 1000);
        if (now > currentGroup.deadline) {
            purchaseSection.classList.add('hidden');
            showMessage('This group has expired.', 'error');
            return;
        }

        // Show purchase section
        amountToPay.textContent = formatSETH(ticketPrice);
        purchaseSection.classList.remove('hidden');

    } catch (error) {
        console.error('Error checking user status:', error);
    }
}

// ---------------------------------------------------------------------
// Ticket Purchase Function
// ---------------------------------------------------------------------

/**
 * Handles the ticket purchase transaction.
 * Comprehensive validation and state management for the purchase flow.
 */
async function buyTicket() {
    try {
        if (!contract || !userAddress) {
            throw new Error('Please connect your MetaMask wallet first.');
        }

        if (!currentGroupId) {
            throw new Error('Please load a group first.');
        }

        // Re-validate user status
        const account = await contract.getAccount(userAddress);
        const isMember = groupMembers.some(member => member.toLowerCase() === userAddress.toLowerCase());
        const hasPaid = account.escrowBalance >= ticketPrice;
        const now = Math.floor(Date.now() / 1000);
        const isExpired = now > currentGroup.deadline;

        if (!isMember) {
            throw new Error('You are not a member of this group.');
        }

        if (hasPaid) {
            throw new Error('You have already paid for this group.');
        }

        if (isExpired) {
            throw new Error('Group deadline has already passed.');
        }

        if (currentGroup.state !== 1) {
            throw new Error('Group is not active.');
        }

        // Show pending state
        buyTicketBtn.disabled = true;
        buyTicketBtn.textContent = 'Processing...';
        transactionStatus.textContent = 'Preparing transaction...';

        // Call contract function
        const tx = await contract.joinGroup(currentGroupId, { value: ticketPrice });
        transactionStatus.textContent = 'Transaction submitted. Waiting for confirmation...';

        // Wait for confirmation
        const receipt = await tx.wait();

        // Check final group state
        const finalGroup = await contract.getGroup(currentGroupId);
        const isGroupComplete = finalGroup.state === 2;

        // Fetch user's ticket balance
        const userTicketBalance = await contract.balanceOf(userAddress);

        // Show success
        showPurchaseSuccess(userTicketBalance, isGroupComplete, tx.hash);

    } catch (error) {
        const friendlyError = parseContractError(error);
        showMessage(`Purchase failed: ${friendlyError}`, 'error');
        transactionStatus.textContent = '';
        console.error('Purchase error:', error);
    } finally {
        // Reset button state
        buyTicketBtn.disabled = false;
        buyTicketBtn.textContent = 'Buy Ticket';
    }
}

/**
 * Handles solo ticket purchase: creates a single-member group then joins it.
 */
async function buySolo() {
    console.log('buySolo called');
    console.log('contract:', contract);
    console.log('userAddress:', userAddress);
    console.log('ticketPrice:', ticketPrice);

    // Change 3: Network check
    if (!window.ethereum) {
        showMessage('MetaMask not detected. Please install MetaMask.', 'error');
        return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    console.log('Current network:', network.chainId.toString());

    if (network.chainId !== 11155111n) {
        showMessage('Wrong network. Please switch MetaMask to Sepolia.', 'error');
        return;
    }

    if (!contract || !userAddress) {
        showMessage('Please connect your MetaMask wallet first.', 'error');
        return;
    }

    console.log('Sending with value:', ticketPrice.toString());

    buySoloBtn.disabled = true;
    buySoloBtn.textContent = 'Processing...';
    soloTransactionStatus.textContent = 'Creating solo group...';
    soloTransactionStatus.style.color = '';

    try {
        // Step 1: Create a solo group with only this user as member
        const createTx = await contract.createGroup([], 1);
        console.log('createGroup tx sent:', createTx.hash);
        soloTransactionStatus.textContent = 'Group creation submitted. Waiting for confirmation...';

        const createReceipt = await createTx.wait();
        console.log('createGroup confirmed:', createReceipt);

        // Parse groupId from receipt logs
        let soloGroupId;
        for (const log of createReceipt.logs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (parsed && parsed.name === 'GroupCreated') {
                    soloGroupId = parsed.args.groupId;
                    break;
                }
            } catch {}
        }

        if (!soloGroupId) {
            throw new Error('Could not parse group ID from transaction receipt.');
        }

        console.log('soloGroupId:', soloGroupId.toString());
        soloTransactionStatus.textContent = `Group created (ID: ${soloGroupId}). Purchasing ticket...`;

        // Step 2: Join the group to purchase the ticket
        const joinTx = await contract.joinGroup(soloGroupId, { value: ticketPrice });
        console.log('joinGroup tx sent:', joinTx.hash);
        soloTransactionStatus.textContent = 'Ticket purchase submitted. Waiting for confirmation...';

        await joinTx.wait();

        soloTransactionStatus.textContent = 'Ticket purchased successfully!';
        soloTransactionStatus.style.color = 'var(--color-accent-2)';
        showMessage('Solo ticket purchased successfully!', 'success');

    } catch (error) {
        console.error('buySolo error:', error);
        console.error('error code:', error.code);
        console.error('error message:', error.message);
        console.error('error data:', error.data);

        const friendly = parseContractError(error);
        soloTransactionStatus.textContent = friendly;
        soloTransactionStatus.style.color = 'var(--color-danger)';
        showMessage(`Purchase failed: ${friendly}`, 'error');
    } finally {
        buySoloBtn.disabled = false;
        buySoloBtn.textContent = 'Buy Ticket Now';
    }
}

/**
 * Shows the purchase success panel.
 */
function showPurchaseSuccess(userTicketBalance, isGroupComplete, txHash) {
    if (isGroupComplete) {
        successMessage.textContent = 'Your group is complete! All tickets confirmed.';
    } else {
        successMessage.textContent = 'Ticket purchased successfully!';
    }

    ticketBalance.textContent = userTicketBalance.toString();
    finalGroupStatus.textContent = isGroupComplete ? 'Complete' : 'Active';
    etherscanLink.href = `https://sepolia.etherscan.io/tx/${txHash}`;

    successPanel.classList.remove('hidden');
    purchaseSection.classList.add('hidden');

    showMessage('Purchase completed successfully!', 'success');
}

// ---------------------------------------------------------------------
// Countdown Timer Function
// ---------------------------------------------------------------------

/**
 * Starts a countdown timer for active groups.
 * Updates every second until deadline.
 */
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
// Error Parsing Function
// ---------------------------------------------------------------------

/**
 * Parses contract errors into user-friendly messages.
 */
function parseContractError(error) {
    // User rejected in MetaMask — ethers v6 uses ACTION_REJECTED, v5 uses 4001
    if (
        error.code === 'ACTION_REJECTED' ||
        error.code === 4001 ||
        error.reason === 'rejected' ||
        error.info?.error?.code === 4001
    ) {
        return 'Transaction cancelled.';
    }

    if (error.code === 4902 || error.info?.error?.code === 4902) {
        return 'Please add the Sepolia network to MetaMask.';
    }

    const message = error.message || error.toString();

    if (message.includes('network') || message.includes('chain')) {
        return 'Wrong network — please switch MetaMask to Sepolia.';
    }
    if (error.code === 'BAD_DATA' || message.includes('could not decode result data')) {
        return 'Could not reach the contract — make sure MetaMask is on Sepolia.';
    }
    if (message.includes('Group does not exist')) {
        return 'This group does not exist.';
    }
    if (message.includes('Group is not active')) {
        return 'This group is not active.';
    }
    if (message.includes('You are not a member of this group')) {
        return 'You are not a member of this group.';
    }
    if (message.includes('You have already paid for this group')) {
        return 'You have already paid for this group.';
    }
    if (message.includes('Group deadline has already passed')) {
        return 'This group has expired.';
    }
    if (message.includes('Must send exact ticket price in SETH')) {
        return 'Incorrect payment amount — please try again.';
    }
    if (message.includes('Not enough tickets available')) {
        return 'Not enough tickets available.';
    }
    if (message.includes('already in an active group')) {
        return 'You are already in an active group.';
    }
    if (message.includes('already own a ticket')) {
        return 'You already own a ticket.';
    }

    return 'Something went wrong. Please try again.';
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