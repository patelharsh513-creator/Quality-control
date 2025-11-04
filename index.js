import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyA3O6Dw0Hj06BH_DUupZvUrufi1jjbDi0g",
    authDomain: "quality-control-24.firebaseapp.com",
    databaseURL: "https://quality-control-24-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "quality-control-24",
    storageBucket: "quality-control-24.firebasestorage.app",
    messagingSenderId: "708146875113",
    appId: "1:708146875113:web:a318755bce78ef99ffbe78"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// --- Application State ---
let state = {
    menu: null,
    checkedData: {},
    selectedDate: new Date().toISOString().split('T')[0],
    selectedDish: null,
    isMenuLoading: true,
    isCheckDataLoading: true,
};

// --- DOM Element References ---
const DOMElements = {
    loadingIndicator: document.getElementById('loading-indicator'),
    mainView: document.getElementById('main-view'),
    dishDetailView: document.getElementById('dish-detail-view'),
    dishGridContainer: document.getElementById('dish-grid-container'),
    dishCardContainer: document.getElementById('dish-card-container'),
    dateSelectorContainer: document.getElementById('date-selector-container'),
    dateButtonsContainer: document.getElementById('date-buttons-container'),
    prevWeekBtn: document.getElementById('prev-week-btn'),
    nextWeekBtn: document.getElementById('next-week-btn'),
    welcomePlaceholder: document.getElementById('welcome-placeholder'),
    backToMenuBtn: document.getElementById('back-to-menu-btn'),
    // Header
    settingsBtn: document.getElementById('settings-btn'),
    exportDetailsBtn: document.getElementById('export-details-btn'),
    exportSummaryBtn: document.getElementById('export-summary-btn'),
    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    settingsCancelBtn: document.getElementById('settings-cancel-btn'),
    settingsSaveBtn: document.getElementById('settings-save-btn'),
    apiKeyInput: document.getElementById('api-key-input'),
    jsonInput: document.getElementById('json-input'),
    settingsError: document.getElementById('settings-error'),
    // Input Accessory Bar
    inputAccessoryBar: document.getElementById('input-accessory-bar'),
    inputPrevBtn: document.getElementById('input-prev-btn'),
    inputNextBtn: document.getElementById('input-next-btn'),
    inputDoneBtn: document.getElementById('input-done-btn'),
};

// --- Utility Functions ---
const getWeekId = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
};

const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
};

const getWeekDates = (anyDateInWeek) => {
    const start = getStartOfWeek(new Date(anyDateInWeek + 'T12:00:00Z'));
    return Array.from({ length: 5 }).map((_, i) => {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        return day.toISOString().split('T')[0];
    });
};

async function urlToBase64(url) {
    // Use a CORS proxy to bypass browser cross-origin restrictions on fetching images.
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}


// --- Rendering Functions ---

function renderApp() {
    DOMElements.loadingIndicator.classList.toggle('hidden', !state.isMenuLoading && !state.isCheckDataLoading);
    DOMElements.mainView.classList.toggle('hidden', state.isMenuLoading || state.isCheckDataLoading);

    if (state.menu && state.menu.dishes.length > 0) {
        DOMElements.welcomePlaceholder.classList.add('hidden');
        DOMElements.dishGridContainer.classList.remove('hidden');
        renderDishSelectionGrid();
    } else {
        renderWelcomePlaceholder();
    }
    
    renderDateSelector();

    // Toggle export button disabled state
    const isExportDisabled = !state.menu || state.menu.dishes.length === 0;
    DOMElements.exportDetailsBtn.disabled = isExportDisabled;
    DOMElements.exportSummaryBtn.disabled = isExportDisabled;
    DOMElements.exportDetailsBtn.classList.toggle('opacity-50', isExportDisabled);
    DOMElements.exportSummaryBtn.classList.toggle('opacity-50', isExportDisabled);
}

function renderDateSelector() {
    const viewDate = getStartOfWeek(new Date(state.selectedDate + 'T12:00:00Z'));
    const weekDays = Array.from({ length: 5 }).map((_, i) => {
        const day = new Date(viewDate);
        day.setDate(viewDate.getDate() + i);
        return day;
    });

    DOMElements.dateButtonsContainer.innerHTML = '';
    weekDays.forEach(day => {
        const dayString = day.toISOString().split('T')[0];
        const isSelected = dayString === state.selectedDate;
        const button = document.createElement('button');
        button.className = `flex flex-col items-center justify-center w-12 h-16 sm:w-16 sm:h-20 rounded-lg transition-all duration-200 transform hover:scale-105 ${isSelected ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'bg-gray-700 text-gray-300 hover:bg-indigo-900/50'}`;
        button.innerHTML = `
            <span class="text-xs uppercase font-bold">${day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span class="text-xl sm:text-2xl font-black">${day.getDate()}</span>
        `;
        button.onclick = () => {
            state.selectedDate = dayString;
            fetchCheckData();
            renderDateSelector(); // Re-render to update selection
        };
        DOMElements.dateButtonsContainer.appendChild(button);
    });
}

