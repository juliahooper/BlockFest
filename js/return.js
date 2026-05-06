// Import ethers.js v6 from CDN
import { ethers } from "https://esm.sh/ethers@6.7.0";

// Import contract utilities
import { getContract, formatAddress, formatSETH } from "../js/contract.js";

// ---------------------------------------------------------------------
// Global Variables
// ---------------------------------------------------------------------

let contract = null; // Contract instance
let userAddress = null; // Connected user address
let ticketPrice = 0n; // Ticket price in wei
let provider = null; // Provider for balance queries

// ---------------------------------------------------------------------
// DOM Element References
// ---------------------------------------------------------------------

const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const connectWalletBtn = document.getElementById('connectWalletBtn');
const preReturnSection = document.getElementById('preReturnSection');
const currentTicketBalance = document.getElementById('currentTicketBalance');
const currentSETHBalance = document.getElementById('currentSETHBalance');
const refundAmount = document.getElementById('refundAmount');
const confirmationCheckbox = document.getElementById('confirmationCheckbox');
const returnTicketBtn = document.getElementById('returnTicketBtn');
const transactionStatus = document.getElementById('transactionStatus');
const successPanel = document.getElementById('successPanel');
const successMessage = document.getElementById('successMessage');
const preReturnTicketBalance = document.getElementById('preReturnTicketBalance');
const postReturnTicketBalance = document.getElementById('postReturnTicketBalance');
const preReturnSETHBalance = document.getElementById('preReturnSETHBalance');
const postReturnSETHBalance = document.getElementById('postReturnSETHBalance');
const etherscanLink = document.getElementById('etherscanLink');
const unclaimedRefundSection = document.getElementById('unclaimedRefundSection');
const checkUnclaimedBtn = document.getElementById('checkUnclaimedBtn');
const unclaimedInfo = document.getElementById('unclaimedInfo');
const unclaimedAmount = document.getElementById('unclaimedAmount');
const claimRefundBtn = document.getElementById('claimRefundBtn');
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
    confirmationCheckbox.addEventListener('change', handleCheckboxChange);
    returnTicketBtn.addEventListener('click', returnTicket);
    checkUnclaimedBtn.addEventListener('click', checkUnclaimedRefund);
    claimRefundBtn.addEventListener('click', claimRefund);

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
 * Fetches ticket price and displays balances.
 */
