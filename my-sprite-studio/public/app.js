const canvas = document.getElementById('sheetCanvas');
const ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('previewCanvas');
const pCtx = pCanvas.getContext('2d');

const modal = document.getElementById('animModal');
const mCanvas = document.getElementById('modalCanvas');
const mCtx = mCanvas.getContext('2d');
const modalStage = document.getElementById('modalStage');

let img = new Image();
let rawIslands = []; 
let sprites = [];    
let sequence = [];
let selectedIdx = -1;
let activeVar = 20; 
let dragIdx = -1, dragEdge = null, currentStep = 0;

let isPlaying = true;
let isModalOpen = false;
let modalZoom = 1.0;

document.querySelectorAll('.acc-header').forEach(header => {
    header.onclick = () => {
        header.classList.toggle('active');
        header.nextElementSibling.classList.toggle('show');
    };
});

// --- FPS CONTROL & SYNC ---
const speedSlider = document.getElementById('speedSlider');
const fpsDisplaySidebar = document.getElementById('fpsDisplaySidebar');
const fpsDisplayModal = document.getElementById('fpsDisplayModal');

function updateFps(valMs) {
    // Prevent division by zero, cap at reasonable limits
    const ms = Math.max(16, Math.min(500, parseInt(valMs)));
    const fps = (1000 / ms).toFixed(0); // Keeping it clean integer for typing usually, or fixed 1
    
    speedSlider.value = ms;
    fpsDisplaySidebar.innerText = fps;
    fpsDisplayModal.innerText = fps;
}

function makeFpsEditable(spanId) {
    const span = document.getElementById(spanId);
    span.onclick = () => {
        const currentFps = span.innerText;
        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentFps;
        input.className = 'fps-input';
        
        input.onblur = () => commitFps(input.value, span, input);
        input.onkeydown = (e) => { if(e.key === 'Enter') commitFps(input.value, span, input); };
        
        span.innerHTML = '';
        span.appendChild(input);
        input.focus();
    };
}

function commitFps(val, span, input) {
    let fps = parseInt(val);
    if (!fps || fps <= 0) fps = 12; // fallback
    if (fps > 60) fps = 60; // cap
    
    const ms = 1000 / fps;
    updateFps(ms);
    
    // Revert to span text (updateFps handles text update, we just remove input)
    span.innerHTML = fps; 
}

// Init FPS controls
makeFpsEditable('fpsDisplaySidebar');
makeFpsEditable('fpsDisplayModal');

speedSlider.oninput = (e) => {
    updateFps(e.target.value);
};
// Set default 12 FPS (approx 83ms)
updateFps(83);


// --- ZOOM GESTURES (Wheel & Pinch) ---
mCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    adjustZoom(delta);
}, { passive: false });

let initialPinchDist = 0;
mCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        initialPinchDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
    }
});

mCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        const delta = dist > initialPinchDist ? 0.05 : -0.05;
        adjustZoom(delta);
        initialPinchDist = dist;
    }
}, { passive: false });

window.adjustZoom = (delta) => {
    modalZoom = Math.max(0.2, Math.min(10.0, modalZoom + delta));
    if(!isPlaying) loop(true);
};


// --- TUTORIAL (Preserved) ---
const tutorialData = [
    { target: null, title: "Welcome to Sprite Studio!", text: "Let's turn your static sprite sheets into animated assets in seconds." },
    { target: '#importStep', title: "1. Import Sheet", text: "Start by uploading any PNG sprite sheet. The AI will scan it instantly." },
    { target: '#variationGrid', title: "2. Fine-Tune Detection", text: "Select a sensitivity level. 'Var 20' is strictest (cleanest), 'Var 1' catches everything." },
    { target: '#sheetCanvas', title: "3. Interactive Canvas", text: "Click boxes to select. Drag edges to resize. Double-click a perfect box to apply its size to all." },
    { target: '.preset-grid', title: "4. Smart Anchors", text: "Lock the 'Feet' (Bottom) so sprites grow upwards when you resize them.", accordion: 1 },
    { target: '#spritePool', title: "5. Build Sequence", text: "Click these numbers to add frames to your loop.", accordion: 2 },
    { target: '.preview-card', title: "6. Cinema Inspector", text: "Click here to open the full-screen Inspector tool.", accordion: 3 }
];
let tutIndex = 0;

