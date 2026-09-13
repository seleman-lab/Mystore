const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// CONFIGURATION
// ============================================
const PORT = parseInt(process.env.VIDEO_SERVER_PORT || '4000', 10);
const STORAGE_DIR = process.env.VIDEO_STORAGE_DIR || 'D:\\NetStream\\videos';
const VIDEO_SERVER_API_KEY = process.env.VIDEO_SERVER_API_KEY || '';
const UPLOAD_TOKEN_SECRET = process.env.UPLOAD_TOKEN_SECRET || '';
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;  // 5 GB
const MAX_FILE_SIZE = 50 * 1024 * 1024;           // 50 MB for posters/stickers

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    console.log(`Created storage directory: ${STORAGE_DIR}`);
}

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

// ============================================
// TOKEN VERIFICATION (HMAC-SHA256 JWT)
// ============================================
function verifyUploadToken(token) {
    if (!UPLOAD_TOKEN_SECRET || !token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [headerB64, payloadB64, signatureB64] = parts;

        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
        if (header.alg !== 'HS256') return null;

        const expectedSig = crypto.createHmac('sha256', UPLOAD_TOKEN_SECRET)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');
        if (signatureB64 !== expectedSig) return null;

        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp && Date.now() > payload.exp) return null;

        return payload;
    } catch (e) {
        return null;
    }
}

// ============================================
// SECURITY HELPERS
// ============================================
function safePath(filename) {
    const sanitized = path.basename(filename);
    if (sanitized !== filename) return null;
    if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\')) return null;
    if (!sanitized || sanitized.length > 255 || sanitized.length === 0) return null;
    return path.join(STORAGE_DIR, sanitized);
}

function streamToDisk(req, destPath, maxSize) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const ws = fs.createWriteStream(destPath);
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxSize) {
                req.destroy();
                ws.destroy();
                try { fs.unlinkSync(destPath); } catch (e) {}
                reject(new Error('File too large'));
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
}

