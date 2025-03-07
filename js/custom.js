// custom.js

/**
 * @file Application for interacting with Peng Protocol smart contracts on Polygon
 * @version 0.3.0
 */

/**
 * Constants for contract addresses and network configuration
 * @namespace Constants
 */
class Constants {
    // Contract addresses on Polygon
    static FREE_BASER_ADDRESS = "0x3bA341ea464ae63372Bfe60B572E677CE0d9a3Ba";
    static DISPENSER_ADDRESS = "0xB709FafF4f731bfD767354738cB8A38D08a92920";
    static PENG_NFT_ADDRESS = "0xB1a58fae5C0E952F64f9433789a350b8ab54D6D0";
    static WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
    static LUSD_ADDRESS = "0xF0FD398Ca09444F771eC968d9cbF073a744A544c";
    
    // Network configuration
    static POLYGON_CHAIN_ID = 137;
    static POLYGON_RPCS = [
        "https://polygon-rpc.com",
        "https://rpc-mainnet.matic.network",
        "https://matic-mainnet.chainstacklabs.com",
        "https://rpc-mainnet.maticvigil.com",
        "https://polygon-mainnet.g.alchemy.com/v2/demo" // Fallback public RPC
    ];
    
    static POLYGON_NETWORK_CONFIG = {
        chainId: `0x${this.POLYGON_CHAIN_ID.toString(16)}`,
        chainName: "Polygon PoS",
        nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
        rpcUrls: this.POLYGON_RPCS,
        blockExplorerUrls: ["https://polygonscan.com"]
    };
}

/**
 * Smart contract ABIs for interacting with blockchain
 * @namespace Abis
 */
class Abis {
    static FREE_BASER_ABI = [
        { inputs: [], name: "freebase", outputs: [], stateMutability: "nonpayable", type: "function" }
    ];
    