function renderDishSelectionGrid() {
    const sortedMenu = [...state.menu.dishes].sort((a, b) => a.dishLetter.localeCompare(b.dishLetter));
    DOMElements.dishGridContainer.innerHTML = '';
    sortedMenu.forEach(dish => {
        const isChecked = !!state.checkedData[dish.dishLetter];
        const theme = dish.dishType === 'hot' ? 'hot' : dish.dishType === 'cold' ? 'cold' : 'default';

        const themes = {
          hot: { cardBg: 'bg-gray-800', cardBorder: 'border-red-900', cardHover: 'hover:border-red-700', circleBg: 'bg-red-900', letterText: 'text-red-300', nameText: 'text-gray-300' },
          cold: { cardBg: 'bg-gray-800', cardBorder: 'border-blue-900', cardHover: 'hover:border-blue-700', circleBg: 'bg-blue-900', letterText: 'text-blue-300', nameText: 'text-gray-300' },
          default: { cardBg: 'bg-gray-800', cardBorder: 'border-gray-700', cardHover: 'hover:border-indigo-500', circleBg: 'bg-gray-700', letterText: 'text-indigo-400', nameText: 'text-gray-200' }
        };

        const currentTheme = themes[theme];
        const button = document.createElement('button');
        button.className = `relative group text-center p-4 border rounded-lg shadow-md hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200 transform hover:-translate-y-1 ${currentTheme.cardBg} ${currentTheme.cardBorder} ${currentTheme.cardHover}`;
        button.onclick = () => {
            state.selectedDish = dish;
            showDishDetailView();
        };

        let checkmarkHTML = '';
        if (isChecked) {
            checkmarkHTML = `<div class="absolute top-2 right-2 text-green-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>`;
        }

        button.innerHTML = `
            ${checkmarkHTML}
            <div class="mx-auto mb-3 h-24 w-24 rounded-full flex items-center justify-center text-3xl font-black overflow-hidden ${currentTheme.circleBg} ${currentTheme.letterText}">
                ${dish.dishLetter}
            </div>
            <p class="font-semibold text-sm truncate ${currentTheme.nameText}">${dish.dishName}</p>
        `;
        DOMElements.dishGridContainer.appendChild(button);
    });
}

