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

// Load questions on page load
if (document.getElementById('questions-container')) {
  loadSecurityQuestions();
}

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
