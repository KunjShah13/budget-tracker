document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorDiv = document.getElementById('login-error');
  const passwordInput = document.getElementById('password-input');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const password = passwordInput.value;
      if (password.length < 10) {
        errorDiv.textContent = 'Password must be at least 10 characters';
        errorDiv.style.display = 'block';
        return;
      }
      
      try {
        const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
          window.location.href = '/budget/';
        } else {
          errorDiv.textContent = data.error || 'Login failed';
          errorDiv.style.display = 'block';
        }
      } catch (err) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
      }
    });
  }
});

// Utility to handle API calls with auth check
async function apiCall(method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, options);
  
  if (response.status === 401) {
    window.location.href = '/budget/login';
    throw new Error('Unauthorized');
  }
  
  // if response is CSV (download)
  if (response.headers.get('content-type')?.includes('text/csv')) {
    return response;
  }
  
  return response.json();
}
