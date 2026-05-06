// Import ethers.js v6 from CDN
import { ethers } from "https://esm.sh/ethers@6.7.0";

// Import contract utilities
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../js/contract.js";

// ---------------------------------------------------------------------
// DOM Element References
// ---------------------------------------------------------------------

const verifyAddressInput = document.getElementById('verifyAddress');
const verifyBtn = document.getElementById('verifyBtn');
const verificationResult = document.getElementById('verificationResult');
const validityIndicator = document.getElementById('validityIndicator');
const ticketBalance = document.getElementById('ticketBalance');
const messageArea = document.getElementById('messageArea');

// ---------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------

verifyBtn.addEventListener('click', verifyAddress);

verifyAddressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyAddress();
});

// ---------------------------------------------------------------------
// Doorman Verification Logic
// Extracted from balance.js — logic unchanged, IDs updated to match verify.html
// ---------------------------------------------------------------------

async function verifyAddress() {
    try {
        const address = verifyAddressInput.value.trim();

        if (!address) {
            throw new Error('Please enter a wallet address.');
        }

        if (!ethers.isAddress(address)) {
            throw new Error('Invalid Ethereum address format.');
        }

        showMessage('Verifying address...', 'info');

        // Create read-only provider using public Sepolia RPC
        const provider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');

        // Create read-only contract instance
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        // Check ticket balance
        const balance = await contract.balanceOf(address);

        // Update display
        verificationResult.classList.remove('hidden');
        if (balance >= 1) {
            validityIndicator.textContent = '✓ VALID';
            validityIndicator.className = 'validity-valid';
        } else {
            validityIndicator.textContent = '✗ INVALID';
            validityIndicator.className = 'validity-invalid';
        }
        ticketBalance.textContent = balance.toString();

        showMessage('Verification complete!', 'success');

    } catch (error) {
        showMessage(`Verification failed: ${error.message}`, 'error');
        console.error('Doorman verification error:', error);
    }
}

// ---------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------

function showMessage(message, type = 'info') {
    messageArea.textContent = message;
    messageArea.className = `message-area ${type}`;
    messageArea.style.display = message ? 'block' : 'none';
}
