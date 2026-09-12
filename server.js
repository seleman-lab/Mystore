const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.warn("Notice: nodemailer is not installed. Emails will only be logged to the console.");
}

const PORT = process.env.PORT || 3000;
const MOVIES_DIR = path.join(__dirname, 'movies');
const USERS_FILE = path.join(__dirname, 'users.json');
const MOVIES_FILE = path.join(__dirname, 'movies.json');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');
const OTP_FILE = path.join(__dirname, 'otp.json');
const STORAGE_LIMIT = 20 * 1024 * 1024 * 1024; // 20 GB per user
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB per movie
const MAX_POSTER_SIZE = 10 * 1024 * 1024;       // 10 MB per poster

// Frontend URLs for CORS
const FRONTEND_URLS = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:3000'
];

// Ensure necessary directories and files exist
if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(MOVIES_FILE)) fs.writeFileSync(MOVIES_FILE, '[]');
if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, '[]');
if (!fs.existsSync(OTP_FILE)) fs.writeFileSync(OTP_FILE, '[]');

// SMTP Configuration
let _transporter = null;
const getTransporter = async () => {
    if (!nodemailer) return null;
    if (_transporter) return _transporter;

    if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
        _transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
        });
        console.log('Using Gmail SMTP');
        return _transporter;
    }

    try {
        const testAccount = await nodemailer.createTestAccount();
        _transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass }
        });
        console.log('Using Ethereal test email service');
        console.log('   Username:', testAccount.user);
        console.log('   Password:', testAccount.pass);
        return _transporter;
    } catch (err) {
        console.error('Failed to create test email account:', err.message);
        return null;
    }
};

const sessions = {};

// --- JSON Database Helpers ---
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// --- Security & Validation Helpers ---
const escapeHTML = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// --- Cryptography ---
const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
};

const verifyPassword = (password, hash, salt) => {
    const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return verifyHash === hash;
};

// --- OTP Generation & Verification ---
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOTPToUserEmail = async (userEmail, otp) => {
    const transporter = await getTransporter();
    if (!transporter) {
        console.log(`\n--- OTP FOR ${userEmail} ---\n${otp}\n--- (No email transporter) ---\n`);
        return;
    }
    try {
        await transporter.sendMail({
            from: process.env.GMAIL_USER || '"MyStore" <noreply@mystore.dev>',
            to: userEmail,
            subject: 'MyStore - Password Reset OTP Code',
            html: `
                <h2>Password Reset Request</h2>
                <p>Your password reset OTP code is:</p>
                <h1 style="color: #007bff; letter-spacing: 5px; font-size: 48px; font-weight: bold; margin: 20px 0;">${otp}</h1>
                <p style="font-size: 16px;"><strong>This code expires in 10 minutes</strong></p>
                <hr>
                <p style="color: #666; font-size: 14px;">
                    If you did not request a password reset, please ignore this email.
                    Do not share this code with anyone.
                </p>
            `
        });
        console.log(`OTP sent successfully to ${userEmail}`);
    } catch (error) {
        console.error("Failed to send OTP email:", error.message);
    }
};

// --- Request Parsing Helpers ---
const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            if (body.length > 5e6) {
                req.destroy();
                reject(new Error("Payload too large"));
                return;
            }
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
};

const getSessionEmail = (req) => {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/sessionId=([^;]+)/);
    if (match && sessions[match[1]]) {
        return sessions[match[1]];
    }
    return null;
};

// Stream a raw request body directly to disk (used for video + poster uploads).
const streamToDisk = (req, destPath, maxSize) => {
    return new Promise((resolve, reject) => {
        let size = 0;
        const ws = fs.createWriteStream(destPath);
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxSize) {
                req.destroy();
                ws.destroy();
                try { fs.unlinkSync(destPath); } catch (e) {}
                reject(new Error("File too large"));
            }
        });
        ws.on('error', err => {
            try { fs.unlinkSync(destPath); } catch (e) {}
            reject(err);
        });
        ws.on('finish', () => resolve(size));
        req.on('error', err => {
            try { fs.unlinkSync(destPath); } catch (e) {}
            reject(err);
        });
        req.pipe(ws);
    });
};

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf'
};

