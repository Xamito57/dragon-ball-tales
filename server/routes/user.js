const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { authenticateToken, updateUser } = require('../middleware/auth');

const router = express.Router();
const usersFile = path.join(__dirname, '..', '..', 'data', 'users.json');
const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

// Configure multer for background image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `bg_${req.user.id}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido. Use: JPG, PNG, GIF ou WebP'));
        }
    }
});

// Get current user preferences
router.get('/preferences', authenticateToken, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const user = data.users.find(u => u.id === req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json(user.preferences || {
            fontSize: 16,
            fontColor: '#f0f0f5',
            borderColor: '#ff6b00',
            backgroundColor: '#050508',
            backgroundImage: null
        });
    } catch (error) {
        console.error('Get preferences error:', error);
        res.status(500).json({ error: 'Erro ao buscar preferências' });
    }
});

// Update user preferences
router.put('/preferences', authenticateToken, (req, res) => {
    try {
        const { fontSize, fontColor, borderColor, backgroundColor } = req.body;

        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const userIndex = data.users.findIndex(u => u.id === req.user.id);

        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Validate fontSize
        const validFontSize = Math.min(Math.max(parseInt(fontSize) || 16, 12), 24);

        // Validate colors (hex format)
        const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
        const validFontColor = hexColorRegex.test(fontColor) ? fontColor : '#f0f0f5';
        const validBorderColor = hexColorRegex.test(borderColor) ? borderColor : '#ff6b00';
        const validBgColor = hexColorRegex.test(backgroundColor) ? backgroundColor : '#050508';

        data.users[userIndex].preferences = {
            ...data.users[userIndex].preferences,
            fontSize: validFontSize,
            fontColor: validFontColor,
            borderColor: validBorderColor,
            backgroundColor: validBgColor
        };

        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

        res.json({
            message: 'Preferências atualizadas!',
            preferences: data.users[userIndex].preferences
        });
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Erro ao atualizar preferências' });
    }
});

// Upload background image
router.post('/background', authenticateToken, upload.single('background'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada' });
        }

        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const userIndex = data.users.findIndex(u => u.id === req.user.id);

        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Delete old background if exists
        if (data.users[userIndex].preferences?.backgroundImage) {
            const oldPath = path.join(uploadsDir, path.basename(data.users[userIndex].preferences.backgroundImage));
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        const imageUrl = `/uploads/${req.file.filename}`;

        data.users[userIndex].preferences = {
            ...data.users[userIndex].preferences,
            backgroundImage: imageUrl
        };

        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

        res.json({
            message: 'Imagem de fundo atualizada!',
            backgroundImage: imageUrl
        });
    } catch (error) {
        console.error('Upload background error:', error);
        res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
    }
});

// Remove background image
router.delete('/background', authenticateToken, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const userIndex = data.users.findIndex(u => u.id === req.user.id);

        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Delete background file if exists
        if (data.users[userIndex].preferences?.backgroundImage) {
            const filePath = path.join(uploadsDir, path.basename(data.users[userIndex].preferences.backgroundImage));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        data.users[userIndex].preferences.backgroundImage = null;
        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

        res.json({ message: 'Imagem de fundo removida!' });
    } catch (error) {
        console.error('Remove background error:', error);
        res.status(500).json({ error: 'Erro ao remover imagem' });
    }
});

// Get user profile
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const user = data.users.find(u => u.id === req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            preferences: user.preferences,
            hasGoogleAccount: !!user.googleId
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
});

// Update username
router.put('/username', authenticateToken, (req, res) => {
    try {
        const { username } = req.body;

        if (!username || username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Usuário deve ter entre 3 e 20 caracteres' });
        }

        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

        // Check if username is taken
        if (data.users.find(u => u.username === username && u.id !== req.user.id)) {
            return res.status(400).json({ error: 'Nome de usuário já existe' });
        }

        const userIndex = data.users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        data.users[userIndex].username = username;
        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

        res.json({
            message: 'Nome de usuário atualizado!',
            username
        });
    } catch (error) {
        console.error('Update username error:', error);
        res.status(500).json({ error: 'Erro ao atualizar nome de usuário' });
    }
});

module.exports = router;
