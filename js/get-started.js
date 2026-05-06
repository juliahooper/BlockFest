import { ethers } from "https://esm.sh/ethers@6.7.0";
import { getContract, formatAddress, formatSETH } from "./contract.js";

const connectBtn = document.getElementById('connectBtn');
const connectPanel = document.getElementById('connectPanel');
const successPanel = document.getElementById('successPanel');

async function init() {
    connectBtn.addEventListener('click', connectMetaMask);
    document.getElementById('switchSepoliaBtn').addEventListener('click', switchToSepolia);
    document.getElementById('tryAgainNoMetaMask').addEventListener('click', tryAgain);
    document.getElementById('tryAgainWrongNetwork').addEventListener('click', tryAgain);
    document.getElementById('tryAgainRejected').addEventListener('click', tryAgain);
    document.getElementById('tryAgainGeneric').addEventListener('click', tryAgain);

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length > 0) {
                await connectMetaMask();
            } else {
                tryAgain();
            }
        });

        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
            await connectMetaMask();
        }
    }
}

async function connectMetaMask() {
    showConnectingState();
    try {
        const { contract, userAddress, provider } = await getContract();
        const [ticketBal, sethBal] = await Promise.all([
            contract.balanceOf(userAddress),
            provider.getBalance(userAddress)
        ]);
        showSuccessState(userAddress, ticketBal, sethBal);
    } catch (error) {
        if (!window.ethereum) {
            showErrorState('noMetaMask');
        } else if (error.code === 4001) {
            showErrorState('rejected');
        } else if (error.message && error.message.toLowerCase().includes('network')) {
            showErrorState('wrongNetwork');
        } else {
            showErrorState('generic', error.message);
        }
    }
}

async function switchToSepolia() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
        });
        await connectMetaMask();
    } catch (error) {
        if (error.code === 4902) {
            showErrorState('generic', 'Please add the Sepolia test network to MetaMask manually.');
        } else {
            showErrorState('generic', error.message);
        }
    }
}

function showConnectingState() {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    hideAllErrors();
    successPanel.classList.add('hidden');
}

function showSuccessState(address, ticketBal, sethBal) {
    connectPanel.classList.add('hidden');
    successPanel.classList.remove('hidden');
    successPanel.innerHTML = `
        <div class="success-check">✓</div>
        <h3>Wallet Connected</h3>
        <div class="success-details">
            <div class="info-item">
                <label>Address</label>
                <span>${formatAddress(address)}</span>
            </div>
            <div class="info-item">
                <label>SETH Balance</label>
                <span>${formatSETH(sethBal)} SETH</span>
            </div>
            <div class="info-item">
                <label>Tickets</label>
                <span>${ticketBal.toString()}</span>
            </div>
        </div>
        <div class="success-actions">
            <a href="/pages/group.html" class="btn btn-primary">Create a Group</a>
            <a href="/pages/buy.html" class="btn btn-secondary">Buy a Ticket</a>
        </div>
    `;
}

function showErrorState(type, message) {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect MetaMask';
    hideAllErrors();

    const panelMap = {
        noMetaMask: 'errorNoMetaMask',
        wrongNetwork: 'errorWrongNetwork',
        rejected: 'errorRejected',
        generic: 'errorGeneric'
    };

    const panelId = panelMap[type] || 'errorGeneric';
    if (type === 'generic' && message) {
        document.getElementById('errorGenericMessage').textContent = message;
    }
    document.getElementById(panelId).classList.remove('hidden');
}

function tryAgain() {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect MetaMask';
    connectPanel.classList.remove('hidden');
    successPanel.classList.add('hidden');
    hideAllErrors();
}

function hideAllErrors() {
    ['errorNoMetaMask', 'errorWrongNetwork', 'errorRejected', 'errorGeneric'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
}

document.addEventListener('DOMContentLoaded', init);