    static DISPENSER_ABI = [
        { inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }], name: "convert", outputs: [], stateMutability: "nonpayable", type: "function" }
    ];
    
    static PENG_NFT_ABI = [
        { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
    ];
    
    static WPOL_ABI = [
        { inputs: [{ internalType: "address", name: "guy", type: "address" }, { internalType: "uint256", name: "wad", type: "uint256" }], name: "approve", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
        { inputs: [{ internalType: "address", name: "", type: "address" }, { internalType: "address", name: "", type: "address" }], name: "allowance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" }
    ];
    
    static LUSD_ABI = [
        { inputs: [], name: "getPrice", outputs: [{ internalType: "int256", name: "", type: "int256" }], stateMutability: "view", type: "function" }
    ];
}

/**
 * Utility functions for the application
 * @namespace Utils
 */
class Utils {
    /**
     * Creates a debounced function that delays invoking func until after wait milliseconds
     * @param {Function} func - The function to debounce
     * @param {number} wait - The number of milliseconds to delay
     * @returns {Function} The debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * Truncates an Ethereum address for display
     * @param {string} address - The full Ethereum address
     * @returns {string} The truncated address (e.g., 0x1234...5678)
     */
    static truncateAddress(address) {
        if (!address) return null;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
}

/**
 * State management for persisting data between sessions
 * @namespace StateManager
 */
class StateManager {
    /**
     * Saves application state to localStorage
     * @param {Object} state - The state object to save
     */
    static saveState(state) {
        // Strip non-serializable objects before saving
        const { provider, signer, ...persistable } = state;
        localStorage.setItem('appState', JSON.stringify(persistable));
    }

    /**
     * Loads application state from localStorage
     * @returns {Object} The saved state or an empty object
     */
    static loadState() {
        return JSON.parse(localStorage.getItem('appState') || '{}');
    }
}

/**
 * Handles wallet connection and blockchain interactions
 * @class WalletManager
 */
class WalletManager {
    /**
     * Creates a new WalletManager instance
     * @param {Object} appState - Reference to the application state
     */
    constructor(appState) {
        this.appState = appState;
        this.fallbackProvider = new ethers.providers.JsonRpcProvider(Constants.POLYGON_RPCS[0]);
    }

    /**
     * Initializes or reconnects to a provider
     * @param {string} [account] - Optional account address to use
     * @returns {Promise<void>}
     */
    async initializeProvider(account) {
        console.log("Initializing provider...");
        const web3Provider = new ethers.providers.Web3Provider(this.appState.provider, "any");
        this.appState.signer = web3Provider.getSigner();
        this.appState.account = account || await this.appState.signer.getAddress();
        this.appState.truncatedAccount = Utils.truncateAddress(this.appState.account);
        this.appState.isConnected = true;
        
        const chainId = await web3Provider.getNetwork().then(net => net.chainId);
        console.log("Detected chain ID:", chainId);
        this.appState.isPolygon = chainId === Constants.POLYGON_CHAIN_ID;
        
        await this.refreshPengBalance();
        await this.updateWpolCost();
        StateManager.saveState(this.appState);
    }

    /**
     * Connects to browser-based wallet (MetaMask, etc.)
     * @returns {Promise<void>}
     */
    async connectBrowserWallet() {
        try {
            console.log("Connecting to browser wallet...");
            if (!window.ethereum) throw new Error("No wallet detected");
            
            this.appState.provider = window.ethereum;
            const accounts = await this.appState.provider.request({ method: 'eth_requestAccounts' });
            await this.initializeProvider(accounts[0]);
            document.getElementById('walletModal').classList.remove('show');
        } catch (e) {
            console.error("Connection failed:", e);
            alert(`Connection failed: ${e.message}`);
        }
    }

    /**
     * Connects via WalletConnect QR code
     * @returns {Promise<void>}
     */
    async connectQRCode() {
        try {
            console.log("Starting WalletConnect...");
            if (!window.WalletConnectProvider) throw new Error("WalletConnectProvider not loaded");
            
            const wcProvider = new window.WalletConnectProvider({ rpc: { 137: Constants.POLYGON_RPCS[0] } });
            const uri = await wcProvider.enable();
            this.appState.wcUri = uri;
            
            console.log("WC URI:", uri);
            QRCode.toCanvas(document.getElementById('qrCanvas'), uri, { width: 200 }, (error) => {
                if (error) console.error("QR Error:", error);
                else console.log("QR rendered successfully");
            });
            
            this.appState.provider = wcProvider;
            await this.initializeProvider(wcProvider.accounts[0]);
            document.getElementById('qrModal').classList.remove('show');
        } catch (e) {
            console.error("QR code connection failed:", e);
            alert(`Connection failed: ${e.message}`);
        }
    }

    /**
     * Handles network selection and switching
     * @returns {Promise<void>}
     */
    async handleNetworkSelection() {
        console.log("Network selection clicked");
        if (!this.appState.isConnected) {
            console.log("Not connected, opening wallet modal");
            document.getElementById('walletModal').classList.add('show');
            return;
        }
        
        try {
            const web3Provider = new ethers.providers.Web3Provider(this.appState.provider, "any");
            const chainId = await web3Provider.getNetwork().then(net => net.chainId);
            console.log("Current chain ID:", chainId);
            
            if (chainId !== Constants.POLYGON_CHAIN_ID) {
                console.log("Switching to Polygon...");
                try {
                    await this.appState.provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: Constants.POLYGON_NETWORK_CONFIG.chainId }]
                    });
                } catch (switchError) {
                    if (switchError.code === 4902) {
                        console.log("Adding Polygon network...");
                        await this.appState.provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [Constants.POLYGON_NETWORK_CONFIG]
                        });
                        await this.appState.provider.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: Constants.POLYGON_NETWORK_CONFIG.chainId }]
                        });
                    } else {
                        throw switchError;
                    }
                }
            }
            
            this.appState.isPolygon = (await web3Provider.getNetwork().then(net => net.chainId)) === Constants.POLYGON_CHAIN_ID;
            console.log("Updated isPolygon:", this.appState.isPolygon);
            StateManager.saveState(this.appState);
        } catch (e) {
            console.error("Network switch failed:", e);
            alert(`Network switch failed: ${e.message}`);
        }
    }

    /**
     * Disconnects the current wallet connection
     */
    disconnectWallet() {
        console.log("Disconnecting wallet...");
        if (this.appState.provider?.disconnect) this.appState.provider.disconnect();
        
        this.appState.isConnected = false;
        this.appState.account = null;
        this.appState.truncatedAccount = null;
        this.appState.isPolygon = false;
        this.appState.pengBalance = 0;
        this.appState.provider = null;
        this.appState.signer = null;
        this.appState.wcUri = null;
        this.appState.showDisconnectModal = false;
        
        document.getElementById('disconnectModal').classList.remove('show');
        StateManager.saveState(this.appState);
    }

    /**
     * Refreshes the Peng NFT balance
     * @returns {Promise<void>}
     */
    async refreshPengBalance() {
        if (!this.appState.signer) return;
        
        try {
            const pengContract = new ethers.Contract(
                Constants.PENG_NFT_ADDRESS, 
                Abis.PENG_NFT_ABI, 
                this.appState.signer
            );
            const balance = await pengContract.balanceOf(this.appState.account);
            this.appState.pengBalance = balance.toNumber();
            console.log("Peng balance:", this.appState.pengBalance);
            StateManager.saveState(this.appState);
        } catch (e) {
            console.error("Failed to fetch Peng balance:", e);
            this.appState.pengBalance = 0;
        }
    }
}

