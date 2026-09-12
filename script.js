// API Configuration
const API_BASE_URL = (() => {
  const { protocol, hostname, port } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
  if (isLocalHost) return 'http://localhost:3000';
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
})();

function copyTextToClipboard(text) {
  return new Promise((resolve) => {
    const done = (ok) => resolve(ok);
    const legacy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    };
    if (navigator.clipboard && window.isSecureContext !== false) {
      navigator.clipboard.writeText(text).then(() => done(true), legacy);
    } else {
      legacy();
    }
  });
}

// ============================================
// THEME - apply saved theme
// ============================================
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
  document.body.classList.add('dark-theme');
} else {
  document.body.classList.remove('dark-theme');
}

// ============================================
// MOBILE MENU TOGGLE
// ============================================
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const navLinks = document.getElementById('nav-links');
if (mobileMenuBtn && navLinks) {
  mobileMenuBtn.addEventListener('click', () => navLinks.classList.toggle('active'));
}

// ============================================
// LOGOUT HANDLER
// ============================================
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await fetch(`${API_BASE_URL}/logout`, { method: 'POST', credentials: 'include' }); } catch (err) {}
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    window.location.href = 'login.html';
  });
}

// ============================================
// 1. SIGNUP FORM HANDLER
// ============================================
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!name || !email || !phone || !password || !confirmPassword) return alert('❌ All fields are required');
    if (password !== confirmPassword) return alert('❌ Passwords do not match');
    if (password.length < 8) return alert('❌ Password must be at least 8 characters');

    const q1 = document.getElementById('security-q1').value;
    const a1 = document.getElementById('security-a1').value.trim();
    const q2 = document.getElementById('security-q2').value;
    const a2 = document.getElementById('security-a2').value.trim();
    const q3 = document.getElementById('security-q3').value;
    const a3 = document.getElementById('security-a3').value.trim();
    if (!q1 || !a1 || !q2 || !a2 || !q3 || !a3) return alert('❌ Please answer all security questions');

    const securityQuestions = [
      { question: q1, answer: a1 },
      { question: q2, answer: a2 },
      { question: q3, answer: a3 }
    ];

    const submitBtn = signupForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Creating Account...';
    submitBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, phone, password, securityQuestions })
      });
      const data = await response.json();
      if (response.ok) {
        alert('✅ Account created successfully! Redirecting to login...');
        window.location.href = 'login.html';
      } else {
        alert(`❌ ${data.error || 'Signup failed'}`);
      }
    } catch (error) {
      alert('❌ Network error. Please check your connection and try again.');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 2. LOGIN FORM HANDLER
// ============================================
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return alert('❌ Email and password are required');

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Logging in...';
    submitBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', data.user.name);
        window.location.href = 'dashboard.html';
      } else {
        alert(`❌ ${data.error || 'Login failed'}`);
      }
    } catch (error) {
      alert('❌ Cannot reach the server at ' + API_BASE_URL + '. Is the server running? Start it with: node server.js');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 3. FORGOT PASSWORD - EMAIL FORM
// ============================================
const emailForm = document.getElementById('email-form');
if (emailForm) {
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) return alert('❌ Email is required');

    const submitBtn = emailForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/get-security-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (response.ok) {
        sessionStorage.setItem('resetEmail', email);
        window.location.href = 'answer-questions.html';
      } else {
        alert(`❌ ${data.error || 'Email not found'}`);
      }
    } catch (error) {
      alert('❌ Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 3.1. LOAD SECURITY QUESTIONS
// ============================================
const loadSecurityQuestions = async () => {
  const qContainer = document.getElementById('questions-container');
  if (!qContainer) return;
  const email = sessionStorage.getItem('resetEmail');
  if (!email) {
    alert('❌ Session expired. Please start over.');
    window.location.href = 'forgot.html';
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/get-security-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (response.ok) {
      const questions = data.questions || [];
      qContainer.innerHTML = '';
      questions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'form-group';
        questionDiv.innerHTML = `
          <label for="answer-${index + 1}"><strong>Q${index + 1}: ${question}</strong></label>
          <input type="text" id="answer-${index + 1}" class="security-answer form-control" placeholder="Your answer" required>
        `;
        qContainer.appendChild(questionDiv);
      });
    } else {
      alert(`❌ ${data.error}`);
      window.location.href = 'forgot.html';
    }
  } catch (error) {
    alert('❌ Network error loading questions.');
    window.location.href = 'forgot.html';
  }
};
if (document.getElementById('questions-container')) loadSecurityQuestions();

