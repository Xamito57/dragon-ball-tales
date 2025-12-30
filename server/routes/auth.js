const express = require('express');
const bcrypt = require('bcrypt');
const svgCaptcha = require('svg-captcha');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { generateToken } = require('../middleware/auth');

const router = express.Router();
const usersFile = path.join(__dirname, '..', '..', 'data', 'users.json');

// Store CAPTCHA solutions temporarily (in production, use Redis or similar)
const captchaSolutions = new Map();

// Clean up old captchas every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of captchaSolutions.entries()) {
        if (now - data.timestamp > 5 * 60 * 1000) {
            captchaSolutions.delete(key);
        }
    }
}, 60 * 1000);

// Generate CAPTCHA
router.get('/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 5,
        noise: 3,
        color: true,
        background: '#0a0a0f'
    });

    const captchaId = uuidv4();
    captchaSolutions.set(captchaId, {
        text: captcha.text.toLowerCase(),
        timestamp: Date.now()
    });

    res.json({
        captchaId,
        svg: captcha.data
    });
});

// Validate CAPTCHA
function validateCaptcha(captchaId, captchaText) {
    const stored = captchaSolutions.get(captchaId);
    if (!stored) return false;

    const isValid = stored.text === captchaText.toLowerCase();
    captchaSolutions.delete(captchaId); // One-time use
    return isValid;
}

// Register
router.post('/register', async (req, res) => {
    console.log('📝 Tentativa de registro recebida');
    try {
        const { username, email, password, captchaId, captchaText } = req.body;
        console.log('   Usuário:', username, '| Email:', email);

        // Validate CAPTCHA
        if (!validateCaptcha(captchaId, captchaText)) {
            console.log('   ❌ CAPTCHA inválido');
            return res.status(400).json({ error: 'CAPTCHA inválido. Tente novamente.' });
        }
        console.log('   ✅ CAPTCHA válido');

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Usuário deve ter entre 3 e 20 caracteres' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        // Check if user exists
        console.log('   Lendo arquivo de usuários...');
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        console.log('   Total de usuários:', data.users.length);

        if (data.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }

        if (data.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Nome de usuário já existe' });
        }

        // Create user
        console.log('   Criando novo usuário...');
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: uuidv4(),
            email,
            username,
            password: hashedPassword,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            loginHistory: [{
                timestamp: new Date().toISOString(),
                ip: req.ip,
                action: 'register'
            }],
            preferences: {
                fontSize: 16,
                fontColor: '#f0f0f5',
                borderColor: '#ff6b00',
                backgroundColor: '#050508',
                backgroundImage: null
            }
        };

        data.users.push(newUser);
        console.log('   Salvando arquivo...');
        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));
        console.log('   ✅ Usuário salvo!');

        const token = generateToken(newUser);

        res.status(201).json({
            message: 'Conta criada com sucesso!',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                isAdmin: newUser.isAdmin,
                preferences: newUser.preferences
            }
        });

    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ error: 'Erro ao criar conta: ' + error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password, captchaId, captchaText } = req.body;

        // Validate CAPTCHA
        if (!validateCaptcha(captchaId, captchaText)) {
            return res.status(400).json({ error: 'CAPTCHA inválido. Tente novamente.' });
        }

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const user = data.users.find(u => u.email === email || u.username === email);

        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Update login history
        const userIndex = data.users.findIndex(u => u.id === user.id);
        data.users[userIndex].lastLogin = new Date().toISOString();
        data.users[userIndex].loginHistory = data.users[userIndex].loginHistory || [];
        data.users[userIndex].loginHistory.push({
            timestamp: new Date().toISOString(),
            ip: req.ip,
            action: 'login'
        });

        // Keep only last 50 login entries
        if (data.users[userIndex].loginHistory.length > 50) {
            data.users[userIndex].loginHistory = data.users[userIndex].loginHistory.slice(-50);
        }

        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

        const token = generateToken(user);

        res.json({
            message: 'Login bem-sucedido!',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                preferences: user.preferences
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// Google OAuth (simplified - receives token from frontend)
router.post('/google', async (req, res) => {
    try {
        const { googleId, email, name, picture } = req.body;

        if (!googleId || !email) {
            return res.status(400).json({ error: 'Dados do Google incompletos' });
        }

        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        let user = data.users.find(u => u.googleId === googleId || u.email === email);

        if (user) {
            // Update existing user with Google info
            const userIndex = data.users.findIndex(u => u.id === user.id);
            data.users[userIndex].googleId = googleId;
            data.users[userIndex].lastLogin = new Date().toISOString();
            data.users[userIndex].loginHistory = data.users[userIndex].loginHistory || [];
            data.users[userIndex].loginHistory.push({
                timestamp: new Date().toISOString(),
                ip: req.ip,
                action: 'google_login'
            });
            user = data.users[userIndex];
        } else {
            // Create new user from Google
            user = {
                id: uuidv4(),
                email,
                username: name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now().toString(36),
                password: null,
                googleId,
                picture,
                isAdmin: false,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                loginHistory: [{
                    timestamp: new Date().toISOString(),
                    ip: req.ip,
                    action: 'google_register'
                }],
                preferences: {
                    fontSize: 16,
                    fontColor: '#f0f0f5',
                    borderColor: '#ff6b00',
                    backgroundColor: '#050508',
                    backgroundImage: null
                }
            };
            data.users.push(user);
        }

        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

        const token = generateToken(user);

        res.json({
            message: 'Login com Google bem-sucedido!',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                preferences: user.preferences,
                picture: user.picture
            }
        });

    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({ error: 'Erro na autenticação Google' });
    }
});

// Verify token
router.get('/verify', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ valid: false });
    }

    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');

    try {
        const user = jwt.verify(token, JWT_SECRET);

        // Get fresh user data
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const freshUser = data.users.find(u => u.id === user.id);

        if (!freshUser) {
            return res.status(401).json({ valid: false });
        }

        res.json({
            valid: true,
            user: {
                id: freshUser.id,
                username: freshUser.username,
                email: freshUser.email,
                isAdmin: freshUser.isAdmin,
                preferences: freshUser.preferences
            }
        });
    } catch (err) {
        res.status(401).json({ valid: false });
    }
});

module.exports = router;
