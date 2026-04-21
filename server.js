const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(__dirname, 'users.json');
const FILES_META = path.join(__dirname, 'files.json');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');
const OTP_FILE = path.join(__dirname, 'otp.json');
const STORAGE_LIMIT = 500 * 1024 * 1024; // 500 MB per user

// Ensure necessary directories and files exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(FILES_META)) fs.writeFileSync(FILES_META, '[]');
if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, '[]');
if (!fs.existsSync(OTP_FILE)) fs.writeFileSync(OTP_FILE, '[]');

let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.warn("Notice: nodemailer is not installed. Emails will only be logged to the console.");
}

// SMTP Configuration (Replace with real credentials)
const ADMIN_EMAIL = 'kennyselleman@gmail.com'; // Admin email for OTP verification
const createTransporter = () => {
    if (!nodemailer) return null;
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER || 'your_email@gmail.com', // Set GMAIL_USER environment variable
            pass: process.env.GMAIL_PASS || 'your_app_password'     // Set GMAIL_PASS environment variable
        }
    });
};

const sessions = {};

// --- JSON Database Helpers ---
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// --- Security & Validation Helpers ---

// Sanitize HTML to prevent XSS
const escapeHTML = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

// Validate email format
const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

// --- Cryptography ---

// Scrypt for brute-force resistance
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

const sendOTPToAdmin = (userEmail, otp) => {
    const transporter = createTransporter();
    if (transporter) {
        const mailOptions = {
            from: process.env.GMAIL_USER || 'your_email@gmail.com',
            to: ADMIN_EMAIL,
            subject: 'MyStore - Password Reset OTP Request',
            html: `
                <h2>Password Reset Request</h2>
                <p><strong>User Email:</strong> ${userEmail}</p>
                <p><strong>OTP Code (valid for 10 minutes):</strong></p>
                <h1 style="color: #007bff; letter-spacing: 5px; font-size: 36px;">${otp}</h1>
                <p><strong>Instructions:</strong></p>
                <ul>
                    <li>User will contact you with their email: ${userEmail}</li>
                    <li>Send them this OTP code: <strong>${otp}</strong></li>
                    <li>They will enter the OTP on the verification page</li>
                </ul>
                <p style="color: #666; font-size: 12px;">This OTP will expire in 10 minutes.</p>
            `
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Failed to send OTP to admin:", error.message);
            } else {
                console.log("OTP sent to admin:", info.response);
            }
        });
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

// --- Request Parsing ---
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