/**
 * Handles LUSD dispensing functionality
 * @class DispenserManager
 */
class DispenserManager {
    /**
     * Creates a new DispenserManager instance
     * @param {Object} appState - Reference to the application state
     */
    constructor(appState) {
        this.appState = appState;
        this.fallbackProvider = new ethers.providers.JsonRpcProvider(Constants.POLYGON_RPCS[0]);
    }

    /**
     * Updates the WPOL cost based on the current LUSD amount
     * @returns {Promise<void>}
     */
    async updateWpolCost() {
        console.log("Updating WPOL cost...");
        try {
            /**
             * Convert LUSD amount to tokens with 18 decimals
             * LUSD uses 18 decimals standard for ERC-20 tokens
             */
            const lusdAmount = ethers.utils.parseUnits(this.appState.dispenseAmount || "0", 18);
            
            if (!this.appState.signer) {
                // Fallback for no wallet connected
                const lusdContract = new ethers.Contract(
                    Constants.LUSD_ADDRESS, 
                    Abis.LUSD_ABI, 
                    this.fallbackProvider
                );
                
                /**
                 * Get price has 8 decimals precision
                 * Price represents WPOL to LUSD exchange rate
                 */
                const price = await lusdContract.getPrice();
                console.log("Fallback price:", price.toString());
                
                /**
                 * Calculate WPOL amount:
                 * WPOL amount = LUSD amount * 10^26 / price
                 * We use 10^26 because:
                 * - LUSD has 18 decimals
                 * - Price has 8 decimals
                 * - WPOL has 18 decimals
                 * So we need: 10^(18+8) = 10^26 for proper scaling
                 */
                const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price);
                this.appState.wpolCost = `${ethers.utils.formatUnits(wpolAmount, 18)} WPOL`;
                this.appState.needsApproval = false; // No approval without signer
                console.log("No signer, static WPOL cost:", this.appState.wpolCost);
            } else {
                const chainId = await this.appState.signer.getChainId();
                this.appState.isPolygon = chainId === Constants.POLYGON_CHAIN_ID;
                console.log("Signer chain ID:", chainId);
                
                const lusdContract = new ethers.Contract(
                    Constants.LUSD_ADDRESS, 
                    Abis.LUSD_ABI, 
                    this.appState.signer
                );
                
                /**
                 * Get price has 8 decimals precision
                 * Price represents WPOL to LUSD exchange rate
                 */
                const price = await lusdContract.getPrice();
                console.log("Fetched price:", price.toString());
                
                /**
                 * Calculate WPOL amount with 18 decimals
                 * Formula: LUSD amount * 10^26 / price
                 */
                const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price);
                this.appState.wpolCost = `${ethers.utils.formatUnits(wpolAmount, 18)} WPOL`;
                
                // Check if user has approved enough WPOL
                const wpolContract = new ethers.Contract(
                    Constants.WPOL_ADDRESS, 
                    Abis.WPOL_ABI, 
                    this.appState.signer
                );
                const allowance = await wpolContract.allowance(this.appState.account, Constants.DISPENSER_ADDRESS);
                this.appState.needsApproval = wpolAmount.gt(allowance);
                console.log("WPOL cost:", this.appState.wpolCost, "Needs approval:", this.appState.needsApproval);
            }
            
