// --- Helpers ---
const qs = (sel) => document.querySelector(sel);
const showErr = (id, msg) => {
    const el = qs('#err-' + id);
    if (!el) return;
    if (msg) {
        el.textContent = msg; el.classList.remove('hidden');
    } else {
        el.textContent = ''; el.classList.add('hidden');
    }
};

// --- Elements ---
const form = qs('#registerForm');
const firstName = qs('#firstName');
const lastName = qs('#lastName');
const email = qs('#email');
const birthdate = qs('#birthdate');
const idType = qs('#idType');
const idNumber = qs('#idNumber');
const password = qs('#password');
const togglePwd = qs('#togglePwd');
const pwdFill = qs('#pwdFill');
const pwdText = qs('#pwdText');
const successBox = qs('#successBox');
const submitBtn = qs('#submitBtn');
const resetBtn = qs('#resetBtn');

// --- Validation rules ---
function isAdult(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const b = new Date(dateString + 'T00:00:00');
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
    return age >= 18;
}

function validateDUI(id) {
    // Espera formato 8 dígitos - 1 dígito: 12345678-9
    return /^\d{8}-\d$/.test(id);
}

function validatePassport(id) {
    // Acepta letras y números entre 5 y 12 caracteres (ajustable)
    return /^[A-Za-z0-9]{5,12}$/.test(id);
}

function evaluatePassword(pwd) {
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    return score; // 0..4
}

function updatePwdMeter() {
    const score = evaluatePassword(password.value);
    const pct = (score / 4) * 100;
    pwdFill.style.width = pct + '%';
    if (score <= 1) {
        pwdText.textContent = 'Muy débil';
    } else if (score === 2) {
        pwdText.textContent = 'Débil';
    } else if (score === 3) {
        pwdText.textContent = 'Buena';
    } else {
        pwdText.textContent = 'Fuerte';
    }
}

// Toggle password visibility
togglePwd.addEventListener('click', () => {
    if (password.type === 'password') {
        password.type = 'text';
        togglePwd.textContent = 'Ocultar';
    } else {
        password.type = 'password';
        togglePwd.textContent = 'Mostrar';
    }
});

password.addEventListener('input', () => {
    updatePwdMeter();
    showErr('password', '');
    checkFormValidity();
});

// Change placeholder / helper depending on id type
idType.addEventListener('change', () => {
    if (idType.value === 'dui') {
        idNumber.placeholder = '12345678-9';
    } else {
        idNumber.placeholder = 'A1234567';
    }
    showErr('idNumber', '');
    checkFormValidity();
});

// Basic live validation on some fields
firstName.addEventListener('input', () => { showErr('firstName', ''); checkFormValidity(); });
lastName.addEventListener('input', () => { showErr('lastName', ''); checkFormValidity(); });
email.addEventListener('input', () => { showErr('email', ''); checkFormValidity(); });
birthdate.addEventListener('change', () => { showErr('birthdate', ''); checkFormValidity(); });
idNumber.addEventListener('input', () => { showErr('idNumber', ''); checkFormValidity(); });

function checkFormValidity() {
    // Quick enable/disable submit (visual only)
    const allFilled = firstName.value.trim().length >= 2 && lastName.value.trim().length >= 2 && email.value.trim() && birthdate.value && password.value.length >= 8 && idNumber.value.trim();
    submitBtn.disabled = !allFilled;
}

// Actual submit validation
form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    // First name
    if (firstName.value.trim().length < 2) { showErr('firstName', 'Ingresa un nombre válido (mín 2 caracteres).'); ok = false; }
    else showErr('firstName', '');
    // Last name
    if (lastName.value.trim().length < 2) { showErr('lastName', 'Ingresa un apellido válido (mín 2 caracteres).'); ok = false; }
    else showErr('lastName', '');
    // Sexo
    const sexo = form.querySelector('input[name="sexo"]:checked');
    if (!sexo) { showErr('sexo', 'Selecciona tu sexo.'); ok = false; } else showErr('sexo', '');
    // Email
    if (!/^\S+@\S+\.\S+$/.test(email.value)) { showErr('email', 'Correo inválido.'); ok = false; } else showErr('email', '');
    // Birthdate
    if (!isAdult(birthdate.value)) { showErr('birthdate', 'Debes ser mayor de 18 años.'); ok = false; } else showErr('birthdate', '');
    // ID number
    const idVal = idNumber.value.trim();
    if (idType.value === 'dui') {
        if (!validateDUI(idVal)) { showErr('idNumber', 'Formato de DUI inválido. Ej: 12345678-9'); ok = false; } else showErr('idNumber', '');
    } else {
        if (!validatePassport(idVal)) { showErr('idNumber', 'Formato de pasaporte inválido. Use 5-12 letras/números.'); ok = false; } else showErr('idNumber', '');
    }
    // Password
    const pwdScore = evaluatePassword(password.value);
    if (password.value.length < 8 || pwdScore < 2) { showErr('password', 'Contraseña demasiado débil. Usa mayúsculas, números o símbolos.'); ok = false; } else showErr('password', '');

    if (!ok) return;

    // Si pasa validación, simulamos envío.
    successBox.classList.remove('hidden');
    form.reset();
    pwdFill.style.width = '0%';
    pwdText.textContent = 'Muy débil';
    togglePwd.textContent = 'Mostrar';
    submitBtn.disabled = true;

    // Si quisieras enviar al servidor, descomenta y adapta el fetch:
    /*
    const payload = {
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      sexo: form.querySelector('input[name="sexo"]:checked').value,
      email: email.value.trim(),
      birthdate: birthdate.value,
      idType: idType.value,
      idNumber: idNumber.value.trim()
    };
    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(res => res.json()).then(data => { /* manejar respuesta */ /*}).catch(err => console.error(err));
    */
});

resetBtn.addEventListener('click', () => {
    form.reset();
    successBox.classList.add('hidden');
    pwdFill.style.width = '0%';
    pwdText.textContent = 'Muy débil';
    submitBtn.disabled = true;
    document.querySelectorAll('[id^="err-"]').forEach(e => e.classList.add('hidden'));
});

// On load
checkFormValidity();