// Raw Multipart Parser
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
    // 1. Robust URL Normalization
    // Get the path without query parameters, remove trailing slashes, 
    // and collapse multiple leading slashes (e.g. //upload -> /upload)
    const urlPath = req.url.split('?')[0];
    const pathName = urlPath.replace(/\/+$/, '').replace(/\/+/g, '/') || '/';
    const method = req.method.toUpperCase();

    // 2. Debug Log (Check your terminal/console when you click the button!)
    console.log(`[${method}] Incoming request to: "${pathName}"`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (method === 'POST' && pathName === '/signup') {
        try {
            const body = await parseBody(req);
            let { name, email, password, phone, securityQuestions } = body;

            // 1. Validate Inputs
            if (!name || !email || !password || !phone || !securityQuestions || securityQuestions.length !== 3) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "All fields including security questions are required" }));
            }
            if (!isValidEmail(email)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid email format" }));
            }
            if (password.length < 8) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Password must be at least 8 characters long" }));
            }
            
            // 2. Sanitize Inputs
            name = escapeHTML(name);
            phone = escapeHTML(phone);
            email = email.trim().toLowerCase();
            
            // Sanitize security questions and answers
            const sanitizedQuestions = securityQuestions.map(sq => ({
                question: escapeHTML(sq.question),
                answer: escapeHTML(sq.answer.trim().toLowerCase()) // Lowercase for case-insensitive comparison
            }));

            const users = readJSON(USERS_FILE);
            
            // 3. Duplicate Prevention
            if (users.some(u => u.email === email)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User already exists with this email" }));
            }

            const { salt, hash } = hashPassword(password);
            const newUser = { 
                id: crypto.randomUUID(),
                name, 
                email, 
                phone, 
                salt, 
                hash,
                securityQuestions: sanitizedQuestions,
                themePreference: 'light' 
            };
            
            users.push(newUser);
            writeJSON(USERS_FILE, users);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "User registered successfully" }));
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
            
            res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=3600`);
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

            // Compare answers (case-insensitive)
            const sanitizedAnswers = answers.map(a => escapeHTML(a.trim().toLowerCase()));
            let correctCount = 0;

            for (let i = 0; i < user.securityQuestions.length; i++) {
                if (user.securityQuestions[i].answer === sanitizedAnswers[i]) {
                    correctCount++;
                }
            }

            // Require 3 out of 3 correct answers
            if (correctCount !== 3) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Incorrect security answers" }));
            }

            // Answers verified - generate OTP
            const otp = generateOTP();
            const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

            const otpData = readJSON(OTP_FILE);
            const filtered = otpData.filter(o => o.email !== email);
            filtered.push({ email, otp, expires });
            writeJSON(OTP_FILE, filtered);

            console.log(`\n--- PASSWORD RESET OTP (via Security Questions) FOR ${email} ---\nOTP: ${otp}\n--- SEND TO USER ---\n------------------------------------------\n`);
            sendOTPToAdmin(email, otp);

            // For testing: include the OTP in the response if environment variables are not set
            if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ 
                    message: "Security questions verified! Your OTP has been sent.",
                    testOTP: otp,
                    testNote: "TEST MODE - OTP for user: " + otp
                }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Security questions verified! Check your email for the OTP code." }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
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

            if (!user || !user.securityQuestions) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "User not found or no security questions set" }));
            }

            // Return only questions, not answers
            const questions = user.securityQuestions.map(sq => sq.question);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ questions }));
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/request-otp') {
        try {
            const body = await parseBody(req);
            let { email } = body;
            
            if (!email) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Email is required" }));
            }
            email = email.trim().toLowerCase();

            const users = readJSON(USERS_FILE);
            const userExists = users.some(u => u.email === email);

            if (userExists) {
                const otp = generateOTP();
                const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

                const otpData = readJSON(OTP_FILE);
                // Remove any existing OTP for this email
                const filtered = otpData.filter(o => o.email !== email);
                filtered.push({ email, otp, expires });
                writeJSON(OTP_FILE, filtered);

                console.log(`\n--- PASSWORD RESET OTP REQUEST FOR ${email} ---\nOTP: ${otp}\n--- ADMIN WILL SEND THIS TO USER ---\n---------------------------------------\n`);
                sendOTPToAdmin(email, otp);

                // For testing: include the OTP in the response if environment variables are not set
                if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ 
                        message: "Your password reset request has been received. The admin will send you an OTP code shortly.",
                        testOTP: otp,
                        testNote: "TEST MODE - Admin OTP (share with user): " + otp
                    }));
                }
            }

            // Always return success even if user doesn't exist (prevent email enumeration)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Your password reset request has been received. The admin will send you an OTP code to your registered email or contact method." }));
        } catch (error) {
            console.error(error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Internal Server Error" }));
            }
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
                // Remove expired OTP
                const filtered = otpData.filter(o => o.email !== email.trim().toLowerCase());
                writeJSON(OTP_FILE, filtered);
                
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "OTP has expired. Please request a new one." }));
            }

            if (otpRecord.otp !== otp.trim()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid OTP" }));
            }

            // OTP verified - generate a temporary token for password reset
            const resetToken = crypto.randomUUID();
            const tokenData = {
                email: email.trim().toLowerCase(),
                token: resetToken,
                verified: true,
                expires: Date.now() + 15 * 60 * 1000 // 15 minutes
            };

            const tokens = readJSON(TOKENS_FILE);
            tokens.push(tokenData);
            writeJSON(TOKENS_FILE, tokens);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                message: "OTP verified successfully",
                resetToken: resetToken
            }));
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
                return res.end(JSON.stringify({ error: "Invalid token or password does not meet requirements (min 8 characters)" }));
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

            // Invalidate token after use
            tokens.splice(tokenIndex, 1);
            writeJSON(TOKENS_FILE, tokens);

            // Clean up OTP data for this email
            const otpData = readJSON(OTP_FILE);
            const filtered = otpData.filter(o => o.email !== tokenData.email);
            writeJSON(OTP_FILE, filtered);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Password has been successfully reset" }));
            
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/forgot-password') {
        try {
            const body = await parseBody(req);
            let { email } = body;
            
            if (!email) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Email is required" }));
            }
            email = email.trim().toLowerCase();

            const users = readJSON(USERS_FILE);
            const userExists = users.some(u => u.email === email);

            if (userExists) {
                const token = crypto.randomBytes(32).toString('hex');
                const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

                const tokens = readJSON(TOKENS_FILE);
                tokens.push({ email, token, expires });
                writeJSON(TOKENS_FILE, tokens);

                const resetLink = `http://${req.headers.host}/reset.html?token=${token}`;
                console.log(`\n--- PASSWORD RESET LINK FOR ${email} ---\n${resetLink}\n---------------------------------------\n`);

                const transporter = createTransporter();
                console.log(`Email transporter created: ${transporter ? 'YES' : 'NO'}`);
                console.log(`GMAIL_USER: ${process.env.GMAIL_USER ? 'SET' : 'NOT SET'}`);
                console.log(`GMAIL_PASS: ${process.env.GMAIL_PASS ? 'SET' : 'NOT SET'}`);
                
                if (transporter) {
                    const mailOptions = {
                        from: process.env.GMAIL_USER || 'your_email@gmail.com',
                        to: email,
                        subject: 'Password Reset - MyStore',
                        text: `You requested a password reset. Click the link below to securely reset your password:\n\n${resetLink}\n\nThis link expires in 15 minutes.\nIf you did not request this, please ignore this email.`
                    };
                    console.log(`Attempting to send email to: ${email}`);
                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) {
                            console.error("Failed to send email via nodemailer:", error.message);
                        } else {
                            console.log("Email sent successfully:", info.response);
                        }
                    });
                } else {
                    console.log("No transporter available - email not sent");
                }

                // For testing: include the reset link in the response if environment variables are not set
                if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ 
                        message: "If an account with that email exists, a password reset link has been sent.",
                        testLink: resetLink,
                        note: "TEST MODE: Copy this link since email credentials are not configured"
                    }));
                }
            }

            // Always return success even if user doesn't exist (prevent email enumeration)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "If an account with that email exists, a password reset link has been sent." }));
        } catch (error) {
            console.error(error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Internal Server Error" }));
            }
        }
    }

    else if (method === 'POST' && pathName === '/reset-password') {
        try {
            const body = await parseBody(req);
            const { token, newPassword } = body;

            if (!token || !newPassword || newPassword.length < 8) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid token or password does not meet requirements" }));
            }

            const tokens = readJSON(TOKENS_FILE);
            const tokenIndex = tokens.findIndex(t => t.token === token);

            if (tokenIndex === -1) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Invalid or expired reset token" }));
            }

            const tokenData = tokens[tokenIndex];

            if (Date.now() > tokenData.expires) {
                // Clean up expired token
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
            }

            // Invalidate token after use
            tokens.splice(tokenIndex, 1);
            writeJSON(TOKENS_FILE, tokens);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "Password has been successfully reset" }));
            
        } catch (error) {
            console.error(error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }
    
    else if (method === 'POST' && pathName === '/upload') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const contentType = req.headers['content-type'] || '';
            if (!contentType.includes('multipart/form-data')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Content-Type must be multipart/form-data" }));
            }

            const boundaryMatch = contentType.match(/boundary=([^;\s]+)/);
            if (!boundaryMatch) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "No boundary found in Content-Type" }));
            }
            
            // Remove quotes from boundary if present
            let boundary = boundaryMatch[1].replace(/^"|"$/g, '');
            const fileObj = await parseMultipartData(req, boundary);
            
            const ext = path.extname(fileObj.filename) || '';
            const uniqueFilename = crypto.randomUUID() + ext;
            const filePath = path.join(UPLOADS_DIR, uniqueFilename);
            
            fs.writeFileSync(filePath, fileObj.data);
            
            const filesData = readJSON(FILES_META);
            const newFileMeta = {
                filename: uniqueFilename,
                originalName: escapeHTML(fileObj.filename),
                userEmail: email,
                mimeType: escapeHTML(fileObj.contentType),
                uploadDate: new Date()
            };
            
            filesData.push(newFileMeta);
            writeJSON(FILES_META, filesData);
            
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "File uploaded successfully", file: newFileMeta }));

        } catch (error) {
            console.error("Upload error:", error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error or invalid multipart data" }));
        }
    }
    
    else if (method === 'POST' && pathName === '/delete-file') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const body = await parseBody(req);
            const { filename } = body;

            if (!filename) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Filename is required" }));
            }

            // Sanitize filename to prevent path traversal
            const safeFilename = path.basename(filename);

            // Verify file ownership
            const filesData = readJSON(FILES_META);
            const fileIndex = filesData.findIndex(f => f.filename === safeFilename && f.userEmail && f.userEmail.toLowerCase() === email.toLowerCase());

            if (fileIndex === -1) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "File not found or unauthorized" }));
            }

            // Delete physical file
            const filePath = path.join(UPLOADS_DIR, safeFilename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Remove from metadata
            filesData.splice(fileIndex, 1);
            writeJSON(FILES_META, filesData);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: "File deleted successfully" }));
        } catch (error) {
            console.error("Delete error:", error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'POST' && pathName === '/generate-embed-link') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const body = await parseBody(req);
            const { filename } = body;

            if (!filename) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Filename is required" }));
            }

            const safeFilename = path.basename(filename);

            // Verify file ownership
            const filesData = readJSON(FILES_META);
            const fileMeta = filesData.find(f => f.filename === safeFilename && f.userEmail && f.userEmail.toLowerCase() === email.toLowerCase());

            if (!fileMeta) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "File not found or unauthorized" }));
            }

            // Generate unique embed token
            const embedToken = crypto.randomBytes(32).toString('hex');
            fileMeta.embedToken = embedToken;
            fileMeta.embedTokenCreated = Date.now();
            writeJSON(FILES_META, filesData);

            const embedUrl = `http://${req.headers.host}/embed/${embedToken}`;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ embedUrl }));
        } catch (error) {
            console.error("Embed link error:", error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    else if (method === 'GET' && pathName.startsWith('/embed/')) {
        try {
            const embedToken = req.url.split('/')[2]?.split('?')[0];
            
            const filesData = readJSON(FILES_META);
            const fileMeta = filesData.find(f => f.embedToken === embedToken);

            if (!fileMeta) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                return res.end('<h1>404 - Embed not found</h1>');
            }

            const filePath = path.join(UPLOADS_DIR, fileMeta.filename);
            
            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                return res.end('<h1>404 - File not found</h1>');
            }

            const extname = String(path.extname(filePath)).toLowerCase();
            const contentType = mimeTypes[extname] || 'application/octet-stream';

            const stats = fs.statSync(filePath);
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': contentType,
                });
                file.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': stats.size,
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes',
                });
                fs.createReadStream(filePath).pipe(res);
            }
        } catch (error) {
            console.error("Embed error:", error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>500 - Server Error</h1>');
        }
    }



    else if (method === 'GET' && pathName === '/files') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const filesData = readJSON(FILES_META);
            const userFiles = filesData.filter(f => f.userEmail.toLowerCase() === email.toLowerCase());
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(userFiles));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }


    
    // NEW ENDPOINT: Secure File Download
    else if (method === 'GET' && pathName.startsWith('/download')) {
        try {
            // 1. Authenticate user
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            // 2. Extract filename from query parameter
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const queryFile = urlObj.searchParams.get('file');

            if (!queryFile) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "No file specified." }));
            }

            // 3. Sanitize filename to prevent path traversal
            const safeFilename = path.basename(queryFile);

            // 4. Verify ownership
            const filesData = readJSON(FILES_META);
            const fileMeta = filesData.find(f => f.filename === safeFilename && f.userEmail && f.userEmail.toLowerCase() === email.toLowerCase());

            if (!fileMeta) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Forbidden or file not found." }));
            }

            const absoluteFilePath = path.join(UPLOADS_DIR, safeFilename);

            // 5. Ensure physical file exists
            if (!fs.existsSync(absoluteFilePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Physical file missing on server." }));
            }

            // 6. Set appropriate headers
            const extname = String(path.extname(absoluteFilePath)).toLowerCase();
            const contentType = mimeTypes[extname] || 'application/octet-stream';
            
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${fileMeta.originalName}"`
            });

            // 7. Stream file to client
            const readStream = fs.createReadStream(absoluteFilePath);
            readStream.pipe(res);
            
            readStream.on('error', (err) => {
                console.error("Stream error:", err);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end("Stream error");
                }
            });

        } catch (error) {
            console.error("Download error:", error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Internal Server Error" }));
            }
        }
    }
    
    else if (method === 'GET' && pathName === '/settings') {
        try {
            const email = getSessionEmail(req);
            if (!email) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Unauthorized. Please log in." }));
            }

            const users = readJSON(USERS_FILE);
            const user = users.find(u => u.email === email);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ theme: user?.themePreference || 'light' }));
        } catch (error) {
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

            const stats = getStorageStats(email);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats));
        } catch (error) {
            console.error("Storage stats error:", error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }
    
    else if (method === 'GET') {
        let filePath = pathName === '/' ? '/index.html' : pathName;
        const sanitizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
        
        // --- Static Route Protection ---
        const protectedPages = ['/dashboard.html', '/settings.html'];
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
    console.log(`Server running securely at http://localhost:${PORT}/`);
});
