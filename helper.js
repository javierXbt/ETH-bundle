import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

// Function to load the config file
function loadConfig() {
  const configPath = path.resolve('evmgg.config.json');
  const configData = fs.readFileSync(configPath);
  return JSON.parse(configData);
}

// Function to initiate a blockchain session
export function initiateSession() {
  const config = loadConfig();

  if (!config.privateKey || !config.rpcUrl) {
    throw new Error('Invalid config: privateKey or rpcUrl is missing.');
  }

  // Create a provider
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  // Create a wallet instance
  const wallet = new ethers.Wallet(config.privateKey, provider);

  console.log('Session initiated with wallet:', wallet.address);

  return { wallet, provider };
}

// Example function to interact with a contract (replace with your logic)
// export async function getBalance() {
//   const { wallet } = initiateSession();
//   const balance = await wallet.getBalance();
//   console.log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);
// }

export async function getBalance() {
  const { wallet, provider } = initiateSession();

  // Fetch the balance using provider and wallet address
  const balance = await provider.getBalance(wallet.address);

  console.log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);
}
