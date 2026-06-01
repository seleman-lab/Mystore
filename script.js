// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3000`
  : 'https://mystore-1-tp7b.onrender.com';

console.log('API Base URL:', API_BASE_URL);

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

    // Validation
    if (!name || !email || !phone || !password || !confirmPassword) {
      return alert('❌ All fields are required');
    }

    if (password !== confirmPassword) {
      return alert('❌ Passwords do not match');
    }

    if (password.length < 8) {
      return alert('❌ Password must be at least 8 characters');
    }

    // Get security questions
    const q1 = document.getElementById('security-q1').value;
    const a1 = document.getElementById('security-a1').value.trim();
    const q2 = document.getElementById('security-q2').value;
    const a2 = document.getElementById('security-a2').value.trim();
    const q3 = document.getElementById('security-q3').value;
    const a3 = document.getElementById('security-a3').value.trim();

    if (!q1 || !a1 || !q2 || !a2 || !q3 || !a3) {
      return alert('❌ Please answer all security questions');
    }

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
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          securityQuestions
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Account created successfully! Redirecting to login...');
        window.location.href = 'login.html';
      } else {
        alert(`❌ ${data.error || 'Signup failed'}`);
      }
    } catch (error) {
      console.error('Signup error:', error);
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

    if (!email || !password) {
      return alert('❌ Email and password are required');
    }

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
        alert('✅ Login successful!');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', data.user.name);
        window.location.href = 'dashboard.html';
      } else {
        alert(`❌ ${data.error || 'Login failed'}`);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('❌ Network error. Please check your connection and try again.');
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

    if (!email) {
      return alert('❌ Email is required');
    }

    const submitBtn = emailForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Loading...';
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
        alert('✅ Email verified! Proceeding to security questions...');
        window.location.href = 'answer-questions.html';
      } else {
        alert(`❌ ${data.error || 'Email not found'}`);
      }
    } catch (error) {
      console.error('Email verification error:', error);
      alert('❌ Network error. Please try again.');
    } finally {
      submitBtn.innerText = originalText;
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
          <input 
            type="text" 
            id="answer-${index + 1}" 
            class="security-answer form-control"
            placeholder="Your answer" 
            required
          >
        `;
        qContainer.appendChild(questionDiv);
      });
    } else {
      alert(`❌ ${data.error}`);
      window.location.href = 'forgot.html';
    }
  } catch (error) {
    console.error('Error loading security questions:', error);
    alert('❌ Network error loading questions.');
    window.location.href = 'forgot.html';
  }
};

// ============================================
// 3.2. ANSWER SECURITY QUESTIONS FORM
// ============================================
const answerQuestionsForm = document.getElementById('answer-questions-form');
const submitAnswersBtn = document.getElementById('submit-answers-btn');

if (answerQuestionsForm && submitAnswersBtn) {
  answerQuestionsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = sessionStorage.getItem('resetEmail');
    if (!email) {
      return alert('❌ Session expired. Please start over.');
    }

    const answerInputs = document.querySelectorAll('.security-answer');
    if (answerInputs.length === 0) {
      return alert('❌ Questions not loaded. Please refresh and try again.');
    }

    const answers = Array.from(answerInputs).map(input => input.value.trim());

    if (answers.some(a => !a)) {
      return alert('❌ Please answer all security questions!');
    }

    const originalText = submitAnswersBtn.innerText;
    submitAnswersBtn.innerText = 'Verifying...';
    submitAnswersBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/verify-security-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, answers })
      });

      const data = await response.json();

      if (response.ok) {
        sessionStorage.setItem('resetToken', data.resetToken);
        alert('✅ Security answers verified!\n\nAn OTP has been sent to your email: ' + email);
        window.location.href = 'verify-otp.html';
      } else {
        alert(`❌ ${data.error || 'Incorrect answers. Please try again.'}`);
      }
    } catch (error) {
      console.error('Security questions verification error:', error);
      alert('❌ A network error occurred. Check the console for details.');
    } finally {
      submitAnswersBtn.innerText = originalText;
      submitAnswersBtn.disabled = false;
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

    if (!email) {
      return alert('❌ Session expired. Please start over.');
    }

    if (!otp) {
      return alert('❌ Please enter the OTP code');
    }

    const submitBtn = verifyOtpForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Verifying OTP...';
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
      console.error('OTP verification error:', error);
      alert('❌ A network error occurred. Please try again.');
    } finally {
      submitBtn.innerText = originalText;
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

    if (!resetToken) {
      return alert('❌ Session expired. Please start over.');
    }

    if (!newPassword || !confirmNewPassword) {
      return alert('❌ Please enter both passwords');
    }

    if (newPassword !== confirmNewPassword) {
      return alert('❌ Passwords do not match');
    }

    if (newPassword.length < 8) {
      return alert('❌ Password must be at least 8 characters');
    }

    const submitBtn = resetPasswordForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Resetting Password...';
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
      console.error('Password reset error:', error);
      alert('❌ A network error occurred. Please try again.');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 6. DASHBOARD - CHECK AUTHENTICATION
// ============================================
const checkAuthentication = () => {
  const userEmail = localStorage.getItem('userEmail');
  const dashboardContent = document.getElementById('dashboard-content');
  const loginPrompt = document.getElementById('login-prompt');

  if (!userEmail && dashboardContent) {
    dashboardContent.style.display = 'none';
    loginPrompt.style.display = 'block';
  }
};

if (window.location.pathname.includes('dashboard')) {
  checkAuthentication();
}

// ============================================
// 6.1. FILE UPLOAD HANDLER
// ============================================
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');

if (uploadBtn && fileInput) {
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return alert('File is too large. Maximum size is 50 MB.');
    }

    const formData = new FormData();
    formData.append('file', file);

    uploadBtn.disabled = true;
    uploadBtn.innerText = 'Uploading...';

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        alert('File uploaded successfully!');
        fileInput.value = '';
        loadFiles();
        loadStorageStats();
      } else {
        alert(`Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Make sure the server is running.');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerText = '+ Upload New';
    }
  });
}

