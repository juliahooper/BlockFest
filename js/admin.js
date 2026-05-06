// Import ethers.js v6 from CDN
import { ethers } from "https://esm.sh/ethers@6.7.0";

// Import contract utilities
import { getContract, formatAddress, formatSETH } from "../js/contract.js";

// ---------------------------------------------------------------------
// Global Variables
// ---------------------------------------------------------------------

let contract = null; // Contract instance
let userAddress = null; // Connected user address
let provider = null; // Provider for queries
let realTimeEnabled = true; // Real-time updates enabled by default
let eventListeners = []; // Array to track event listeners for cleanup

// ---------------------------------------------------------------------
// DOM Element References
// ---------------------------------------------------------------------

const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const connectWalletBtn = document.getElementById('connectWalletBtn');
const ownershipIndicator = document.getElementById('ownershipIndicator');
const statsDashboard = document.getElementById('statsDashboard');
const totalSupply = document.getElementById('totalSupply');
const totalSold = document.getElementById('totalSold');
const totalEscrow = document.getElementById('totalEscrow');
const totalReceived = document.getElementById('totalReceived');
const activeGroups = document.getElementById('activeGroups');
const completedGroups = document.getElementById('completedGroups');
const cancelledGroups = document.getElementById('cancelledGroups');
const ticketsReturned = document.getElementById('ticketsReturned');
const groupsSection = document.getElementById('groupsSection');
const groupsTableBody = document.getElementById('groupsTableBody');
const chainSection = document.getElementById('chainSection');
const chainLengthDisplay = document.getElementById('chainLengthDisplay');
const chainIntegrity = document.getElementById('chainIntegrity');
const verifyChainBtn = document.getElementById('verifyChainBtn');
const chainTableBody = document.getElementById('chainTableBody');
const controls = document.getElementById('controls');
const realTimeToggle = document.getElementById('realTimeToggle');
const withdrawFundsBtn = document.getElementById('withdrawFundsBtn');
const withdrawStatus = document.getElementById('withdrawStatus');
const messageArea = document.getElementById('messageArea');

// ---------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------

/**
 * Initialize the page on load.
 * Attempts silent MetaMask connection.
 */
async function init() {
    try {
        // Try silent connection
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                await connectWallet();
            }
        }

        // Set up event listeners
        setupEventListeners();

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
    realTimeToggle.addEventListener('change', toggleRealTime);
    withdrawFundsBtn.addEventListener('click', withdrawFunds);
    verifyChainBtn.addEventListener('click', verifyChainIntegrity);

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
 * Connects to MetaMask and verifies ownership.
 * Only allows access if user is the contract owner.
 */
