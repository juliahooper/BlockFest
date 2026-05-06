// Import ethers.js v6 from CDN for client-side wallet generation
import { ethers } from "https://esm.sh/ethers@6.7.0";

// Import utility function from contract.js
import { formatAddress } from "../js/contract.js";

// ---------------------------------------------------------------------
// Global Variables
// ---------------------------------------------------------------------

let currentWallet = null; // Store the generated wallet temporarily
let keystoreDownloaded = false; // Track if keystore has been downloaded

// ---------------------------------------------------------------------
// DOM Element References
// ---------------------------------------------------------------------

const generateWalletBtn = document.getElementById('generateWalletBtn');
const walletDetails = document.getElementById('walletDetails');
const keystoreSection = document.getElementById('keystoreSection');
const walletAddress = document.getElementById('walletAddress');
const walletPrivateKey = document.getElementById('walletPrivateKey');
const walletMnemonic = document.getElementById('walletMnemonic');
const keystorePassword = document.getElementById('keystorePassword');
const confirmPassword = document.getElementById('confirmPassword');
const downloadKeystoreBtn = document.getElementById('downloadKeystoreBtn');
const messageArea = document.getElementById('messageArea');

// ---------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------

generateWalletBtn.addEventListener('click', generateWallet);
downloadKeystoreBtn.addEventListener('click', downloadKeystore);

// Add event listeners to copy buttons
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('copy-btn')) {
        const type = e.target.dataset.copy;
        let text = '';
        if (type === 'address') text = walletAddress.textContent;
        else if (type === 'privateKey') text = walletPrivateKey.textContent;
        copyToClipboard(text, e.target);
    }
});

// ---------------------------------------------------------------------
// Wallet Generation Function
// ---------------------------------------------------------------------

/**
 * Generates a new random Ethereum wallet client-side using ethers.js.
 * This approach was chosen over server-side generation to ensure:
 * - Private keys never leave the user's browser
 * - No server-side storage of sensitive wallet data
 * - Complete user control over wallet creation
 * - Enhanced security by keeping everything local
 *
 * @async
 * @throws {Error} If browser doesn't support required crypto APIs
 */
async function generateWallet() {
    try {
        // Check for crypto API support
        if (!window.crypto || !window.crypto.getRandomValues) {
            throw new Error("Your browser doesn't support the required cryptographic APIs. Please use a modern browser.");
        }

        // Generate random wallet
        currentWallet = ethers.Wallet.createRandom();

        // Display wallet details
        walletAddress.textContent = currentWallet.address;
        walletPrivateKey.textContent = currentWallet.privateKey;
        walletMnemonic.textContent = currentWallet.mnemonic.phrase;

        // Show the details and keystore sections
        walletDetails.classList.remove('hidden');
        keystoreSection.classList.remove('hidden');

        // Clear any previous messages
        showMessage('', 'info');

        // Show warning about one-time display
        showMessage('Your wallet has been generated. This information is displayed once only — save it now before leaving this page.', 'success');

        // Disable generate button to prevent multiple generations
        generateWalletBtn.disabled = true;
        generateWalletBtn.textContent = 'Wallet Generated';

    } catch (error) {
        showMessage(`Error generating wallet: ${error.message}`, 'error');
        console.error('Wallet generation error:', error);
    }
}

// ---------------------------------------------------------------------
// Keystore Download Function
// ---------------------------------------------------------------------

/**
 * Downloads an encrypted keystore file for the generated wallet.
 * Uses ethers.js wallet.encrypt() to create a secure, encrypted JSON keystore.
 * The keystore can be imported into MetaMask or other Ethereum wallets.
 *
 * @async
 * @throws {Error} If passwords don't match, are too short, or encryption fails
 */
async function downloadKeystore() {
    try {
        if (!currentWallet) {
            throw new Error("Please generate a wallet first.");
        }

        const password = keystorePassword.value;
        const confirmPwd = confirmPassword.value;

        // Validate passwords
        if (!password || !confirmPwd) {
            throw new Error("Please enter both password fields.");
        }

        if (password !== confirmPwd) {
            throw new Error("Passwords do not match.");
        }

        if (password.length < 8) {
            throw new Error("Password must be at least 8 characters long.");
        }

        // Show loading state
        downloadKeystoreBtn.disabled = true;
        downloadKeystoreBtn.textContent = 'Encrypting...';

        // Encrypt the wallet
        const keystore = await currentWallet.encrypt(password);

        // Create downloadable file
        const blob = new Blob([keystore], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create download link
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `blockfest-wallet-${timestamp}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up
        URL.revokeObjectURL(url);

        // Show success message
        showMessage('Keystore downloaded successfully! Store it safely.', 'success');

        // Mark keystore as downloaded
        keystoreDownloaded = true;

        // Reset form
        keystorePassword.value = '';
        confirmPassword.value = '';

    } catch (error) {
        showMessage(`Error creating keystore: ${error.message}`, 'error');
        console.error('Keystore creation error:', error);
    } finally {
        // Reset button state
        downloadKeystoreBtn.disabled = false;
        downloadKeystoreBtn.textContent = 'Download Keystore';
    }
}

// ---------------------------------------------------------------------
// Copy to Clipboard Function
// ---------------------------------------------------------------------

/**
 * Copies text to the system clipboard using the modern Clipboard API.
 * Provides visual feedback by temporarily changing the button text.
 *
 * @param {string} text - The text to copy
 * @param {HTMLElement} buttonElement - The button element that triggered the copy
 */
async function copyToClipboard(text, buttonElement) {
    try {
        await navigator.clipboard.writeText(text);
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Copied!';
        buttonElement.disabled = true;

        setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.disabled = false;
        }, 2000);

    } catch (error) {
        showMessage('Failed to copy to clipboard. Please copy manually.', 'error');
        console.error('Clipboard error:', error);
    }
}

// ---------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------

/**
 * Displays a message to the user in the message area.
 * Supports different message types for styling.
 *
 * @param {string} message - The message to display
 * @param {string} type - The type of message ('info', 'success', 'error')
 */
function showMessage(message, type = 'info') {
    messageArea.textContent = message;
    messageArea.className = `message-area ${type}`;
    messageArea.style.display = message ? 'block' : 'none';
}

// ---------------------------------------------------------------------
// Page Unload Protection
// ---------------------------------------------------------------------

/**
 * Warns the user if they try to leave the page after generating a wallet
 * but before downloading the keystore, preventing accidental loss of wallet details.
 */
window.addEventListener('beforeunload', (e) => {
    if (currentWallet && !keystoreDownloaded) {
        e.preventDefault();
        e.returnValue = '';
    }
});