// ============================================
// 6.2. LOAD FILES (DASHBOARD)
// ============================================
const loadFiles = async () => {
  const mediaGrid = document.getElementById('media-grid');
  if (!mediaGrid) return;

  try {
    const response = await fetch(`${API_BASE_URL}/files`, {
      credentials: 'include'
    });

    if (!response.ok) return;

    const files = await response.json();

    if (files.length === 0) {
      mediaGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; color: var(--text-secondary);">
          <p style="font-size: 3rem; margin-bottom: 1rem;">📁</p>
          <p>No files yet. Click "Upload New" to get started.</p>
        </div>`;
      return;
    }

    mediaGrid.innerHTML = '';
    files.forEach(file => {
      const isVideo = file.mimeType && file.mimeType.startsWith('video/');
      const ext = file.filename.split('.').pop().toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif'].includes(ext);
      const hasToken = file.embedToken;

      const item = document.createElement('div');
      item.className = 'media-item';

      let preview = '';
      if (isVideo && hasToken) {
        preview = `<video src="${API_BASE_URL}/embed/${file.embedToken}" muted></video>`;
      } else if (isImage && hasToken) {
        preview = `<img src="${API_BASE_URL}/embed/${file.embedToken}" alt="${file.originalName}" loading="lazy">`;
      } else {
        const icon = isVideo ? '🎬' : isImage ? '🖼️' : '📄';
        preview = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:3rem;color:var(--text-secondary);">${icon}</div>`;
      }

      item.innerHTML = `
        ${preview}
        <div class="media-overlay">
          <span style="font-weight:600;font-size:0.9rem;">${file.originalName}</span>
          <div class="media-actions">
            <button class="download-btn" data-filename="${file.filename}">Download</button>
            <button class="delete-btn" data-filename="${file.filename}">Delete</button>
          </div>
        </div>
      `;

      mediaGrid.appendChild(item);
    });

    // Add event listeners for download and delete
    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filename = btn.dataset.filename;
        window.open(`${API_BASE_URL}/download?file=${encodeURIComponent(filename)}`, '_blank');
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this file?')) return;
        const filename = btn.dataset.filename;
        try {
          const res = await fetch(`${API_BASE_URL}/delete-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ filename })
          });
          const data = await res.json();
          if (res.ok) {
            alert('File deleted');
            loadFiles();
            loadStorageStats();
          } else {
            alert(data.error || 'Delete failed');
          }
        } catch (err) {
          alert('Delete failed');
        }
      });
    });
  } catch (error) {
    console.error('Load files error:', error);
  }
};

// Load files on dashboard page
if (document.getElementById('media-grid')) {
  loadFiles();
}

// ============================================
// 6.3. LOAD STORAGE STATS
// ============================================
const loadStorageStats = async () => {
  const storageUsed = document.getElementById('storage-used');
  const storageUsedText = document.getElementById('storage-used-text');
  const storageLimitText = document.getElementById('storage-limit-text');
  const storageRemainingText = document.getElementById('storage-remaining-text');
  if (!storageUsed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/storage-stats`, {
      credentials: 'include'
    });
    if (!response.ok) return;
    const stats = await response.json();

    const usedMB = (stats.used / (1024 * 1024)).toFixed(1);
    const limitMB = (stats.limit / (1024 * 1024)).toFixed(0);
    const remainingMB = (stats.remaining / (1024 * 1024)).toFixed(1);

    storageUsed.style.width = stats.percentage + '%';
    if (storageUsedText) storageUsedText.textContent = usedMB + ' MB';
    if (storageLimitText) storageLimitText.textContent = limitMB + ' MB';
    if (storageRemainingText) storageRemainingText.textContent = remainingMB + ' MB';

    if (stats.percentage > 90) {
      storageUsed.style.background = 'linear-gradient(to right, #ef4444, #dc2626)';
    } else if (stats.percentage > 70) {
      storageUsed.style.background = 'linear-gradient(to right, #f59e0b, #d97706)';
    }
  } catch (error) {
    console.error('Storage stats error:', error);
  }
};

