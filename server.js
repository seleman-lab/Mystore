const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend'); // Twongereyemo Resend

// Cloudinary config (set env vars for production)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'mystore',
    api_key: process.env.CLOUDINARY_API_KEY || '928916128216455',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'bCJqUzahayCfiNbNNp03DJM09BQ'
});
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(__dirname, 'users.json');
const FILES_META = path.join(__dirname, 'files.json');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');
const OTP_FILE = path.join(__dirname, 'otp.json');
const STORAGE_LIMIT = 500 * 1024 * 1024; // 500 MB per user

// Frontend URLs for CORS
const FRONTEND_URLS = [
  'https://seleman-lab.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://localhost:8000',
  'http://127.0.0.1:3000'
];

// Ensure necessary directories and files exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(FILES_META)) fs.writeFileSync(FILES_META, '[]');
if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, '[]');
if (!fs.existsSync(OTP_FILE)) fs.writeFileSync(OTP_FILE, '[]');

const sessions = {};

// --- JSON Database Helpers ---
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// --- Security & Validation Helpers ---
const escapeHTML = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

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
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

// Send OTP via Resend
const sendOTPToUserEmail = async (userEmail, otp) => {
    try {
        const data = await resend.emails.send({
            from: 'MyStore <onboarding@resend.dev>',
            to: userEmail,
            subject: 'MyStore - Password Reset OTP Code',
            html: `
                <h2>Password Reset Request</h2>
                <p>Your password reset OTP code is:</p>
                <h1 style="color: #007bff; letter-spacing: 5px; font-size: 48px; font-weight: bold; margin: 20px 0;">${otp}</h1>
                <p style="font-size: 16px;"><strong>⏱️ This code expires in 10 minutes</strong></p>
                <hr>
                <p style="color: #666; font-size: 14px;">
                    If you did not request a password reset, please ignore this email.<br>
                    Do not share this code with anyone.
                </p>
            `
        });
        console.log(`✅ OTP sent successfully to ${userEmail}, ID: ${data.id}`);
    } catch (error) {
        console.error("❌ Failed to send OTP email via Resend:", error.message);
    }
};

// --- Storage Management ---
const getStorageStats = (userEmail) => {
    try {
        const filesData = readJSON(FILES_META);
        const userFiles = filesData.filter(f => f.userEmail === userEmail);
        
        let totalUsed = 0;
        userFiles.forEach(file => {
            try {
                const filePath = path.join(UPLOADS_DIR, file.filename);
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    totalUsed += stats.size;
                }
            } catch (err) {
                console.error("Error getting file size:", err);
            }
        });
        
        const remaining = Math.max(0, STORAGE_LIMIT - totalUsed);
        const percentage = Math.round((totalUsed / STORAGE_LIMIT) * 100);
        
        return {
            used: totalUsed,
            limit: STORAGE_LIMIT,
            remaining: remaining,
            percentage: percentage
        };
    } catch (err) {
        console.error("Error calculating storage stats:", err);
        return { used: 0, limit: STORAGE_LIMIT, remaining: STORAGE_LIMIT, percentage: 0 };
    }
};

// --- Request Parsing & Other Helpers ---
const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            if (body.length > 1e6) { 
                req.connection.destroy();
                reject(new Error("Payload too large"));
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
}

const parseMultipartData = (req, boundary) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalSize = 0;
        
        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > 50 * 1024 * 1024) {
                req.connection.destroy();
                reject(new Error("File too large"));
            }
            chunks.push(chunk);
        });
        
        req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const boundaryBuffer = Buffer.from('--' + boundary);
            
            let parts = [];
            let start = buffer.indexOf(boundaryBuffer);
            
            while (start !== -1) {
                let next = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
                if (next === -1) break;
                
                let part = buffer.slice(start + boundaryBuffer.length, next);
                parts.push(part);
                start = next;
            }
            
            for (let part of parts) {
                if (part.length > 2 && part[0] === 13 && part[1] === 10) {
                    part = part.slice(2);
                }
                
                const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
                if (headerEnd !== -1) {
                    const headerString = part.slice(0, headerEnd).toString('utf8');
                    const fileData = part.slice(headerEnd + 4, part.length - 2);
                    
                    const nameMatch = headerString.match(/name="([^"]+)"/);
                    const filenameMatch = headerString.match(/filename="([^"]+)"/);
                    const contentTypeMatch = headerString.match(/Content-Type:\s*(.+)/);
                    
                    if (nameMatch && filenameMatch) {
                        resolve({
                            filename: filenameMatch[1],
                            contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
                            data: fileData
                        });
                        return;
                    }
                }
            }
            reject(new Error("No file found in multipart form data"));
        });
        req.on('error', reject);
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
    '.json': 'application/json',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf'
};

// --- Server Creation ---
const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];
    const pathName = urlPath.replace(/\/+$/, '').replace(/\/+/g, '/') || '/';
    const method = req.method.toUpperCase();

    // CORS Headers
    const origin = req.headers.origin;
    const allowedOrigins = [...FRONTEND_URLS, 'https://seleman-lab.github.io/Mystore'];
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Logic remaining same...
    // (Ensure you have all the routes defined in your original file here)
    // NOTE: Keep all other route handlers unchanged.
    
    // Example call for verification (inside /verify-security-questions):
    // sendOTPToUserEmail(email, otp);

    // ... (All other route handlers omitted for brevity, ensure they remain intact)
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Backend URL: https://mystore-1-tp7b.onrender.com`);
    if (useCloudinary) {
        console.log(`☁️  Cloudinary storage is ENABLED`);
    }
});