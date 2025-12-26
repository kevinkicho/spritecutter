const sheetCanvas = document.getElementById('sheetCanvas');
const ctx = sheetCanvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const pCtx = previewCanvas.getContext('2d');

let originalImg = new Image();
let detectedSprites = []; 
let isAnimating = false;
let currentFrame = 0;

/**
 * 1. Background Removal Logic
 * Identifies the top-left pixel as the 'key' and clears similar colors.
 */
function processBackground(canvas) {
    const tempCtx = canvas.getContext('2d');
    const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Pick the background color from the very first pixel
    const keyR = data[0], keyG = data[1], keyB = data[2];
    const tolerance = 45; // High tolerance for messy JPG grids

    for (let i = 0; i < data.length; i += 4) {
        const diff = Math.abs(data[i] - keyR) + Math.abs(data[i+1] - keyG) + Math.abs(data[i+2] - keyB);
        if (diff < tolerance) data[i + 3] = 0; // Set Alpha to 0
    }
    tempCtx.putImageData(imageData, 0, 0);
}

/**
 * 2. Vision Algorithm: Connected Component Analysis
 * Finds every separate "island" of pixels
 */
function detectIslands(canvas, minSize = 5) {
    const tCtx = canvas.getContext('2d');
    const {width, height} = canvas;
    const data = tCtx.getImageData(0, 0, width, height).data;
    const visited = new Uint8Array(width * height);
    const islands = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (data[idx * 4 + 3] > 0 && !visited[idx]) {
                // Found a sprite pixel, start flood fill
                const island = floodFill(x, y, width, height, data, visited);
                if (island.w >= minSize && island.h >= minSize) islands.push(island);
            }
        }
    }
    return islands;
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
    return {x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1};
}

/**
 * 3. Variation Engine
 * Generates different sets of results for the user to pick
 */
document.getElementById('genVariations').onclick = () => {
    if (!originalImg.src) return alert("Upload sheet first");
    
    const grid = document.getElementById('variationGrid');
    grid.innerHTML = ""; // Clear old results
    
    // Process background on main canvas once
    processBackground(sheetCanvas);

    // Generate 20 variations with different 'Noise Filtering' settings
    for (let v = 0; v < 20; v++) {
        const minPixelSize = 2 + (v * 2); 
        const sprites = detectIslands(sheetCanvas, minPixelSize);
        
        if (sprites.length > 0) {
            const btn = document.createElement('button');
            btn.className = "btn-ghost";
            btn.style.fontSize = "10px";
            btn.innerText = `Var ${v}: ${sprites.length} Sprites`;
            btn.onclick = () => selectVariation(sprites);
            grid.appendChild(btn);
        }
    }
    document.getElementById('aiStatus').innerText = "Select the variation that looks best!";
};

function selectVariation(sprites) {
    detectedSprites = sprites.map(s => ({bbox: [s.x, s.y, s.w, s.h]}));
    drawEditor();
    if (!isAnimating) { isAnimating = true; animate(); }
}

function drawEditor() {
    ctx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    ctx.drawImage(originalImg, 0, 0); // Redraw original for context
    processBackground(sheetCanvas); // Apply transparency overlay

    ctx.strokeStyle = "#00bcd4";
    detectedSprites.forEach(s => ctx.strokeRect(...s.bbox));
}

function animate() {
    if (!isAnimating || detectedSprites.length === 0) return;
    const s = detectedSprites[currentFrame % detectedSprites.length].bbox;
    pCtx.clearRect(0, 0, 128, 128);
    // Draw centered using Vision Centroids
    pCtx.drawImage(sheetCanvas, s[0], s[1], s[2], s[3], (128-s[2])/2, (128-s[3])/2, s[2], s[3]);
    currentFrame++;
    setTimeout(() => requestAnimationFrame(animate), 150);
}

document.getElementById('upload').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (f) => {
        originalImg = new Image();
        originalImg.onload = () => {
            sheetCanvas.width = originalImg.width;
            sheetCanvas.height = originalImg.height;
            ctx.drawImage(originalImg, 0, 0);
            document.getElementById('aiStatus').innerText = "Ready to Process Background & Extract Sprites";
        };
        originalImg.src = f.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

// Reuse your previous JSZip logic for the final export
document.getElementById('zipBtn').onclick = async () => {
    if (detectedSprites.length === 0) return alert("Select a variation first");
    const zip = new JSZip();
    const folder = zip.folder("extracted_sprites");
    for (let i = 0; i < detectedSprites.length; i++) {
        const b = detectedSprites[i].bbox;
        const temp = document.createElement('canvas');
        temp.width = b[2]; temp.height = b[3];
        temp.getContext('2d').drawImage(sheetCanvas, b[0], b[1], b[2], b[3], 0, 0, b[2], b[3]);
        const blob = await new Promise(r => temp.toBlob(r));
        folder.file(`sprite_${i}.png`, blob);
    }
    const content = await zip.generateAsync({type:"blob"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "vision_sprites.zip";
    link.click();
};