if (document.getElementById('storage-used')) {
  loadStorageStats();
}

// ============================================
// 6.4. THEME LOAD & TOGGLE SYNC
// ============================================
// Apply saved theme on every page
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
  document.body.classList.add('dark-theme');
} else {
  document.body.classList.remove('dark-theme');
}

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
    } catch (error) {
      console.error('Theme sync error:', error);
    }
  });
}

// ============================================
// 6.5. SETTINGS - LOAD PROFILE
// ============================================
const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
  const loadProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/get-profile`, {
        credentials: 'include'
      });
      if (!response.ok) {
        window.location.href = 'login.html';
        return;
      }
      const data = await response.json();

      const nameInput = document.getElementById('settings-name');
      const emailInput = document.getElementById('settings-email');
      const phoneInput = document.getElementById('settings-phone');

      if (nameInput) nameInput.value = data.name || '';
      if (emailInput) emailInput.value = data.email || '';
      if (phoneInput) phoneInput.value = data.phone || '';
    } catch (error) {
      console.error('Load profile error:', error);
    }
  };

  loadProfile();

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('settings-name').value.trim();
    const phone = document.getElementById('settings-phone').value.trim();

    if (!name) return alert('Name is required');

    const submitBtn = settingsForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Saving...';
    submitBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, phone })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('userName', name);
        alert('Profile updated successfully!');
      } else {
        alert(data.error || 'Update failed');
      }
    } catch (error) {
      alert('Failed to update profile');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 6.6. SETTINGS - CHANGE PASSWORD
// ============================================
const passwordForm = document.getElementById('password-form');
if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return alert('All password fields are required');
    }

    if (newPassword !== confirmPassword) {
      return alert('New passwords do not match');
    }

    if (newPassword.length < 8) {
      return alert('New password must be at least 8 characters');
    }

    const submitBtn = passwordForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Changing...';
    submitBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Password changed successfully!');
        passwordForm.reset();
      } else {
        alert(data.error || 'Password change failed');
      }
    } catch (error) {
      alert('Failed to change password');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ============================================
// 7. LOGOUT HANDLER
// ============================================
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      alert('✅ Logged out successfully!');
      window.location.href = 'login.html';
    }
  });
}

// ============================================
// 8. MOBILE MENU TOGGLE
// ============================================
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const navLinks = document.getElementById('nav-links');

if (mobileMenuBtn && navLinks) {
  mobileMenuBtn.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
}