            StateManager.saveState(this.appState);
        } catch (e) {
            console.error("Error calculating WPOL cost:", e);
            this.appState.wpolCost = "Error";
            this.appState.needsApproval = false;
        }
    }

    /**
     * Executes either token approval or dispense action
     * Debounced to prevent multiple rapid calls
     * @returns {Promise<void>}
     */
    executeDispenseOrApprove = Utils.debounce(async function() {
        console.log("Executing dispense or approve...");
        if (!this.appState.signer || !this.appState.isPolygon) {
            console.log("Not connected to Polygon");
            alert("Connect wallet to Polygon first");
            return;
        }
        
        try {
            /**
             * Parse LUSD amount with 18 decimals
             */
            const lusdAmount = ethers.utils.parseUnits(this.appState.dispenseAmount, 18);
            
            const lusdContract = new ethers.Contract(
                Constants.LUSD_ADDRESS, 
                Abis.LUSD_ABI, 
                this.appState.signer
            );
            
            /**
             * Get price from contract (8 decimals)
             */
            const price = await lusdContract.getPrice();
            
            /**
             * Calculate WPOL amount (18 decimals)
             */
            const wpolAmount = lusdAmount.mul(ethers.BigNumber.from(10).pow(26)).div(price);
            
            const wpolContract = new ethers.Contract(
                Constants.WPOL_ADDRESS, 
                Abis.WPOL_ABI, 
                this.appState.signer
            );
            
            if (this.appState.needsApproval) {
                console.log("Approving WPOL...");
                const txApprove = await wpolContract.approve(Constants.DISPENSER_ADDRESS, wpolAmount);
                await txApprove.wait();
                this.appState.needsApproval = false;
                await this.updateWpolCost();
                console.log("Approval successful");
                return;
            }
            
            console.log("Executing dispense...");
            const dispenserContract = new ethers.Contract(
                Constants.DISPENSER_ADDRESS, 
                Abis.DISPENSER_ABI, 
                this.appState.signer
            );
            const tx = await dispenserContract.convert(lusdAmount);
            await tx.wait();
            this.appState.dispenseAmount = "1.0";
            document.getElementById('dispenserModal').classList.remove('show');
            console.log("Dispense executed");
            StateManager.saveState(this.appState);
        } catch (e) {
            console.error("Dispense/Approve failed:", e);
            alert(`Action failed: ${e.message}`);
        }
    }, 300);
}

/**
 * Handles freebase functionality
 * @class FreebaseManager
 */
class FreebaseManager {
    /**
     * Creates a new FreebaseManager instance
     * @param {Object} appState - Reference to the application state
     */
    constructor(appState) {
        this.appState = appState;
    }