// --- Movie helpers ---
const publicMovie = (m, origin) => {
    const base = origin || '';
    return {
        id: m.id,
        title: m.title,
        description: m.description,
        genre: m.genre,
        year: m.year,
        duration: m.duration || null,
        uploadDate: m.uploadDate,
        views: m.views || 0,
        posterUrl: m.posterFile ? `${base}/poster/${m.posterFile}` : null,
        streamUrl: `${base}/stream/${m.streamToken}`,
        embedUrl: `${base}/embed/${m.streamToken}`
    };
};

// ============================================
// SERVER
// ============================================
const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];
    const pathName = urlPath.replace(/\/+$/, '').replace(/\/+/g, '/') || '/';
    const method = req.method.toUpperCase();

    // CORS
    const origin = req.headers.origin;
    const allowedOrigins = [...FRONTEND_URLS, 'https://seleman-lab.github.io', 'https://seleman-lab.github.io/Mystore'];
    const originAllowed = origin
        && (origin === 'null'
            || allowedOrigins.includes(origin)
            || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
    if (origin) {
        if (originAllowed) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');
    }

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }


    // =================== AUTH ===================
    if (method === 'POST' && pathName === '/signup') {
        try {
            const body = await parseBody(req);
            let { name, email, phone, password, securityQuestions } = body;

            if (!name || !email || !phone || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "All fields are required" }));
            }
            email = email.trim().toLowerCase();
            if (!isValidEmail(email)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid email address" }));
            }
            if (password.length < 8) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Password must be at least 8 characters" }));
            }

            const users = readJSON(USERS_FILE);
            if (users.some(u => u.email === email)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "An account with this email already exists" }));
            }

            const { salt, hash } = hashPassword(password);
            const newUser = {
                id: crypto.randomUUID(),
                name: escapeHTML(name),
                email,
                phone: escapeHTML(phone),
                salt,
                hash,
                themePreference: 'light',
                securityQuestions: Array.isArray(securityQuestions) && securityQuestions.length === 3
                    ? securityQuestions.map(q => ({ question: escapeHTML(q.question), answer: escapeHTML(q.answer.trim().toLowerCase()) }))
                    : [],
                createdAt: new Date()
            };
            users.push(newUser);
            writeJSON(USERS_FILE, users);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Account created successfully" }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/login') {
        try {
            const body = await parseBody(req);
            let { email, password } = body;

            if (!email || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Email and password are required" }));
            }
            email = email.trim().toLowerCase();

            const users = readJSON(USERS_FILE);
            const user = users.find(u => u.email === email);

            if (!user || !verifyPassword(password, user.hash, user.salt)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid email or password" }));
            }

            const sessionId = crypto.randomUUID();
            sessions[sessionId] = user.email;
            const isSecure = req.headers['x-forwarded-proto'] === 'https';
            const sameSite = isSecure ? 'None' : 'Lax';
            const secureAttr = isSecure ? '; Secure' : '';
            res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=3600; SameSite=${sameSite}${secureAttr}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: "Login successful",
                user: { id: user.id, name: user.name, email: user.email, theme: user.themePreference }
            }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/logout') {
        const cookieHeader = req.headers.cookie || '';
        const match = cookieHeader.match(/sessionId=([^;]+)/);
        if (match && sessions[match[1]]) delete sessions[match[1]];
        const isSecure = req.headers['x-forwarded-proto'] === 'https';
        const sameSite = isSecure ? 'None' : 'Lax';
        const secureAttr = isSecure ? '; Secure' : '';
        res.setHeader('Set-Cookie', `sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=${sameSite}${secureAttr}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: "Logged out" }));
    }

    else if (method === 'POST' && pathName === '/get-security-questions') {
        try {
            const body = await parseBody(req);
            let { email } = body;
            if (!email) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Email is required" }));
            }
            email = email.trim().toLowerCase();
            const users = readJSON(USERS_FILE);
            const user = users.find(u => u.email === email);
            if (!user || !user.securityQuestions || user.securityQuestions.length !== 3) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User not found or no security questions set" }));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ questions: user.securityQuestions.map(sq => sq.question) }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/verify-security-questions') {
        try {
            const body = await parseBody(req);
            let { email, answers } = body;
            if (!email || !answers || answers.length !== 3) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Email and all 3 security answers are required" }));
            }
            email = email.trim().toLowerCase();
            const users = readJSON(USERS_FILE);
            const user = users.find(u => u.email === email);
            if (!user || !user.securityQuestions) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User not found or no security questions set" }));
            }

            const sanitized = answers.map(a => escapeHTML((a || '').trim().toLowerCase()));
            let correctCount = 0;
            for (let i = 0; i < user.securityQuestions.length; i++) {
                if (user.securityQuestions[i].answer === sanitized[i]) correctCount++;
            }
            if (correctCount !== 3) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Incorrect security answers" }));
            }

            const otp = generateOTP();
            const expires = Date.now() + 10 * 60 * 1000;
            const otpData = readJSON(OTP_FILE);
            const filtered = otpData.filter(o => o.email !== email);
            filtered.push({ email, otp, expires });
            writeJSON(OTP_FILE, filtered);

            console.log(`\n--- PASSWORD RESET OTP FOR ${email} ---\nOTP: ${otp}\n---`); 
            sendOTPToUserEmail(email, otp);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Security questions verified! Check your email for the OTP code." }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/verify-otp') {
        try {
            const body = await parseBody(req);
            const { email, otp } = body;
            if (!email || !otp) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Email and OTP are required" }));
            }

            const otpData = readJSON(OTP_FILE);
            const otpRecord = otpData.find(o => o.email === email.trim().toLowerCase());
            if (!otpRecord) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid email or OTP not requested" }));
            }
            if (Date.now() > otpRecord.expires) {
                writeJSON(OTP_FILE, otpData.filter(o => o.email !== email.trim().toLowerCase()));
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "OTP has expired. Please request a new one." }));
            }
            if (otpRecord.otp !== otp.trim()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid OTP" }));
            }

            const resetToken = crypto.randomUUID();
            const tokens = readJSON(TOKENS_FILE);
            tokens.push({ email: email.trim().toLowerCase(), token: resetToken, verified: true, expires: Date.now() + 15 * 60 * 1000 });
            writeJSON(TOKENS_FILE, tokens);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "OTP verified successfully", resetToken }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/resend-otp') {
        try {
            const body = await parseBody(req);
            let { email } = body;
            if (!email) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Email is required" }));
            }
            email = email.trim().toLowerCase();
            const users = readJSON(USERS_FILE);
            const user = users.find(u => u.email === email);
            if (!user) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User not found" }));
            }

            const otp = generateOTP();
            const expires = Date.now() + 10 * 60 * 1000;
            const otpData = readJSON(OTP_FILE);
            const filtered = otpData.filter(o => o.email !== email);
            filtered.push({ email, otp, expires });
            writeJSON(OTP_FILE, filtered);

            console.log(`\n--- RESEND OTP FOR ${email} ---\nOTP: ${otp}\n---`);
            sendOTPToUserEmail(email, otp);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "OTP resent successfully! Check your email." }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/reset-password-otp') {
        try {
            const body = await parseBody(req);
            const { resetToken, newPassword } = body;
            if (!resetToken || !newPassword || newPassword.length < 8) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid token or password must be at least 8 characters" }));
            }

            const tokens = readJSON(TOKENS_FILE);
            const tokenIndex = tokens.findIndex(t => t.token === resetToken && t.verified);
            if (tokenIndex === -1) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid reset token" }));
            }
            const tokenData = tokens[tokenIndex];
            if (Date.now() > tokenData.expires) {
                tokens.splice(tokenIndex, 1);
                writeJSON(TOKENS_FILE, tokens);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Reset token has expired" }));
            }

            const users = readJSON(USERS_FILE);
            const userIndex = users.findIndex(u => u.email === tokenData.email);
            if (userIndex !== -1) {
                const { salt, hash } = hashPassword(newPassword);
                users[userIndex].salt = salt;
                users[userIndex].hash = hash;
                writeJSON(USERS_FILE, users);
                console.log(`Password reset for user: ${tokenData.email}`);
            }

            tokens.splice(tokenIndex, 1);
            // clean up stale tokens
            const now = Date.now();
            const cleanTokens = tokens.filter(t => t.expires > now);
            writeJSON(TOKENS_FILE, cleanTokens);

            const otpData = readJSON(OTP_FILE);
            writeJSON(OTP_FILE, otpData.filter(o => o.email !== tokenData.email));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Password has been successfully reset! You can now log in." }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }


    // =================== MOVIE UPLOADS ===================
    else if (method === 'POST' && pathName === '/upload/video') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const rawName = req.headers['x-file-name'] || 'video.mp4';
            const safeName = path.basename(rawName);
            const ext = path.extname(safeName).toLowerCase() || '.mp4';
            if (!['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.mkv'].includes(ext)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unsupported video format. Use MP4, WebM, OGG, MOV or MKV." }));
            }

            const uniqueFilename = crypto.randomUUID() + ext;
            const destPath = path.join(MOVIES_DIR, uniqueFilename);

            await streamToDisk(req, destPath, MAX_VIDEO_SIZE);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Video uploaded", videoFile: uniqueFilename }));
        } catch (error) {
            console.error("Video upload error:", error);
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message || "Upload failed" }));
        }
    }

    else if (method === 'POST' && pathName === '/upload/poster') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const rawName = req.headers['x-file-name'] || 'poster.png';
            const safeName = path.basename(rawName);
            const ext = path.extname(safeName).toLowerCase() || '.png';
            if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unsupported image format. Use PNG, JPG, GIF or WEBP." }));
            }

            const uniqueFilename = 'poster_' + crypto.randomUUID() + ext;
            const destPath = path.join(MOVIES_DIR, uniqueFilename);

            const size = await streamToDisk(req, destPath, MAX_POSTER_SIZE);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Poster uploaded", posterFile: uniqueFilename, posterUrl: `/poster/${uniqueFilename}`, size }));
        } catch (error) {
            console.error("Poster upload error:", error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message || "Upload failed" }));
        }
    }

    // =================== MOVIE CRUD ===================
    else if (method === 'POST' && pathName === '/movie') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const body = await parseBody(req);
            const { title, description, genre, year, videoFile, posterFile } = body;

            if (!title || !videoFile) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Title and video file are required" }));
            }

            const safeVideo = path.basename(videoFile);
            const videoAbs = path.join(MOVIES_DIR, safeVideo);
            if (!fs.existsSync(videoAbs)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Video file was not found on server" }));
            }

            const movie = {
                id: crypto.randomUUID(),
                title: escapeHTML(title),
                description: escapeHTML(description || ''),
                genre: escapeHTML(genre || 'Other'),
                year: year ? parseInt(year, 10) || null : null,
                videoFile: safeVideo,
                posterFile: posterFile ? path.basename(posterFile) : null,
                userEmail: email,
                uploadDate: new Date().toISOString(),
                views: 0,
                streamToken: crypto.randomBytes(24).toString('hex')
            };

            const movies = readJSON(MOVIES_FILE);
            movies.push(movie);
            writeJSON(MOVIES_FILE, movies);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Movie published", movie: publicMovie(movie, `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`) }));
        } catch (error) {
            console.error("Save movie error:", error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'GET' && pathName === '/movies') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
            const movies = readJSON(MOVIES_FILE)
                .filter(m => m.userEmail && m.userEmail.toLowerCase() === email.toLowerCase())
                .map(m => publicMovie(m, origin))
                .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(movies));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'GET' && pathName.startsWith('/movie/')) {
        try {
            const id = pathName.split('/')[2];
            const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
            const movies = readJSON(MOVIES_FILE);
            const movie = movies.find(m => m.id === id);
            if (!movie) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Movie not found" }));
            }

            const email = getSessionEmail(req);
            // owner + public token access allowed
            const isOwner = movie.userEmail && email && movie.userEmail.toLowerCase() === email.toLowerCase();
            if (!isOwner) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "You do not have access to this movie" }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(publicMovie(movie, origin)));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'DELETE' && pathName.startsWith('/movie/')) {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const id = pathName.split('/')[2];
            const movies = readJSON(MOVIES_FILE);
            const idx = movies.findIndex(m => m.id === id && m.userEmail && m.userEmail.toLowerCase() === email.toLowerCase());
            if (idx === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Movie not found or not yours" }));
            }

            const [movie] = movies.splice(idx, 1);
            writeJSON(MOVIES_FILE, movies);

            for (const f of [movie.videoFile, movie.posterFile]) {
                if (f) {
                    const fp = path.join(MOVIES_DIR, path.basename(f));
                    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch (e) {} }
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Movie deleted", title: movie.title }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    // =================== STREAMING & POSTERS ===================
    else if (method === 'GET' && pathName.startsWith('/stream/')) {
        try {
            const token = pathName.split('/')[2]?.split('?')[0];
            const movies = readJSON(MOVIES_FILE);
            const movie = movies.find(m => m.streamToken === token);
            if (!movie) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Movie not found" }));
            }

            const filePath = path.join(MOVIES_DIR, movie.videoFile);
            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Video file missing on server" }));
            }

            const extname = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[extname] || 'video/mp4';
            const stats = fs.statSync(filePath);
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
                const chunksize = (end - start) + 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': contentType
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': stats.size,
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes'
                });
                fs.createReadStream(filePath).pipe(res);
            }

            // increment view count
            const moviesUpdated = readJSON(MOVIES_FILE);
            const m = moviesUpdated.find(x => x.streamToken === token);
            if (m) {
                m.views = (m.views || 0) + 1;
                writeJSON(MOVIES_FILE, moviesUpdated);
            }
        } catch (error) {
            console.error("Stream error:", error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end("Streaming error");
            }
        }
    }

    else if (method === 'GET' && pathName.startsWith('/poster/')) {
        try {
            const file = path.basename(pathName.split('/')[2]?.split('?')[0] || '');
            const filePath = path.join(MOVIES_DIR, file);
            if (!file || !fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end("Poster not found");
            }
            const extname = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[extname] || 'image/png';
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' });
            fs.createReadStream(filePath).pipe(res);
        } catch (error) {
            console.error("Poster error:", error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Poster error");
        }
    }

    // =================== SETTINGS / PROFILE ===================
    else if (method === 'GET' && pathName === '/get-profile') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }
            const users = readJSON(USERS_FILE);
            const user = users.find(u => u.email === email);
            if (!user) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User not found" }));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ name: user.name, email: user.email, phone: user.phone, theme: user.themePreference || 'light' }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/update-profile') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }
            const body = await parseBody(req);
            let { name, phone } = body;
            const users = readJSON(USERS_FILE);
            const userIndex = users.findIndex(u => u.email === email);
            if (userIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User not found" }));
            }
            if (name) users[userIndex].name = escapeHTML(name);
            if (phone) users[userIndex].phone = escapeHTML(phone);
            writeJSON(USERS_FILE, users);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Profile updated successfully", user: { name: users[userIndex].name, email: users[userIndex].email, phone: users[userIndex].phone } }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/change-password') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }
            const body = await parseBody(req);
            const { currentPassword, newPassword } = body;
            if (!currentPassword || !newPassword) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Current password and new password are required" }));
            }
            if (newPassword.length < 8) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "New password must be at least 8 characters" }));
            }
            const users = readJSON(USERS_FILE);
            const userIndex = users.findIndex(u => u.email === email);
            if (userIndex === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User not found" }));
            }
            const user = users[userIndex];
            if (!verifyPassword(currentPassword, user.hash, user.salt)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Current password is incorrect" }));
            }
            const { salt, hash } = hashPassword(newPassword);
            users[userIndex].salt = salt;
            users[userIndex].hash = hash;
            writeJSON(USERS_FILE, users);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Password changed successfully" }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/settings') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }
            const body = await parseBody(req);
            let { theme } = body;
            if (theme !== 'dark' && theme !== 'light') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid theme setting." }));
            }
            const users = readJSON(USERS_FILE);
            const userIndex = users.findIndex(u => u.email === email);
            if (userIndex !== -1) {
                users[userIndex].themePreference = theme;
                writeJSON(USERS_FILE, users);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Settings updated successfully", theme }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'GET' && pathName === '/storage-stats') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const movies = readJSON(MOVIES_FILE).filter(m => m.userEmail && m.userEmail.toLowerCase() === email.toLowerCase());
            let totalUsed = 0;
            for (const m of movies) {
                const fp = path.join(MOVIES_DIR, m.videoFile);
                if (fs.existsSync(fp)) totalUsed += fs.statSync(fp).size;
                if (m.posterFile) {
                    const pp = path.join(MOVIES_DIR, m.posterFile);
                    if (fs.existsSync(pp)) totalUsed += fs.statSync(pp).size;
                }
            }
            const remaining = Math.max(0, STORAGE_LIMIT - totalUsed);
            const percentage = Math.min(100, Math.round((totalUsed / STORAGE_LIMIT) * 100));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ used: totalUsed, limit: STORAGE_LIMIT, remaining, percentage }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    // =================== EMBED PAGE ===================
    else if (method === 'GET' && pathName.startsWith('/embed/')) {
        try {
            const token = pathName.split('/')[2]?.split('?')[0];
            const movies = readJSON(MOVIES_FILE);
            const movie = movies.find(m => m.streamToken === token);
            if (!movie) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                return res.end('<h1 style="font-family:sans-serif;padding:2rem;color:#fff;background:#111;">404 - Embed not found</h1>');
            }
            const embedPath = path.join(__dirname, 'embed.html');
            fs.readFile(embedPath, 'utf8', (err, html) => {
                if (err) {
                    res.writeHead(500);
                    return res.end('Embed page error');
                }
                const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
                const title = (movie.title || 'MyStore video').replace(/"/g, '&quot;');
                html = html
                    .replace(/__STREAM_URL__/g, `${origin}/stream/${token}`)
                    .replace(/__POSTER_URL__/g, movie.posterFile ? `${origin}/poster/${movie.posterFile}` : '')
                    .replace(/__TITLE__/g, title)
                    .replace(/__LINK__/g, `${origin}/watch.html?id=${movie.id}`);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
            });
        } catch (error) {
            console.error("Embed route error:", error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>500 - Server Error</h1>');
        }
    }

    // =================== STATIC FILES ===================
    else if (method === 'GET') {
        let filePath = pathName === '/' ? '/index.html' : pathName;
        const sanitizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');

        const protectedPages = ['/dashboard.html', '/upload.html', '/watch.html', '/settings.html'];
        if (protectedPages.includes(sanitizedPath)) {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(302, { 'Location': '/login.html' });
                return res.end();
            }
        }

        const absolutePath = path.join(__dirname, sanitizedPath);
        const extname = String(path.extname(absolutePath)).toLowerCase();
        const contentType = mimeTypes[extname] || 'application/octet-stream';

        fs.readFile(absolutePath, (error, content) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end('<h1>404 Not Found</h1>', 'utf-8');
                } else {
                    res.writeHead(500);
                    res.end(`Server Error: ${error.code}`);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    }

    else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end("Method Not Allowed");
    }
});

server.listen(PORT, () => {
    console.log(`Movie hosting server running at http://localhost:${PORT}/`);
    console.log(`Movies directory: ${MOVIES_DIR}`);
});