function renderDishCard() {
    const dish = state.selectedDish;
    if (!dish) return;

    const savedData = state.checkedData[dish.dishLetter];
    const isEditing = !savedData;

    const formData = savedData || {
        capturedImage: null,
        selectedIngredients: [],
        temperatures: ['', '', ''],
        weights: ['', '', ''],
        totalWeight: '',
        comment: '',
        aiCheckResult: null,
        timestamp: null,
    };

    const headerBgClass = dish.dishType === 'hot' ? 'bg-red-900/50' : dish.dishType === 'cold' ? 'bg-blue-900/50' : 'bg-gray-900/50';
    
    let timestampHTML = '';
    if (formData.timestamp) {
        const checkedTime = new Date(formData.timestamp).toLocaleString();
        timestampHTML = `<p class="text-xs text-gray-400 mt-1">Last checked: ${checkedTime}</p>`;
    }

    let ingredientsHTML = dish.dishIngredients.map(ing => `
        <label class="flex items-center space-x-2 text-sm p-2 rounded-md bg-gray-700 text-gray-200">
            <input type="checkbox" name="selectedIngredients" value="${ing.name}" class="h-4 w-4 text-indigo-500 bg-gray-600 border-gray-500 rounded focus:ring-indigo-400 focus:ring-offset-gray-800" ${(formData.selectedIngredients || []).includes(ing.name) ? 'checked' : ''}>
            <span class="ml-2">${ing.name} (${ing.weight})</span>
        </label>
    `).join('');

    DOMElements.dishCardContainer.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div class="p-4 ${headerBgClass}">
                <h3 class="text-lg font-bold text-indigo-400">${dish.dishLetter} - ${dish.dishName}</h3>
                ${timestampHTML}
            </div>
            <form id="dish-form" class="p-4 space-y-6">
                <!-- Image Section -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div class="text-center">
                        <p class="font-semibold mb-2 text-gray-200">Reference Image</p>
                        <img src="${dish.dishImage}" alt="${dish.dishName}" class="w-full aspect-square object-cover rounded-md shadow-md"/>
                    </div>
                    <div class="text-center">
                        <p class="font-semibold mb-2 text-gray-200">Captured Image</p>
                        <div id="camera-container"></div>
                    </div>
                </div>
                 <!-- AI Analysis Section -->
                <div id="ai-feedback-container" class="hidden"></div>
                <!-- Ingredients Section -->
                <div>
                    <h4 class="font-semibold text-gray-200 mb-2">Ingredients</h4>
                    <div class="grid grid-cols-2 gap-2">${ingredientsHTML}</div>
                </div>
                <!-- Measurements Section -->
                <div>
                    <h4 class="font-semibold text-gray-200 mb-2">Measurements</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <p class="text-sm font-medium text-gray-200">Temperature (°C)</p>
                            ${(formData.temperatures || ['', '', '']).map((t, i) => `<input type="text" inputmode="decimal" data-form-input name="temperatures" value="${t}" placeholder="Temp ${i + 1}" class="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm text-gray-100">`).join('')}
                        </div>
                        <div class="space-y-2">
                            <p class="text-sm font-medium text-gray-200">Weight (g)</p>
                            ${(formData.weights || ['', '', '']).map((w, i) => `<input type="text" inputmode="decimal" data-form-input name="weights" value="${w}" placeholder="Weight ${i + 1}" class="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm text-gray-100">`).join('')}
                        </div>
                    </div>
                     <div class="mt-4">
                        <p class="text-sm font-medium text-gray-200">Total Measured Weight (g)</p>
                        <p class="text-xs text-gray-400 mb-1">Theoretical: ${dish.theoreticalWeight ? dish.theoreticalWeight.toFixed(2) + 'g' : 'N/A'}</p>
                        <input type="text" inputmode="decimal" data-form-input name="totalWeight" value="${formData.totalWeight || ''}" placeholder="Measured Total Weight" class="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm text-gray-100">
                    </div>
                </div>
                <!-- Comment Section -->
                <div>
                    <label class="font-semibold text-gray-200 mb-2 block">Comment</label>
                    <textarea name="comment" rows="3" data-form-input class="mt-1 block w-full p-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm text-gray-100">${formData.comment || ''}</textarea>
                </div>
                <!-- Buttons -->
                <div class="p-4 bg-gray-900/50 flex justify-end space-x-2">
                    <button type="button" id="ai-check-btn" class="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a.75.75 0 01.75.75V5h1.5a.75.75 0 010 1.5H10.75v1.5a.75.75 0 01-1.5 0V6.5H7.75a.75.75 0 010-1.5H9.25V2.75A.75.75 0 0110 2zM5.05 5.05A.75.75 0 015.757 4.343l1.061 1.061a.75.75 0 11-1.061 1.06L4.343 5.757a.75.75 0 01.707-1.207zM14.95 14.95a.75.75 0 01-1.06 0L12.12 13.12a.75.75 0 111.06-1.06l1.768 1.768a.75.75 0 010 1.06zM2 10a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 012 10zm14 0a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75zM5.05 14.95a.75.75 0 01.707.05L7.525 13.232a.75.75 0 111.06-1.06l-1.768-1.768a.75.75 0 01-1.207.707l-1.414 1.414a.75.75 0 01.05.707zM14.95 5.05a.75.75 0 010 1.06L13.182 7.879a.75.75 0 11-1.06-1.06l1.768-1.768a.75.75 0 011.06 0z" clip-rule="evenodd" /></svg>
                        AI Check
                    </button>
                    <button type="button" id="edit-btn" class="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700">Edit</button>
                    <button type="submit" id="submit-btn" class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Submit</button>
                </div>
            </form>
        </div>
    `;

    renderCameraCapture(formData.capturedImage);
    const form = DOMElements.dishCardContainer.querySelector('#dish-form');
    const editBtn = DOMElements.dishCardContainer.querySelector('#edit-btn');
    const submitBtn = DOMElements.dishCardContainer.querySelector('#submit-btn');
    const aiCheckBtn = DOMElements.dishCardContainer.querySelector('#ai-check-btn');
    const inputs = form.querySelectorAll('input, textarea');

    const setFormDisabled = (disabled) => {
        inputs.forEach(el => el.disabled = disabled);
        editBtn.classList.toggle('hidden', !disabled);
        submitBtn.classList.toggle('hidden', disabled);
        // AI button is disabled if form is disabled OR if there is no captured image.
        aiCheckBtn.disabled = disabled || !form.dataset.capturedImage;
    };

    editBtn.onclick = () => setFormDisabled(false);
    aiCheckBtn.onclick = () => handleAiCheck(dish, form.dataset.capturedImage, aiCheckBtn);

    form.onsubmit = (e) => {
        e.preventDefault();
        const formEl = e.target;
        const data = new FormData(formEl);
        
        const checkData = {
            dishLetter: dish.dishLetter,
            date: state.selectedDate,
            capturedImage: formEl.dataset.capturedImage || null,
            selectedIngredients: data.getAll('selectedIngredients'),
            temperatures: data.getAll('temperatures'),
            weights: data.getAll('weights'),
            totalWeight: data.get('totalWeight'),
            comment: data.get('comment'),
            aiCheckResult: formEl.dataset.aiFeedback ? JSON.parse(formEl.dataset.aiFeedback) : null,
            timestamp: new Date().toISOString(),
        };
        
        saveCheckData(checkData);
        showMainView();
    };

    setFormDisabled(!isEditing);

    if (formData.aiCheckResult) {
        renderAiFeedback(formData.aiCheckResult);
        document.getElementById('ai-feedback-container').classList.remove('hidden');
        form.dataset.aiFeedback = JSON.stringify(formData.aiCheckResult);
    }
}


function renderCameraCapture(initialImage) {
    const container = document.getElementById('camera-container');
    container.innerHTML = `
        <div id="camera-placeholder" class="w-full aspect-square rounded-md shadow-md bg-gray-700 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-600 cursor-pointer hover:bg-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <span class="mt-2 text-sm font-medium">Click to capture image</span>
        </div>
        <div id="camera-view" class="w-full aspect-square rounded-md shadow-md bg-black flex flex-col items-center justify-center hidden relative">
            <video id="camera-video" autoplay playsinline class="w-full h-full object-cover rounded-md"></video>
            <button type="button" id="capture-btn" class="w-full bg-indigo-600 text-white py-2 absolute bottom-0 left-0 bg-opacity-70 hover:bg-opacity-100 flex items-center justify-center gap-2">Capture</button>
        </div>
        <div id="image-preview" class="w-full aspect-square rounded-md shadow-md relative group hidden">
            <img id="preview-img" class="w-full h-full object-cover rounded-md" />
            <button type="button" id="retake-btn" class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">Retake</button>
        </div>
    `;

    const placeholder = container.querySelector('#camera-placeholder');
    const cameraView = container.querySelector('#camera-view');
    const videoEl = container.querySelector('#camera-video');
    const captureBtn = container.querySelector('#capture-btn');
    const imagePreview = container.querySelector('#image-preview');
    const previewImg = container.querySelector('#preview-img');
    const retakeBtn = container.querySelector('#retake-btn');
    const form = DOMElements.dishCardContainer.querySelector('#dish-form');
    const aiCheckBtn = DOMElements.dishCardContainer.querySelector('#ai-check-btn');

    let stream = null;
    
    const startCamera = async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            videoEl.srcObject = stream;
            placeholder.classList.add('hidden');
            imagePreview.classList.add('hidden');
            cameraView.classList.remove('hidden');
        } catch (e) {
            console.error("Camera error:", e);
            placeholder.querySelector('span').textContent = "Camera access denied.";
        }
    };
    
    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        cameraView.classList.add('hidden');
    };

    placeholder.onclick = () => {
        if (!form.querySelector('input').disabled) startCamera();
    };

    captureBtn.onclick = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        canvas.getContext('2d').drawImage(videoEl, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        previewImg.src = dataUrl;
        form.dataset.capturedImage = dataUrl;
        stopCamera();
        imagePreview.classList.remove('hidden');
        aiCheckBtn.disabled = false;
    };

    retakeBtn.onclick = () => {
        if (!form.querySelector('input').disabled) {
            previewImg.src = '';
            form.dataset.capturedImage = '';
            form.dataset.aiFeedback = ''; // Clear stored AI feedback
            aiCheckBtn.disabled = true;
            const feedbackContainer = document.getElementById('ai-feedback-container');
            feedbackContainer.classList.add('hidden');
            feedbackContainer.innerHTML = ''; // Clear content
            startCamera();
        }
    };

    if (initialImage) {
        previewImg.src = initialImage;
        form.dataset.capturedImage = initialImage;
        placeholder.classList.add('hidden');
        imagePreview.classList.remove('hidden');
    }
}

function renderWelcomePlaceholder() {
    DOMElements.dishGridContainer.classList.add('hidden');
    const weekId = getWeekId(new Date(state.selectedDate + 'T12:00:00Z'));
    DOMElements.welcomePlaceholder.innerHTML = `
        <div class="text-center flex flex-col items-center justify-center h-[calc(100vh-250px)]">
            <div class="max-w-2xl">
                <svg class="mx-auto h-24 w-24 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <h2 class="mt-6 text-2xl font-bold text-white">No Menu Found for This Week</h2>
                <p class="mt-2 text-base text-gray-400">Please go to settings to upload the menu for the week of ${weekId}.</p>
                <div class="mt-6">
                    <button id="welcome-settings-btn" type="button" class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Go to Settings</button>
                </div>
            </div>
        </div>
    `;
    DOMElements.welcomePlaceholder.classList.remove('hidden');
    DOMElements.welcomePlaceholder.querySelector('#welcome-settings-btn').onclick = () => DOMElements.settingsModal.classList.remove('hidden');
}


// --- View Navigation ---
function showMainView() {
    DOMElements.mainView.classList.remove('hidden');
    DOMElements.dishDetailView.classList.add('hidden');
    state.selectedDish = null;
    DOMElements.dishCardContainer.innerHTML = '';
}

function showDishDetailView() {
    DOMElements.mainView.classList.add('hidden');
    DOMElements.dishDetailView.classList.remove('hidden');
    renderDishCard();
}


// --- Data Handling & Firebase ---
function fetchMenu() {
    state.isMenuLoading = true;
    renderApp();
    const weekId = getWeekId(new Date(state.selectedDate + 'T12:00:00Z'));
    const menuRef = ref(database, `menus/${weekId}`);
    onValue(menuRef, (snapshot) => {
        state.menu = snapshot.val() || null;
        state.isMenuLoading = false;
        renderApp();
    });
}

function fetchCheckData() {
    state.isCheckDataLoading = true;
    renderApp();
    const checkRef = ref(database, `quality-checks/${state.selectedDate}`);
    onValue(checkRef, (snapshot) => {
        state.checkedData = snapshot.val() || {};
        state.isCheckDataLoading = false;
        // If a dish is selected, re-render it. Otherwise, render the grid.
        if(state.selectedDish) {
          renderDishCard();
        } else {
          renderApp();
        }
    });
}

function saveCheckData(data) {
    const dbRef = ref(database, `quality-checks/${data.date}/${data.dishLetter}`);
    set(dbRef, data).catch(console.error);
}

// --- AI Functions ---
async function handleAiCheck(dish, capturedImageDataUrl, buttonElement) {
    const originalContent = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Analyzing...</span>
    `;

    const feedbackContainer = document.getElementById('ai-feedback-container');
    feedbackContainer.classList.remove('hidden');
    feedbackContainer.innerHTML = `<div class="p-4 border rounded-md bg-gray-700/50"><p>AI is analyzing the dish, please wait...</p></div>`;
    
    const form = document.getElementById('dish-form');


    try {
        const apiKey = localStorage.getItem('geminiApiKey');
        if (!apiKey) {
            DOMElements.settingsError.textContent = 'Please set your Gemini API key to use the AI Check feature.';
            DOMElements.settingsModal.classList.remove('hidden');
            
            // Reset UI
            buttonElement.disabled = false;
            buttonElement.innerHTML = originalContent;
            feedbackContainer.classList.add('hidden');
            feedbackContainer.innerHTML = '';
            return;
        }
        
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const [refImageBase64, capturedImageBase64] = await Promise.all([
            urlToBase64(dish.dishImage).catch(e => {
                console.error("Reference image fetch error:", e);
                throw new Error('Could not load reference image for comparison.');
            }),
            Promise.resolve(capturedImageDataUrl.split(',')[1])
        ]);

        const ingredientsList = dish.dishIngredients.map(ing => `${ing.name} (${ing.weight})`).join(', ');
        const promptText = `As a culinary quality control expert in Berlin, Germany, analyze the provided "Captured Image" against the "Reference Image" for the dish '${dish.dishName}'.
        The expected ingredients are: ${ingredientsList}.
        Based on your comparison and knowledge of local Berlin food trends (e.g., preference for fresh, locally sourced ingredients, vibrant plating, and specific flavor profiles), conduct a grounded search and then provide your analysis.
        Your entire response MUST be a single, valid JSON object with the following structure: { "score": number, "positives": string[], "improvements": string[], "overall_comment": string }.
        Do not include any text, markdown formatting, or code fences (like \`\`\`json) before or after the JSON object. The "improvements" should be actionable suggestions.`;
        
        const requestBody = {
            contents: [{
                parts: [
                    { text: "Reference Image:" },
                    { inlineData: { mimeType: 'image/jpeg', data: refImageBase64 } },
                    { text: "Captured Image:" },
                    { inlineData: { mimeType: 'image/jpeg', data: capturedImageBase64 } },
                    { text: promptText }
                ]
            }],
            tools: [{
                googleSearch: {},
            }]
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("API Error:", errorBody);
            throw new Error(`API returned status ${response.status}: ${errorBody.error?.message || 'Unknown error'}`);
        }

        const responseData = await response.json();
        const candidate = responseData.candidates?.[0];
        const textResponse = candidate?.content?.parts?.[0]?.text;
        const groundingMetadata = candidate?.groundingMetadata;

        if (!textResponse) {
             console.error("Invalid API response structure, no text part:", responseData);
            throw new Error("AI did not return a text response.");
        }
        
        let feedbackData;
        try {
            feedbackData = JSON.parse(textResponse);
        } catch (e) {
            console.error("Failed to parse JSON from AI response:", textResponse);
            throw new Error("AI returned an invalid JSON format.");
        }

        feedbackData.groundingMetadata = groundingMetadata; // Attach grounding data
        
        if (form) {
            form.dataset.aiFeedback = JSON.stringify(feedbackData);
        }
        renderAiFeedback(feedbackData);

    } catch (error) {
        console.error("AI Check failed:", error);
        feedbackContainer.innerHTML = `<div class="p-4 border rounded-md bg-red-900/30 text-red-300"><p><strong>Error:</strong> AI analysis failed.</p><p class="text-xs mt-1">${error.message}</p></div>`;
    } finally {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalContent;
    }
}


