const { Client, GatewayIntentBits } = require('discord.js');
const litecore = require('litecore-lib');
const axios = require('axios');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Your bot token from the Discord Developer Portal
const TOKEN = 'YOUR-BOT-TOKEN';

// BlockCypher API Token
const BLOCKCYPHER_API_TOKEN = 'API-TOKEN';

// In-memory storage for the wallet (this could be improved for production)
let userWallets = {}; // Keyed by user ID

// Function to fetch current LTC price in USD
async function getLtcPrice() {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd');
    return response.data.litecoin.usd;
}

// Function to get balance and total received for a LTC address
async function getAddressInfo(address) {
    const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/full?token=${BLOCKCYPHER_API_TOKEN}`;
    const response = await axios.get(url);
    console.log(response.data); // Log the entire response for debugging

    const balance = response.data.final_balance; // in satoshis
    const totalReceived = response.data.final_balance + response.data.unconfirmed_balance; // in satoshis
    return {
        balance: balance / 100000000, // Convert to LTC
        totalReceived: totalReceived / 100000000 // Convert to LTC
    };
}
// When the bot is ready
client.once('ready', () => {
    console.log('Bot is online!');
});

// Listen for messages
client.on('messageCreate', async (message) => {
    // Ignore messages from the bot itself
    if (message.author.bot) return;

    // Command to create a new Litecoin wallet
    if (message.content.startsWith('!createwallet')) {
        const privateKey = new litecore.PrivateKey();
        const address = privateKey.toAddress();
        userWallets[message.author.id] = { address, privateKey: privateKey.toString() }; // Store wallet info
        message.reply(`Wallet created! Address: ${address}\nPrivate Key: ${privateKey.toString()}`);
    }

    // Command to send Litecoin
    if (message.content.startsWith('!sendcrypto')) {
        const args = message.content.split(' ');
        const receiverAddress = args[1]; // The first argument should be the receiver's address
        const amountInUSD = parseFloat(args[2]); // The second argument should be the amount to send in USD

        if (!receiverAddress || isNaN(amountInUSD)) {
            return message.reply('Please provide a valid receiver address and amount in USD.');
        }

        // Retrieve the current LTC price
        const ltcPrice = await getLtcPrice();
        const amountInLTC = amountInUSD / ltcPrice; // Convert USD to LTC

        // Retrieve the stored wallet information
        const userWallet = userWallets[message.author.id];
        if (!userWallet) {
            return message.reply('You need to create a wallet first using !createwallet.');
        }

        // Use the stored sender address and private key
        const senderAddress = userWallet.address;
        const privateKey = userWallet.privateKey;

        // BlockCypher API URL
        const url = `https://api.blockcypher.com/v1/ltc/main/txs/new?token=${BLOCKCYPHER_API_TOKEN}`;

        const transactionData = {
            inputs: [{ addresses: [senderAddress] }],
            outputs: [{ addresses: [receiverAddress], value: Math.round(amountInLTC * 100000000) }] // Convert LTC to satoshis
        };

        // Create the transaction
        try {
            const response = await axios.post(url, transactionData);
            const tx = response.data;

            // Sign the transaction
            const signedTxResponse = await axios.post(`https://api.blockcypher.com/v1/ltc/main/txs/send?token=${BLOCKCYPHER_API_TOKEN}`, {
                tx: tx,
                private: privateKey
            });

            message.reply(`Successfully sent approximately ${amountInUSD} USD (${amountInLTC.toFixed(8)} LTC) to ${receiverAddress}. Transaction ID: ${signedTxResponse.data.tx.hash}`);
        } catch (error) {
            console.error(error.response ? error.response.data : error.message);
            message.reply('Error sending LTC. Please check the addresses and try again.');
        }
    }

    // Command to fetch LTC address balance
    if (message.content.startsWith('!balance')) {
        const args = message.content.split(' ');
        const address = args[1];

        if (!address) {
            return message.reply('Please provide a Litecoin address.');
        }

        try {
            const { balance, totalReceived, totalSent } = await getAddressInfo(address);
            console.log({ balance, totalReceived, totalSent }); // Log the values for debugging

            const ltcPrice = await getLtcPrice(); // Assume this function fetches the current LTC price
            const totalReceivedInUSD = totalReceived * ltcPrice;
            const totalSentInUSD = totalSent * ltcPrice;

            message.reply(`Address: ${address}\nBalance: ${balance.toFixed(8)} LTC (~$${(balance * ltcPrice).toFixed(2)})\nTotal Received: ${totalReceived.toFixed(8)} LTC (~$${totalReceivedInUSD.toFixed(2)})\nTotal Sent: ${totalSent.toFixed(8)} LTC (~$${totalSentInUSD.toFixed(2)})`);
        } catch (error) {
            console.error(error);
            message.reply('Error fetching balance. Please check the address and try again.');
        }
    }

});

// Login to Discord with your bot token
client.login(TOKEN);