    /**
     * Executes the freebase function on the contract
     * Debounced to prevent multiple rapid calls
     * @returns {Promise<void>}
     */
    executeFreebase = Utils.debounce(async function() {
        console.log("Executing freebase...");
        if (!this.appState.signer || !this.appState.isPolygon) {
            console.log("Not connected to Polygon");
            alert("Connect wallet to Polygon first");
            return;
        }
        
        try {
            const freebaseContract = new ethers.Contract(
                Constants.FREE_BASER_ADDRESS, 
                Abis.FREE_BASER_ABI, 
                this.appState.signer
            );
            const tx = await freebaseContract.freebase();
            await tx.wait();
            console.log("Freebase executed");
        } catch (e) {
            console.error("Freebase failed:", e);
            alert(`Freebase failed: ${e.message}`);
        }
    }, 300);
}

/**
 * Main application class that integrates all managers
 * @class App
 */
class App {
    /**
     * Creates the application state for Alpine.js
     * @returns {Object} Alpine.js compatible state object
     */
    static createAppState() {
        const state = StateManager.loadState();
        // Initialize Alpine.js state with saved data or defaults
        const appState = {
            isConnected: state.isConnected || false,
            account: state.account || null,
            truncatedAccount: state.truncatedAccount || null,
            isPolygon: state.isPolygon || false,
            pengBalance: state.pengBalance || 0,
            dispenseAmount: state.dispenseAmount || "1.0",
            wpolCost: state.wpolCost || "0 WPOL",
            needsApproval: state.needsApproval || false,
            showDisconnectModal: false,
            isDarkMode: state.isDarkMode || window.matchMedia('(prefers-color-scheme: dark)').matches,
            provider: null,
            signer: null,
            wcUri: null
        };

        // Create managers
        const walletManager = new WalletManager(appState);
        const dispenserManager = new DispenserManager(appState);
        const freebaseManager = new FreebaseManager(appState);

        // Add methods for Alpine.js
        return {
            ...appState,
            
            init() {
                console.log("Initializing app state...");
                document.body.classList.toggle("dark-mode", this.isDarkMode);
                if (this.isConnected && this.account) walletManager.initializeProvider.call(walletManager);
                dispenserManager.updateWpolCost.call(dispenserManager); // Initial cost display
            },
            
            // Wallet methods
            connectBrowserWallet() {
                return walletManager.connectBrowserWallet.call(walletManager);
            },
            
            connectQRCode() {
                return walletManager.connectQRCode.call(walletManager);
            },
            
            handleNetworkSelection() {
                return walletManager.handleNetworkSelection.call(walletManager);
            },
            
            disconnectWallet() {
                return walletManager.disconnectWallet.call(walletManager);
            },
            
            // Dispenser methods
            showDispenseModal() {
                console.log("Showing dispense modal");
                return dispenserManager.updateWpolCost.call(dispenserManager);
            },
            
            updateWpolCost() {
                return dispenserManager.updateWpolCost.call(dispenserManager);
            },
            
            executeDispenseOrApprove() {
                return dispenserManager.executeDispenseOrApprove.call(dispenserManager);
            },
            
            // Freebase method
            executeFreebase() {
                return freebaseManager.executeFreebase.call(freebaseManager);
            },
            
            // UI methods
            copyUri: async function() {
                if (this.wcUri) {
                    try {
                        await navigator.clipboard.writeText(this.wcUri);
                        console.log("URI copied to clipboard:", this.wcUri);
                        alert("URI copied to clipboard");
                    } catch (e) {
                        console.error("Clipboard copy failed:", e);
                        alert("Failed to copy URI");
                    }
                } else {
                    console.log("No URI available to copy");
                    alert("No URI available");
                }
            },
            
            toggleDarkMode() {
                console.log("Toggling dark mode...");
                this.isDarkMode = !this.isDarkMode;
                document.body.classList.toggle("dark-mode", this.isDarkMode);
                StateManager.saveState(this);
            }
        };
    }
}

/**
 * Alpine.js app state factory function
 * This is what gets called by Alpine's x-data directive
 * @returns {Object} Alpine.js state with all necessary methods
 */
function appState() {
    return App.createAppState();
}

// Log to confirm loading
console.log("custom.js loaded");

// v0.2.0