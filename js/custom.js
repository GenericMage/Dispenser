// custom.js

// --- Constants ---
const FREE_BASER_ADDRESS = "0x3bA341ea464ae63372Bfe60B572E677CE0d9a3Ba";
const DISPENSER_ADDRESS = "0xB709FafF4f731bfD767354738cB8A38D08a92920";
const PENG_NFT_ADDRESS = "0xB1a58fae5C0E952F64f9433789a350b8ab54D6D0";
const WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const LUSD_ADDRESS = "0xF0FD398Ca09444F771eC968d9cbF073a744A544c";
const POLYGON_CHAIN_ID = 137;
const POLYGON_RPCS = [
    "https://polygon-rpc.com",
    "https://rpc-mainnet.matic.network",
    "https://matic-mainnet.chainstacklabs.com",
    "https://rpc-mainnet.maticvigil.com"
];
const POLYGON_NETWORK_CONFIG = {
    chainId: `0x${POLYGON_CHAIN_ID.toString(16)}`,
    chainName: "Polygon PoS",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: POLYGON_RPCS,
    blockExplorerUrls: ["https://polygonscan.com"]
};

// --- ABIs ---
const FREE_BASER_ABI = [
    { inputs: [], name: "freebase", outputs: [], stateMutability: "nonpayable", type: "function" }
];
const DISPENSER_ABI = [
    { inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }], name: "convert", outputs: [], stateMutability: "nonpayable", type: "function" }
];
const PENG_NFT_ABI = [
    { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
];
const WPOL_ABI = [
    { inputs: [{ internalType: "address", name: "guy", type: "address" }, { internalType: "uint256", name: "wad", type: "uint256" }], name: "approve", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ internalType: "address", name: "", type: "address" }, { internalType: "address", name: "", type: "address" }], name: "allowance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
];
const LUSD_ABI = [
    { inputs: [], name: "getPrice", outputs: [{ internalType: "int256", name: "", type: "int256" }], stateMutability: "view", type: "function" }
];

// --- Utility Functions ---
const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