function initTutorial() {
    if (localStorage.getItem('seenTutorial_v4')) return; // Bump version
    setTimeout(() => {
        document.getElementById('tutorialOverlay').classList.add('active');
        updateTutorialStep();
    }, 800);
}

window.nextStep = () => {
    tutIndex++;
    if (tutIndex >= tutorialData.length) endTutorial();
    else updateTutorialStep();
};

window.skipTutorial = () => endTutorial();

function endTutorial() {
    document.getElementById('tutorialOverlay').classList.remove('active');
    localStorage.setItem('seenTutorial_v4', 'true');
}

function updateTutorialStep() {
    const data = tutorialData[tutIndex];
    const spot = document.getElementById('tutorialSpotlight');
    const card = document.getElementById('tutorialCard');
    
    document.getElementById('tTitle').innerText = data.title;
    document.getElementById('tContent').innerHTML = data.text;
    document.getElementById('tStepCount').innerText = `${tutIndex + 1} / ${tutorialData.length}`;
    
    if (data.accordion !== undefined) {
        const headers = document.querySelectorAll('.acc-header');
        const contents = document.querySelectorAll('.acc-content');
        if (headers[data.accordion] && !headers[data.accordion].classList.contains('active')) {
            headers[data.accordion].classList.add('active');
            contents[data.accordion].classList.add('show');
        }
    }

    if (data.target) {
        const el = document.querySelector(data.target);
        if (el) {
            const rect = el.getBoundingClientRect();
            spot.style.width = `${rect.width + 10}px`;
            spot.style.height = `${rect.height + 10}px`;
            spot.style.top = `${rect.top - 5}px`;
            spot.style.left = `${rect.left - 5}px`;
            spot.style.opacity = '1';

            const cardWidth = 300;
            const cardHeight = 250;
            const margin = 20;
            let left = rect.left - cardWidth - margin;
            let top = rect.top;

            if (left < margin) left = rect.right + margin;
            if (left + cardWidth > window.innerWidth) left = window.innerWidth - cardWidth - margin;
            if (top + cardHeight > window.innerHeight) top = window.innerHeight - cardHeight - margin;
            
            card.style.top = `${top}px`;
            card.style.left = `${left}px`;
        }
    } else {
        spot.style.opacity = '0';
        card.style.top = '50%';
        card.style.left = '50%';
        card.style.transform = 'translate(-50%, -50%)';
    }
    card.classList.remove('visible');
    setTimeout(() => card.classList.add('visible'), 50);
}

// --- CORE ENGINE ---
function runDetection() {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const width = canvas.width;
    const height = canvas.height;
    const visited = new Uint8Array(width * height);
    rawIslands = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (data[idx * 4 + 3] > 0 && !visited[idx]) {
                const s = floodFill(x, y, width, height, data, visited);
                if (s.w > 1 && s.h > 1) rawIslands.push(s);
            }
        }
    }
    generateVariationsUI();
    applyVariation(20);
}

function floodFill(startX, startY, width, height, data, visited) {
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    let stack = [[startX, startY]];
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;
        if (x < 0 || x >= width || y < 0 || y >= height || visited[idx] || data[idx * 4 + 3] === 0) continue;
        visited[idx] = 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
    }
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function generateVariationsUI() {
    const grid = document.getElementById('variationGrid');
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 1; i <= 20; i++) {
        const btn = document.createElement('div');
        btn.className = "seq-item pool-item";
        btn.style.fontSize = "10px";
        btn.id = `var-btn-${i}`;
        const count = rawIslands.filter(s => s.w >= i && s.h >= i).length;
        btn.innerText = `Var ${i} (${count})`;
        btn.onclick = () => applyVariation(i);
        grid.appendChild(btn);
    }
}

