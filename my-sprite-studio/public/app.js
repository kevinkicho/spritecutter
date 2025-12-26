const canvas = document.getElementById('sheetCanvas');
const ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('previewCanvas');
const pCtx = pCanvas.getContext('2d');

let img = new Image();
let sprites = []; 
let sequence = [];
let dragIdx = -1;
let dragEdge = null; 
let currentStep = 0;

// 1. Vision Engine: Generate 20 Variations
function generateVariations() {
    const grid = document.getElementById('variationGrid');
    grid.innerHTML = "";
    
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    for (let v = 1; v <= 20; v++) {
        // Each variation uses a slightly different "minimum island size" to filter noise
        const minPixelSize = v * 2; 
        const found = detectIslands(data, minPixelSize);
        
        const btn = document.createElement('button');
        btn.style.fontSize = "10px";
        btn.style.padding = "5px";
        btn.innerText = `Var ${v}: ${found.length} Box`;
        btn.onclick = () => applyVariation(found);
        grid.appendChild(btn);
        
        // Auto-apply the first variation as a default
        if (v === 1) applyVariation(found);
    }
}

function detectIslands(data, minSize) {
    const width = canvas.width;
    const height = canvas.height;
    const visited = new Uint8Array(width * height);
    const results = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (data[idx * 4 + 3] > 0 && !visited[idx]) {
                const s = floodFill(x, y, width, height, data, visited);
                if (s.w >= minSize || s.h >= minSize) results.push(s);
            }
        }
    }
    return results;
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

function applyVariation(foundSprites) {
    sprites = foundSprites;
    sequence = sprites.map((_, i) => i);
    updateUI();
    render();
}

// 2. Interactive Logic
canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pad = 8;

    dragIdx = sprites.findIndex(s => mx > s.x-pad && mx < s.x+s.w+pad && my > s.y-pad && my < s.y+s.h+pad);
    if (dragIdx === -1) return;

    const s = sprites[dragIdx];
    if (Math.abs(mx - s.x) < pad) dragEdge = 'left';
    else if (Math.abs(mx - (s.x+s.w)) < pad) dragEdge = 'right';
    else if (Math.abs(my - s.y) < pad) dragEdge = 'top';
    else if (Math.abs(my - (s.y+s.h)) < pad) dragEdge = 'bottom';
    else dragEdge = 'move';
};

window.onmousemove = (e) => {
    if (dragIdx === -1) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const s = sprites[dragIdx];

    if (dragEdge === 'left') { s.w += (s.x - mx); s.x = mx; }
    else if (dragEdge === 'right') s.w = mx - s.x;
    else if (dragEdge === 'top') { s.h += (s.y - my); s.y = my; }
    else if (dragEdge === 'bottom') s.h = my - s.y;
    else if (dragEdge === 'move') { s.x = mx - s.w/2; s.y = my - s.h/2; }
    render();
};

window.onmouseup = () => { dragIdx = -1; dragEdge = null; };

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    sprites.forEach((s, i) => {
        ctx.strokeStyle = '#00bcd4';
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText(`${i}: ${Math.round(s.w)}x${Math.round(s.h)}`, s.x, s.y - 5);
    });
}

// 3. UI & Preview Loop
function loop() {
    if (sequence.length > 0) {
        const s = sprites[sequence[currentStep % sequence.length]];
        pCtx.clearRect(0, 0, 128, 128);
        if (s) {
            // Proportional fit for preview
            const scale = Math.min(120/s.w, 120/s.h, 1);
            pCtx.drawImage(img, s.x, s.y, s.w, s.h, (128-s.w*scale)/2, (128-s.h*scale)/2, s.w*scale, s.h*scale);
        }
        currentStep++;
    }
    setTimeout(loop, document.getElementById('speedSlider').value);
}

function updateUI() {
    const avail = document.getElementById('availableSprites');
    const seqList = document.getElementById('sequencerList');
    avail.innerHTML = ""; seqList.innerHTML = "";

    sprites.forEach((_, i) => {
        const div = document.createElement('div');
        div.className = "seq-item"; div.innerText = i;
        div.onclick = () => { sequence.push(i); updateUI(); };
        avail.appendChild(div);
    });

    sequence.forEach((sIdx, order) => {
        const div = document.createElement('div');
        div.className = "seq-item"; div.innerText = sIdx;
        div.draggable = true;
        div.oncontextmenu = (e) => { e.preventDefault(); sequence.splice(order, 1); updateUI(); };
        div.ondragstart = (e) => e.dataTransfer.setData('text', order);
        div.ondrop = (e) => {
            const from = e.dataTransfer.getData('text');
            const item = sequence.splice(from, 1)[0];
            sequence.splice(order, 0, item);
            updateUI();
        };
        div.ondragover = (e) => e.preventDefault();
        seqList.appendChild(div);
    });
}

document.getElementById('upload').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (f) => {
        img.onload = () => {
            canvas.width = img.width; canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            generateVariations();
        };
        img.src = f.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

loop();
