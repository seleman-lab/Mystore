
// Get API Base URL - auto-detect environment
const getApiUrl = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  } else if (window.location.hostname.includes('github.io')) {
    return 'https://mystore-1-tp7b.onrender.com';
  }
  return 'https://mystore-1-tp7b.onrender.com'; // Default to Render
};

const API_BASE_URL = getApiUrl();

// Redirect users to the proper Node.js server if they accidentally double-clicked the HTML file
if (window.location.protocol === 'file:') {
  const filename = window.location.pathname.split('/').pop() || 'index.html';
  window.location.href = API_BASE_URL + '/' + filename;
} 

document.addEventListener('DOMContentLoaded', () => {
  // --- Theme Toggling Logic ---
  const themeToggle = document.getElementById('theme-toggle');

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
      if (themeToggle) themeToggle.checked = true;
    } else {
      document.body.classList.remove('dark-theme');
      if (themeToggle) themeToggle.checked = false;
    }
    // Fallback for immediate load on other pages
    localStorage.setItem('theme', theme);
  };

  // 1. Initial Load: Apply from localStorage immediately
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);

  // 2. Fetch authenticated user's settings from the backend
  const loadSettings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        applyTheme(data.theme);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };
  
  // Call immediately on page load to ensure sync
  loadSettings();

  // 3. Handle toggle switch change on settings page
  if (themeToggle) {
    themeToggle.addEventListener('change', async (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      applyTheme(newTheme);

      try {
        await fetch(`${API_BASE_URL}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ theme: newTheme })
        });
      } catch (err) {
        console.error('Error saving settings to backend:', err);
      }
    });
  }

  // --- Mobile Menu Logic ---
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const navLinks = document.getElementById('nav-links');

  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
  }

  // --- File Upload & Dashboard Logic ---
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('file-input');
  const mediaGrid = document.getElementById('media-grid');

  // Fetch and display user files on dashboard load
  const loadFiles = async () => {
    if (!mediaGrid) return; // Only run on dashboard
    
    try {
      const response = await fetch(`${API_BASE_URL}/files`, {
        credentials: 'include'
      });
      if (response.ok) {
        const files = await response.json();
        mediaGrid.innerHTML = ''; // Clear existing items
        
        files.forEach(file => {
          const item = document.createElement('div');
          item.className = 'media-item';
          
          let mediaElement = '';
          if (file.mimeType && file.mimeType.startsWith('video/')) {
            mediaElement = `<video src="${API_BASE_URL}/uploads/${file.filename}" controls></video>`;
          } else {
            mediaElement = `<img src="${API_BASE_URL}/uploads/${file.filename}" alt="${file.originalName}">`;
          }
          
          item.innerHTML = `
            ${mediaElement}
            <div class="media-overlay">
              <span>${file.originalName}</span>
              <div class="media-actions">
                <button class="download-btn" data-file="${file.filename}" data-name="${file.originalName}">Download</button>

                <button class="delete-btn" data-file="${file.filename}" data-name="${file.originalName}">Delete</button>
              </div>
            </div>
          `;
          mediaGrid.appendChild(item);
        });
      } else if (response.status === 401) {
        alert("Please log in to view your files.");
        window.location.href = 'login.html';
      }
    } catch (err) {
      console.error("Error loading files:", err);
    }
  };

  // Load and display storage stats on dashboard load
  const loadStorageStats = async () => {
    const storageUsedBar = document.getElementById('storage-used');
    if (!storageUsedBar) return; // Only run on dashboard
    
    try {
      const response = await fetch(`${API_BASE_URL}/storage-stats`, {
        credentials: 'include'
      });
      if (response.ok) {
        const stats = await response.json();
        
        // Helper function to format bytes to MB
        const formatBytes = (bytes) => {
          return (bytes / (1024 * 1024)).toFixed(2);
        };
        
        const usedMB = formatBytes(stats.used);
        const limitMB = formatBytes(stats.limit);
        const remainingMB = formatBytes(stats.remaining);
        
        // Update progress bar
        storageUsedBar.style.width = stats.percentage + '%';
        
        // Update text displays
        document.getElementById('storage-used-text').textContent = usedMB + ' MB';
        document.getElementById('storage-limit-text').textContent = limitMB + ' MB';
        document.getElementById('storage-remaining-text').textContent = remainingMB + ' MB';
        
        console.log(`Storage: ${usedMB}MB used of ${limitMB}MB`);
      } else if (response.status === 401) {
        console.log("Please log in to view storage stats.");
      }
    } catch (err) {
      console.error("Error loading storage stats:", err);
    }
  };
  
  if (mediaGrid) {
    loadFiles(); // Call immediately on dashboard
    loadStorageStats(); // Load storage stats
    
    // Attach event listener once to handle all download and delete buttons securely
    mediaGrid.addEventListener('click', async (e) => {
      if (e.target.classList.contains('download-btn')) {
        const btn = e.target;
        const filename = btn.getAttribute('data-file');
        const originalName = btn.getAttribute('data-name');
        
        // Show loading state
        const originalText = btn.innerText;
        btn.innerText = 'Downloading...';
        btn.disabled = true;
        
        try {
          const response = await fetch(`${API_BASE_URL}/download?file=${encodeURIComponent(filename)}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            // Convert binary response to a Blob
            const blob = await response.blob();
            // Create a temporary object URL to trigger the browser download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = originalName;
            document.body.appendChild(a);
            a.click();
            // Clean up
            window.URL.revokeObjectURL(url);
            a.remove();
          } else {
            const data = await response.json();
            alert(`Download failed: ${data.error}`);
          }
        } catch (err) {
          console.error("Download error:", err);
          alert("Network error during download.");
        } finally {
          // Restore button state
          btn.innerText = originalText;
          btn.disabled = false;
        }
      } else if (e.target.classList.contains('delete-btn')) {
        const btn = e.target;
        const filename = btn.getAttribute('data-file');
        const originalName = btn.getAttribute('data-name');
        
        // Confirm deletion
        if (!confirm(`Are you sure you want to delete "${originalName}"?`)) {
          return;
        }
        
        // Show loading state
        const originalText = btn.innerText;
        btn.innerText = 'Deleting...';
        btn.disabled = true;
        
        try {
          const response = await fetch(`${API_BASE_URL}/delete-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ filename: filename })
          });
          
          const data = await response.json();
          
          if (response.ok) {
            alert('File deleted successfully!');
            loadFiles(); // Refresh the grid
            loadStorageStats(); // Refresh storage stats
          } else {
            alert(`Delete failed: ${data.error}`);
          }
        } catch (err) {
          console.error("Delete error:", err);
          alert("Network error during delete.");
        } finally {
          // Restore button state
          btn.innerText = originalText;
          btn.disabled = false;
        }
      } else if (e.target.classList.contains('embed-btn')) {
        const btn = e.target;
        const filename = btn.getAttribute('data-file');
        const originalName = btn.getAttribute('data-name') || 'File';
        
        btn.disabled = true;
        try {
          // Generate embed link
          const response = await fetch(`${API_BASE_URL}/generate-embed-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ filename: filename })
          });
          
          if (response.ok) {
            const data = await response.json();
            const embedUrl = data.embedUrl;
            // Create embed code based on file type
            let embedCode = '';
            const isVideo = (/\.(mp4|webm|ogg|mov|avi)$/i).test(originalName);
            
            if (isVideo) {
              embedCode = `<video width="560" height="315" controls>\n  <source src="${embedUrl}">\n  Your browser does not support the video tag.\n</video>`;
            } else {
              embedCode = `<img src="${embedUrl}" alt="${originalName}" style="max-width: 100%;">`;
            }
            
            // Copy to clipboard
            navigator.clipboard.writeText(embedCode).then(() => {
              alert(`Embed code copied to clipboard!\n\nEmbed Code:\n${embedCode}`);
            }).catch(() => {
              alert(`Embed Code:\n${embedCode}\n\nCopy this code to embed in your website.`);
            });
          } else {
            const errorData = await response.json().catch(() => ({ error: `Server returned HTTP ${response.status} (${response.statusText}) for ${pathName || 'this route'}` }));
            alert(`Embed generation failed: ${errorData.error || response.statusText}`);
          }
        } catch (err) {
          console.error("Embed error:", err);
          alert("Network error generating embed link.");
        } finally {
          btn.disabled = false;
        }
      } else if (e.target.classList.contains('share-btn')) {
        const btn = e.target;
        const filename = btn.getAttribute('data-file');
        const originalName = btn.getAttribute('data-name');
        
        try {
          // Generate share link
          const response = await fetch(`${API_BASE_URL}/generate-share-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ filename: filename })
          });
          
          const data = await response.json();
          
          if (response.ok) {
            const shareUrl = data.shareUrl;
            
            // Copy to clipboard
            navigator.clipboard.writeText(shareUrl).then(() => {
              alert(`Share link copied to clipboard!\n\nShare URL:\n${shareUrl}`);
            }).catch(() => {
              alert(`Share URL:\n${shareUrl}\n\nShare this link with others!`);
            });
          } else {
            alert(`Share link generation failed: ${data.error}`);
          }
        } catch (err) {
          console.error("Share error:", err);
          alert("Network error generating share link.");
        }
      }
    });
  }

  // Trigger hidden file input
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // Handle file selection and FormData upload
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);
      
      // Basic loading state
      const originalText = uploadBtn.innerText;
      uploadBtn.innerText = 'Uploading...';
      uploadBtn.disabled = true;

      try {
        const response = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          credentials: 'include',
          body: formData // Note: Do NOT set Content-Type header. fetch automatically sets it with the boundary!
        });

        const data = await response.json();

        if (response.ok) {
          alert('File uploaded successfully!');
          loadFiles(); // Refresh the grid
          loadStorageStats(); // Refresh storage stats
        } else {
          alert(`Upload failed: ${data.error}`);
        }
      } catch (err) {
        console.error("Upload error:", err);
        alert('Network error during upload.');
      } finally {
        // Reset button state
        uploadBtn.innerText = originalText;
        uploadBtn.disabled = false;
        fileInput.value = ''; // Clear input
      }
    });
  }

  // --- Auth & Fetch API Logic ---
  
  // 1. Signup Form Submission
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // Prevent default browser form submission
      
      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      
      if (password !== confirmPassword) {
        return alert("Passwords do not match!");
      }
      
      // Get security questions and answers
      const securityQuestions = [
        {
          question: document.getElementById('security-q1').value,
          answer: document.getElementById('security-a1').value
        },
        {
          question: document.getElementById('security-q2').value,
          answer: document.getElementById('security-a2').value
        },
        {
          question: document.getElementById('security-q3').value,
          answer: document.getElementById('security-a3').value
        }
      ];
      
      // Validate security questions
      if (securityQuestions.some(q => !q.question || !q.answer)) {
        return alert("Please answer all security questions!");
      }
      
      if (securityQuestions[0].question === securityQuestions[1].question || 
          securityQuestions[1].question === securityQuestions[2].question ||
          securityQuestions[0].question === securityQuestions[2].question) {
        return alert("Please select different security questions!");
      }
      
      try {
        // Use Fetch API to send data to the backend
        const response = await fetch(`${API_BASE_URL}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, email, phone, password, securityQuestions })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          alert("Signup successful! You can now log in.");
          window.location.href = 'login.html'; // Redirect to login
        } else {
          alert(`Error: ${data.error}`);
        }
      } catch (error) {
        console.error("Signup error:", error);
        alert("A network error occurred. Check the console for details.");
      }
    });
  }

  // 2. Login Form Submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // Prevent default browser form submission
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      try {
        const response = await fetch(`${API_BASE_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          // Success: Store user data in localStorage
          // The backend sends a Set-Cookie header for the session ID automatically.
          localStorage.setItem('user', JSON.stringify(data.user));
          applyTheme(data.user.theme); // Apply theme immediately on login
          alert("Login successful!");
          window.location.href = 'dashboard.html'; // Redirect to dashboard
        } else {
          alert(`Error: ${data.error}`);
        }
      } catch (error) {
        console.error("Login error:", error);
        alert("A network error occurred. Check the console for details.");
      }
    });
  }

  // 3. Forgot Password Form - Multi-step process
  const emailForm = document.getElementById('email-form');
  
  // Step 1: Email submission (on forgot.html)
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userEmail = document.getElementById('email').value.trim();
      
      try {
        // Verify email exists in the system
        const response = await fetch(`${API_BASE_URL}/get-security-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail })
        });
        
        if (response.ok) {
          // Email found, store it and redirect to answer-questions page
          sessionStorage.setItem('resetEmail', userEmail);
          window.location.href = `answer-questions.html?email=${encodeURIComponent(userEmail)}`;
        } else {
          const data = await response.json();
          alert(`Error: ${data.error}`);
        }
      } catch (error) {
        console.error("Error verifying email:", error);
        alert("A network error occurred. Check the console for details.");
      }
    });
  }

  // 3.2. ANSWER SECURITY QUESTIONS FORM
  // This form verifies security questions and sends OTP to admin email
  const answerQuestionsForm = document.getElementById('answer-questions-form');
  const submitAnswersBtn = document.getElementById('submit-answers-btn');
  
  if (answerQuestionsForm && submitAnswersBtn) {
    answerQuestionsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = sessionStorage.getItem('resetEmail');
      if (!email) {
        return alert("Session expired. Please start over.");
      }
      
      // Get answers from form
      const answers = [
        document.getElementById('answer-1').value.trim(),
        document.getElementById('answer-2').value.trim(),
        document.getElementById('answer-3').value.trim()
      ];
      
      if (answers.some(a => !a)) {
        return alert("Please answer all security questions!");
      }
      
      const originalText = submitAnswersBtn.innerText;
      submitAnswersBtn.innerText = 'Verifying...';
      submitAnswersBtn.disabled = true;
      
      try {
        // Verify security questions with backend
        const response = await fetch(`${API_BASE_URL}/verify-security-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, answers })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          alert("✅ Security answers verified!\n\nAn OTP has been sent to the admin email.\nYou will receive it shortly.\n\nPlease wait for the admin to send you the OTP code.");
          // Redirect to OTP verification page
          window.location.href = 'verify-otp.html';
        } else {
          alert(`❌ ${data.error || 'Incorrect answers'}`);
        }
      } catch (error) {
        console.error("Security questions verification error:", error);
        alert("A network error occurred. Check the console for details.");
      } finally {
        submitAnswersBtn.innerText = originalText;
        submitAnswersBtn.disabled = false;
      }
    });
  }

  // 3.5. Verify OTP Form
  const verifyOTPForm = document.getElementById('verify-otp-form');
  const verifyBtn = document.getElementById('verify-btn');
  if (verifyOTPForm && verifyBtn) {
    // Pre-fill email from sessionStorage if available
    const emailInput = document.getElementById('email');
    const storedEmail = sessionStorage.getItem('resetEmail');
    if (storedEmail) {
      emailInput.value = storedEmail;
    }

    verifyOTPForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const otp = document.getElementById('otp').value;
      const originalText = verifyBtn.innerText;
      verifyBtn.innerText = 'Verifying...';
      verifyBtn.disabled = true;
      
      try {
        const response = await fetch(`${API_BASE_URL}/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          // Store the resetToken in sessionStorage
          sessionStorage.setItem('resetToken', data.resetToken);
          alert(data.message);
          window.location.href = 'reset.html';
        } else {
          alert(`Error: ${data.error}`);
        }
      } catch (error) {
        console.error("OTP verification error:", error);
        alert("A network error occurred. Check the console for details.");
      } finally {
        verifyBtn.innerText = originalText;
        verifyBtn.disabled = false;
      }
    });
  }

  // 4. Reset Password Form (OTP-based)
  const resetForm = document.getElementById('reset-form');
  const resetBtn = document.getElementById('reset-btn');
  if (resetForm && resetBtn) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const resetToken = sessionStorage.getItem('resetToken');
      
      if (!resetToken) {
        return alert("Invalid session. Please start the password reset process again.");
      }
      
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      
      if (password !== confirmPassword) {
        return alert("Passwords do not match!");
      }
      
      const originalText = resetBtn.innerText;
      resetBtn.innerText = 'Resetting...';
      resetBtn.disabled = true;
      
      try {
        const response = await fetch(`${API_BASE_URL}/reset-password-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetToken, newPassword: password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          alert(data.message);
          // Clear session storage
          sessionStorage.removeItem('resetToken');
          sessionStorage.removeItem('resetEmail');
          window.location.href = 'login.html';
        } else {
          alert(`Error: ${data.error}`);
        }
      } catch (error) {
        console.error("Reset password error:", error);
        alert("A network error occurred. Check the console for details.");
      } finally {
        resetBtn.innerText = originalText;
        resetBtn.disabled = false;
      }
    });
  }
});