async function connectWallet() {
    try {
        showMessage('Connecting to MetaMask...', 'info');

        const { contract: contractInstance, userAddress: address } = await getContract();
        contract = contractInstance;
        userAddress = address;
        provider = contract.runner.provider;

        // Verify ownership on-chain
        // We check ownership directly from the contract rather than trusting client-side data
        // This ensures only the true contract owner can access the admin panel
        const owner = await contract.owner();
        if (userAddress.toLowerCase() !== owner.toLowerCase()) {
            throw new Error('Access denied: You are not the contract owner.');
        }

        // Update connection status
        statusText.textContent = `Connected: ${formatAddress(userAddress)}`;
        connectWalletBtn.style.display = 'none';

        // Show ownership verified
        ownershipIndicator.classList.remove('hidden');

        // Load dashboard data
        await loadDashboard();

        // Show dashboard and controls
        statsDashboard.classList.remove('hidden');
        groupsSection.classList.remove('hidden');
        chainSection.classList.remove('hidden');
        controls.classList.remove('hidden');

        // Set up real-time updates
        if (realTimeEnabled) {
            setupRealTimeUpdates();
        }

        showMessage('Admin access granted!', 'success');

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
    provider = null;
    statusText.textContent = 'Not Connected';
    connectWalletBtn.style.display = 'inline-block';
    ownershipIndicator.classList.add('hidden');
    statsDashboard.classList.add('hidden');
    groupsSection.classList.add('hidden');
    chainSection.classList.add('hidden');
    controls.classList.add('hidden');
    showMessage('Wallet disconnected.', 'info');
    cleanupEventListeners();
}

// ---------------------------------------------------------------------
// Dashboard Loading Functions
// ---------------------------------------------------------------------

/**
 * Loads all dashboard data and populates the UI.
 */
async function loadDashboard() {
    try {
        showMessage('Loading dashboard data...', 'info');

        // Fetch basic contract data
        const supply = await contract.totalSupply();
        const ticketPrice = await contract.ticketPrice();
        const nextGroupId = await contract.nextGroupId();

        // Initialize counters
        let activeCount = 0;
        let completedCount = 0;
        let cancelledCount = 0;
        let totalEscrowAmount = 0n;
        let totalReceivedAmount = 0n;
        let totalSoldCount = 0;
        const groups = [];

        // Loop through all groups
        for (let groupId = 1; groupId < nextGroupId; groupId++) {
            const group = await contract.getGroup(groupId);
            const members = await contract.getGroupMembers(groupId);

            // Categorize groups
            if (group.state === 1) activeCount++;
            else if (group.state === 2) completedCount++;
            else if (group.state === 3) cancelledCount++;

            // Calculate escrow for active groups
            if (group.state === 1) {
                for (const member of members) {
                    const account = await contract.getAccount(member);
                    totalEscrowAmount += account.escrowBalance;
                }
            }

            // Calculate received for completed groups
            if (group.state === 2) {
                totalReceivedAmount += ticketPrice * BigInt(group.paidCount);
                totalSoldCount += group.paidCount;
            }

            // Store group data for table
            groups.push({
                id: groupId,
                group,
                members
            });
        }

        // Query TicketReturned events to count returns
        const returnEvents = await contract.queryFilter('TicketReturned', 0, 'latest');
        const totalReturns = returnEvents.length;

        // Update stat cards
        totalSupply.textContent = supply.toString();
        totalSold.textContent = totalSoldCount.toString();
        totalEscrow.textContent = formatSETH(totalEscrowAmount);
        totalReceived.textContent = formatSETH(totalReceivedAmount);
        activeGroups.textContent = activeCount.toString();
        completedGroups.textContent = completedCount.toString();
        cancelledGroups.textContent = cancelledCount.toString();
        ticketsReturned.textContent = totalReturns.toString();

        // Populate groups table
        await populateGroupsTable(groups, ticketPrice);

        // Load chain explorer
        await loadChain();

        showMessage('Dashboard loaded successfully!', 'success');

    } catch (error) {
        showMessage(`Failed to load dashboard: ${error.message}`, 'error');
        console.error('Dashboard loading error:', error);
    }
}

/**
 * Populates the groups table with group data.
 */
async function populateGroupsTable(groups, ticketPrice) {
    groupsTableBody.innerHTML = '';

    for (const { id, group, members } of groups) {
        const row = document.createElement('tr');

        // Group ID
        const idCell = document.createElement('td');
        idCell.textContent = id;
        row.appendChild(idCell);

        // Creator
        const creatorCell = document.createElement('td');
        creatorCell.textContent = formatAddress(group.creator);
        row.appendChild(creatorCell);

        // Members count
        const membersCell = document.createElement('td');
        membersCell.textContent = members.length;
        row.appendChild(membersCell);

        // Paid count
        const paidCell = document.createElement('td');
        paidCell.textContent = group.paidCount;
        row.appendChild(paidCell);

        // Deadline
        const deadlineCell = document.createElement('td');
        const deadlineDate = new Date(Number(group.deadline) * 1000);
        deadlineCell.textContent = deadlineDate.toLocaleString();
        row.appendChild(deadlineCell);

        // Status
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = 'status-badge';

        let statusText = '';
        let statusClass = '';
        if (group.state === 1) {
            statusText = 'Active';
            statusClass = 'active';
        } else if (group.state === 2) {
            statusText = 'Completed';
            statusClass = 'completed';
        } else if (group.state === 3) {
            statusText = 'Cancelled';
            statusClass = 'cancelled';
        }

        statusBadge.textContent = statusText;
        statusBadge.classList.add(statusClass);
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);

        // Escrow
        const escrowCell = document.createElement('td');
        let escrowAmount = 0n;
        if (group.state === 1) {
            const ticketPrice = await contract.ticketPrice();
            escrowAmount = ticketPrice * BigInt(group.paidCount);
        }
        escrowCell.textContent = formatSETH(escrowAmount);
        row.appendChild(escrowCell);

        groupsTableBody.appendChild(row);
    }
}