function applyVariation(sensitivity) {
    activeVar = sensitivity;
    document.querySelectorAll('#variationGrid .seq-item').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`var-btn-${sensitivity}`);
    if(activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const filtered = rawIslands.filter(s => s.w >= sensitivity && s.h >= sensitivity);
    sprites = filtered.map(s => ({ ...s, origin: {...s}, locks: { v: 'center', h: 'center' } }));
    sequence = sprites.map((_, i) => i);
    selectedIdx = -1;
    updatePool();
    updateSequencer();
    render();
}

window.resetCurrentVariation = () => { applyVariation(activeVar); document.getElementById('aiStatus').innerText = "Variations reset."; };

// --- MODAL ---
pCanvas.onclick = () => {
    if (sequence.length === 0) return alert("Sequence is empty!");
    isModalOpen = true;
    modal.classList.add('open');
    renderFilmStrip();
    resizeModalCanvas();
};

window.closeModal = () => { isModalOpen = false; modal.classList.remove('open'); };

function resizeModalCanvas() {
    if(!isModalOpen) return;
    const rect = modalStage.getBoundingClientRect();
    mCanvas.width = rect.width;
    mCanvas.height = rect.height;
}
window.addEventListener('resize', resizeModalCanvas);

window.togglePlay = () => {
    isPlaying = !isPlaying;
    document.getElementById('playPauseBtn').innerText = isPlaying ? "⏸" : "▶";
};

window.stepFrame = (dir) => {
    isPlaying = false;
    document.getElementById('playPauseBtn').innerText = "▶";
    currentStep += dir;
    if(currentStep < 0) currentStep = sequence.length - 1;
    loop(true);
};

