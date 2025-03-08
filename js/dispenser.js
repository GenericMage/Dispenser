// ./js/dispenser.js
// Version: v0.1.5

let lastPriceFetch = 0;
let lastCostUpdate = 0;
let lastAllowanceCheck = 0;
const debounceDelay = 1000;
window.priceRefreshInterval = window.priceRefreshInterval || null;

async function fetchAndUpdatePrice() {
    try {
        lastPriceFetch = Date.now();
        const priceData = await window.web3Logic.fetchLUSDPrice();
        if (priceData.human > 0) {
            document.getElementById('dispenserCost').textContent = `1 WPOL = ${priceData.human.toFixed(8)} LUSD`;
            window.web3Logic.currentPrice = priceData;
            updateCostAndAllowance();
            document.getElementById('dispenserError').style.display = 'none';
        } else if (window.web3Logic.error) {
            showError(window.web3Logic.error);
        }
    } catch (err) {
        console.error('Price fetch failed:', err);
        showError('Failed to fetch price.');
    }
}

function updateCostAndAllowance() {
    const lusdInput = document.getElementById('dispenserAmount').value;
    const now = Date.now();
    if (!lusdInput || now - lastCostUpdate < debounceDelay) return;
    lastCostUpdate = now;

    if (window.web3Logic.currentPrice && window.web3Logic.currentPrice.human > 0) {
        const lusdAmount = BigInt(Math.floor(Number(lusdInput) * 1e18));
        const wpolCost = lusdAmount * BigInt(1e18) / window.web3Logic.currentPrice.uint256;
        const wpolCostHuman = Number(wpolCost) / 1e18;
        document.getElementById('dispenserCost').textContent = `${wpolCostHuman.toFixed(6)} WPOL for ${lusdInput} LUSD`;
        if (window.web3Logic.walletAddress) {
            checkAllowance(wpolCost);
        }
    }
}

async function checkAllowance(wpolCost) {
    try {
        console.log('Checking allowance for:', window.web3Logic.walletAddress, 'to Dispenser:', window.web3Logic.DISPENSER_ADDRESS);
        const allowance = await window.web3Logic.fetchAllowance(window.web3Logic.walletAddress, window.web3Logic.DISPENSER_ADDRESS);
        console.log('Current allowance:', allowance.toString(), 'vs required:', wpolCost.toString());
        const executeButton = document.getElementById('dispenserExecute');
        if (allowance < wpolCost) {
            executeButton.textContent = 'Approve';
            executeButton.onclick = () => handleApprove(wpolCost);
        } else {
            executeButton.textContent = 'Execute';
            executeButton.onclick = () => handleConvert(wpolCost);
        }
        lastAllowanceCheck = Date.now();
        window.web3Logic.error = null;
        document.getElementById('dispenserError').style.display = 'none';
    } catch (err) {
        console.error('Allowance check failed:', err);
        showError('Failed to check allowance.');
    }
}

async function handleApprove(amount) {
    try {
        console.log('Approving WPOL:', amount.toString(), 'with 10% buffer');
        const txHash = await window.web3Logic.approveWPOL(window.web3Logic.DISPENSER_ADDRESS, amount);
        if (txHash) {
            console.log('Approval successful, txHash:', txHash);
            alert(`Approval sent: ${txHash}`);
            pollAllowance(amount);
        } else if (window.web3Logic.error) {
            console.error('Approval returned null with error:', window.web3Logic.error);
            showError(window.web3Logic.error);
        }
    } catch (err) {
        console.error('Approval failed:', err);
        showError('Failed to approve WPOL: ' + (err.message || 'Unknown error'));
    }
}

async function pollAllowance(amount) {
    const interval = setInterval(async () => {
        try {
            const allowance = await window.web3Logic.fetchAllowance(window.web3Logic.walletAddress, window.web3Logic.DISPENSER_ADDRESS);
            if (allowance >= amount) {
                console.log('Allowance sufficient, stopping poll:', allowance.toString());
                clearInterval(interval);
                updateCostAndAllowance();
            }
        } catch (err) {
            console.error('Allowance polling failed:', err);
        }
    }, 2000);
}

async function handleConvert(amount) {
    try {
        console.log('Converting WPOL:', amount.toString(), 'to LUSD');
        if (!window.web3Logic.currentPrice || window.web3Logic.currentPrice.human <= 0) {
            showError('Price not available. Please refresh.');
            return;
        }
        const txHash = await window.web3Logic.convertWPOL(amount);
        if (txHash) {
            console.log('Transaction sent:', txHash);
            showPending(`Transaction Pending: ${txHash}`);
            pollTransactionReceipt(txHash);
        } else if (window.web3Logic.error) {
            showError(window.web3Logic.error);
        }
    } catch (err) {
        console.error('Convert failed:', err);
        showError('Failed to convert WPOL: ' + (err.message || 'Unknown error'));
    }
}

async function pollTransactionReceipt(txHash) {
    const interval = setInterval(async () => {
        try {
            const status = await window.web3Logic.checkTransactionReceipt(txHash);
            if (status === true) {
                console.log('Transaction confirmed:', txHash);
                clearInterval(interval);
                alert(`LUSD dispensed: ${txHash}`);
                document.getElementById('dispenserModal').classList.remove('show');
                document.getElementById('dispenserError').style.display = 'none';
            } else if (status === false) {
                console.log('Transaction failed:', txHash);
                clearInterval(interval);
                showError('Transaction Failed');
            }
            // If status is null, keep polling (pending)
        } catch (err) {
            console.error('Receipt polling failed:', err);
            clearInterval(interval);
            showError('Failed to check transaction status: ' + (err.message || 'Unknown error'));
        }
    }, 2000);
}

function showError(message) {
    const errorSpan = document.getElementById('dispenserError');
    errorSpan.textContent = message;
    errorSpan.style.display = 'block';
    console.log('Error displayed:', message);
}

function showPending(message) {
    const errorSpan = document.getElementById('dispenserError');
    errorSpan.textContent = message;
    errorSpan.style.display = 'block';
    console.log('Pending status displayed:', message);
}

// Event Listener
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('dispenserAmount').addEventListener('input', (e) => {
        const value = e.target.value;
        if (!/^\d*\.?\d*$/.test(value) || Number(value) < 0) {
            e.target.value = '';
        }
        setTimeout(updateCostAndAllowance, 1000);
    });
    document.getElementById('dispenseButton').addEventListener('click', () => {
        fetchAndUpdatePrice();
        if (!window.priceRefreshInterval) {
            window.priceRefreshInterval = setInterval(() => {
                fetchAndUpdatePrice();
            }, 30000);
        }
    });
});