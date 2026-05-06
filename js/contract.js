// Import ethers.js v6 from CDN
import { ethers } from "https://esm.sh/ethers@6.7.0";

// ---------------------------------------------------------------------
// Contract Configuration Constants
// ---------------------------------------------------------------------

/**
 * @constant {string} CONTRACT_ADDRESS
 * The deployed address of the BlockFest smart contract on Ethereum Sepolia testnet.
 * This is the central point of contact for all frontend interactions with the contract.
 */
export const CONTRACT_ADDRESS = "0xbB4429408330b4e18Ad8ada91ECE37E0cFC45b62";

/**
 * @constant {Array} CONTRACT_ABI
 * The complete Application Binary Interface (ABI) for the BlockFest contract.
 * Generated from the final Solidity contract, including all functions, events, and public variables.
 * This ABI enables ethers.js to encode/decode interactions with the contract.
 */
export const CONTRACT_ABI = [
    // ERC-20 Functions
    {
        "type": "function",
        "name": "totalSupply",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "balanceOf",
        "inputs": [{"type": "address", "name": "account"}],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "allowance",
        "inputs": [
            {"type": "address", "name": "tokenOwner"},
            {"type": "address", "name": "spender"}
        ],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "approve",
        "inputs": [
            {"type": "address", "name": "spender"},
            {"type": "uint256", "name": "amount"}
        ],
        "outputs": [{"type": "bool"}],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "transfer",
        "inputs": [
            {"type": "address", "name": "to"},
            {"type": "uint256", "name": "amount"}
        ],
        "outputs": [{"type": "bool"}],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "transferFrom",
        "inputs": [
            {"type": "address", "name": "from"},
            {"type": "address", "name": "to"},
            {"type": "uint256", "name": "amount"}
        ],
        "outputs": [{"type": "bool"}],
        "stateMutability": "nonpayable"
    },
    // Constants (public variables)
    {
        "type": "function",
        "name": "decimals",
        "inputs": [],
        "outputs": [{"type": "uint8"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "name",
        "inputs": [],
        "outputs": [{"type": "string"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "symbol",
        "inputs": [],
        "outputs": [{"type": "string"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "MAX_GROUP_SIZE",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "ticketPrice",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "owner",
        "inputs": [],
        "outputs": [{"type": "address"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "nextGroupId",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    // Group Management Functions
    {
        "type": "function",
        "name": "createGroup",
        "inputs": [
            {"type": "address[]", "name": "members"},
            {"type": "uint256", "name": "deadlineHours"}
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "joinGroup",
        "inputs": [{"type": "uint256", "name": "groupId"}],
        "outputs": [],
        "stateMutability": "payable"
    },
    {
        "type": "function",
        "name": "cancelGroup",
        "inputs": [{"type": "uint256", "name": "groupId"}],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "refundGroup",
        "inputs": [{"type": "uint256", "name": "groupId"}],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "claimRefund",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "returnTicket",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "withdrawFunds",
        "inputs": [],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    // View Functions
    {
        "type": "function",
        "name": "getGroup",
        "inputs": [{"type": "uint256", "name": "groupId"}],
        "outputs": [{
            "type": "tuple",
            "name": "group",
            "components": [
                {"type": "address", "name": "creator"},
                {"type": "uint256", "name": "deadline"},
                {"type": "uint256", "name": "paidCount"},
                {"type": "uint8", "name": "state"}
            ]
        }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getGroupMembers",
        "inputs": [{"type": "uint256", "name": "groupId"}],
        "outputs": [{"type": "address[]"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getAccount",
        "inputs": [{"type": "address", "name": "user"}],
        "outputs": [{
            "type": "tuple",
            "name": "account",
            "components": [
                {"type": "uint256", "name": "groupId"},
                {"type": "uint256", "name": "escrowBalance"}
            ]
        }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getUnclaimedRefund",
        "inputs": [{"type": "address", "name": "user"}],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    // Ticket Availability + Chain View Functions
    {
        "type": "function",
        "name": "totalTickets",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "availableTickets",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "chainLength",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "getChainBlock",
        "inputs": [{"type": "uint256", "name": "blockIndex"}],
        "outputs": [{
            "type": "tuple",
            "name": "",
            "components": [
                {"type": "uint256", "name": "blockNumber"},
                {"type": "uint256", "name": "groupId"},
                {"type": "bytes32", "name": "previousHash"},
                {"type": "bytes32", "name": "blockHash"},
                {"type": "address[]", "name": "members"},
                {"type": "uint256", "name": "timestamp"},
                {"type": "uint256", "name": "ticketCount"}
            ]
        }],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "verifyChain",
        "inputs": [],
        "outputs": [{"type": "bool"}],
        "stateMutability": "view"
    },
    // Events
    {
        "type": "event",
        "name": "Transfer",
        "inputs": [
            {"indexed": true, "type": "address", "name": "from"},
            {"indexed": true, "type": "address", "name": "to"},
            {"indexed": false, "type": "uint256", "name": "value"}
        ]
    },
    {
        "type": "event",
        "name": "Approval",
        "inputs": [
            {"indexed": true, "type": "address", "name": "owner"},
            {"indexed": true, "type": "address", "name": "spender"},
            {"indexed": false, "type": "uint256", "name": "value"}
        ]
    },
    {
        "type": "event",
        "name": "GroupCreated",
        "inputs": [
            {"indexed": true, "type": "uint256", "name": "groupId"},
            {"indexed": true, "type": "address", "name": "creator"},
            {"indexed": false, "type": "uint256", "name": "deadline"},
            {"indexed": false, "type": "uint256", "name": "groupSize"}
        ]
    },
    {
        "type": "event",
        "name": "MemberJoined",
        "inputs": [
            {"indexed": true, "type": "uint256", "name": "groupId"},
            {"indexed": true, "type": "address", "name": "member"},
            {"indexed": false, "type": "uint256", "name": "paidCount"}
        ]
    },
    {
        "type": "event",
        "name": "GroupCompleted",
        "inputs": [
            {"indexed": true, "type": "uint256", "name": "groupId"}
        ]
    },
    {
        "type": "event",
        "name": "GroupCancelled",
        "inputs": [
            {"indexed": true, "type": "uint256", "name": "groupId"},
            {"indexed": true, "type": "address", "name": "triggeredBy"}
        ]
    },
    {
        "type": "event",
        "name": "TicketReturned",
        "inputs": [
            {"indexed": true, "type": "address", "name": "holder"},
            {"indexed": false, "type": "uint256", "name": "refundAmount"}
        ]
    },
    {
        "type": "event",
        "name": "RefundFailed",
        "inputs": [
            {"indexed": true, "type": "uint256", "name": "groupId"},
            {"indexed": true, "type": "address", "name": "member"},
            {"indexed": false, "type": "uint256", "name": "amount"}
        ]
    },
    {
        "type": "event",
        "name": "RefundClaimed",
        "inputs": [
            {"indexed": true, "type": "address", "name": "claimant"},
            {"indexed": false, "type": "uint256", "name": "amount"}
        ]
    },
    {
        "type": "event",
        "name": "TicketsReserved",
        "inputs": [
            {"indexed": true, "type": "uint256", "name": "groupId"},
            {"indexed": false, "type": "uint256", "name": "ticketCount"}
        ]
    },
    {
        "type": "event",
        "name": "BlockAdded",
        "inputs": [
            {"indexed": true, "type": "uint256", "name": "blockNumber"},
            {"indexed": true, "type": "uint256", "name": "groupId"},
            {"indexed": false, "type": "bytes32", "name": "blockHash"}
        ]
    }
];

// ---------------------------------------------------------------------
// Contract Connection Function
// ---------------------------------------------------------------------

/**
 * Establishes a connection to the BlockFest smart contract on Sepolia testnet.
 * This is the primary function for initializing contract interactions in the frontend.
 * It handles MetaMask availability, wallet connection, network validation, and contract instantiation.
 * 
 * @async
 * @returns {Promise<Object>} An object containing:
 *   - contract: The ethers.js Contract instance for interacting with BlockFest
 *   - userAddress: The connected user's Ethereum address
 *   - provider: The BrowserProvider instance
 *   - signer: The Signer instance for transaction signing
 * @throws {Error} If MetaMask is not installed, user rejects connection, or wrong network
 */
export async function getContract() {
    console.log('[getContract] called');

    if (!window.ethereum) {
        console.error('[getContract] window.ethereum is undefined — MetaMask not detected');
        throw new Error("MetaMask is not installed. Please install MetaMask to use BlockFest.");
    }
    console.log('[getContract] window.ethereum found:', window.ethereum);

    try {
        console.log('[getContract] requesting accounts...');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log('[getContract] accounts returned:', accounts);

        if (!accounts || accounts.length === 0) {
            throw new Error("Please connect your MetaMask wallet to use BlockFest.");
        }
        const userAddress = accounts[0];
        console.log('[getContract] userAddress:', userAddress);

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        console.log('[getContract] signer obtained');

        const network = await provider.getNetwork();
        console.log('[getContract] network chainId:', network.chainId.toString());

        if (network.chainId !== 11155111n) {
            console.log('[getContract] wrong network, attempting auto-switch to Sepolia...');
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0xaa36a7' }],
                });
                console.log('[getContract] switched to Sepolia successfully');
            } catch (switchError) {
                console.error('[getContract] network switch failed:', switchError);
                if (switchError.code === 4902) {
                    throw new Error("Please add the Sepolia test network to MetaMask manually.");
                }
                throw new Error("Please switch MetaMask to the Sepolia test network to use BlockFest.");
            }
        }

        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        console.log('[getContract] contract instance created at', CONTRACT_ADDRESS);

        return { contract, userAddress, provider, signer };
    } catch (error) {
        console.error('[getContract] error:', error.code, error.message, error);
        if (error.code === 4001) {
            throw new Error("Please connect your MetaMask wallet to use BlockFest.");
        } else if (error.code === 4902) {
            throw new Error("Please add the Sepolia test network to MetaMask.");
        } else if (error.message.includes('network')) {
            throw new Error("Please switch MetaMask to the Sepolia test network to use BlockFest.");
        } else {
            throw error;
        }
    }
}

// ---------------------------------------------------------------------
// Network Management Function
// ---------------------------------------------------------------------

/**
 * Checks and ensures the user is connected to the Sepolia testnet.
 * Attempts automatic network switching if on a different network.
 * This function is called by getContract() but can also be used independently.
 * 
 * @async
 * @returns {Promise<boolean>} True if on correct network, throws error otherwise
 * @throws {Error} If network switch fails or user is on wrong network
 */
export async function checkNetwork() {
    if (!window.ethereum) {
        throw new Error("MetaMask is not available.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();

    if (network.chainId === 11155111n) {
        return true;
    }

    try {
        // Attempt to switch to Sepolia
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // 11155111 in hex
        });
        return true;
    } catch (switchError) {
        // If switch fails, provide helpful error message
        if (switchError.code === 4902) {
            throw new Error("Please add the Sepolia test network to MetaMask manually.");
        } else {
            throw new Error("Please switch MetaMask to the Sepolia test network to use BlockFest.");
        }
    }
}

// ---------------------------------------------------------------------
// Utility Helper Functions
// ---------------------------------------------------------------------

/**
 * Formats a full Ethereum address for display purposes.
 * Shortens the address to show first 6 and last 4 characters.
 * 
 * @param {string} address - The full Ethereum address
 * @returns {string} Shortened address like "0x1234...5678"
 */
export function formatAddress(address) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Formats a wei amount to SETH (Sepolia ETH) with 4 decimal places.
 * Uses ethers.js formatEther for accurate conversion.
 * 
 * @param {bigint|string} weiAmount - The amount in wei
 * @returns {string} Formatted SETH amount with 4 decimal places
 */
export function formatSETH(weiAmount) {
    try {
        const ethString = ethers.formatEther(weiAmount);
        return parseFloat(ethString).toFixed(4);
    } catch (error) {
        return "0.0000";
    }
}