// ============================================
// 3.2. ANSWER SECURITY QUESTIONS FORM
// ============================================
const answerQuestionsForm = document.getElementById('answer-questions-form');
if (answerQuestionsForm) {
  answerQuestionsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = sessionStorage.getItem('resetEmail');
    if (!email) return alert('❌ Session expired. Please start over.');

    const answerInputs = document.querySelectorAll('.security-answer');
    if (answerInputs.length === 0) return alert('❌ Questions not loaded. Please refresh and try again.');
    const answers = Array.from(answerInputs).map(input => input.value.trim());
    if (answers.some(a => !a)) return alert('❌ Please answer all security questions!');

    const submitBtn = document.getElementById('submit-answers-btn');
    submitBtn.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/verify-security-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, answers })
      });
      const data = await response.json();
      if (response.ok) {
        alert('✅ Security answers verified!\n\nAn OTP has been sent to your email: ' + email);
        window.location.href = 'verify-otp.html';
      } else {
        alert(`❌ ${data.error || 'Incorrect answers. Please try again.'}`);
      }
    } catch (error) {
      alert('❌ A network error occurred.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 4. VERIFY OTP FORM
// ============================================
const verifyOtpForm = document.getElementById('verify-otp-form');
if (verifyOtpForm) {
  verifyOtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = sessionStorage.getItem('resetEmail');
    const otp = document.getElementById('otp-input').value.trim();
    if (!email) return alert('❌ Session expired. Please start over.');
    if (!otp) return alert('❌ Please enter the OTP code');

    const submitBtn = verifyOtpForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, otp })
      });
      const data = await response.json();
      if (response.ok) {
        sessionStorage.setItem('resetToken', data.resetToken);
        alert('✅ OTP verified! Redirecting to password reset...');
        window.location.href = 'reset.html';
      } else {
        alert(`❌ ${data.error || 'Invalid OTP'}`);
      }
    } catch (error) {
      alert('❌ A network error occurred.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 5. RESET PASSWORD FORM
// ============================================
const resetPasswordForm = document.getElementById('reset-password-form');
if (resetPasswordForm) {
  resetPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resetToken = sessionStorage.getItem('resetToken');
    const newPassword = document.getElementById('new-password').value;
    const confirmNewPassword = document.getElementById('confirm-new-password').value;
    if (!resetToken) return alert('❌ Session expired. Please start over.');
    if (!newPassword || !confirmNewPassword) return alert('❌ Please enter both passwords');
    if (newPassword !== confirmNewPassword) return alert('❌ Passwords do not match');
    if (newPassword.length < 8) return alert('❌ Password must be at least 8 characters');

    const submitBtn = resetPasswordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/reset-password-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ resetToken, newPassword })
      });
      const data = await response.json();
      if (response.ok) {
        alert('✅ Password reset successfully! Redirecting to login...');
        sessionStorage.removeItem('resetEmail');
        sessionStorage.removeItem('resetToken');
        window.location.href = 'login.html';
      } else {
        alert(`❌ ${data.error || 'Password reset failed'}`);
      }
    } catch (error) {
      alert('❌ A network error occurred.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 6. MOVIE LIBRARY (DASHBOARD)
// ============================================
const loadMovies = async () => {
  const grid = document.getElementById('movies-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><h3>Loading your library...</h3></div>`;

  try {
    const response = await fetch(`${API_BASE_URL}/movies`, { credentials: 'include' });
    if (response.status === 401) { window.location.href = 'login.html'; return; }
    if (!response.ok) throw new Error('Failed to load movies');

    const movies = await response.json();
    if (movies.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎬</div>
          <h3>No movies yet</h3>
          <p>Upload your first movie to start your collection.</p>
          <a href="upload.html" class="btn btn-primary">+ Upload Movie</a>
        </div>`;
      return;
    }

    grid.innerHTML = '';
    movies.forEach(movie => {
      const card = document.createElement('a');
      card.className = 'movie-card';
      card.href = `watch.html?id=${movie.id}`;

      card.innerHTML = `
        <div class="movie-poster-wrap">
          ${movie.posterUrl
            ? `<img class="movie-poster" src="${movie.posterUrl}" alt="${movie.title}" loading="lazy">`
            : `<div class="movie-poster placeholder"><span>🎬</span></div>`}
          <div class="movie-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
          <div class="movie-badge genre">${movie.genre || 'Movie'}</div>
        </div>
        <div class="movie-card-info">
          <h3 class="movie-title">${movie.title}</h3>
          <div class="movie-sub">
            ${movie.year ? `<span>${movie.year}</span>` : ''}
            <span>👁 ${movie.views.toLocaleString()}</span>
          </div>
        </div>
        <button class="movie-delete" data-id="${movie.id}" title="Delete movie">🗑️</button>
      `;

      grid.appendChild(card);
    });

    grid.querySelectorAll('.movie-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Delete this movie and all its files from local storage?')) return;
        try {
          const res = await fetch(`${API_BASE_URL}/movie/${btn.dataset.id}`, { method: 'DELETE', credentials: 'include' });
          const data = await res.json();
          if (res.ok) {
            alert('Movie deleted');
            loadMovies();
            loadStorageStats();
          } else {
            alert(data.error || 'Delete failed');
          }
        } catch (err) { alert('Delete failed'); }
      });
    });
  } catch (error) {
    console.error('Load movies error:', error);
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Could not load your library</h3><p>${error.message}</p></div>`;
  }
};
if (document.getElementById('movies-grid')) loadMovies();

// ============================================
// 6.1. STORAGE STATS
// ============================================
const loadStorageStats = async () => {
  const storageUsed = document.getElementById('storage-used');
  if (!storageUsed) return;
  try {
    const response = await fetch(`${API_BASE_URL}/storage-stats`, { credentials: 'include' });
    if (!response.ok) return;
    const stats = await response.json();

    const usedGB = (stats.used / (1024 * 1024 * 1024)).toFixed(2);
    const limitGB = (stats.limit / (1024 * 1024 * 1024)).toFixed(0);
    const remainingGB = (stats.remaining / (1024 * 1024 * 1024)).toFixed(2);

    storageUsed.style.width = stats.percentage + '%';
    document.getElementById('storage-used-text').textContent = usedGB + ' GB';
    document.getElementById('storage-limit-text').textContent = limitGB + ' GB';
    document.getElementById('storage-remaining-text').textContent = remainingGB + ' GB';

    if (stats.percentage > 90) storageUsed.style.background = 'linear-gradient(to right, #ef4444, #dc2626)';
    else if (stats.percentage > 70) storageUsed.style.background = 'linear-gradient(to right, #f59e0b, #d97706)';
  } catch (error) { console.error('Storage stats error:', error); }
};
if (document.getElementById('storage-used')) loadStorageStats();

// ============================================
// 7. UPLOAD FORM
// ============================================
const uploadForm = document.getElementById('upload-form');
if (uploadForm) {
  const videoInput = document.getElementById('video-file');
  const posterInput = document.getElementById('poster-file');
  let videoFile = null;
  let posterFile = null;

  const videoDz = document.getElementById('video-dropzone');
  const posterDz = document.getElementById('poster-dropzone');

  const setupDropzone = (dz, input, onPick, nameElId) => {
    dz.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') input.click(); });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; onPick(e.dataTransfer.files[0]); }
    });
    input.addEventListener('change', () => { if (input.files.length) onPick(input.files[0]); });

    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  };

  setupDropzone(videoDz, videoInput, (f) => {
    videoFile = f;
    document.getElementById('video-name').textContent = f.name;
    document.getElementById('video-name').classList.add('selected');
  }, 'video-name');

  setupDropzone(posterDz, posterInput, (f) => {
    posterFile = f;
    document.getElementById('poster-name').textContent = f.name;
    document.getElementById('poster-name').classList.add('selected');
  }, 'poster-name');

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('m-title-input').value.trim();
    if (!title) return alert('❌ Please enter a movie title');
    if (!videoFile) return alert('❌ Please select a video file');
    if (videoFile.size > 5 * 1024 * 1024 * 1024) return alert('❌ Video is larger than 5 GB.');

    const submitBtn = document.getElementById('upload-submit');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Uploading...';

    try {
      // 0) Optional client-side compression
      let toUpload = videoFile;
      let uploadName = videoFile.name;
      const compressCb = document.getElementById('compress-video');
      if (compressCb && compressCb.checked && window.MediaRecorder) {
        const compRow = document.getElementById('compress-progress-row');
        const compFill = document.getElementById('compress-progress');
        const compText = document.getElementById('compress-progress-text');
        compRow.style.display = 'flex';
        submitBtn.innerText = 'Compressing...';
        try {
          toUpload = await compressVideoToWebM(videoFile, document.getElementById('compress-quality').value, (pct) => {
            compFill.style.width = pct + '%';
            compText.textContent = pct + '%';
          });
          const base = (videoFile.name || 'video').replace(/\.[^.]+$/, '');
          uploadName = base + '.webm';
        } catch (err) {
          compRow.style.display = 'none';
          toUpload = videoFile;
        }
      }

      // 1) Upload video (streamed to local disk)
      document.getElementById('video-progress-row').style.display = 'flex';
      const videoResult = await uploadWithProgress(toUpload, `${API_BASE_URL}/upload/video`, document.getElementById('video-progress'), document.getElementById('video-progress-text'), uploadName);
      if (!videoResult.ok) {
        const data = JSON.parse(videoResult.response || '{}');
        throw new Error(data.error || 'Video upload failed');
      }
      const vidData = JSON.parse(videoResult.response);

      // 2) Optional poster
      let posterFileResult = null;
      if (posterFile) {
        const posterResult = await uploadWithProgress(posterFile, `${API_BASE_URL}/upload/poster`, null, null);
        if (!posterResult.ok) {
          const data = JSON.parse(posterResult.response || '{}');
          throw new Error(data.error || 'Poster upload failed');
        }
        posterFileResult = JSON.parse(posterResult.response);
      }

      // 3) Save movie metadata
      const saveRes = await fetch(`${API_BASE_URL}/movie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title,
          description: document.getElementById('m-desc-input').value.trim(),
          genre: document.getElementById('m-genre-input').value,
          year: document.getElementById('m-year-input').value,
          videoFile: vidData.videoFile,
          posterFile: posterFileResult ? posterFileResult.posterFile : null
        })
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Could not save movie');

      alert('✅ Movie uploaded successfully!');
      uploadForm.reset();
      document.getElementById('video-name').textContent = 'No file selected';
      document.getElementById('poster-name').textContent = 'No file selected';
      window.location.href = 'dashboard.html';
    } catch (error) {
      alert(`❌ ${error.message || 'Upload failed'}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = '🚀 Upload Movie';
    }
  });
}

function uploadWithProgress(file, url, progressEl, textEl, name) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(name || file.name));
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressEl) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressEl.style.width = pct + '%';
        if (textEl) textEl.textContent = pct + '%';
      }
    });

    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, response: xhr.responseText, status: xhr.status });
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