// ---------------------------------------------------------------------
// Chain Explorer Functions
// ---------------------------------------------------------------------

/**
 * Loads the on-chain block data and populates the chain explorer table.
 * Fetches chainLength, then retrieves each block via getChainBlock().
 * The genesis block (index 0) is labelled differently from confirmed group blocks.
 */
async function loadChain() {
    try {
        const length = await contract.chainLength();
        chainLengthDisplay.textContent = length.toString();

        chainTableBody.innerHTML = '';

        for (let i = 0; i < Number(length); i++) {
            const block = await contract.getChainBlock(i);
            const row = document.createElement('tr');

            const isGenesis = i === 0;
            if (isGenesis) {
                row.classList.add('chain-genesis');
            }

            // Block #
            const blockNumCell = document.createElement('td');
            blockNumCell.textContent = block.blockNumber.toString();
            row.appendChild(blockNumCell);

            // Group ID
            const groupIdCell = document.createElement('td');
            groupIdCell.textContent = isGenesis ? 'GENESIS' : block.groupId.toString();
            row.appendChild(groupIdCell);

            // Members count
            const membersCell = document.createElement('td');
            membersCell.textContent = block.members.length.toString();
            row.appendChild(membersCell);

            // Ticket count
            const ticketsCell = document.createElement('td');
            ticketsCell.textContent = block.ticketCount.toString();
            row.appendChild(ticketsCell);

            // Timestamp
            const timestampCell = document.createElement('td');
            const date = new Date(Number(block.timestamp) * 1000);
            timestampCell.textContent = date.toLocaleString();
            row.appendChild(timestampCell);

            // Block hash (truncated)
            const hashCell = document.createElement('td');
            hashCell.textContent = block.blockHash.slice(0, 10) + '...';
            hashCell.title = block.blockHash;
            row.appendChild(hashCell);

            // Previous hash (truncated)
            const prevHashCell = document.createElement('td');
            prevHashCell.textContent = isGenesis ? '—' : block.previousHash.slice(0, 10) + '...';
            prevHashCell.title = isGenesis ? 'Genesis block has no predecessor' : block.previousHash;
            row.appendChild(prevHashCell);

            chainTableBody.appendChild(row);
        }

    } catch (error) {
        showMessage(`Failed to load chain: ${error.message}`, 'error');
        console.error('Chain loading error:', error);
    }
}

/**
 * Calls verifyChain() on the contract and displays the integrity result.
 * This is a read-only call executed off-chain via ethers.js — it is never
 * submitted as a transaction.
 */