function renderAiFeedback(feedbackData) {
    const container = document.getElementById('ai-feedback-container');
    if (!container || !feedbackData) return;

    const { score, positives, improvements, overall_comment, groundingMetadata } = feedbackData;

    // Determine color and width for the progress bar
    const scorePercentage = (score / 10) * 100;
    let scoreBarColorClass = 'bg-green-500';
    if (score < 5) {
        scoreBarColorClass = 'bg-red-600';
    } else if (score < 8) {
        scoreBarColorClass = 'bg-yellow-500';
    }

    const listItems = (items, icon) => (items || []).map(item => `<li class="flex items-start"><span class="mr-2 pt-0.5">${icon}</span><span>${item}</span></li>`).join('');

    let sourcesHTML = '';
    const sources = groundingMetadata?.groundingChunks?.filter(c => c.web).map(c => c.web);
    if (sources && sources.length > 0) {
        sourcesHTML = `
            <div class="mt-4 pt-4 border-t border-gray-700">
                <h5 class="text-xs font-semibold text-gray-400 mb-2">AI consulted the following sources for local context:</h5>
                <ul class="space-y-1 text-xs list-none pl-0">
                    ${sources.map(source => `<li><a href="${source.uri}" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline truncate block">${source.title || source.uri}</a></li>`).join('')}
                </ul>
            </div>
        `;
    }

    container.innerHTML = `
        <div>
            <h4 class="font-semibold text-gray-200 mb-2">AI Analysis (Berlin Context)</h4>
            <div class="p-4 border border-gray-700 rounded-md bg-gray-900/50">
                <div>
                    <div class="flex justify-between items-baseline mb-1">
                        <p class="font-bold text-lg text-gray-200">Overall Score</p>
                        <p class="text-2xl font-black text-white">${score}<span class="text-base font-medium text-gray-400">/10</span></p>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-2.5">
                        <div class="${scoreBarColorClass} h-2.5 rounded-full" style="width: ${scorePercentage}%"></div>
                    </div>
                </div>

                <p class="text-sm italic text-gray-400 mt-4">"${overall_comment}"</p>
                
                <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <h5 class="font-semibold mb-1 text-green-400">What's Good:</h5>
                        <ul class="space-y-1 text-sm list-none pl-0 text-gray-300">${listItems(positives, '✅')}</ul>
                    </div>
                    <div>
                        <h5 class="font-semibold mb-1 text-yellow-400">Actionable Improvements:</h5>
                        <ul class="space-y-1 text-sm list-none pl-0 text-gray-300">${listItems(improvements, '⚠️')}</ul>
                    </div>
                </div>
                 ${sourcesHTML}
            </div>
        </div>
    `;
    container.classList.remove('hidden');
}

// --- Export Functions ---

async function handleExportDetails(button) {
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="hidden sm:inline ml-2">Exporting...</span>`;

    try {
        if (!state.menu || !state.menu.dishes) {
            alert("Menu data is not loaded. Cannot generate details.");
            return;
        }
        
        const weekDates = getWeekDates(state.selectedDate);
        const weekDataPromises = weekDates.map(date => get(ref(database, `quality-checks/${date}`)));
        const weekSnapshots = await Promise.all(weekDataPromises);

        const allChecks = [];
        weekSnapshots.forEach(snapshot => {
            const dailyData = snapshot.val();
            if (dailyData) {
                Object.values(dailyData).forEach(check => allChecks.push(check));
            }
        });

        if (allChecks.length === 0) {
            alert("No quality check data found for the selected week to export.");
            return;
        }

        const headers = ["Date", "Dish Letter", "Dish Name", "Timestamp", "Temp 1", "Temp 2", "Temp 3", "Weight 1", "Weight 2", "Weight 3", "Total Measured Weight", "Checked Ingredients", "Comment", "AI Score", "AI Positives", "AI Improvements", "AI Summary"];
        
        const dishMap = new Map(state.menu.dishes.map(d => [d.dishLetter, d.dishName]));

        const rows = allChecks.map(check => {
            const { date, dishLetter, timestamp, temperatures, weights, totalWeight, selectedIngredients, comment, aiCheckResult } = check;
            const dishName = dishMap.get(dishLetter) || 'Unknown';
            
            return [
                date, dishLetter, dishName, new Date(timestamp).toLocaleString(),
                temperatures?.[0] || '', temperatures?.[1] || '', temperatures?.[2] || '',
                weights?.[0] || '', weights?.[1] || '', weights?.[2] || '', totalWeight || '',
                selectedIngredients?.join(', ') || '', comment || '', aiCheckResult?.score || '',
                aiCheckResult?.positives?.join('; ') || '', aiCheckResult?.improvements?.join('; ') || '', aiCheckResult?.overall_comment || ''
            ];
        });

        const dataForSheet = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Details');
        
        const weekId = getWeekId(new Date(state.selectedDate + 'T12:00:00Z'));
        XLSX.writeFile(wb, `CQC_Details_${weekId}.xlsx`);

    } catch (error) {
        console.error("Failed to export details:", error);
        alert("An error occurred during export. Please check the console.");
    } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
    }
}

