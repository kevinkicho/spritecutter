const sheetCanvas = document.getElementById('sheetCanvas');
const ctx = sheetCanvas.getContext('2d');
let model, img = new Image(), vCuts = [], hCuts = [], trainingData = [];

// Initialize AI
async function init() {
    model = tf.sequential();
    model.add(tf.layers.dense({units: 64, inputShape: [512], activation: 'relu'}));
    model.add(tf.layers.dense({units: 512, activation: 'sigmoid'}));
    model.compile({optimizer: 'adam', loss: 'binaryCrossentropy'});
    document.getElementById('aiStatus').innerText = "AI Brain: Ready";
}

// Feature Extraction: Pixel Density
function getDensity(imageData) {
    const {width, height, data} = imageData;
    let density = new Array(width).fill(0);
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (data[(y * width + x) * 4 + 3] > 0) density[x]++;
        }
    }
    // Resize to fixed 512 for model input
    return tf.image.resizeBilinear(tf.tensor3d(density, [width, 1, 1]), [512, 1]).flatten().arraySync();
}

// Training Loop (Reinforcement)
async function learn(selectedCuts, densityMap) {
    const target = new Array(512).fill(0);
    selectedCuts.forEach(c => target[Math.floor((c/sheetCanvas.width)*512)] = 1);
    await model.fit(tf.tensor2d([densityMap]), tf.tensor2d([target]), {epochs: 5});
    document.getElementById('aiStatus').innerText = "AI Status: Learned from last choice!";
}

// ZIP Export
document.getElementById('zipBtn').onclick = async () => {
    const zip = new JSZip();
    const folder = zip.folder("ai_sprites");
    for(let i=0; i < vCuts.length-1; i++) {
        const w = vCuts[i+1] - vCuts[i];
        const temp = document.createElement('canvas');
        temp.width = w; temp.height = sheetCanvas.height;
        temp.getContext('2d').drawImage(img, vCuts[i], 0, w, img.height, 0, 0, w, img.height);
        const blob = await new Promise(r => temp.toBlob(r));
        folder.file(`sprite_${i}.png`, blob);
    }
    const content = await zip.generateAsync({type:"blob"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "ai_assets.zip";
    link.click();
};

// File Upload
document.getElementById('upload').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (f) => {
        img.onload = () => {
            sheetCanvas.width = img.width; sheetCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            init();
        };
        img.src = f.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

init().catch(err => {
    console.error("AI Initialization failed:", err);
    document.getElementById('aiStatus').innerText = "AI Error: Check Console";
});
