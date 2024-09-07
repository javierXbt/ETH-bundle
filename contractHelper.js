import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

// Example ABIs (Replace these with actual ABIs of your contracts)
import standardTokenDeployerABI from './abis/StandardTokenDeployer.json'assert { type: 'json' };
import uniswapPoolCreatorABI from './abis/uniswapPoolCreatorABI.json'assert { type: 'json' };

// import uniswapV2RouterABI from './abis/UniswapV2Router.json';
// import uniswapV3RouterABI from './abis/UniswapV3Router.json';

// Load config from evmgg.config.json
export function loadConfig() {
  const configPath = path.resolve('evmgg.config.json');
  const configData = fs.readFileSync(configPath);
  return JSON.parse(configData);
}



// Initialize provider and wallet
export function initializeSession() {
  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  return { wallet, provider };
}

const erc20Abi = [
  // Minimal ERC20 ABI for approval
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

// Set approval amount to maximum (unlimited)
const MAX_UINT256 = ethers.MaxUint256;

export async function approveUnlimitedSpend(tokenAddress, spenderAddresses) {
  try {
    // Initialize token contract instance
    const { wallet } = initializeSession();
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);

    for (const spenderAddress of spenderAddresses) {
      // Check current allowance
      const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
      console.log(`Current allowance for ${spenderAddress}:`, currentAllowance.toString());

      // If allowance is already MAX_UINT256, no need to approve again
      if (currentAllowance == (MAX_UINT256)) {
        console.log(`Unlimited spend already approved for ${spenderAddress}`);
      } else {
        // Approve unlimited spending
        const tx = await tokenContract.approve(spenderAddress, MAX_UINT256);
        await tx.wait();
        console.log(`Approved unlimited spend for ${spenderAddress}. Transaction Hash: ${tx.hash}`);
      }
    }
  } catch (error) {
    console.error("Error in approving spend:", error);
  }
}


export async function getTransactionReceipt(txHash) {
  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  return receipt;
}

export async function findTokenAddressFromTopic(txHash) {
const config = loadConfig();
const topicHash = config.standardTokenTopic
const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const receipt = await provider.getTransactionReceipt(txHash);
for (const log of receipt.logs) {
    if (log.topics[0] === topicHash) {
        console.log("Token Minted at Address: ");
        console.log(log.address);
        return log.address;
    }
}
}
// Function to get the Standard Token Deployer contract instance
export function getStandardTokenDeployerContract() {
  const { wallet } = initializeSession();
  const config = loadConfig();
  const contract = new ethers.Contract(
    config.standardTokenDeployer,
    standardTokenDeployerABI,
    wallet
  );
  return contract;
}

// Function to get the Uniswap Pool Creator contract instance
export function getUniswapPoolCreatorContract() {
  const { wallet } = initializeSession();
  const config = loadConfig();
  const contract = new ethers.Contract(
    config.uniswapPoolCreator,
    uniswapPoolCreatorABI,
    wallet
  );
  return contract;
}
export async function addLiquidityToPool(tokenAddress, tokenAmount, ethAmount, snipeEthAmount, path) {
  try {
    const poolCreator = getUniswapPoolCreatorContract();

    console.log('Adding liquidity to pool...');
    console.log('Token Address:', tokenAddress);
    console.log('Token Amount:', tokenAmount);
    console.log('ETH Amount:', ethAmount);
    console.log('Snipe ETH Amount:', snipeEthAmount);
    console.log('Path:', path);
    const sendValue = 
      (Number(ethAmount + snipeEthAmount)).toString();
    console.log('Send Value:', sendValue);


    const spender =  [loadConfig().uniswapV2Router, loadConfig().uniswapPoolCreator];

    await approveUnlimitedSpend(tokenAddress, spender)
    
    const sendTokenAmount = (ethers.parseUnits((tokenAmount).toString(), 9)).toString();
    console.log('Send Token Amount:', sendTokenAmount);

    const tx = await poolCreator.addToPoolV2(tokenAddress, sendTokenAmount, ethAmount, snipeEthAmount, [loadConfig().WETH , tokenAddress], {
      value: sendValue
    });
    const receipt = await tx.wait();
    const transactionData = {
      transactionHash: receipt.hash,
      from: receipt.from,
      to: receipt.to,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      logs: receipt.logs,
      blockNumber: receipt.blockNumber
    };

    
    const pool = fs.existsSync('logs/pool') ? 'logs/pool' : 'logs/pool';
    if (!fs.existsSync(pool)) {
      fs.mkdirSync(pool, { recursive: true });
    }
    const logFilePath = path.join(pool, `${receipt.hash}.json`);
    fs.writeFileSync(logFilePath, JSON.stringify(transactionData, null, 2), 'utf-8');
    console.log(`Transaction logged `);
  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('Insufficient funds to complete transaction');
    } else {
      console.error('Transaction Error:', error);
    }
    // console.error('Transaction Error:', error);
  }
}
// // Function to get the Uniswap V2 Router contract instance
// export function getUniswapV2RouterContract() {
//   const { wallet } = initializeSession();
//   const config = loadConfig();
//   const contract = new ethers.Contract(
//     config.uniswapV2Router,
//     uniswapV2RouterABI,
//     wallet
//   );
//   return contract;
// }

// // Function to get the Uniswap V3 Router contract instance
// export function getUniswapV3RouterContract() {
//   const { wallet } = initializeSession();
//   const config = loadConfig();
//   const contract = new ethers.Contract(
//     config.uniswapV3Router,
//     uniswapV3RouterABI,
//     wallet
//   );
//   return contract;
// }
