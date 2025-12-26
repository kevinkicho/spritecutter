const canvas = document.getElementById('sheetCanvas');
const ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('previewCanvas');
const pCtx = pCanvas.getContext('2d');

let img = new Image();
let rawIslands = []; 
let sprites = [];    
let sequence = [];
let selectedIdx = -1;
let dragIdx = -1, dragEdge = null, currentStep = 0;

// Accordion Logic
document.querySelectorAll('.acc-header').forEach(header => {
    header.onclick = () => {
        header.classList.toggle('active');
        header.nextElementSibling.classList.toggle('show');
    };
});

// Preset Logic
window.applyPreset = (type) => {
    if (selectedIdx === -1) return alert("Select a sprite first!");
    const s = sprites[selectedIdx];
    s.locks = { v: 'center', h: 'center' };

    if (type === 'top') s.locks.v = 'top';
    if (type === 'bottom') s.locks.v = 'bottom';
    if (type === 'left') s.locks.h = 'left';
    if (type === 'right') s.locks.h = 'right';

    if (type === 'top-left') { s.locks.v = 'top'; s.locks.h = 'left'; }
    if (type === 'top-right') { s.locks.v = 'top'; s.locks.h = 'right'; }
    if (type === 'bottom-left') { s.locks.v = 'bottom'; s.locks.h = 'left'; }
    if (type === 'bottom-right') { s.locks.v = 'bottom'; s.locks.h = 'right'; }

    render();
    document.getElementById('aiStatus').innerText = `Sprite ${selectedIdx} anchored: ${type}`;
};

// Detection
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

function generateVariationsUI() {
    const grid = document.getElementById('variationGrid');
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 1; i <= 20; i++) {
        const btn = document.createElement('div');
        btn.className = "seq-item";
        btn.style.fontSize = "10px";
        btn.innerText = `Var ${i}`;
        btn.onclick = () => applyVariation(i);
        grid.appendChild(btn);
    }
}

function applyVariation(sensitivity) {
    const filtered = rawIslands.filter(s => s.w >= sensitivity && s.h >= sensitivity);
    sprites = filtered.map(s => ({ ...s, origin: {...s}, locks: { v: 'center', h: 'center' } }));
    sequence = sprites.map((_, i) => i);
    selectedIdx = -1;
    updateSequencer();
    render();
}

// Mouse Logic
canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const p = 12;

    const clicked = sprites.findIndex(s => mx > s.x-p && mx < s.x+s.w+p && my > s.y-p && my < s.y+s.h+p);
    
    if (clicked !== -1) {
        selectedIdx = clicked;
        render(); 
    } else {
        selectedIdx = -1;
        render();
        return;
    }

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

// Template Logic
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
    document.getElementById('aiStatus').innerText = "Applied template!";
};

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    
    sprites.forEach((s, i) => {
        if (i === selectedIdx) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(s.x-2, s.y-2, s.w+4, s.h+4);
            ctx.setLineDash([]);
        }
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x, s.y, s.w, s.h);

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

loop();
