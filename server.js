const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const port = 3000;
const app = express();

const mongoClient = new MongoClient(process.env.MONGODB_URI);

app.use(bodyParser.json());
app.use(cors({
    origin: '*', // Permite todas as origens. Para maior segurança, defina uma lista de origens permitidas
}));

// Conectar ao MongoDB
async function connectToMongo() {
    try {
        await mongoClient.connect();
        console.log('Conectado ao MongoDB com sucesso!');
    } catch (error) {
        console.error('Erro ao conectar ao MongoDB:', error);
        process.exit(1); // Encerra o processo se não conseguir conectar ao MongoDB
    }
}

app.post('/verify-key', async (req, res) => {
    const { key, hwid } = req.body;

    if (!key || !hwid) {
        return res.status(400).json({ success: false, message: 'Chave e HWID são necessários.' });
    }

    try {
        const db = mongoClient.db('Cluster0');
        const keyCollection = db.collection('keys');
        const keyEntry = await keyCollection.findOne({ key: key });

        if (!keyEntry) {
            // Se a chave não for encontrada
            return res.status(404).json({ success: false, message: 'Chave não encontrada.' });
        }

        // Verifica se o HWID corresponde ao registrado
        if (keyEntry.hwid && keyEntry.hwid !== hwid) {
            // Se HWID não corresponder
            return res.status(400).json({ success: false, message: 'HWID não corresponde.' });
        }

        // Atualiza o HWID se não estiver registrado
        if (!keyEntry.hwid) {
            await keyCollection.updateOne(
                { key: key },
                { $set: { hwid: hwid } }
            );
        }

        return res.status(200).json({ success: true, message: 'Chave e HWID válidos.' });
    } catch (error) {
        console.error('Erro ao verificar chave:', error);
        return res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});


app.post('/add-key', async (req, res) => {
    const { key } = req.body;

    if (!key) {
        return res.status(400).json({ success: false, message: 'KEY é necessário' });
    }

    try {
        const db = mongoClient.db('Cluster0');
        const collection = db.collection('keys');
        
        // Verifica se o PIN já existe
        const existingkey = await collection.findOne({ key: key });
        if (existingkey) {
            return res.status(400).json({ success: false, message: 'KEY já existe' });
        }

        // Adiciona o novo PIN
        await collection.insertOne({ key: key });
        res.json({ success: true, message: 'PIN adicionado com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao conectar ao banco de dados' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const db = mongoClient.db('Cluster0');
        const loginCollection = db.collection('login');

        const user = await loginCollection.findOne({ username });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            res.json({ success: true, message: 'Login bem-sucedido!', token });
        } else {
            res.status(401).json({ success: false, message: 'Senha incorreta.' });
        }
    } catch (error) {
        console.error('Erro ao processar login:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ success: false, message: 'Token não fornecido.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token inválido.' });
        req.user = user;
        next();
    });
}

// Rota para o dashboard (protegida por token)
app.get('/dashboard', authenticateToken, (req, res) => {
    res.json({ success: true, message: 'Bem-vindo ao dashboard!' });
});

app.post('/send-user', async (req, res) => {
    const { username, key, hwid, date } = req.body;

    if (!username || !key || !hwid || !date) {
        return res.status(400).json({ success: false, message: 'Todos os campos são necessários (username, key, hwid, date)' });
    }

    try {
        const db = mongoClient.db('Cluster0'); // Substitua pelo nome do seu banco de dados
        const collection = db.collection('users'); // Substitua pelo nome da sua coleção

        const filter = { username };
        const update = {
            $set: { key, hwid, date }
        };

        const result = await collection.updateOne(filter, update, { upsert: true });

        if (result.matchedCount > 0) {
            res.json({ success: true, message: 'Dados atualizados com sucesso', user: { username, key, hwid, date } });
        } else {
            res.json({ success: true, message: 'Novo usuário criado com sucesso', user: { username, key, hwid, date } });
        }
    } catch (error) {
        console.error('Erro ao conectar ao banco de dados:', error);
        res.status(500).json({ success: false, message: 'Erro ao conectar ao banco de dados' });
    }
});

// Iniciar o servidor
    app.listen(3000, () => {
        console.log('Servidor ouvindo na porta 3000');
    connectToMongo();
});
