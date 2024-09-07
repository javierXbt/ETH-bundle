import { initiateSession, getBalance } from './helper.js';
import inquirer from 'inquirer';
async function main() {
  console.log('Starting Ethereum bundler bot...');
  const { wallet } = initiateSession(); // Initiates blockchain session
  console.log('Using wallet address:', wallet.address);

  const action = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        'Check Wallet Balance',
        'Other actions...'
      ]
    }
  ]);

  if (action.action === 'Check Wallet Balance') {
    await getBalance(); // Fetch and display wallet balance
  }

  // Add more CLI interactions as needed
}

main();
