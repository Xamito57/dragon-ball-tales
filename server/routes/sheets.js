const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const sheetsDir = path.join(__dirname, '..', '..', 'data', 'sheets');

// Get all sheets for current user
router.get('/', authenticateToken, (req, res) => {
    try {
        const userSheets = [];
        const files = fs.readdirSync(sheetsDir);

        files.forEach(file => {
            if (file.startsWith(req.user.id + '_') && file.endsWith('.json')) {
                const filePath = path.join(sheetsDir, file);
                const sheetData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                userSheets.push({
                    id: sheetData.id,
                    name: sheetData.charName || 'Sem Nome',
                    system: sheetData.system || 'RR',
                    updatedAt: sheetData.updatedAt,
                    createdAt: sheetData.createdAt,
                    pdl: sheetData.pdl || 0
                });
            }
        });

        // Sort by updatedAt descending
        userSheets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json(userSheets);
    } catch (error) {
        console.error('Get sheets error:', error);
        res.status(500).json({ error: 'Erro ao buscar fichas' });
    }
});

// Get single sheet
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const filePath = path.join(sheetsDir, `${req.user.id}_${req.params.id}.json`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Ficha não encontrada' });
        }

        const sheetData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(sheetData);
    } catch (error) {
        console.error('Get sheet error:', error);
        res.status(500).json({ error: 'Erro ao buscar ficha' });
    }
});

// Create new sheet
router.post('/', authenticateToken, (req, res) => {
    try {
        const { system, name } = req.body;

        if (!system) {
            return res.status(400).json({ error: 'Sistema é obrigatório' });
        }

        // Only RR system for now
        if (system !== 'RR') {
            return res.status(400).json({ error: 'Sistema inválido' });
        }

        const sheetId = uuidv4();
        const now = new Date().toISOString();

        const newSheet = {
            id: sheetId,
            userId: req.user.id,
            system: system,
            createdAt: now,
            updatedAt: now,
            updateHistory: [{
                timestamp: now,
                action: 'created'
            }],

            // Character data (default values from RR system)
            charName: name || 'Novo Personagem',
            charRace: 'Terráqueo',
            customRaceHP: 6,
            charImageUrl: '',
            playerName: req.user.username,
            pdl: 0,
            for: 8,
            des: 8,
            con: 8,
            int: 8,
            sab: 8,
            pod: 8,
            pre: 8,
            epBonus: 0,
            epBaseCustom: 0,
            stOverride: false,
            stCustom: 0,
            currentHP: 40,
            currentPK: 16,
            techniques: [],
            enemies: [],
            talents: [],
            martialMoves: [],
            transforms: [],
            inventory: [],
            notes: '',
            racialTraits: '',
            skills: {}
        };

        const filePath = path.join(sheetsDir, `${req.user.id}_${sheetId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(newSheet, null, 2));

        res.status(201).json({
            message: 'Ficha criada com sucesso!',
            sheet: {
                id: sheetId,
                name: newSheet.charName,
                system: system,
                createdAt: now
            }
        });
    } catch (error) {
        console.error('Create sheet error:', error);
        res.status(500).json({ error: 'Erro ao criar ficha' });
    }
});

// Update sheet
router.put('/:id', authenticateToken, (req, res) => {
    try {
        const filePath = path.join(sheetsDir, `${req.user.id}_${req.params.id}.json`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Ficha não encontrada' });
        }

        const existingSheet = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const now = new Date().toISOString();

        // Merge updates
        const updatedSheet = {
            ...existingSheet,
            ...req.body,
            id: existingSheet.id,
            userId: existingSheet.userId,
            system: existingSheet.system,
            createdAt: existingSheet.createdAt,
            updatedAt: now,
            updateHistory: [
                ...(existingSheet.updateHistory || []),
                {
                    timestamp: now,
                    action: 'updated',
                    changes: Object.keys(req.body).filter(k => !['updateHistory'].includes(k))
                }
            ].slice(-100) // Keep only last 100 updates
        };

        fs.writeFileSync(filePath, JSON.stringify(updatedSheet, null, 2));

        res.json({
            message: 'Ficha atualizada!',
            updatedAt: now
        });
    } catch (error) {
        console.error('Update sheet error:', error);
        res.status(500).json({ error: 'Erro ao atualizar ficha' });
    }
});

// Delete sheet
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const filePath = path.join(sheetsDir, `${req.user.id}_${req.params.id}.json`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Ficha não encontrada' });
        }

        fs.unlinkSync(filePath);

        res.json({ message: 'Ficha deletada com sucesso!' });
    } catch (error) {
        console.error('Delete sheet error:', error);
        res.status(500).json({ error: 'Erro ao deletar ficha' });
    }
});

// Save roll history
router.post('/:id/rolls', authenticateToken, (req, res) => {
    try {
        const { roll } = req.body;
        const rollsDir = path.join(__dirname, '..', '..', 'data', 'rolls');
        const rollFile = path.join(rollsDir, `${req.user.id}_${req.params.id}_session.json`);

        let rollHistory = [];
        if (fs.existsSync(rollFile)) {
            rollHistory = JSON.parse(fs.readFileSync(rollFile, 'utf8'));
        }

        rollHistory.push({
            ...roll,
            timestamp: new Date().toISOString()
        });

        // Keep only last 100 rolls per session
        if (rollHistory.length > 100) {
            rollHistory = rollHistory.slice(-100);
        }

        fs.writeFileSync(rollFile, JSON.stringify(rollHistory, null, 2));

        res.json({ message: 'Rolagem registrada' });
    } catch (error) {
        console.error('Save roll error:', error);
        res.status(500).json({ error: 'Erro ao salvar rolagem' });
    }
});

// Get roll history for session
router.get('/:id/rolls', authenticateToken, (req, res) => {
    try {
        const rollsDir = path.join(__dirname, '..', '..', 'data', 'rolls');
        const rollFile = path.join(rollsDir, `${req.user.id}_${req.params.id}_session.json`);

        if (!fs.existsSync(rollFile)) {
            return res.json([]);
        }

        const rollHistory = JSON.parse(fs.readFileSync(rollFile, 'utf8'));
        res.json(rollHistory);
    } catch (error) {
        console.error('Get rolls error:', error);
        res.status(500).json({ error: 'Erro ao buscar rolagens' });
    }
});

// Clear roll history on logout
router.delete('/:id/rolls', authenticateToken, (req, res) => {
    try {
        const rollsDir = path.join(__dirname, '..', '..', 'data', 'rolls');
        const rollFile = path.join(rollsDir, `${req.user.id}_${req.params.id}_session.json`);

        // Instead of deleting, mark for cleanup after 3 days
        if (fs.existsSync(rollFile)) {
            const expiredFile = path.join(rollsDir, `expired_${req.user.id}_${req.params.id}_${Date.now()}.json`);
            fs.renameSync(rollFile, expiredFile);
        }

        res.json({ message: 'Histórico de rolagens arquivado' });
    } catch (error) {
        console.error('Clear rolls error:', error);
        res.status(500).json({ error: 'Erro ao limpar rolagens' });
    }
});

module.exports = router;