async function verifyChainIntegrity() {
    try {
        verifyChainBtn.disabled = true;
        verifyChainBtn.textContent = 'Verifying...';
        chainIntegrity.textContent = 'Checking...';
        chainIntegrity.style.color = '';

        const isValid = await contract.verifyChain();

        if (isValid) {
            chainIntegrity.textContent = 'VERIFIED';
            chainIntegrity.style.color = 'green';
        } else {
            chainIntegrity.textContent = 'CHAIN BROKEN';
            chainIntegrity.style.color = 'red';
        }

    } catch (error) {
        chainIntegrity.textContent = 'Verification failed';
        chainIntegrity.style.color = 'red';
        showMessage(`Chain verification error: ${error.message}`, 'error');
        console.error('Chain verification error:', error);
    } finally {
        verifyChainBtn.disabled = false;
        verifyChainBtn.textContent = 'Verify Chain';
    }
}

// ---------------------------------------------------------------------
// Real-time Updates Functions
// ---------------------------------------------------------------------

/**
 * Sets up real-time event listeners for dashboard updates.
 */
function setupRealTimeUpdates() {
    cleanupEventListeners(); // Clean up any existing listeners

    // Listen for various events that affect dashboard data
    const events = ['GroupCreated', 'MemberJoined', 'GroupCompleted', 'GroupCancelled', 'TicketReturned'];

    for (const eventName of events) {
        const listener = (...args) => {
            console.log(`${eventName} event received, reloading dashboard...`);
            loadDashboard();
        };

        contract.on(eventName, listener);
        eventListeners.push({ eventName, listener });
    }
}

/**
 * Cleans up all event listeners.
 */
function cleanupEventListeners() {
    for (const { eventName, listener } of eventListeners) {
        contract.off(eventName, listener);
    }
    eventListeners = [];
}

/**
 * Toggles real-time updates on/off.
 */
function toggleRealTime() {
    realTimeEnabled = realTimeToggle.checked;

    if (realTimeEnabled && contract) {
        setupRealTimeUpdates();
        showMessage('Real-time updates enabled.', 'info');
    } else {
        cleanupEventListeners();
        showMessage('Real-time updates disabled.', 'info');
    }
}

// ---------------------------------------------------------------------
// Withdraw Funds Function
// ---------------------------------------------------------------------

/**
 * Handles the withdrawal of funds by the contract owner.
 */
async function withdrawFunds() {
    try {
        if (!contract || !userAddress) {
            throw new Error('Please connect your MetaMask wallet first.');
        }

        // Show confirmation dialog
        const confirmed = confirm('Are you sure you want to withdraw all available funds from the contract? This action cannot be undone.');
        if (!confirmed) {
            return;
        }

        // Show pending state
        withdrawFundsBtn.disabled = true;
        withdrawFundsBtn.textContent = 'Withdrawing...';
        withdrawStatus.textContent = 'Preparing withdrawal...';
        withdrawStatus.classList.remove('hidden');

        // Call contract function
        const tx = await contract.withdrawFunds();
        withdrawStatus.textContent = 'Transaction submitted. Waiting for confirmation...';

        // Wait for confirmation
        const receipt = await tx.wait();

        // Show success
        withdrawStatus.innerHTML = `
            <p>Funds withdrawn successfully!</p>
            <p><a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank">View Transaction on Etherscan</a></p>
        `;

        // Reload dashboard to show updated balances
        await loadDashboard();

        showMessage('Funds withdrawn successfully!', 'success');

    } catch (error) {
        const friendlyError = parseContractError(error);
        showMessage(`Withdrawal failed: ${friendlyError}`, 'error');
        withdrawStatus.classList.add('hidden');
        console.error('Withdrawal error:', error);
    } finally {
        // Reset button state
        withdrawFundsBtn.disabled = false;
        withdrawFundsBtn.textContent = 'Withdraw Funds';
    }
}

// ---------------------------------------------------------------------
// Error Parsing Function
// ---------------------------------------------------------------------

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
    if (message.includes('Access denied')) {
        return 'Access denied: You are not the contract owner.';
    }
    if (message.includes('No funds available')) {
        return 'No funds available for withdrawal.';
    }
    if (message.includes('Withdrawal failed')) {
        return 'Withdrawal transaction failed.';
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