const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { MongoClient } = require('mongodb'); // Importando o MongoDB
const axios = require('axios'); // Importando o axios
require('dotenv').config();
const bcrypt = require('bcrypt');
const saltRounds = 10; // Número de rounds para o hashing

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Configuração do MongoDB
const mongoClient = new MongoClient(process.env.MONGODB_URI);

// Função para conectar ao MongoDB
async function connectToMongo() {
    try {
        await mongoClient.connect();
        console.log('Conectado ao MongoDB com sucesso!');

        const db = mongoClient.db('Cluster0'); 
        const keyCollection = db.collection('key'); 
        const usersCollection = db.collection('users'); 
        const loginCollection = db.collection('login'); 

        const indexes = await keyCollection.indexes();
        const indexExists = indexes.some(index => index.name === 'createdAt_1');

        if (!indexExists) {
            await keyCollection.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 600 }); 
            console.log('Índice TTL criado para expirar os keys após 10 minutos.');
        }
    } catch {
    }
}

async function insertkey(key, userId, expirationDays) {
    try {
        const db = mongoClient.db('Cluster0'); 
        const keyCollection = db.collection('keys'); 

        const expireAt = new Date(new Date().getTime() + expirationDays * 24 * 60 * 60 * 1000);

        await keyCollection.insertOne({ key: key, createdAt: new Date(), expireAt: expireAt, userId: userId });
        await clientsCollection.updateOne(
            { userId: userId },
            { $set: { userId: userId } },
            { upsert: true } 
        );
    } catch {
    }
}

async function getUsers() {
    try {
        const db = mongoClient.db('Cluster0');
        const collection = db.collection('users');
        const users = await collection.find().toArray();
        return users;
    } catch {
        console.log('Erro ao recuperar usuários do MongoDB.');
        return [];
    }
}

async function getUserByName(username) {
    try {
        const db = mongoClient.db('Cluster0');
        const collection = db.collection('users');
        const user = await collection.findOne({ username: username });
        return user;
    } catch {
        console.log('Erro ao recuperar usuário do MongoDB.');
        return null;
    }
}

async function addUser(username, password) {
    try {
        const db = mongoClient.db('Cluster0');
        const loginCollection = db.collection('login'); 

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await loginCollection.insertOne({ username: username, password: hashedPassword });
        console.log(`Usuário ${username} adicionado ao MongoDB com sucesso!`);

        await axios.post('http://localhost:3000/login', { username: username, password: hashedPassword });
    } catch {
        console.log('Erro ao adicionar usuário ao MongoDB.');
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    await connectToMongo();

    const commands = [
        new SlashCommandBuilder()
            .setName('key')
            .setDescription('Generate key')
            .addIntegerOption(option =>
                option.setName('expiration')
                    .setDescription('The expiration time in days for the key')
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName('info')
            .setDescription('Generate key'),
        new SlashCommandBuilder()
            .setName('clients')
            .setDescription('Get a list of clients who generated keys'),
        new SlashCommandBuilder()
            .setName('user')
            .setDescription('Get details for a specific user by ID or name')
            .addStringOption(option => 
                option.setName('userid')
                    .setDescription('The ID of the user')
                    .setRequired(false)
            )
            .addStringOption(option => 
                option.setName('username')
                    .setDescription('The name of the user')
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName('adduser')
            .setDescription('Add a new user with a username and password')
            .addStringOption(option => 
                option.setName('username')
                    .setDescription('The username of the new user')
                    .setRequired(true)
            )
            .addStringOption(option => 
                option.setName('password')
                    .setDescription('The password of the new user')
                    .setRequired(true)
            )
    ];

    await client.application.commands.set(commands);
    
    console.log('Comandos registrados com sucesso.');
});

function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return 'Data inválida'; 
    }
    return date.toLocaleString(); 
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'key') {
        function generateRandomString(length) {
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                result += characters[randomIndex];
            }
            return result;
        }

        const part1 = generateRandomString(8); 
        const part2 = generateRandomString(6); 
        const part3 = generateRandomString(6); 

        const formattedkey = `MAJESTIC-${part1}-${part2}-${part3}`;

        const userId = interaction.user.id;

        const expirationDays = interaction.options.getInteger('expiration') || 1;

        await insertkey(formattedkey, userId, expirationDays);

        const keyEmbed = new EmbedBuilder()
            .setColor(0x0099ff) 
            .setTitle('Generated key')
            .setDescription(`key: **${formattedkey}**`) 
            .setFooter({ text: `The key expires in ${expirationDays} days.` }) 
            .setTimestamp();

        await interaction.reply({ embeds: [keyEmbed] });

    } else if (interaction.commandName === 'info') {
        const users = await getUsers();
        const userList = users.map(user => user.username).join('\n') || 'Nenhum usuário encontrado';

        const infoEmbed = new EmbedBuilder()
            .setColor(0x0099ff) 
            .setTitle('User list')
            .setDescription(userList)
            .setTimestamp();

        await interaction.reply({ embeds: [infoEmbed] });

    } else if (interaction.commandName === 'clients') {
        // Recupera a lista de clientes
        const clients = await getClients();
        const clientList = clients.map(client => client.userId).join('\n') || 'Nenhum cliente encontrado';

        // Cria um embed para mostrar os clientes
        const clientEmbed = new EmbedBuilder()
            .setColor(0x0099ff) // Cor do embed
            .setTitle('Client list')
            .setDescription(clientList)
            .setTimestamp();

        // Envia o embed de volta para o usuário
        await interaction.reply({ embeds: [clientEmbed] });

    } else if (interaction.commandName === 'user') {
        const userId = interaction.options.getString('userid');
        const username = interaction.options.getString('username');
        
        let user;
        
        if (userId) {
            // Procura o usuário pelo ID
            user = await getUserById(userId);
        } else if (username) {
            // Procura o usuário pelo nome
            user = await getUserByName(username);
        }
        
        if (user) {
            // Cria um embed para mostrar as informações do usuário
            const userEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('User Details')
                .addFields(
                    { name: 'ID', value: user._id.toString() },
                    { name: 'Username', value: user.username },
                    { name: 'Created At', value: formatDate(user.createdAt) },
                )
                .setTimestamp();

            // Envia o embed de volta para o usuário
            await interaction.reply({ embeds: [userEmbed] });
        } else {
            await interaction.reply('Usuário não encontrado.');
        }

    } else if (interaction.commandName === 'adduser') {
        const username = interaction.options.getString('username');
        const password = interaction.options.getString('password');

        if (username && password) {
            await addUser(username, password);
            await interaction.reply(`Usuário ${username} adicionado com sucesso.`);
        } else {
            await interaction.reply('Por favor, forneça um nome de usuário e senha.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
