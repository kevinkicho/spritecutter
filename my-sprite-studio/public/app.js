const canvas = document.getElementById('sheetCanvas');
const ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('previewCanvas');
const pCtx = pCanvas.getContext('2d');

let img = new Image();
let rawIslands = []; 
let sprites = [];    
let sequence = [];
let dragIdx = -1, dragEdge = null, currentStep = 0;
let editMode = 'edit'; // 'edit' or 'anchor'

// 1. DETECTION
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
    applyVariation(5);
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

// 2. VARIATIONS & STATE
function generateVariationsUI() {
    const grid = document.getElementById('variationGrid');
    if (!grid) return;
    grid.innerHTML = "";
    
    for (let i = 1; i <= 20; i++) {
        const btn = document.createElement('div');
        btn.className = "seq-item";
        btn.style.fontSize = "10px";
        btn.style.cursor = "pointer";
        const count = rawIslands.filter(s => s.w >= i && s.h >= i).length;
        btn.innerText = `Var ${i}\n(${count})`;
        btn.onclick = () => applyVariation(i);
        grid.appendChild(btn);
    }
}

function applyVariation(sensitivity) {
    const filtered = rawIslands.filter(s => s.w >= sensitivity && s.h >= sensitivity);
    // Initialize with default locks (Center/Center)
    sprites = filtered.map(s => ({ 
        ...s,
        locks: { v: 'center', h: 'center' } // v: top/bottom/center, h: left/right/center
    }));
    
    sequence = sprites.map((_, i) => i);
    updateSequencer();
    render();
    document.getElementById('aiStatus').innerText = `Variation ${sensitivity} applied. Switch modes to set anchors.`;
}

// 3. INTERACTION CONTROLLER
document.getElementById('modeEdit').onclick = () => setMode('edit');
document.getElementById('modeAnchor').onclick = () => setMode('anchor');

function setMode(mode) {
    editMode = mode;
    document.getElementById('modeEdit').classList.toggle('active', mode === 'edit');
    document.getElementById('modeAnchor').classList.toggle('active', mode === 'anchor');
    const tip = mode === 'edit' ? "Edit Mode: Drag edges to resize." : "Anchor Mode: Click sides to lock (Red = Locked). Click center to reset.";
    document.getElementById('toolTip').innerText = tip;
    render();
}

// MOUSE LOGIC
canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const p = 12; // hit padding
    
    // Find clicked sprite
    const clickedIdx = sprites.findIndex(s => mx > s.x-p && mx < s.x+s.w+p && my > s.y-p && my < s.y+s.h+p);
    
    if (clickedIdx === -1) return;
    const s = sprites[clickedIdx];

    // Determine where specifically was clicked
    let clickedPart = null;
    if (Math.abs(mx - s.x) < p) clickedPart = 'left';
    else if (Math.abs(mx - (s.x+s.w)) < p) clickedPart = 'right';
    else if (Math.abs(my - s.y) < p) clickedPart = 'top';
    else if (Math.abs(my - (s.y+s.h)) < p) clickedPart = 'bottom';
    else clickedPart = 'center';

    if (editMode === 'edit') {
        // RESIZE / MOVE
        dragIdx = clickedIdx;
        dragEdge = (clickedPart === 'center') ? 'move' : clickedPart;

    } else if (editMode === 'anchor') {
        // SET ANCHORS
        if (clickedPart === 'bottom') s.locks.v = (s.locks.v === 'bottom') ? 'center' : 'bottom';
        if (clickedPart === 'top') s.locks.v = (s.locks.v === 'top') ? 'center' : 'top';
        if (clickedPart === 'left') s.locks.h = (s.locks.h === 'left') ? 'center' : 'left';
        if (clickedPart === 'right') s.locks.h = (s.locks.h === 'right') ? 'center' : 'right';
        if (clickedPart === 'center') s.locks = {v: 'center', h: 'center'}; // Reset
        
        render(); // Update red lines
    }
};

window.onmousemove = (e) => {
    if (dragIdx === -1 || editMode !== 'edit') return;
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

// 4. SMART TEMPLATE APPLICATION (Respects Locks)
canvas.ondblclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    
    const target = sprites.find(s => mx > s.x && mx < s.x+s.w && my > s.y && my < s.y+s.h);
    if (!target) return;

    // Apply target dims to all, respecting their individual anchors
    sprites = sprites.map(s => {
        let newX = s.x, newY = s.y;

        // VERTICAL LOGIC
        if (s.locks.v === 'bottom') {
            // Anchor Bottom: y moves, bottom edge stays fixed
            newY = (s.y + s.h) - target.h;
        } else if (s.locks.v === 'top') {
            // Anchor Top: y stays fixed
            newY = s.y;
        } else {
            // Anchor Center: expand/contract around center
            newY = s.y + (s.h - target.h) / 2;
        }

        // HORIZONTAL LOGIC
        if (s.locks.h === 'right') {
            newX = (s.x + s.w) - target.w;
        } else if (s.locks.h === 'left') {
            newX = s.x;
        } else {
            newX = s.x + (s.w - target.w) / 2;
        }

        return { 
            ...s, 
            x: newX, y: newY, 
            w: target.w, h: target.h 
        };
    });

    render();
    document.getElementById('aiStatus').innerText = `Applied ${Math.round(target.w)}x${Math.round(target.h)} template respecting anchors!`;
};

// 5. RENDER
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    
    sprites.forEach((s, i) => {
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x, s.y, s.w, s.h);

        // Draw Locks (Red Lines)
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (s.locks.v === 'top') { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x+s.w, s.y); }
        if (s.locks.v === 'bottom') { ctx.moveTo(s.x, s.y+s.h); ctx.lineTo(s.x+s.w, s.y+s.h); }
        if (s.locks.h === 'left') { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y+s.h); }
        if (s.locks.h === 'right') { ctx.moveTo(s.x+s.w, s.y); ctx.lineTo(s.x+s.w, s.y+s.h); }
        ctx.stroke();

        ctx.fillStyle = '#00bcd4';
        ctx.font = '10px Arial';
        ctx.fillText(i, s.x, s.y - 4);
    });
}

function updateSequencer() {
    const list = document.getElementById('sequencerList');
    if (!list) return;
    list.innerHTML = "";
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
        item.ondragstart = (e) => { e.dataTransfer.setData('idx', orderIdx); item.style.opacity = '0.5'; };
        item.ondragend = () => item.style.opacity = '1';
        item.ondragover = (e) => e.preventDefault();
        item.ondrop = (e) => {
            const from = e.dataTransfer.getData('idx');
            const mov = sequence.splice(from, 1)[0];
            sequence.splice(orderIdx, 0, mov);
            updateSequencer();
        };
        list.appendChild(item);
    });
}

function loop() {
    if (sequence.length > 0) {
        const s = sprites[sequence[currentStep % sequence.length]];
        pCtx.fillStyle = "#000";
        pCtx.fillRect(0, 0, 128, 128);
        if (s) {
            const scale = Math.min(120/s.w, 120/s.h, 1);
            pCtx.drawImage(img, s.x, s.y, s.w, s.h, (128-s.w*scale)/2, (128-s.h*scale)/2, s.w*scale, s.h*scale);
        }
        currentStep++;
    }
    setTimeout(loop, document.getElementById('speedSlider').value);
}

document.getElementById('upload').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (f) => {
        img.onload = () => {
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            runDetection();
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

document.getElementById('resetCuts').onclick = () => applyVariation(5);
loop();
