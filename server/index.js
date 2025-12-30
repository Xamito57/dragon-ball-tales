const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const sheetsRoutes = require('./routes/sheets');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directories exist
const dataDir = path.join(__dirname, '..', 'data');
const sheetsDir = path.join(dataDir, 'sheets');
const uploadsDir = path.join(dataDir, 'uploads');
const rollsDir = path.join(dataDir, 'rolls');

console.log('📁 Criando diretórios de dados...');
console.log('   Data dir:', dataDir);

try {
    [dataDir, sheetsDir, uploadsDir, rollsDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log('   ✅ Criado:', dir);
        } else {
            console.log('   ✅ Existe:', dir);
        }
    });
} catch (err) {
    console.error('❌ Erro ao criar diretórios:', err);
}

// Initialize users.json if it doesn't exist
const usersFile = path.join(dataDir, 'users.json');
console.log('👤 Verificando arquivo de usuários...');

try {
    if (!fs.existsSync(usersFile)) {
        console.log('   Criando users.json com admin padrão...');
        const bcrypt = require('bcrypt');
        const adminPassword = bcrypt.hashSync('DragonBalls2024!', 10);
        const initialData = {
            users: [{
                id: 'admin-001',
                email: 'admin@dragonballtales.com',
                username: 'admin',
                password: adminPassword,
                isAdmin: true,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                loginHistory: [],
                preferences: {
                    fontSize: 16,
                    fontColor: '#f0f0f5',
                    borderColor: '#ff6b00',
                    backgroundColor: '#050508',
                    backgroundImage: null
                }
            }]
        };
        fs.writeFileSync(usersFile, JSON.stringify(initialData, null, 2));
        console.log('   ✅ users.json criado!');
    } else {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        console.log('   ✅ users.json existe com', data.users.length, 'usuários');
    }
} catch (err) {
    console.error('❌ Erro ao inicializar users.json:', err);
}

// Security middleware - CSP disabled for now to allow captcha and external resources
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Trust proxy for Render
app.set('trust proxy', 1);

app.use(cors({
    origin: true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Body parsing
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Serve main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/ficha/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'ficha.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
    console.log(`🐉 Dragon Ball Tales Server rodando em http://localhost:${PORT}`);
});