// ============================================
// SERVER
// ============================================
const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];
    const method = req.method.toUpperCase();

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-Upload-Token, X-File-Type, X-API-Key, Range');
    if (method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // =================== ROOT / HEALTH CHECK ===================
    if (method === 'GET' && (urlPath === '/' || urlPath === '/api/health')) {
        const isRoot = urlPath === '/';
        res.writeHead(200, { 'Content-Type': isRoot ? 'text/html' : 'application/json' });
        if (isRoot) {
            return res.end(`<!DOCTYPE html><html><head><title>MyStore Video Server</title>
<style>body{font-family:system-ui;max-width:600px;margin:40px auto;padding:20px;background:#111;color:#fff;}
h1{color:#e50914;}code{background:#222;padding:2px 6px;border-radius:4px;font-size:14px;}
a{color:#e50914;}</style></head><body>
<h1>MyStore Video Storage Server</h1>
<p>Server is running. This is the storage backend for your MyStore video website.</p>
<h3>API Endpoints:</h3>
<ul>
<li><a href="/api/health"><code>GET /api/health</code></a> - Health check (JSON)</li>
<li><code>POST /api/upload</code> - Upload files (requires upload token)</li>
<li><code>GET /api/stream/:filename</code> - Stream video with Range support</li>
<li><code>GET /api/file/:filename</code> - Serve poster/sticker images</li>
<li><code>GET /api/download/:filename</code> - Download video file</li>
</ul>
<p><small>Do not upload files directly through this page. Use the MyStore website.</small></p>
</body></html>`);
        }
        return res.end(JSON.stringify({ status: 'ok', storageDir: STORAGE_DIR, timestamp: new Date().toISOString() }));
    }

    // =================== FILE UPLOAD ===================
    if (method === 'POST' && urlPath === '/api/upload') {
        const uploadToken = req.headers['x-upload-token'];
        const rawName = decodeURIComponent(req.headers['x-file-name'] || '');
        const fileType = req.headers['x-file-type'] || 'video'; // video, poster, brand

        // Verify upload token
        const payload = verifyUploadToken(uploadToken);
        if (!payload) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid or expired upload token. Please request a new one.' }));
        }

        if (!rawName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File name is required' }));
        }

        const safeName = path.basename(rawName);
        const ext = path.extname(safeName).toLowerCase() || '.mp4';

        // Validate file type
        if (fileType === 'video' && !['.mp4'].includes(ext)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Only MP4 (.mp4) videos are allowed.' }));
        }
        if (fileType === 'poster' && !['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unsupported image format. Use PNG, JPG, GIF or WEBP.' }));
        }
        if (fileType === 'brand' && !['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unsupported image format. Use PNG, JPG, GIF, WEBP or SVG.' }));
        }

        // Determine max size and generate unique filename
        const isVideo = fileType === 'video';
        const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;

        let uniqueFilename;
        if (isVideo) {
            uniqueFilename = crypto.randomUUID() + ext;
        } else if (fileType === 'poster') {
            uniqueFilename = 'poster_' + crypto.randomUUID() + ext;
        } else {
            uniqueFilename = 'sticker_' + crypto.randomUUID() + ext;
        }

        const destPath = path.join(STORAGE_DIR, uniqueFilename);

        try {
            const size = await streamToDisk(req, destPath, maxSize);
            console.log(`Upload received: ${uniqueFilename} (${(size / 1024 / 1024).toFixed(2)} MB) by ${payload.email}`);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                filename: uniqueFilename,
                originalName: safeName,
                size,
                email: payload.email,
                fileType
            }));
        } catch (error) {
            try { fs.unlinkSync(destPath); } catch (e) {}
            console.error(`Upload failed: ${error.message}`);
            res.writeHead(error.message === 'File too large' ? 413 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message || 'Upload failed' }));
        }
        return;
    }

    // =================== STREAM VIDEO (Range Request Support) ===================
    if (method === 'GET' && urlPath.startsWith('/api/stream/')) {
        const filename = decodeURIComponent(urlPath.split('/')[3]?.split('?')[0] || '');
        const filePath = safePath(filename);

        if (!filePath || !fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'video/mp4';
        const stats = fs.statSync(filePath);
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

            if (start >= stats.size || end >= stats.size) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${stats.size}`,
                    'Content-Type': 'text/plain'
                });
                return res.end('Range Not Satisfiable');
            }

            const chunksize = (end - start) + 1;
            res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*'
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': stats.size,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(filePath).pipe(res);
        }
        return;
    }

    // =================== SERVE FILES (Posters, Stickers, etc.) ===================
    if (method === 'GET' && urlPath.startsWith('/api/file/')) {
        const filename = decodeURIComponent(urlPath.split('/')[3]?.split('?')[0] || '');
        const filePath = safePath(filename);

        if (!filePath || !fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('File not found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const stats = fs.statSync(filePath);

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    // =================== DOWNLOAD FILE ===================
    if (method === 'GET' && urlPath.startsWith('/api/download/')) {
        const parts = urlPath.split('?');
        const filename = decodeURIComponent(parts[0].split('/')[3]?.split('?')[0] || '');
        const filePath = safePath(filename);

        if (!filePath || !fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const stats = fs.statSync(filePath);

        const qs = new URLSearchParams(parts[1] || '');
        const rawTitle = qs.get('title') || 'movie';
        const safeTitle = rawTitle.replace(/[^\w\- ]+/g, '').trim() || 'movie';
        const downloadName = `${safeTitle}${ext}`;

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Content-Disposition': `attachment; filename="${downloadName}"`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    // =================== DELETE FILE (requires API key) ===================
    if (method === 'DELETE' && urlPath.startsWith('/api/file/')) {
        const apiKey = req.headers['x-api-key'];
        if (!VIDEO_SERVER_API_KEY || apiKey !== VIDEO_SERVER_API_KEY) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }

        const filename = decodeURIComponent(urlPath.split('/')[3]?.split('?')[0] || '');
        const filePath = safePath(filename);

        if (!filePath || !fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'File not found' }));
        }

        try {
            const stats = fs.statSync(filePath);
            fs.unlinkSync(filePath);
            console.log(`Deleted: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'File deleted', filename }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to delete file' }));
        }
        return;
    }

    // =================== STORAGE STATS (requires API key) ===================
    if (method === 'GET' && urlPath === '/api/stats') {
        const apiKey = req.headers['x-api-key'];
        if (!VIDEO_SERVER_API_KEY || apiKey !== VIDEO_SERVER_API_KEY) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }

        try {
            const files = fs.readdirSync(STORAGE_DIR);
            let totalSize = 0;
            let fileCount = 0;
            for (const f of files) {
                const fp = path.join(STORAGE_DIR, f);
                try {
                    const stat = fs.statSync(fp);
                    if (stat.isFile()) {
                        totalSize += stat.size;
                        fileCount++;
                    }
                } catch (e) {}
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ totalSize, fileCount, storageDir: STORAGE_DIR }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to get stats' }));
        }
        return;
    }

    // =================== 404 ===================
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
    console.log(`\n=== Video Storage Server ===`);
    console.log(`Running at http://localhost:${PORT}/`);
    console.log(`Storage directory: ${STORAGE_DIR}`);
    console.log(`Max video size: ${(MAX_VIDEO_SIZE / 1024 / 1024 / 1024).toFixed(0)} GB`);
    console.log(`API key configured: ${!!VIDEO_SERVER_API_KEY}`);
    console.log(`Upload tokens enabled: ${!!UPLOAD_TOKEN_SECRET}`);
    console.log(`============================\n`);
});
