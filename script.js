  // 3.1. LOAD SECURITY QUESTIONS
  // Fetch and display security questions from backend
  const loadSecurityQuestions = async () => {
    const qContainer = document.getElementById('questions-container');
    if (!qContainer) return;
    
    const email = sessionStorage.getItem('resetEmail');
    if (!email) {
      alert("Session expired. Please start over.");
      window.location.href = 'forgot.html';
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/get-security-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const questions = data.questions || [];
        qContainer.innerHTML = ''; // Clear container
        
        questions.forEach((question, index) => {
          const questionDiv = document.createElement('div');
          questionDiv.className = 'question-item';
          questionDiv.innerHTML = `
            <label for="answer-${index + 1}"><strong>Q${index + 1}: ${question}</strong></label>
            <input 
              type="text" 
              id="answer-${index + 1}" 
              class="security-answer"
              placeholder="Your answer" 
              required
            >
          `;
          qContainer.appendChild(questionDiv);
        });
      } else {
        alert(`Error: ${data.error}`);
        window.location.href = 'forgot.html';
      }
    } catch (error) {
      console.error("Error loading security questions:", error);
      alert("Network error loading questions.");
      window.location.href = 'forgot.html';
    }
  };
  
  // Load questions on page load
  if (document.getElementById('questions-container')) {
    loadSecurityQuestions();
  }

  // 3.2. ANSWER SECURITY QUESTIONS FORM
  // This form verifies security questions and sends OTP to user's email
  const answerQuestionsForm = document.getElementById('answer-questions-form');
  const submitAnswersBtn = document.getElementById('submit-answers-btn');
  
  if (answerQuestionsForm && submitAnswersBtn) {
    answerQuestionsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = sessionStorage.getItem('resetEmail');
      if (!email) {
        return alert("Session expired. Please start over.");
      }
      
      // Get all answers from form
      const answerInputs = document.querySelectorAll('.security-answer');
      if (answerInputs.length === 0) {
        return alert("Questions not loaded. Please refresh and try again.");
      }
      
      const answers = Array.from(answerInputs).map(input => input.value.trim());
      
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
          alert("✅ Security answers verified!\n\nAn OTP has been sent to your email: " + email + "\n\nPlease check your email for the OTP code.");
          // Redirect to OTP verification page
          window.location.href = 'verify-otp.html';
        } else {
          alert(`❌ ${data.error || 'Incorrect answers. Please try again.'}`);
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
