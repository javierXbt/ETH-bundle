import { ethers } from 'ethers';

function initializeSession() {
  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  return { wallet, provider };
}


// const topicHash = "0x56358b41df5fa59f5639228f0930994cbdde383c8a8fd74e06c04e1deebe3562";
// findTokenAddressFromTopic(transactionHash, topicHash).then(console.log);

