const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const usersFile = path.join(__dirname, '..', '..', 'data', 'users.json');
const sheetsDir = path.join(__dirname, '..', '..', 'data', 'sheets');
const rollsDir = path.join(__dirname, '..', '..', 'data', 'rolls');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Get all users (admin only)
router.get('/users', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

        const users = data.users.map(user => ({
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            hasGoogleAccount: !!user.googleId,
            sheetCount: getSheetCount(user.id)
        }));

        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
});

// Get user details with history
router.get('/users/:id', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const user = data.users.find(u => u.id === req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Get user's sheets
        const sheets = getUserSheets(user.id);

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            loginHistory: user.loginHistory || [],
            preferences: user.preferences,
            hasGoogleAccount: !!user.googleId,
            sheets: sheets
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

// Get user login history
router.get('/users/:id/history', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const user = data.users.find(u => u.id === req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json({
            username: user.username,
            loginHistory: (user.loginHistory || []).reverse()
        });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

// Get user sheets with update history
router.get('/users/:id/sheets', (req, res) => {
    try {
        const sheets = getUserSheetsDetailed(req.params.id);
        res.json(sheets);
    } catch (error) {
        console.error('Get sheets error:', error);
        res.status(500).json({ error: 'Erro ao buscar fichas' });
    }
});

// Get expired roll histories (for admin recovery)
router.get('/rolls/expired', (req, res) => {
    try {
        const expiredRolls = [];
        const files = fs.readdirSync(rollsDir);

        files.forEach(file => {
            if (file.startsWith('expired_') && file.endsWith('.json')) {
                const parts = file.replace('expired_', '').replace('.json', '').split('_');
                const expiredTime = parseInt(parts[parts.length - 1]);
                const userId = parts[0];
                const sheetId = parts[1];

                // Check if it's within 3 days
                const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
                if (expiredTime > threeDaysAgo) {
                    const filePath = path.join(rollsDir, file);
                    const rollData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                    expiredRolls.push({
                        file: file,
                        userId: userId,
                        sheetId: sheetId,
                        expiredAt: new Date(expiredTime).toISOString(),
                        rollCount: rollData.length,
                        canRecover: true
                    });
                }
            }
        });

        res.json(expiredRolls);
    } catch (error) {
        console.error('Get expired rolls error:', error);
        res.status(500).json({ error: 'Erro ao buscar rolagens expiradas' });
    }
});

// Recover expired roll history
router.post('/rolls/recover/:filename', (req, res) => {
    try {
        const filePath = path.join(rollsDir, req.params.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }

        const rollData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json({
            message: 'Histórico recuperado',
            rolls: rollData
        });
    } catch (error) {
        console.error('Recover rolls error:', error);
        res.status(500).json({ error: 'Erro ao recuperar rolagens' });
    }
});

// Clean up old expired files (run periodically)
router.post('/rolls/cleanup', (req, res) => {
    try {
        const files = fs.readdirSync(rollsDir);
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
        let cleaned = 0;

        files.forEach(file => {
            if (file.startsWith('expired_') && file.endsWith('.json')) {
                const parts = file.replace('expired_', '').replace('.json', '').split('_');
                const expiredTime = parseInt(parts[parts.length - 1]);

                if (expiredTime < threeDaysAgo) {
                    fs.unlinkSync(path.join(rollsDir, file));
                    cleaned++;
                }
            }
        });

        res.json({ message: `${cleaned} arquivos limpos` });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Erro na limpeza' });
    }
});

// Dashboard stats
router.get('/stats', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const sheetFiles = fs.readdirSync(sheetsDir);

        const totalUsers = data.users.length;
        const totalSheets = sheetFiles.filter(f => f.endsWith('.json')).length;
        const activeToday = data.users.filter(u => {
            if (!u.lastLogin) return false;
            const lastLogin = new Date(u.lastLogin);
            const today = new Date();
            return lastLogin.toDateString() === today.toDateString();
        }).length;

        res.json({
            totalUsers,
            totalSheets,
            activeToday,
            adminCount: data.users.filter(u => u.isAdmin).length
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// Helper functions
function getSheetCount(userId) {
    try {
        const files = fs.readdirSync(sheetsDir);
        return files.filter(f => f.startsWith(userId + '_') && f.endsWith('.json')).length;
    } catch {
        return 0;
    }
}

function getUserSheets(userId) {
    try {
        const sheets = [];
        const files = fs.readdirSync(sheetsDir);

        files.forEach(file => {
            if (file.startsWith(userId + '_') && file.endsWith('.json')) {
                const filePath = path.join(sheetsDir, file);
                const sheetData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                sheets.push({
                    id: sheetData.id,
                    name: sheetData.charName || 'Sem Nome',
                    system: sheetData.system,
                    updatedAt: sheetData.updatedAt
                });
            }
        });

        return sheets;
    } catch {
        return [];
    }
}

function getUserSheetsDetailed(userId) {
    try {
        const sheets = [];
        const files = fs.readdirSync(sheetsDir);

        files.forEach(file => {
            if (file.startsWith(userId + '_') && file.endsWith('.json')) {
                const filePath = path.join(sheetsDir, file);
                const sheetData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                sheets.push({
                    id: sheetData.id,
                    name: sheetData.charName || 'Sem Nome',
                    system: sheetData.system,
                    createdAt: sheetData.createdAt,
                    updatedAt: sheetData.updatedAt,
                    updateHistory: sheetData.updateHistory || [],
                    pdl: sheetData.pdl
                });
            }
        });

        return sheets;
    } catch {
        return [];
    }
}

module.exports = router;
