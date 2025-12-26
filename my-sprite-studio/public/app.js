const canvas = document.getElementById('sheetCanvas');
const ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('previewCanvas');
const pCtx = pCanvas.getContext('2d');

let img = new Image();
let sprites = []; // {x, y, w, h}
let sequence = [];
let dragIdx = -1;
let dragEdge = null; // 'top', 'bottom', 'left', 'right', 'move'
let currentStep = 0;

// 1. Detection & Start Animating immediately
function autoDetect() {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const visited = new Uint8Array(canvas.width * canvas.height);
    sprites = [];

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const idx = y * canvas.width + x;
            if (data[idx * 4 + 3] > 0 && !visited[idx]) {
                const s = floodFill(x, y, canvas.width, canvas.height, data, visited);
                if (s.w > 4 && s.h > 4) sprites.push(s);
            }
        }
    }
    sequence = sprites.map((_, i) => i);
    updateUI();
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

// 2. Interactive Bounding Boxes
canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pad = 5;

    dragIdx = sprites.findIndex(s => mx > s.x - pad && mx < s.x + s.w + pad && my > s.y - pad && my < s.y + s.h + pad);
    if (dragIdx === -1) return;

    const s = sprites[dragIdx];
    if (Math.abs(mx - s.x) < pad) dragEdge = 'left';
    else if (Math.abs(mx - (s.x + s.w)) < pad) dragEdge = 'right';
    else if (Math.abs(my - s.y) < pad) dragEdge = 'top';
    else if (Math.abs(my - (s.y + s.h)) < pad) dragEdge = 'bottom';
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
        // Box & Number
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        
        ctx.fillStyle = '#00bcd4';
        ctx.font = '10px monospace';
        ctx.fillText(i, s.x + 2, s.y + 10);
        
        // Dimensions
        ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.round(s.w)}x${Math.round(s.h)}`, s.x, s.y + s.h + 12);
    });
}

// 3. Dynamic Preview & Sequence Logic
function loop() {
    if (sequence.length > 0) {
        const s = sprites[sequence[currentStep % sequence.length]];
        pCtx.clearRect(0, 0, 128, 128);
        if (s) pCtx.drawImage(img, s.x, s.y, s.w, s.h, (128-s.w)/2, (128-s.h)/2, s.w, s.h);
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
            autoDetect();
            render();
        };
        img.src = f.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

loop();
