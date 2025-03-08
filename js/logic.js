// ./js/logic.js
// Version: v0.1.15

const web3Logic = {
    walletAddress: null,
    chainId: null,
    error: null,
    rpcUrl: null,
    currentPrice: null,

    // Contract Addresses
    FREE_BASER_ADDRESS: "0x3bA341ea464ae63372Bfe60B572E677CE0d9a3Ba",
    DISPENSER_ADDRESS: "0xB709FafF4f731bfD767354738cB8A38D08a92920",
    PENG_NFT_ADDRESS: "0xB1a58fae5C0E952F64f9433789a350b8ab54D6D0",
    WPOL_ADDRESS: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    LUSD_ADDRESS: "0xF0FD398Ca09444F771eC968d9cbF073a744A544c",

    // Contract ABIs (for reference only, not used directly)
    FREE_BASER_ABI: [
        { inputs: [], name: "freebase", outputs: [], stateMutability: "nonpayable", type: "function" }
    ],
    DISPENSER_ABI: [
        { inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }], name: "convert", outputs: [], stateMutability: "nonpayable", type: "function" }
    ],
    PENG_NFT_ABI: [
        { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
    ],
    WPOL_ABI: [
        { inputs: [{ internalType: "address", name: "guy", type: "address" }, { internalType: "uint256", name: "wad", type: "uint256" }], name: "approve", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
        { inputs: [{ internalType: "address", name: "", type: "address" }, { internalType: "address", name: "", type: "address" }], name: "allowance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
    ],
    LUSD_ABI: [
        { inputs: [], name: "getPrice", outputs: [{ internalType: "int256", name: "", type: "int256" }], stateMutability: "view", type: "function" }
    ],

    async connectWallet() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                this.walletAddress = accounts[0];
                this.chainId = await window.ethereum.request({ method: 'eth_chainId' });
                this.rpcUrl = window.ethereum.rpcUrl || 'unknown';
                this.error = null;
                window.ethereum.on('accountsChanged', (accounts) => { this.walletAddress = accounts[0] || null; });
                window.ethereum.on('chainChanged', (newChainId) => { 
                    this.chainId = newChainId; 
                    window.dispatchEvent(new Event('chainChanged')); 
                });
            } catch (err) {
                this.error = 'Failed to connect wallet: ' + err.message;
            }
        } else {
            this.error = 'No Ethereum provider detected.';
        }
        return { address: this.walletAddress, chainId: this.chainId, rpcUrl: this.rpcUrl };
    },

    encodeParameters(types, values) {
        let data = '';
        for (let i = 0; i < types.length; i++) {
            if (types[i] === 'address') {
                data += values[i].replace('0x', '').padStart(64, '0');
            } else if (types[i] === 'uint256') {
                const hex = BigInt(values[i]).toString(16);
                data += hex.padStart(64, '0');
            }
        }
        return data;
    },

    decodeUint256(hex) { return BigInt('0x' + (hex.replace('0x', '') || '0')); },

    async fetchBalance(contractAddress, queryAddress) {
        if (!queryAddress) {
            this.error = 'No address provided to query.';
            return 0n;
        }
        try {
            const selector = '0x70a08231'; // balanceOf(address)
            const data = selector + this.encodeParameters(['address'], [queryAddress]);
            const result = await window.ethereum.request({
                method: 'eth_call',
                params: [{ to: contractAddress, data }, 'latest']
            });
            this.error = null;
            return this.decodeUint256(result);
        } catch (err) {
            this.error = 'Failed to fetch balance: ' + err.message;
            return 0n;
        }
    },

    async sendFreebaseTransaction() {
        if (!this.walletAddress) {
            this.error = 'Please connect your wallet first.';
            return null;
        }
        try {
            const selector = '0x641876a1'; // freebase
            const data = selector;
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: this.walletAddress,
                    to: this.FREE_BASER_ADDRESS,
                    data: data
                }]
            });
            this.error = null;
            return txHash;
        } catch (err) {
            this.error = 'Failed to send Freebase transaction: ' + err.message;
            return null;
        }
    },

    async fetchLUSDPrice() {
        try {
            const selector = '0x98d5fdca'; // getPrice
            const data = selector;
            console.log('Fetching LUSD price from:', this.LUSD_ADDRESS, 'on chain:', this.chainId);
            const result = await window.ethereum.request({
                method: 'eth_call',
                params: [{ to: this.LUSD_ADDRESS, data }, 'latest']
            });
            console.log('Raw result:', result);
            const priceUint256 = BigInt('0x' + (result.replace('0x', '') || '0'));
            const priceHuman = Number(priceUint256) / 1e8;
            const priceNormalized = priceUint256 * BigInt(1e10);
            this.error = null;
            return { human: priceHuman, uint256: priceNormalized };
        } catch (err) {
            console.error('Fetch LUSD price failed:', err);
            this.error = 'Failed to fetch LUSD price: ' + (err.message || 'Unknown error');
            return { human: 0, uint256: 0n };
        }
    },

    async fetchAllowance(owner, spender) {
        try {
            const selector = '0xdd62ed3e'; // allowance(address,address)
            const data = selector + this.encodeParameters(['address', 'address'], [owner, spender]);
            const result = await window.ethereum.request({
                method: 'eth_call',
                params: [{ to: this.WPOL_ADDRESS, data }, 'latest']
            });
            this.error = null;
            return this.decodeUint256(result);
        } catch (err) {
            this.error = 'Failed to fetch allowance: ' + err.message;
            return 0n;
        }
    },

    async approveWPOL(spender, amount) {
        if (!this.walletAddress) {
            this.error = 'Please connect your wallet first.';
            return null;
        }
        try {
            const paddedAmount = amount * BigInt(110) / BigInt(100); // 10% buffer
            const selector = '0x095ea7b3'; // approve(address,uint256)
            const data = selector + this.encodeParameters(['address', 'uint256'], [spender, paddedAmount]);
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: this.walletAddress,
                    to: this.WPOL_ADDRESS,
                    data: data
                }]
            });
            this.error = null;
            return txHash;
        } catch (err) {
            this.error = 'Failed to approve WPOL: ' + (err.message || 'Unknown error');
            return null;
        }
    },

    async convertWPOL(amount) {
        if (!this.walletAddress) {
            this.error = 'Please connect your wallet first.';
            return null;
        }
        try {
            const selector = '0xa3908e1b'; // convert
            const data = selector + this.encodeParameters(['uint256'], [amount]);
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: this.walletAddress,
                    to: this.DISPENSER_ADDRESS,
                    data: data
                }]
            });
            this.error = null;
            return txHash;
        } catch (err) {
            this.error = 'Failed to convert WPOL: ' + err.message;
            return null;
        }
    },

    async checkTransactionReceipt(txHash) {
        try {
            const receipt = await window.ethereum.request({
                method: 'eth_getTransactionReceipt',
                params: [txHash]
            });
            this.error = null;
            if (receipt === null) return null; // Pending
            return receipt.status === '0x1'; // true (success) or false (failed)
        } catch (err) {
            this.error = 'Failed to check transaction receipt: ' + err.message;
            throw err; // Let caller handle
        }
    }
};

window.web3Logic = web3Logic;