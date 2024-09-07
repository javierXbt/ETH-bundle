import { ethers } from "ethers";
import fs from "fs";
import path from "path";
// Uniswap V2 Pair ABI (simplified, including only the functions you need)
const UNISWAP_V2_PAIR_ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];


function loadConfig() {
  const configPath = path.resolve("evmgg.config.json");
  const configData = fs.readFileSync(configPath);
  return JSON.parse(configData);
}

function initializeSession() {
  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  return { wallet, provider };
}

const config = loadConfig();
// Uniswap V2 Pair Address for ETH-USDC (replace with actual address)
const UNISWAP_V2_PAIR_ADDRESS = config.UNISWAP_V2_PAIR_ADDRESS;

const provider = initializeSession().provider;

// Function to get ETH price in USDC
export async function getETHPriceInUSDC() {
  const pairContract = new ethers.Contract(
    UNISWAP_V2_PAIR_ADDRESS,
    UNISWAP_V2_PAIR_ABI,
    provider
  );

  // Fetch reserves
  const [reserve0, reserve1] = await pairContract.getReserves();

  const ethReserve = ethers.formatEther(reserve0, 18);
  const usdcReserve = ethers.formatEther(reserve1, 6);

  const ethPriceInUSDC = usdcReserve / ethReserve;
  const priceInWei = ethPriceInUSDC;
  const weiPerEth = 10 ** 12;
  const ethPriceInUSD = priceInWei * weiPerEth;

  return ethPriceInUSD;
}