function compressVideoToWebM(file, quality, onProgress) {
  return new Promise((resolve, reject) => {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      return reject(new Error('Compression is not supported in this browser.'));
    }

    const settings = {
      fast: { maxW: 854, maxH: 480, vbps: 900000, abps: 64000 },
      good: { maxW: 1280, maxH: 720, vbps: 1800000, abps: 96000 },
      best: { maxW: 1920, maxH: 1080, vbps: 3500000, abps: 128000 }
    }[quality] || { maxW: 1280, maxH: 720, vbps: 1800000, abps: 96000 };

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let stream = null;
    let recorder = null;
    let running = true;
    const chunks = [];

    canvas.width = 2;
    canvas.height = 2;

    const cleanup = () => {
      running = false;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };

    video.setAttribute('playsinline', '');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const scale = Math.min(1, settings.maxW / video.videoWidth, settings.maxH / video.videoHeight);
      canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(2, Math.round(video.videoHeight * scale));

      let recStream;
      try {
        recStream = canvas.captureStream(30);
      } catch (e) {
        cleanup();
        return reject(e);
      }

      // Capture the audio track straight from the media element so sound is always
      // preserved in the compressed file (avoids silent/suspended AudioContext).
      try {
        const elementStream = video.captureStream
          ? video.captureStream()
          : video.mozCaptureStream ? video.mozCaptureStream() : null;
        if (elementStream) {
          elementStream.getAudioTracks().forEach(t => recStream.addTrack(t));
          elementStream.getVideoTracks().forEach(t => t.stop());
        }
      } catch (e) { /* audio capture may be limited in some browsers */ }

      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      try {
        recorder = new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: settings.vbps, audioBitsPerSecond: settings.abps });
      } catch (e) {
        cleanup();
        return reject(e);
      }
      stream = recStream;

      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime || 'video/webm' });
        cleanup();
        resolve(blob);
      };
      recorder.start(1000);

      const drawLoop = () => {
        if (!running) return;
        if (video.ended) { if (recorder && recorder.state !== 'inactive') recorder.stop(); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (typeof onProgress === 'function' && video.duration) {
          onProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
        }
        requestAnimationFrame(drawLoop);
      };

      video.play().catch(() => {});
      requestAnimationFrame(drawLoop);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read the video file.'));
    };

    video.src = url;
    video.load();
  });
}

