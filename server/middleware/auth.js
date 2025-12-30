const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'DragonBallTales_SuperSecretKey_2024_SSJ!';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido ou expirado' });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
}

function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function getUserById(userId) {
    const usersFile = path.join(__dirname, '..', '..', 'data', 'users.json');
    const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    return data.users.find(u => u.id === userId);
}

function updateUser(userId, updates) {
    const usersFile = path.join(__dirname, '..', '..', 'data', 'users.json');
    const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const userIndex = data.users.findIndex(u => u.id === userId);

    if (userIndex !== -1) {
        data.users[userIndex] = { ...data.users[userIndex], ...updates };
        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));
        return data.users[userIndex];
    }
    return null;
}

module.exports = {
    authenticateToken,
    requireAdmin,
    generateToken,
    getUserById,
    updateUser,
    JWT_SECRET
};
