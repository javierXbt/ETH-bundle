#!/usr/bin/env node
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import cleanup from 'node-cleanup';
import { ethers, formatEther, toBigInt } from "ethers";
import BigNumber from "bignumber.js";
import {
  addLiquidityToPool,
  findTokenAddressFromTopic,
  getStandardTokenDeployerContract,
  initializeSession,
  loadConfig,
} from "./contractHelper.js";
import { getETHPriceInUSDC } from "./usdPrice.js";
import Table from 'cli-table3';
import ora from 'ora';


cleanup((exitCode, signal) => {
  console.log(`\nExited ctrl+c ...`);
  
  process.exit();
});

const tokenDirPath = path.resolve("token");
const standardTokenPath = path.join(tokenDirPath, "standard");
const liquidityGeneratorPath = path.join(tokenDirPath, "liquidity-generator");
function saveTokenDetails(tokenDetails, folder = "standard") {
  const spinner = ora('Saving token files....').start();
  const baseDir = path.join("token", folder);
  let dirPath = path.join(baseDir, tokenDetails.name);
  let counter = 1;

  // Check if folder already exists, if so append a numeric value
  while (fs.existsSync(dirPath)) {
    dirPath = path.join(baseDir, `${tokenDetails.name}-${counter}`);
    counter++;
  }

  // Create directory with unique name
  fs.mkdirSync(dirPath, { recursive: true });

  // Save token details to the JSON file inside the newly created folder
  const filePath = path.join(dirPath, `${tokenDetails.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(tokenDetails, null, 2));
  spinner.succeed('Success');
  console.log(`Token details saved to ${filePath}`);
}
async function createToken(type, tokenName, tokenSymbol, decimals, supply) {
  console.log(`Creating ${type} Token...`);
  const spinner = ora('token creation in progress...').start();
  try {
    const tokenDeployer = getStandardTokenDeployerContract();
    const flatFee = await tokenDeployer.getFlatFee();
    const tx = await tokenDeployer.create(
      tokenName,
      tokenSymbol,
      decimals,
      supply,
      {
        value: flatFee,
      }
    );
    const receipt = await tx.wait();
    const transactionData = {
      transactionHash: receipt,
      from: receipt.from,
      to: receipt.to,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      logs: receipt.logs,
      blockNumber: receipt.blockNumber,
    };
    const logFolder = path.resolve("log");
    const standard = path.resolve("standard");
    if (!fs.existsSync(logFolder)) {
      fs.mkdirSync(logFolder, { recursive: true });
    }
    if (!fs.existsSync(standard)) {
      fs.mkdirSync(standard, { recursive: true });
    }
    const logFilePath = path.join(standard, `${receipt.hash}.json`);
    fs.writeFileSync(
      logFilePath,
      JSON.stringify(transactionData, null, 2),
      "utf-8"
    );
    console.log(`Transaction saved to log`);
    const tokenContractAddress = await findTokenAddressFromTopic(receipt.hash);
    const tokenDetails = {
      name: tokenName,
      symbol: tokenSymbol,
      decimals: decimals,
      totalSupply: supply,
      contractAddress: tokenContractAddress,
    };
    saveTokenDetails(tokenDetails);
    spinner.succeed('Success');
    console.log(`Token Created: ${tokenName} (${tokenSymbol})`);
  } catch (e) {
    console.log(e);
  }
}
function getTokensFromDirectory(directoryPath) {
  const spinner = ora('fetching tokens from dir...').start();
  try {
    const tokenFolders = fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => {
        const tokenFolderPath = path.join(directoryPath, dirent.name);
        const jsonFilePath = path.join(tokenFolderPath, `${dirent.name}.json`);

        if (fs.existsSync(jsonFilePath)) {
          const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
          return {
            name: dirent.name,
            data: jsonData,
          };
        } else {
          return null;
        }
      })
      .filter((token) => token !== null);
      spinner.succeed('Success');
    return tokenFolders;
  } catch (error) {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
    return [];
  }
}

// Bulk send tokens to worker wallets
async function bulkSendTokens(tokenAddress, amount, privateKeys) {
  const tokenABI = [
    "function transfer(address to, uint256 amount) returns (bool)"
  ];

  const contract = new ethers.Contract(tokenAddress, tokenABI, provider);

  for (const privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, provider);
    try {
      const tx = await contract.connect(wallet).transfer(wallet.address, ethers.parseUnits(amount.toString(), 'ether'));
      console.log(`Transaction sent for wallet ${wallet.address}: ${tx.hash}`);
    } catch (error) {
      console.error(`Error sending token to wallet ${wallet.address}:`, error);
    }
  }
}

// Main function to manage tokens
// Function to create a token manager and display token details
async function tokenManager() {
  const tokenDirPath = path.resolve('token');
  const tokens = getTokensFromDirectoryManager(tokenDirPath);

  if (!tokens || tokens.length === 0) {
    console.log('No tokens found.');
    return;
  }

  const table = new Table({
    head: ['Token Name', 'Contract Address', 'Decimals', 'Total Supply', 'Has Uniswap V2 Pool?'],
    colWidths: [20, 45, 10, 15, 20],
  });

  // Loop through the tokens and get details
  for (const token of tokens) {
    const tokenAddress = token.data.contractAddress;
    const decimals = token.data.decimals || 18;
    const supply = token.data.totalSupply || 'Unknown';

    // Check if token has a Uniswap V2 pool

    const hasPool = false

    // Add token details to the table
    table.push([
      token.name,
      tokenAddress,
      decimals,
      supply,
      hasPool ? 'Yes' : 'No',
    ]);
  }

  // Display the token details in the table format
  console.log(table.toString());

  // Allow user to select a token for management
  const { selectedTokenName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedTokenName',
      message: 'Select a token to manage:',
      choices: tokens.map((token) => token.name),
    },
  ]);

  const selectedToken = tokens.find((token) => token.name === selectedTokenName);

  if (selectedToken) {
    await manageToken(selectedToken); // Call token management function
  } else {
    console.log('Token not found.');
  }
}

async function manageToken(token) {
  console.log(`Managing token: ${token.name}`);
  console.log(`Contract Address: ${token.data.contractAddress}`);
  console.log(`Decimals: ${token.data.decimals}`);
  console.log(`Total Supply: ${token.data.totalSupply}`);

  const actions = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `What would you like to do with ${token.name}?`,
      choices: ['View Details', 'Send Tokens', 'Back'],
    },
  ]);

  if (actions.action === 'View Details') {
    // Display token details
    console.log('Token Details:');
    console.log(`Contract Address: ${token.data.contractAddress}`);
    console.log(`Decimals: ${token.data.decimals}`);
    console.log(`Total Supply: ${token.data.totalSupply}`);
    // Add more details here if needed
    await manageToken(token); // Return to token management menu
  } else if (actions.action === 'Send Tokens') {
    // Function to send tokens (placeholder logic)
    const { recipientAddress, amount } = await inquirer.prompt([
      { type: 'input', name: 'recipientAddress', message: 'Enter recipient address:' },
      { type: 'input', name: 'amount', message: 'Enter amount to send:' },
    ]);

    // Use ethers.js to send tokens (placeholder logic)
    console.log(`Sending ${amount} tokens to ${recipientAddress} from ${token.name}...`);
    // Logic for sending tokens would go here.
    await manageToken(token); // Return to token management menu
  } else if (actions.action === 'Back') {
    await tokenManager(); // Go back to token selection
  }
}


async function createLiquidityGeneratorToken(
  tokenName,
  tokenSymbol,
  decimal,
  supply
) {
  await createToken(
    "Liquidity Generator",
    tokenName,
    tokenSymbol,
    decimal,
    supply
  );
}

// Function to get tokens from the specified directory structure
function getTokensFromDirectoryManager(parentDir) {
  const spinner = ora('Fetching tokens from directory...').start();

  try {
    const categories = ['standard', 'liquidity-generator'];
    let allTokens = [];

    // Loop through 'standard' and 'liquidity-generator' directories
    for (const category of categories) {
      const categoryDirPath = path.join(parentDir, category);

      // Check if the category directory exists
      if (fs.existsSync(categoryDirPath)) {
        const tokenFolders = fs.readdirSync(categoryDirPath, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory()) // Get all subdirectories (tokens)
          .map((dirent) => {
            const tokenFolderPath = path.join(categoryDirPath, dirent.name);
            const jsonFilePath = path.join(tokenFolderPath, `${dirent.name}.json`); // {token.name}.json

            // If the JSON file exists, read it and parse its contents
            if (fs.existsSync(jsonFilePath)) {
              const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
              return {
                name: dirent.name,
                data: jsonData,
              };
            } else {
              return null;
            }
          })
          .filter((token) => token !== null); // Filter out any null tokens
          
        allTokens = [...allTokens, ...tokenFolders]; // Append to the main token list
      }
    }

    spinner.succeed('Tokens fetched successfully');
    return allTokens;
  } catch (error) {
    spinner.fail('Error fetching tokens');
    console.error(error);
    return [];
  }
}
async function createPoolV2(token, tokenAmount, ethLiquidity, ethSnipe) {
  console.log(chalk.green("Creating V2 Pool..."));
  const spinner = ora('Pool creation in progress...').start();
  const config = loadConfig();
  const WETH = config.WETH;
  try {
    addLiquidityToPool(token, tokenAmount, ethLiquidity, ethSnipe, [
      WETH,
      token,
    ]);
    spinner.succeed('Success');
  } catch (e) {
    console.log(e);
    spinner.stop('Error');
  }
}

async function createWorkerWallets(walletCount) {
  

  const spinner = ora('Wallet creation in Progress...').start();

  const wallets = [];
  for (let i = 0; i < walletCount; i++) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push(wallet);
  }
  
  // Ensure the worker directory exists
  const workerDir = path.resolve('worker');
  if (!fs.existsSync(workerDir)) {
    fs.mkdirSync(workerDir, { recursive: true });
  }
  
  // Save each wallet as a JSON file
  wallets.forEach(wallet => {
    const walletPath = path.join(workerDir, `${wallet.address}.json`);
    const walletData = {
      publicAddress: wallet.address,
      privateKey: wallet.privateKey,
    };
  
    fs.writeFileSync(walletPath, JSON.stringify(walletData, null, 2), 'utf8');
    console.log(`Saved Wallet to ${walletPath}`);
  });
  spinner.succeed('Success');
  console.log(chalk.green("All Worker Wallets Created and Saved Successfully."));

}

async function showWorkerWallets() {
  const spinner = ora('Loading Worker wallets from Dir...').start();

  const {provider} = initializeSession();
  const erc20ABI = [
    "function balanceOf(address) view returns (uint256)"
  ];
  
  const erc20Tokens = [
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
    // Add more tokens as needed
  ];
  
  // Function to get ERC-20 token balances
  const getTokenBalances = async (walletAddress) => {
    const tokenBalances = {};
    
    for (const token of erc20Tokens) {
      const contract = new ethers.Contract(token.address, erc20ABI, provider);
      const balance = await contract.balanceOf(walletAddress);
      tokenBalances[token.symbol] = ethers.formatUnits(balance, 18); // Assuming 18 decimals
    }
    
    return tokenBalances;
  };
 
    try {
      const workerDir = path.resolve('worker');
      if (!fs.existsSync(workerDir)) {
        console.log('No worker wallets found.');
        return  process.exit(1);
      }
      const walletFiles = fs.readdirSync(workerDir).filter(file => file.endsWith('.json'));
  
      // const table = new Table({
      //   head: ['Public Address', 'ETH Balance', ...erc20Tokens.map(token => `${token.symbol} Balance`)],
      //   colWidths: [50, 20, ...erc20Tokens.map(() => 20)],
      // });

      const table = new Table({
        head: ['Public Address', 'ETH Balance'],
        colWidths: [50, 20],
      });
      const wallets = [];

  
      for (const file of walletFiles) {
        const filePath = path.join(workerDir, file);
        const walletData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const walletAddress = walletData.publicAddress;
        const ethBalance = await provider.getBalance(walletAddress);
        // console.log(walletAddress, "wallet")
        const formattedEthBalance = ethers.formatUnits(ethBalance, 18);
        if (ethBalance < 0) {
          console.log('zero balance', walletAddress);
          continue;
        }
        const row = [
          walletAddress,
          formattedEthBalance,
                 ];

        table.push(row);
        wallets.push({ address: walletAddress, data: walletData });
      }
      spinner.succeed('Success');
      console.log(table.toString());
      const { selectedWalletIndex } = await inquirer.prompt({
        type: 'list',
        name: 'selectedWalletIndex',
        message: 'Select a wallet to interact with:',
        choices: wallets.map((wallet, index) => ({ name: wallet.address, value: index }))
      });
      const selectedWallet = wallets[selectedWalletIndex];

      const { action } = await inquirer.prompt({
        type: 'list',
        name: 'action',
        message: 'Select an action:',
        choices: ['Send ETH', 'Send ERC-20 Token']
      });
  
      if (action === 'Send ETH') {
    
        const { recipientAddress, amount } = await inquirer.prompt([
          { type: 'input', name: 'recipientAddress', message: 'Recipient address:' },
          { type: 'number', name: 'amount', message: 'Amount in ETH:' }
        ]);
  
        const wallet = new ethers.Wallet(selectedWallet.data.privateKey, provider);
        const tx = await wallet.sendTransaction({
          to: recipientAddress,
          value: ethers.parseUnits(amount.toString(), 'ether')
        });
  
        console.log('Transaction sent:', tx.hash);
      } else if (action === 'Send ERC-20 Token') {
        const { tokenSymbol, recipientAddress, amount } = await inquirer.prompt([
          { type: 'list', name: 'tokenSymbol', message: 'Select token to send:', choices: erc20Tokens.map(token => token.symbol) },
          { type: 'input', name: 'recipientAddress', message: 'Recipient address:' },
          { type: 'number', name: 'amount', message: 'Amount to send:' }
        ]);
  
        const token = erc20Tokens.find(t => t.symbol === tokenSymbol);
        const contract = new ethers.Contract(token.address, erc20ABI, provider);
        const wallet = new ethers.Wallet(selectedWallet.data.privateKey, provider);
  
        const tx = await contract.connect(wallet).transfer(recipientAddress, ethers.parseUnits(amount.toString(), 'ether'));
        console.log('Transaction sent:', tx.hash);
      }
      spinner.succeed('Success');
    } catch (error) {
      console.error('Error displaying worker wallets:', error);
    }
 
  
}

async function main() {
  console.log(chalk.blue("Welcome to the Ethereum Bundler Bot!"));
const ethu = await getETHPriceInUSDC();
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: `Choose an action | ETH - $ ${(ethu).toFixed(0)}   - `,
      choices: [
        "Create Standard Token",
        // "Create Liquidity Generator Token",
        "Create V2 Pool and Snipe",
        "Create Worker Wallets",
        "Wallet Manager",
        "Token Manager",
        // "Send ETH to Worker Wallets",
        // "Send Tokens to Worker Wallets",
        "Recover",
        "Exit"
      ],
    },
  ]);

 

  if (action === "Create Standard Token") {
  
    const answers = await inquirer.prompt([
      { type: "input", name: "tokenName", message: "What is the token name?" },
      {
        type: "input",
        name: "tokenSymbol",
        message: "What is the token symbol?",
      },
      { type: "number", name: "decimals", message: "What is the decimal?" },
      { type: "number", name: "supply", message: "What is the total supply?" },
    ]);
    await createToken(
      "Standard",
      answers.tokenName,
      answers.tokenSymbol,
      answers.decimals,
      answers.supply
    );
  } 
  else if (action === "Create Liquidity Generator Token") {
    const answers = await inquirer.prompt([
      { type: "input", name: "tokenName", message: "What is the token name?" },
      {
        type: "input",
        name: "tokenSymbol",
        message: "What is the token symbol?",
      },
      { type: "number", name: "decimals", message: "What is the decimal?" },
      { type: "number", name: "supply", message: "What is the total supply?" },
    ]);
    await createLiquidityGeneratorToken(
      answers.tokenName,
      answers.tokenSymbol,
      answers.decimals,
      answers.supply
    );
  } else if (action === "Create V2 Pool and Snipe") {
    if (
      !fs.existsSync(standardTokenPath) &&
      !fs.existsSync(liquidityGeneratorPath)
    ) {
      console.log(chalk.red("No tokens found. Start by creating a token."));
      return process.exit(1);
    }
    const standardTokens = getTokensFromDirectory(standardTokenPath);
    const liquidityTokens = getTokensFromDirectory(liquidityGeneratorPath);
    const allTokens = [...standardTokens, ...liquidityTokens];

    if (allTokens.length === 0) {
      console.log("No tokens found.");
      return process.exit(1);
    }
    const tokenChoice = allTokens.map((token) => token.name, tokenDirPath);
    if (tokenChoice.length === 0) {
      console.log(chalk.red("No tokens found in the selected category."));
      return process.exit(1);
    }
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "token",
        message: "Select token from the list below:",
        choices: tokenChoice,
      },
      {
        type: "confirm",
        name: "addEthPair",
        message: "Proceed?",
      },
      {
        type: "number",
        name: "tokenAmount",
        message: `Amount of token allocated for Pool? ${chalk.bgGrey(
          "(in %) :"
        )}`,
        when: (answers) => answers.addEthPair,
        validate: (input) => {
          const amount = new BigNumber(input);
          if (
            !input ||
            amount.isNaN() ||
            !amount.isInteger() ||
            amount.isLessThan(0)
          ) {
            return "Please enter a valid positive integer for ETH amount.";
          }
          return true;
        },
        filter: (input) => input.trim(),
      },
      {
        type: "number",
        name: "ethLiquidity",
        message: `How much ETH for liquidity? ${chalk.bgGrey(
          "(AMOUNT in WEI) :"
        )}`,
        when: (answers) => answers.addEthPair,
        validate: (input) => {
          const amount = new BigNumber(input);
          if (
            !input ||
            amount.isNaN() ||
            !amount.isInteger() ||
            amount.isLessThan(0)
          ) {
            return "Please enter a valid positive integer for ETH amount.";
          }
          return true;
        },
        filter: (input) => input.trim(),
      },
      {
        type: "number",
        name: "ethSnipe",
        message: `How much ETH for sniping? ${chalk.bgGrey(
          "(AMOUNT in WEI) :"
        )}`,
        when: (answers) => answers.addEthPair,
      },
    ]);

    if (answers.addEthPair) {
      const selectedToken = allTokens.find(
        (token) => token.name === answers.token
      );

      if (!selectedToken) {
        console.error("Selected token not found.");
        return;
      }
      const ethAmountInWei = formatEther(
        toBigInt(answers.ethLiquidity) || "0",
        "ether"
      );
      const snipeAmount = formatEther(
        toBigInt(answers.ethSnipe) || "0",
        "ether"
      );
      const ethUsd = await getETHPriceInUSDC();

      const tokenAmountForLiquidity =
        (Number(answers.tokenAmount) / Number(100)) *
        selectedToken.data.totalSupply;

      const confirmationAnswers = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message:
            `You are about to add the following liquidity:\n\n` +
            `Ethereum Price ~ ${ethUsd}:\n\n` +
            `Token: ${selectedToken.name}\n` +
            `Token CA: ${selectedToken.data.contractAddress}\n` +
            `Token amount for Liquidity: ${tokenAmountForLiquidity} ${selectedToken.data.symbol} \n` +
            `ETH amount for Liquidity: ${ethAmountInWei} ETH\n` +
            `ETH amount for Sniping: ${snipeAmount} ETH\n` +
            `Pool Creation and Sniping will be done instantly\n` +
            `Do you want to proceed?`,
        },
      ]);

      if (!confirmationAnswers.confirm) {
        console.log(chalk.bgCyan("Liquidity addition cancelled. Exiting..."));
        return;
      }
      console.log("Selected Token Data:", selectedToken.data);
      console.log("Add ETH Pair:", answers.addEthPair);
      const addtokenPool = tokenAmountForLiquidity;
      await createPoolV2(
        selectedToken.data.contractAddress,
        addtokenPool,
        answers.ethLiquidity,
        answers.ethSnipe
      );
    } else {
      console.log(chalk.red("No ETH pair added."));
    }
  } else if (action === "Create Worker Wallets") {
    const { walletCount } = await inquirer.prompt([
      {
        type: "number",
        name: "walletCount",
        message: "How many wallets do you want to generate?",
      },
    ]);
    await createWorkerWallets(walletCount);
  } else if (action === "Wallet Manager") {
    await showWorkerWallets();
  }else if (action === "Token Manager") {
    await tokenManager();
  }else if (action === "Recover") {
    await showWorkerWallets();
  }

 
}
const clearTerminal = () => {
  process.stdout.write('\x1Bc'); // For most terminals
  process.stdout.write('\x1b\x63');  // For some terminals (like macOS)
};

// Call this function at the beginning of your script
clearTerminal();

main();