// ============================================
// 8. WATCH PAGE
// ============================================
const initWatch = async () => {
  const slot = document.getElementById('player-slot');
  if (!slot) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('player-slot').style.display = 'none';
    document.getElementById('movie-error').style.display = 'block';
    document.getElementById('movie-error-msg').textContent = 'No movie selected.';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/movie/${id}`, { credentials: 'include' });
    if (response.status === 401) { window.location.href = 'login.html'; return; }
    if (response.status === 403 || response.status === 404) {
      document.getElementById('player-slot').style.display = 'none';
      document.getElementById('movie-error').style.display = 'block';
      document.getElementById('movie-error-msg').textContent = 'This movie was not found or you do not have access.';
      return;
    }
    if (!response.ok) throw new Error('Failed to load movie');

    const movie = await response.json();
    document.title = `${movie.title} - MyStore`;

    new CinePlayer(slot, {
      src: movie.streamUrl,
      poster: movie.posterUrl,
      title: movie.title,
      autoplay: false,
      embedUrl: movie.embedUrl,
      embed: false
    });

    // Movie info panel
    const info = document.getElementById('movie-info');
    info.style.display = 'block';
    document.getElementById('m-title').textContent = movie.title;
    document.getElementById('m-year').textContent = movie.year ? movie.year : '—';
    document.getElementById('m-genre').textContent = movie.genre || 'Other';
    document.getElementById('m-views').textContent = `👁 ${movie.views.toLocaleString()} clicks`;
    document.getElementById('m-desc').textContent = movie.description || 'No description provided.';

    // Embed code
    const embedBtn = document.getElementById('embed-btn');
    const embedBox = document.getElementById('embed-box');
    const embedCode = document.getElementById('embed-code');
    const iframeSrc = movie.embedUrl;
    const code = `<iframe src="${iframeSrc}" width="640" height="360" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" style="max-width:100%;border:none;border-radius:12px;"></iframe>`;
    embedCode.value = code;

    if (embedBtn) {
      embedBtn.addEventListener('click', async () => {
        embedCode.select();
        const ok = await copyTextToClipboard(code);
        if (!ok) embedBox.style.display = 'block';
        embedBtn.innerText = ok ? '✅ Copied!' : '❌ Copy failed — select the code above manually';
        setTimeout(() => { embedBtn.innerText = '📋 Copy Embed Code'; }, 2000);
      });
    }
  } catch (error) {
    console.error('Watch init error:', error);
    document.getElementById('player-slot').style.display = 'none';
    document.getElementById('movie-error').style.display = 'block';
    document.getElementById('movie-error-msg').textContent = error.message;
  }
};
if (document.getElementById('player-slot')) initWatch();