async function handleExportSummary(button) {
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="hidden sm:inline ml-2">Exporting...</span>`;

    try {
        if (!state.menu || !state.menu.dishes) {
            alert("Menu data is not loaded. Cannot generate summary.");
            return;
        }

        const weekDates = getWeekDates(state.selectedDate);
        const weekDataPromises = weekDates.map(date => get(ref(database, `quality-checks/${date}`)));
        const weekSnapshots = await Promise.all(weekDataPromises);

        const allChecks = [];
        weekSnapshots.forEach(snapshot => {
            const dailyData = snapshot.val();
            if (dailyData) {
                Object.values(dailyData).forEach(check => allChecks.push(check));
            }
        });

        if (allChecks.length === 0) {
            alert("No quality check data found for the selected week to export.");
            return;
        }

        const headers = ["Date", "Dish Letter", "Dish Name", "Average Temperature (°C)", "Average Weight (g)", "Comment"];
        
        const dishMap = new Map(state.menu.dishes.map(d => [d.dishLetter, d.dishName]));

        const rows = allChecks.map(check => {
            const { date, dishLetter, temperatures, weights, comment } = check;
            const dishName = dishMap.get(dishLetter) || 'Unknown';
            
            const validTemps = (temperatures || []).map(t => parseFloat(t)).filter(t => !isNaN(t) && t !== null);
            const avgTemp = validTemps.length > 0 ? (validTemps.reduce((a, b) => a + b, 0) / validTemps.length).toFixed(1) : 'N/A';

            const validWeights = (weights || []).map(w => parseFloat(w)).filter(w => !isNaN(w) && w !== null);
            const avgWeight = validWeights.length > 0 ? (validWeights.reduce((a, b) => a + b, 0) / validWeights.length).toFixed(1) : 'N/A';
            
            return [
                date,
                dishLetter,
                dishName,
                avgTemp,
                avgWeight,
                comment || ''
            ];
        });

        const dataForSheet = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Summary');

        const weekId = getWeekId(new Date(state.selectedDate + 'T12:00:00Z'));
        XLSX.writeFile(wb, `CQC_Summary_${weekId}.xlsx`);

    } catch (error) {
        console.error("Failed to export summary:", error);
        alert("An error occurred during export. Please check the console.");
    } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
    }
}


// --- Event Listeners ---
function setupEventListeners() {
    // Header
    DOMElements.settingsBtn.onclick = () => {
        DOMElements.apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
        DOMElements.settingsModal.classList.remove('hidden');
    };
    DOMElements.exportDetailsBtn.onclick = (e) => handleExportDetails(e.currentTarget);
    DOMElements.exportSummaryBtn.onclick = (e) => handleExportSummary(e.currentTarget);
    
    // Settings Modal
    DOMElements.settingsCloseBtn.onclick = () => DOMElements.settingsModal.classList.add('hidden');
    DOMElements.settingsCancelBtn.onclick = () => DOMElements.settingsModal.classList.add('hidden');
    DOMElements.settingsSaveBtn.onclick = handleSaveSettings;

    // Date Selector
    DOMElements.prevWeekBtn.onclick = () => changeWeek('prev');
    DOMElements.nextWeekBtn.onclick = () => changeWeek('next');
    
    // Dish Detail View
    DOMElements.backToMenuBtn.onclick = showMainView;
}

// --- Accessory Bar and Keyboard Navigation (Robust Implementation) ---
function setupAccessoryBarAndKeyboardListeners() {
    let focusableInputs = [];
    let currentFocusIndex = -1;

    const showAccessoryBar = () => DOMElements.inputAccessoryBar.classList.add('is-visible');
    const hideAccessoryBar = () => DOMElements.inputAccessoryBar.classList.remove('is-visible');

    const updateAccessoryBarButtons = () => {
        DOMElements.inputPrevBtn.disabled = currentFocusIndex <= 0;
        DOMElements.inputNextBtn.disabled = currentFocusIndex >= focusableInputs.length - 1;
    };

    const navigateTo = (direction) => {
        const newIndex = currentFocusIndex + direction;
        if (newIndex >= 0 && newIndex < focusableInputs.length) {
            focusableInputs[newIndex].focus();
        }
    };

    DOMElements.inputPrevBtn.onclick = () => navigateTo(-1);
    DOMElements.inputNextBtn.onclick = () => navigateTo(1);
    DOMElements.inputDoneBtn.onclick = () => {
        if (currentFocusIndex !== -1 && focusableInputs[currentFocusIndex]) {
            focusableInputs[currentFocusIndex].blur();
        }
    };

    DOMElements.dishCardContainer.addEventListener('focusin', (e) => {
        if (e.target.matches('[data-form-input]')) {
            focusableInputs = Array.from(DOMElements.dishCardContainer.querySelectorAll('[data-form-input]'));
            currentFocusIndex = focusableInputs.indexOf(e.target);
            updateAccessoryBarButtons();
            showAccessoryBar();
        }
    });

    DOMElements.dishCardContainer.addEventListener('focusout', (e) => {
         if (e.target.matches('[data-form-input]')) {
            // Use a small timeout to allow focus to shift to the accessory bar buttons
            setTimeout(() => {
                const activeEl = document.activeElement;
                if (activeEl !== DOMElements.inputPrevBtn &&
                    activeEl !== DOMElements.inputNextBtn &&
                    activeEl !== DOMElements.inputDoneBtn) {
                    currentFocusIndex = -1;
                    hideAccessoryBar();
                }
            }, 150);
        }
    });

    DOMElements.dishCardContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && e.target.matches('[data-form-input]')) {
            e.preventDefault();
            const isTextarea = e.target.tagName === 'TEXTAREA';
            const submitBtn = document.getElementById('submit-btn');

            if (currentFocusIndex === focusableInputs.length - 1 || isTextarea) {
                if (submitBtn && !submitBtn.classList.contains('hidden')) {
                    submitBtn.click();
                }
            } else {
                navigateTo(1);
            }
        }
    });
}

function handleSaveSettings() {
    // Save API Key
    const apiKey = DOMElements.apiKeyInput.value.trim();
    if (apiKey) {
        localStorage.setItem('geminiApiKey', apiKey);
    } else {
        localStorage.removeItem('geminiApiKey');
    }

    const jsonInput = DOMElements.jsonInput;
    const errorEl = DOMElements.settingsError;
    
    if (!jsonInput.value.trim()) {
        alert('Settings saved.');
        DOMElements.settingsModal.classList.add('hidden');
        errorEl.textContent = '';
        return;
    }
    
    try {
        const parsed = JSON.parse(jsonInput.value);
        if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.dishes) || !parsed.startDate) {
            throw new Error("Invalid JSON structure.");
        }
        
        const extractIngredients = (ingredients = []) => {
             const allIngredients = [];
             const ignoredSubIngredients = ['water', 'salt', 'oil'];
             for (const ing of ingredients) {
                 if (ing.subRecipe && Array.isArray(ing.subRecipe.ingredients)) {
                     const primarySubIngredients = ing.subRecipe.ingredients.filter(subIng => {
                        if (!subIng || typeof subIng.name !== 'string') {
                            return false;
                        }
                        const lowerCaseName = subIng.name.toLowerCase();
                        return !ignoredSubIngredients.some(ignored => lowerCaseName.includes(ignored));
                     });
                     const mainDishAmount = parseFloat(ing.amount);
                     const subRecipePortion = parseFloat(ing.subRecipe.portion);
                     if (!isNaN(mainDishAmount) && subRecipePortion > 0 && primarySubIngredients.length > 1) {
                         for (const subIng of primarySubIngredients) {
                            if (subIng.name && subIng.amount !== undefined) {
                                const proportionalAmount = (mainDishAmount / subRecipePortion) * parseFloat(subIng.amount);
                                allIngredients.push({ name: subIng.name.trim(), weight: `${proportionalAmount.toFixed(2)}g` });
                            }
                         }
                     } else if (primarySubIngredients.length === 1 && ing.amount !== undefined) {
                         allIngredients.push({ name: primarySubIngredients[0].name.trim(), weight: `${ing.amount}g` });
                     }
                 } else if (ing.name && ing.amount !== undefined) {
                     allIngredients.push({ name: ing.name.trim(), weight: `${ing.amount}g` });
                 }
             }
             return allIngredients;
        };

        const dishes = parsed.dishes
            .filter(d => d.stickerNo && d.stickerNo !== 'addons')
            .map(d => {
                const ingredients = extractIngredients(d.ingredients);
                const theoreticalWeight = ingredients.reduce((sum, ing) => {
                    const weightValue = parseFloat(ing.weight);
                    return sum + (isNaN(weightValue) ? 0 : weightValue);
                }, 0);

                return {
                    dishLetter: d.stickerNo,
                    dishName: d.variantName,
                    dishImage: d.webUrl,
                    dishIngredients: ingredients,
                    dishType: ['hot', 'cold'].includes(d.type) ? d.type : 'unknown',
                    theoreticalWeight: theoreticalWeight,
                };
            });

        const newMenu = {
            id: parsed.id || `menu-${parsed.startDate}`,
            name: parsed.name || 'Weekly Menu',
            startDate: parsed.startDate,
            endDate: parsed.endDate || '',
            dishes,
        };
        
        const menuWeekId = getWeekId(new Date(newMenu.startDate + 'T12:00:00Z'));
        set(ref(database, `menus/${menuWeekId}`), newMenu).then(() => {
            alert('Settings and Menu saved successfully!');
            DOMElements.settingsModal.classList.add('hidden');
            jsonInput.value = '';
            errorEl.textContent = '';
            // If the saved menu is for a different week, navigate to it
            if (getWeekId(new Date(state.selectedDate + 'T12:00:00Z')) !== menuWeekId) {
                state.selectedDate = newMenu.startDate;
                initializeAppState(); // Re-initialize app for the new week
            }
        }).catch(e => {
            console.error("Firebase save error:", e);
            errorEl.textContent = "Failed to save menu to the database.";
        });

    } catch (e) {
        errorEl.textContent = "Invalid JSON format: " + e.message;
    }
}

function changeWeek(direction) {
    const currentDate = new Date(state.selectedDate + 'T12:00:00Z');
    currentDate.setDate(currentDate.getDate() + (direction === 'prev' ? -7 : 7));
    state.selectedDate = currentDate.toISOString().split('T')[0];
    initializeAppState();
}

// --- Initialization ---

// Request camera permission once on load to improve UX
async function requestCameraPermission() {
    try {
        // Attempt to get a media stream. This will trigger the permission prompt.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Immediately stop the tracks to release the camera. We only wanted the permission.
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        // Log the error, but don't block the app. The user can still grant permission later.
        console.warn('Camera permission was not granted on load:', err.name);
    }
}

function initializeAppState() {
    fetchMenu();
    fetchCheckData();
}

setupEventListeners();
setupAccessoryBarAndKeyboardListeners(); // Setup robust listeners once
requestCameraPermission(); // Request permission when the app starts
initializeAppState();
