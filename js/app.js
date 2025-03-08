// ./js/app.js
// Version: v0.1.4

// Dark Mode Logic
function initializeMode() {
    const savedMode = localStorage.getItem('isDarkMode');
    const isDarkMode = savedMode === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : savedMode === 'true';
    applyMode(isDarkMode);
}

function toggleDarkMode() {
    const currentMode = document.body.classList.contains('dark-mode');
    applyMode(!currentMode);
}

function applyMode(isDarkMode) {
    document.body.classList.toggle('dark-mode', isDarkMode);
    const button = document.getElementById('modeToggle');
    if (button) button.textContent = isDarkMode ? '🌞' : '🌙';
    localStorage.setItem('isDarkMode', isDarkMode);
}

// Core App Logic
window.web3Logic = window.web3Logic || {
    walletAddress: null,
    chainId: null,
    error: null,
    currentPrice: null,
    connectWallet: async () => ({ address: null, chainId: null, rpcUrl: null }),
    fetchBalance: async () => 0n,
    sendFreebaseTransaction: async () => null,
    fetchLUSDPrice: async () => ({ human: 0, uint256: 0n }),
    fetchAllowance: async () => 0n,
    approveWPOL: async () => null,
    convertWPOL: async () => null,
    checkTransactionReceipt: async () => false
};

async function connectToWallet() {
    const connectButton = document.getElementById('connectWallet');
    connectButton.disabled = true;
    connectButton.textContent = 'Connecting...';
    try {
        const walletData = await window.web3Logic.connectWallet();
        if (walletData.address) {
            connectButton.textContent = `${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}`;
            connectButton.classList.add('connected');
            document.getElementById('walletModal').classList.remove('show');
            updateNetworkButton(walletData.chainId);
            checkPengNFTBalance(walletData.address);
        } else if (window.web3Logic.error) {
            alert(window.web3Logic.error);
        }
    } catch (err) {
        console.error('Connect wallet failed:', err);
        alert('Failed to connect wallet.');
    } finally {
        connectButton.disabled = false;
        if (!window.web3Logic.walletAddress) connectButton.textContent = 'Connect Wallet';
    }
}

function updateNetworkButton(chainId) {
    const networkButton = document.getElementById('networkSettings');
    if (chainId === '0x89') {
        networkButton.innerHTML = '<img src="./assets/matic-logo-1.webp" alt="Polygon" style="width: 24px; height: 24px;">';
    } else {
        networkButton.textContent = '🌐';
    }
}

function handleNetworkSwitch() {
    if (!window.web3Logic.walletAddress) {
        alert('Please connect wallet to switch network.');
        return;
    }
    if (window.web3Logic.chainId !== '0x89') {
        try {
            window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x89' }]
            }).catch(err => {
                if (err.code === 4902) {
                    window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x89',
                            chainName: 'Polygon POS',
                            rpcUrls: ['https://polygon-rpc.com'],
                            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                            blockExplorerUrls: ['https://polygonscan.com']
                        }]
                    });
                } else {
                    alert(`Network switch failed: ${err.message}`);
                }
            });
        } catch (err) {
            console.error('Network switch failed:', err);
        }
    }
}

async function checkPengNFTBalance(address) {
    try {
        const balance = await window.web3Logic.fetchBalance(window.web3Logic.PENG_NFT_ADDRESS, address);
        document.getElementById('freebaseButton').classList.toggle('d-none', balance <= 1n);
    } catch (err) {
        console.error('Peng NFT balance check failed:', err);
    }
}

async function handleFreebaseClick() {
    try {
        const txHash = await window.web3Logic.sendFreebaseTransaction();
        if (txHash) alert(`Freebase transaction sent: ${txHash}`);
        else if (window.web3Logic.error) alert(window.web3Logic.error);
    } catch (err) {
        console.error('Freebase failed:', err);
        alert('Freebase failed.');
    }
}

function handleDispenseClick() {
    document.getElementById('dispenserModal').classList.add('show');
}

function generateQRCode() {
    document.getElementById('qrError').style.display = 'none';
    const inputAddress = document.getElementById('qrAddress').value.trim();
    let uri;
    if (inputAddress) {
        // Basic address validation
        if (/^0x[a-fA-F0-9]{40}$/.test(inputAddress)) {
            uri = `ethereum:${inputAddress}@137`;
        } else {
            showQRError('Invalid Ethereum address.');
            return;
        }
    } else if (window.web3Logic.walletAddress) {
        uri = `ethereum:${window.web3Logic.walletAddress}@137`;
    } else {
        uri = 'https://link.dexhune.eth.limo';
    }
    const canvas = document.getElementById('qrCanvas');
    QRCode.toCanvas(canvas, uri, { width: 300 }, (err) => {
        if (err) {
            console.error('QR Code failed:', err);
            showQRError('QR Code generation failed.');
        } else {
            document.getElementById('copyUri').style.display = 'block';
        }
    });
}

function showQRError(message) {
    const errorSpan = document.getElementById('qrError');
    errorSpan.textContent = message;
    errorSpan.style.display = 'block';
}

function copyURI() {
    const inputAddress = document.getElementById('qrAddress').value.trim();
    let uri;
    if (inputAddress) {
        if (/^0x[a-fA-F0-9]{40}$/.test(inputAddress)) {
            uri = `ethereum:${inputAddress}@137`;
        } else {
            uri = 'https://link.dexhune.eth.limo'; // Fallback if invalid
        }
    } else if (window.web3Logic.walletAddress) {
        uri = `ethereum:${window.web3Logic.walletAddress}@137`;
    } else {
        uri = 'https://link.dexhune.eth.limo';
    }
    navigator.clipboard.writeText(uri).then(() => {
        alert('URI copied: ' + uri);
    }).catch(err => {
        console.error('Copy URI failed:', err);
        alert('Copy failed.');
    });
}

function disconnectWallet() {
    window.web3Logic.walletAddress = null;
    window.web3Logic.chainId = null;
    window.web3Logic.error = null;
    window.web3Logic.currentPrice = null;
    document.getElementById('connectWallet').textContent = 'Connect Wallet';
    document.getElementById('connectWallet').classList.remove('connected');
    document.getElementById('networkSettings').textContent = '🌐';
    document.getElementById('freebaseButton').classList.add('d-none');
    document.getElementById('dispenserAmount').value = '';
    document.getElementById('dispenserCost').textContent = '0 WPOL';
    document.getElementById('dispenserError').style.display = 'none';
    if (window.priceRefreshInterval) clearInterval(window.priceRefreshInterval);
    window.priceRefreshInterval = null;
    document.getElementById('disconnectModal').classList.remove('show');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeMode();
    window.addEventListener('chainChanged', () => updateNetworkButton(window.web3Logic.chainId));
});