// --- Alpine.js State ---
function appState() {
    const state = loadState();
    return {
        isConnected: state.isConnected || false,
        account: state.account || null,
        truncatedAccount: state.account ? `${state.account.slice(0, 6)}...${state.account.slice(-4)}` : null,
        isPolygon: state.isPolygon || false,
        pengBalance: state.pengBalance || 0,
        dispenseAmount: state.dispenseAmount || "1.0",
        wpolCost: state.wpolCost || "0 WPOL",
        needsApproval: state.needsApproval || false,
        showDisconnectModal: false,
        isDarkMode: state.isDarkMode || window.matchMedia('(prefers-color-scheme: dark)').matches,
        provider: null,
        signer: null,

        init() {
            document.body.classList.toggle("dark-mode", this.isDarkMode);
            if (this.isConnected && this.account) this.initializeProvider();
        },

        async connectWallet() {
            if (this.isConnected) {
                this.showDisconnectModal = true;
            }
            // Modal opens via data-bs-toggle, no further action needed here
        },

        async connectBrowserWallet() {
            try {
                if (!window.ethereum) throw new Error("No wallet detected");
                this.provider = window.ethereum;
                const accounts = await this.provider.request({ method: 'eth_requestAccounts' });
                await this.initializeProvider(accounts[0]);
                this.$nextTick(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('walletModal'));
                    modal.hide();
                });
            } catch (e) {
                console.error("Browser wallet connection failed:", e);
            }
        },

        async connectQRCode() {
            try {
                const wcProvider = new WalletConnectProvider({ rpc: { 137: POLYGON_RPCS[0] } });
                const uri = await wcProvider.enable(); // Triggers QR modal
                this.provider = wcProvider;
                await this.initializeProvider(wcProvider.accounts[0]);
                this.$nextTick(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('walletModal'));
                    modal.hide();
                });
            } catch (e) {
                console.error("QR code connection failed:", e);
            }
        },

        async copyUri() {
            if (this.provider?.connector?.uri) {
                await navigator.clipboard.writeText(this.provider.connector.uri);
                alert("URI copied to clipboard");
            }
        },

        async initializeProvider(account) {
            const web3Provider = new ethers.providers.Web3Provider(this.provider);
            this.signer = web3Provider.getSigner();
            this.account = account || await this.signer.getAddress();
            this.truncatedAccount = `${this.account.slice(0, 6)}...${this.account.slice(-4)}`;
            this.isConnected = true;
            const chainId = await this.signer.getChainId();
            this.isPolygon = chainId === POLYGON_CHAIN_ID;
            await this.refreshPengBalance();
            await this.updateWpolCost();
            saveState(this.$data);
        },

        async handleNetworkSelection() {
            if (!this.isConnected) {
                document.getElementById('connectWallet').click();
                return;
            }
            try {
                const chainId = await this.signer.getChainId();
                if (chainId !== POLYGON_CHAIN_ID) {
                    try {
                        await this.provider.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: POLYGON_NETWORK_CONFIG.chainId }]
                        });
                    } catch (switchError) {
                        if (switchError.code === 4902) {
                            await this.provider.request({
                                method: 'wallet_addEthereumChain',
                                params: [POLYGON_NETWORK_CONFIG]
                            });
                            await this.provider.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: POLYGON_NETWORK_CONFIG.chainId }]
                            });
                        } else {
                            throw switchError;
                        }
                    }
                }
                this.isPolygon = (await this.signer.getChainId()) === POLYGON_CHAIN_ID;
                saveState(this.$data);
            } catch (e) {
                console.error("Network switch failed:", e);
            }
        },

        async refreshPengBalance() {
            if (!this.signer) return;
            try {
                const pengContract = new ethers.Contract(PENG_NFT_ADDRESS, PENG_NFT_ABI, this.signer);
                const balance = await pengContract.balanceOf(this.account);
                this.pengBalance = balance.toNumber();
                saveState(this.$data);
            } catch (e) {
                console.error("Failed to fetch Peng balance:", e);
                this.pengBalance = 0;
            }
        },

        showDispenseModal() {
            this.updateWpolCost();
        },

        async updateWpolCost() {
            if (!this.signer || !this.isPolygon) {
                this.wpolCost = "0 WPOL";
                return;
            }
            try {
                const lusdAmount = ethers.utils.parseUnits(this.dispenseAmount || "0", 18);
                const lusdContract = new ethers.Contract(LUSD_ADDRESS, LUSD_ABI, this.signer);
                const price = await lusdContract.getPrice(); // LUSD per WPOL, 8 decimals
                const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price); // 18 + 18 - 8 = 26
                this.wpolCost = `${ethers.utils.formatUnits(wpolAmount, 18)} WPOL`;
                const wpolContract = new ethers.Contract(WPOL_ADDRESS, WPOL_ABI, this.signer);
                const allowance = await wpolContract.allowance(this.account, DISPENSER_ADDRESS);
                this.needsApproval = wpolAmount.gt(allowance);
                saveState(this.$data);
            } catch (e) {
                console.error("Error calculating WPOL cost:", e);
                this.wpolCost = "Error";
                this.needsApproval = false;
            }
        },

        executeDispenseOrApprove: debounce(async function() {
            if (!this.signer || !this.isPolygon) {
                alert("Connect wallet to Polygon first");
                return;
            }
            try {
                const lusdAmount = ethers.utils.parseUnits(this.dispenseAmount, 18);
                const lusdContract = new ethers.Contract(LUSD_ADDRESS, LUSD_ABI, this.signer);
                const price = await lusdContract.getPrice();
                const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price);
                const wpolContract = new ethers.Contract(WPOL_ADDRESS, WPOL_ABI, this.signer);
                if (this.needsApproval) {
                    const txApprove = await wpolContract.approve(DISPENSER_ADDRESS, wpolAmount);
                    await txApprove.wait();
                    this.needsApproval = false;
                    this.updateWpolCost();
                    return;
                }
                const dispenserContract = new ethers.Contract(DISPENSER_ADDRESS, DISPENSER_ABI, this.signer);
                const tx = await dispenserContract.convert(lusdAmount);
                await tx.wait();
                this.dispenseAmount = "1.0";
                this.$nextTick(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('dispenserModal'));
                    modal.hide();
                });
                saveState(this.$data);
            } catch (e) {
                console.error("Dispense/Approve failed:", e);
                alert(`Action failed: ${e.message}`);
            }
        }, 300),

        executeFreebase: debounce(async function() {
            if (!this.signer || !this.isPolygon) {
                alert("Connect wallet to Polygon first");
                return;
            }
            try {
                const freebaseContract = new ethers.Contract(FREE_BASER_ADDRESS, FREE_BASER_ABI, this.signer);
                const tx = await freebaseContract.freebase();
                await tx.wait();
            } catch (e) {
                console.error("Freebase failed:", e);
                alert(`Freebase failed: ${e.message}`);
            }
        }, 300),

        disconnectWallet() {
            if (this.provider?.disconnect) this.provider.disconnect();
            this.isConnected = false;
            this.account = null;
            this.truncatedAccount = null;
            this.isPolygon = false;
            this.pengBalance = 0;
            this.provider = null;
            this.signer = null;
            this.showDisconnectModal = false;
            this.$nextTick(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('disconnectModal'));
                modal.hide();
            });
            saveState(this.$data);
        },

        toggleDarkMode() {
            this.isDarkMode = !this.isDarkMode;
            document.body.classList.toggle("dark-mode", this.isDarkMode);
            saveState(this.$data);
        }
    };
}

// --- State Persistence ---
const saveState = (state) => {
    const { provider, signer, ...persistable } = state; // Exclude non-serializable fields
    localStorage.setItem('appState', JSON.stringify(persistable));
};
const loadState = () => JSON.parse(localStorage.getItem('appState') || '{}');

// Log to confirm loading
console.log("custom.js loaded");