// ============================================
// 9. SETTINGS - PROFILE & THEME
// ============================================
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.checked = savedTheme === 'dark';
  themeToggle.addEventListener('change', async () => {
    const isDark = themeToggle.checked;
    const theme = isDark ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', isDark);
    localStorage.setItem('theme', theme);
    try {
      await fetch(`${API_BASE_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ theme })
      });
    } catch (error) { console.error('Theme sync error:', error); }
  });
}

const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
  const loadProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/get-profile`, { credentials: 'include' });
      if (!response.ok) { window.location.href = 'login.html'; return; }
      const data = await response.json();
      if (document.getElementById('settings-name')) document.getElementById('settings-name').value = data.name || '';
      if (document.getElementById('settings-email')) document.getElementById('settings-email').value = data.email || '';
      if (document.getElementById('settings-phone')) document.getElementById('settings-phone').value = data.phone || '';
    } catch (error) { console.error('Load profile error:', error); }
  };
  loadProfile();

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('settings-name').value.trim();
    const phone = document.getElementById('settings-phone').value.trim();
    if (!name) return alert('Name is required');
    const submitBtn = settingsForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, phone })
      });
      const data = await response.json();
      if (response.ok) { localStorage.setItem('userName', name); alert('Profile updated successfully!'); }
      else alert(data.error || 'Update failed');
    } catch (error) { alert('Failed to update profile'); }
    finally { submitBtn.disabled = false; }
  });
}

// ============================================
// 10. SETTINGS - CHANGE PASSWORD
// ============================================
const passwordForm = document.getElementById('password-form');
if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    if (!currentPassword || !newPassword || !confirmPassword) return alert('All password fields are required');
    if (newPassword !== confirmPassword) return alert('New passwords do not match');
    if (newPassword.length < 8) return alert('New password must be at least 8 characters');

    const submitBtn = passwordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await response.json();
      if (response.ok) { alert('Password changed successfully!'); passwordForm.reset(); }
      else alert(data.error || 'Password change failed');
    } catch (error) { alert('Failed to change password'); }
    finally { submitBtn.disabled = false; }
  });
}