async function connectWallet() {
    try {
        showMessage('Connecting to MetaMask...', 'info');

        const { contract: contractInstance, userAddress: address } = await getContract();
        contract = contractInstance;
        userAddress = address;
        provider = contract.runner.provider;

        // Fetch ticket price
        ticketPrice = await contract.ticketPrice();

        // Update connection status
        statusText.textContent = `Connected: ${formatAddress(userAddress)}`;
        connectWalletBtn.style.display = 'none';

        // Fetch and display balances
        await fetchAndDisplayBalances();

        // Show pre-return section
        preReturnSection.classList.remove('hidden');

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
    provider = null;
    statusText.textContent = 'Not Connected';
    connectWalletBtn.style.display = 'inline-block';
    preReturnSection.classList.add('hidden');
    successPanel.classList.add('hidden');
    showMessage('Wallet disconnected.', 'info');
}

// ---------------------------------------------------------------------
// Balance Display Functions
// ---------------------------------------------------------------------

/**
 * Fetches and displays current balances.
 * Shows ticket balance, SETH balance, and refund amount.
 */
async function fetchAndDisplayBalances() {
    try {
        // Fetch balances
        const ticketBalance = await contract.balanceOf(userAddress);
        const sethBalance = await provider.getBalance(userAddress);

        // Display balances
        currentTicketBalance.textContent = ticketBalance.toString();
        currentSETHBalance.textContent = formatSETH(sethBalance);
        refundAmount.textContent = formatSETH(ticketPrice);

        // Check if user has a ticket
        if (ticketBalance < 1n) {
            showMessage('You do not have a ticket to return.', 'info');
            returnTicketBtn.disabled = true;
        } else {
            returnTicketBtn.disabled = !confirmationCheckbox.checked;
        }

    } catch (error) {
        console.error('Error fetching balances:', error);
        showMessage('Failed to fetch balances.', 'error');
    }
}

// ---------------------------------------------------------------------
// Checkbox Handler
// ---------------------------------------------------------------------

/**
 * Handles checkbox change to enable/disable return button.
 */
function handleCheckboxChange() {
    const hasTicket = parseInt(currentTicketBalance.textContent) >= 1;
    returnTicketBtn.disabled = !(confirmationCheckbox.checked && hasTicket);
}

// ---------------------------------------------------------------------
// Ticket Return Function
// ---------------------------------------------------------------------

/**
 * Handles the ticket return transaction.
 * Validates all conditions, processes return, and shows success with pre/post balances.
 */
async function returnTicket() {
    try {
        if (!contract || !userAddress) {
            throw new Error('Please connect your MetaMask wallet first.');
        }

        // Validate user has a ticket
        const currentTicketBal = await contract.balanceOf(userAddress);
        if (currentTicketBal < 1n) {
            throw new Error('You do not have a ticket to return.');
        }

        // Validate confirmation
        if (!confirmationCheckbox.checked) {
            throw new Error('Please confirm that you understand the return is permanent.');
        }

        // Capture pre-return balances for display
        const preTicketBal = await contract.balanceOf(userAddress);
        const preSETHBal = await provider.getBalance(userAddress);

        // Show pending state
        returnTicketBtn.disabled = true;
        returnTicketBtn.textContent = 'Processing...';
        transactionStatus.textContent = 'Preparing transaction...';
        transactionStatus.classList.remove('hidden');

        // Call contract function
        const tx = await contract.returnTicket();
        transactionStatus.textContent = 'Transaction submitted. Waiting for confirmation...';

        // Wait for confirmation
        const receipt = await tx.wait();

        // Explicitly re-query on-chain balances after transaction
        // This ensures we show accurate post-transaction state rather than assuming local UI state
        const postTicketBal = await contract.balanceOf(userAddress);
        const postSETHBal = await provider.getBalance(userAddress);

        // Display pre and post balances as proof of successful return
        preReturnTicketBalance.textContent = preTicketBal.toString();
        postReturnTicketBalance.textContent = postTicketBal.toString();
        preReturnSETHBalance.textContent = formatSETH(preSETHBal);
        postReturnSETHBalance.textContent = formatSETH(postSETHBal);

        // Show success
        etherscanLink.href = `https://sepolia.etherscan.io/tx/${tx.hash}`;
        successPanel.classList.remove('hidden');
        preReturnSection.classList.add('hidden');
        transactionStatus.classList.add('hidden');

        showMessage('Ticket returned successfully!', 'success');

    } catch (error) {
        const friendlyError = parseContractError(error);
        showMessage(`Return failed: ${friendlyError}`, 'error');
        transactionStatus.classList.add('hidden');
        console.error('Return error:', error);
    } finally {
        // Reset button state
        returnTicketBtn.disabled = false;
        returnTicketBtn.textContent = 'Return Ticket';
    }
}

// ---------------------------------------------------------------------
// Unclaimed Refund Functions
// ---------------------------------------------------------------------

/**
 * Checks for unclaimed refunds for the connected user.
 */
async function checkUnclaimedRefund() {
    try {
        if (!contract || !userAddress) {
            throw new Error('Please connect your MetaMask wallet first.');
        }

        showMessage('Checking for unclaimed refunds...', 'info');

        const unclaimed = await contract.getUnclaimedRefund(userAddress);
        unclaimedAmount.textContent = formatSETH(unclaimed);

        if (unclaimed > 0n) {
            claimRefundBtn.classList.remove('hidden');
            showMessage('Unclaimed refund found!', 'success');
        } else {
            claimRefundBtn.classList.add('hidden');
            showMessage('No unclaimed refunds.', 'info');
        }

        unclaimedInfo.classList.remove('hidden');

    } catch (error) {
        showMessage(`Failed to check refunds: ${error.message}`, 'error');
        console.error('Check refund error:', error);
    }
}

/**
 * Claims unclaimed refund for the connected user.
 */
async function claimRefund() {
    try {
        if (!contract || !userAddress) {
            throw new Error('Please connect your MetaMask wallet first.');
        }

        // Show pending state
        claimRefundBtn.disabled = true;
        claimRefundBtn.textContent = 'Claiming...';

        // Call contract function
        const tx = await contract.claimRefund();
        const receipt = await tx.wait();

        // Re-fetch balances to show updated SETH
        await fetchAndDisplayBalances();

        // Hide claim button and update display
        claimRefundBtn.classList.add('hidden');
        unclaimedAmount.textContent = '0';
        etherscanLink.href = `https://sepolia.etherscan.io/tx/${tx.hash}`;

        showMessage('Refund claimed successfully!', 'success');

    } catch (error) {
        const friendlyError = parseContractError(error);
        showMessage(`Claim failed: ${friendlyError}`, 'error');
        console.error('Claim error:', error);
    } finally {
        // Reset button state
        claimRefundBtn.disabled = false;
        claimRefundBtn.textContent = 'Claim Refund';
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
    if (message.includes('No ticket available to return')) {
        return 'No ticket available to return.';
    }
    if (message.includes('Contract has insufficient funds')) {
        return 'Contract has insufficient funds to process this return.';
    }
    if (message.includes('Ticket return transfer failed')) {
        return 'Ticket return transfer failed.';
    }
    if (message.includes('No unclaimed refund available')) {
        return 'No unclaimed refund available.';
    }
    if (message.includes('Claim refund transfer failed')) {
        return 'Claim refund transfer failed.';
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