document.addEventListener('keydown', (e) => {
    if(!isModalOpen) return;
    if(e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if(e.code === 'ArrowRight') stepFrame(1);
    if(e.code === 'ArrowLeft') stepFrame(-1);
});

function renderFilmStrip() {
    const strip = document.getElementById('filmStrip');
    strip.innerHTML = "";
    sequence.forEach((sIdx, i) => {
        const s = sprites[sIdx];
        const div = document.createElement('div');
        div.className = "film-item";
        div.id = `film-frame-${i}`;
        div.onclick = () => { currentStep = i; isPlaying = false; document.getElementById('playPauseBtn').innerText = "▶"; loop(true); };
        
        const c = document.createElement('canvas');
        c.width = s.w; c.height = s.h;
        c.getContext('2d').drawImage(img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
        const num = document.createElement('span');
        num.className = "film-num";
        num.innerText = i + 1;
        div.appendChild(c); div.appendChild(num); strip.appendChild(div);
    });
}

// --- LOOP ---
function loop(force = false) {
    const speed = speedSlider.value;
    if (sequence.length > 0) {
        if (!force && !isPlaying) { setTimeout(loop, 100); return; }
        
        const frameIdx = Math.abs(currentStep % sequence.length);
        const s = sprites[sequence[frameIdx]];

        pCtx.fillStyle = "#000"; pCtx.fillRect(0, 0, 128, 128);
        document.getElementById('previewNum').innerText = `Frame: ${frameIdx + 1} / ${sequence.length}`;
        if (s) {
            const scale = Math.min(120/s.w, 120/s.h, 1);
            pCtx.drawImage(img, s.x, s.y, s.w, s.h, (128-s.w*scale)/2, (128-s.h*scale)/2, s.w*scale, s.h*scale);
        }

        if (isModalOpen && s) {
            document.getElementById('modalFrameCounter').innerText = `Frame: ${frameIdx + 1} / ${sequence.length}`;
            mCtx.fillStyle = "#111"; mCtx.fillRect(0, 0, mCanvas.width, mCanvas.height);
            mCtx.strokeStyle = "#222"; mCtx.beginPath();
            mCtx.moveTo(mCanvas.width/2, 0); mCtx.lineTo(mCanvas.width/2, mCanvas.height);
            mCtx.moveTo(0, mCanvas.height/2); mCtx.lineTo(mCanvas.width, mCanvas.height/2);
            mCtx.stroke();

            const zw = s.w * modalZoom, zh = s.h * modalZoom;
            mCtx.imageSmoothingEnabled = false;
            mCtx.drawImage(img, s.x, s.y, s.w, s.h, (mCanvas.width - zw)/2, (mCanvas.height - zh)/2, zw, zh);

            document.querySelectorAll('.film-item').forEach(f => f.classList.remove('active'));
            const activeFrame = document.getElementById(`film-frame-${frameIdx}`);
            if (activeFrame) {
                activeFrame.classList.add('active');
                activeFrame.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
            }
        }
        if (isPlaying) currentStep++;
    }
    if(!force) setTimeout(loop, speed);
}

// ... [Remainder of code (Pool, Sequencer, Mouse, Render, Export) is identical to previous successful version] ...
function updatePool() {
    const pool = document.getElementById('spritePool');
    pool.innerHTML = "";
    sprites.forEach((_, i) => {
        const item = document.createElement('div');
        item.className = "seq-item pool-item";
        item.innerText = i;
        item.onclick = () => { sequence.push(i); updateSequencer(); };
        pool.appendChild(item);
    });
}

function updateSequencer() {
    const list = document.getElementById('sequencerList');
    list.innerHTML = "";
    document.getElementById('frameCount').innerText = `${sequence.length} Frames`;
    sequence.forEach((sIdx, orderIdx) => {
        const item = document.createElement('div');
        item.className = "seq-item";
        item.draggable = true;
        item.innerText = sIdx;
        const rm = document.createElement('div');
        rm.className = "remove-btn";
        rm.innerText = "×";
        rm.onclick = (e) => { e.stopPropagation(); sequence.splice(orderIdx, 1); updateSequencer(); };
        item.appendChild(rm);
        item.ondragstart = (e) => { e.dataTransfer.setData('text/plain', orderIdx); item.style.opacity = '0.5'; };
        item.ondragover = (e) => e.preventDefault();
        item.ondrop = (e) => {
            e.preventDefault();
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
            const movedItem = sequence.splice(fromIdx, 1)[0];
            sequence.splice(orderIdx, 0, movedItem);
            updateSequencer();
        };
        list.appendChild(item);
    });
}

window.resetSequence = () => { sequence = sprites.map((_, i) => i); updateSequencer(); };

window.applyPreset = (type) => {
    const applyAll = document.getElementById('applyAll').checked;
    const setSpriteLock = (s) => {
        s.locks = { v: 'center', h: 'center' };
        if (type === 'top') s.locks.v = 'top';
        if (type === 'bottom') s.locks.v = 'bottom';
        if (type === 'left') s.locks.h = 'left';
        if (type === 'right') s.locks.h = 'right';
        if (type === 'top-left') { s.locks.v = 'top'; s.locks.h = 'left'; }
        if (type === 'top-right') { s.locks.v = 'top'; s.locks.h = 'right'; }
        if (type === 'bottom-left') { s.locks.v = 'bottom'; s.locks.h = 'left'; }
        if (type === 'bottom-right') { s.locks.v = 'bottom'; s.locks.h = 'right'; }
    };
    if (applyAll) {
        if (sprites.length === 0) return alert("No sprites!");
        sprites.forEach(s => setSpriteLock(s));
    } else {
        if (selectedIdx === -1) return alert("Select a sprite first!");
        setSpriteLock(sprites[selectedIdx]);
    }
    render();
};

window.resetAllAnchors = () => { sprites.forEach(s => s.locks = { v: 'center', h: 'center' }); render(); };

canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const p = 12;
    const clicked = sprites.findIndex(s => mx > s.x-p && mx < s.x+s.w+p && my > s.y-p && my < s.y+s.h+p);
    if (clicked !== -1) { selectedIdx = clicked; render(); } 
    else { selectedIdx = -1; render(); return; }
    const s = sprites[clicked];
    if (Math.abs(mx - s.x) < p) dragEdge = 'left';
    else if (Math.abs(mx - (s.x+s.w)) < p) dragEdge = 'right';
    else if (Math.abs(my - s.y) < p) dragEdge = 'top';
    else if (Math.abs(my - (s.y+s.h)) < p) dragEdge = 'bottom';
    else dragEdge = 'move';
    dragIdx = clicked;
};

window.onmousemove = (e) => {
    if (dragIdx === -1) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const s = sprites[dragIdx];
    if (dragEdge === 'left') { s.w += (s.x - mx); s.x = mx; }
    else if (dragEdge === 'right') s.w = mx - s.x;
    else if (dragEdge === 'top') { s.h += (s.y - my); s.y = my; }
    else if (dragEdge === 'bottom') s.h = my - s.y;
    else if (dragEdge === 'move') { s.x = mx - s.w/2; s.y = my - s.h/2; }
    render();
};

window.onmouseup = () => { dragIdx = -1; dragEdge = null; };

canvas.ondblclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const target = sprites.find(s => mx > s.x && mx < s.x+s.w && my > s.y && my < s.y+s.h);
    if (!target) return;
    sprites = sprites.map(s => {
        let newX = s.x, newY = s.y;
        if (s.locks.v === 'bottom') newY = (s.y + s.h) - target.h;
        else if (s.locks.v === 'top') newY = s.y;
        else newY = s.y + (s.h - target.h) / 2;
        if (s.locks.h === 'right') newX = (s.x + s.w) - target.w;
        else if (s.locks.h === 'left') newX = s.x;
        else newX = s.x + (s.w - target.w) / 2;
        return { ...s, x: newX, y: newY, w: target.w, h: target.h };
    });
    render();
};

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    sprites.forEach((s, i) => {
        if (i === selectedIdx) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.strokeRect(s.x-2, s.y-2, s.w+4, s.h+4); ctx.setLineDash([]);
        }
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1; ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2; ctx.beginPath();
        if (s.locks.v === 'top') { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x+s.w, s.y); }
        if (s.locks.v === 'bottom') { ctx.moveTo(s.x, s.y+s.h); ctx.lineTo(s.x+s.w, s.y+s.h); }
        if (s.locks.h === 'left') { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y+s.h); }
        if (s.locks.h === 'right') { ctx.moveTo(s.x+s.w, s.y); ctx.lineTo(s.x+s.w, s.y+s.h); }
        ctx.stroke();
        ctx.fillStyle = '#00bcd4'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left'; ctx.fillText(i, s.x, s.y - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '10px monospace'; ctx.textAlign = 'right'; ctx.fillText(`${Math.round(s.w)}x${Math.round(s.h)}`, s.x + s.w, s.y + s.h + 10);
    });
}

document.getElementById('upload').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (f) => {
        sprites = []; sequence = []; rawIslands = []; currentStep = 0; selectedIdx = -1; updatePool(); updateSequencer(); pCtx.clearRect(0,0,128,128); document.getElementById('previewNum').innerText = "Frame: 0";
        img.onload = () => {
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            runDetection();
            initTutorial();
        };
        img.src = f.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

document.getElementById('zipBtn').onclick = async () => {
    const zip = new JSZip();
    for(let i=0; i<sequence.length; i++) {
        const s = sprites[sequence[i]];
        const c = document.createElement('canvas');
        c.width = s.w; c.height = s.h;
        c.getContext('2d').drawImage(img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
        const blob = await new Promise(r => c.toBlob(r));
        zip.file(`frame_${i}.png`, blob);
    }
    const content = await zip.generateAsync({type:"blob"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = "sprites.zip";
    a.click();
};

loop();
