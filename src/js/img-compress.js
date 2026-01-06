document.addEventListener('DOMContentLoaded', () => {
    
    // --- State ---
    const filesArray = []; // { id, name, type, originalSize, thumb, compressedBlob, compressedSize }
    
    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepEditor = document.getElementById('step-editor');
    const imageList = document.getElementById('image-list');
    const countBadge = document.getElementById('count-badge');
    
    const addMoreBtn = document.getElementById('add-more-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const compressBtn = document.getElementById('compress-btn');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const statusMsg = document.getElementById('status-msg');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(compressBtn && compressBtn.parentNode) compressBtn.parentNode.appendChild(convertNewBtn);

    // Settings
    const modeRadios = document.getElementsByName('mode');
    const settingAuto = document.getElementById('setting-auto');
    const settingTarget = document.getElementById('setting-target');
    const qualitySlider = document.getElementById('quality-slider');
    const targetSizeInput = document.getElementById('target-size-input');

    // --- 1. File Handling ---
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    addMoreBtn.addEventListener('click', () => fileInput.click());

    async function handleFiles(fileList) {
        if (fileList.length === 0) return;

        document.getElementById('global-loader').style.display = 'flex';
        document.getElementById('global-loader').style.opacity = '1';

        for (const file of Array.from(fileList)) {
            if (!file.type.startsWith('image/')) continue;

            const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await VerticonDB.saveFile(id, file);
            
            filesArray.push({
                id: id,
                name: file.name,
                type: file.type,
                originalSize: file.size,
                thumb: URL.createObjectURL(file),
                compressedBlob: null,
                compressedSize: 0
            });
        }

        renderList();
        updateUI();
        document.getElementById('global-loader').style.display = 'none';
    }

    // --- 2. UI & Settings ---
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'auto') {
                settingAuto.style.display = 'block';
                settingTarget.style.display = 'none';
            } else {
                settingAuto.style.display = 'none';
                settingTarget.style.display = 'block';
            }
            resetCompression();
        });
    });

    qualitySlider.addEventListener('input', resetCompression);
    targetSizeInput.addEventListener('change', () => {
        if (targetSizeInput.value < 100) targetSizeInput.value = 100;
        resetCompression();
    });

    function resetCompression() {
        filesArray.forEach(f => {
            f.compressedBlob = null;
            f.compressedSize = 0;
        });
        renderList();
        compressBtn.style.display = 'inline-flex';
        downloadZipBtn.style.display = 'none';
        convertNewBtn.style.display = 'none';
        statusMsg.textContent = '';
    }

    function renderList() {
        imageList.innerHTML = '';
        filesArray.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'image-item';
            
            let sizeDisplay = formatSize(item.originalSize);
            if (item.compressedSize > 0) {
                const savings = Math.round((1 - item.compressedSize / item.originalSize) * 100);
                sizeDisplay += ` <span class="material-icons" style="font-size:0.8rem; vertical-align:middle;">arrow_forward</span> <span class="size-badge">${formatSize(item.compressedSize)} (-${savings}%)</span>`;
            }

            el.innerHTML = `
                <img src="${item.thumb}" class="image-thumb">
                <div class="image-info">
                    <div class="image-name">${item.name}</div>
                    <div class="image-meta">${sizeDisplay}</div>
                </div>
                <span class="material-icons remove-btn" style="cursor:pointer; color:var(--text-muted);" data-index="${index}">close</span>
            `;
            imageList.appendChild(el);
        });

        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idx = parseInt(e.target.dataset.index);
                await VerticonDB.deleteFile(filesArray[idx].id);
                filesArray.splice(idx, 1);
                renderList();
                updateUI();
            });
        });

        countBadge.textContent = `${filesArray.length} images`;
    }

    function updateUI() {
        if (filesArray.length > 0) {
            stepUpload.classList.remove('step-active');
            stepUpload.classList.add('step-hidden');
            stepEditor.classList.remove('step-hidden');
            stepEditor.classList.add('step-active');
        } else {
            stepEditor.classList.remove('step-active');
            stepEditor.classList.add('step-hidden');
            stepUpload.classList.remove('step-hidden');
            stepUpload.classList.add('step-active');
        }
    }

    clearAllBtn.addEventListener('click', async () => {
        if (!confirm('Remove all images?')) return;
        await VerticonDB.clearStore();
        filesArray.length = 0;
        renderList();
        updateUI();
    });

    // Convert New Logic
    convertNewBtn.addEventListener('click', async () => {
        if (!confirm('Clear all and start over?')) return;
        await VerticonDB.clearStore();
        filesArray.length = 0;
        renderList();
        updateUI();
        
        compressBtn.style.display = 'inline-flex';
        downloadZipBtn.style.display = 'none';
        convertNewBtn.style.display = 'none';
        statusMsg.textContent = '';
        // Reset inputs if needed, but keeping settings is usually preferred
    });

    // --- 3. Compression Logic ---
    compressBtn.addEventListener('click', async () => {
        compressBtn.disabled = true;
        compressBtn.innerHTML = `<span class="material-icons spin">sync</span> Compressing...`;
        
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const zip = new JSZip();

        try {
            for (const item of filesArray) {
                statusMsg.textContent = `Processing ${item.name}...`;
                const file = await VerticonDB.getFile(item.id);
                
                let blob;
                if (mode === 'auto') {
                    const val = parseInt(qualitySlider.value);
                    // 0: Small (0.5), 1: Balanced (0.7), 2: Quality (0.9)
                    const quality = val === 0 ? 0.5 : (val === 1 ? 0.7 : 0.9);
                    blob = await compressImage(file, quality);
                } else {
                    const targetKB = parseInt(targetSizeInput.value);
                    blob = await compressToTarget(file, targetKB * 1024);
                }

                item.compressedBlob = blob;
                item.compressedSize = blob.size;
                zip.file(item.name, blob);
            }

            renderList();
            statusMsg.textContent = "Creating ZIP...";
            
            const content = await zip.generateAsync({ type: "blob" });
            
            downloadZipBtn.onclick = () => {
                const url = URL.createObjectURL(content);
                const link = document.createElement('a');
                link.href = url;
                link.download = `filenest_${Date.now()}.zip`;
                link.click();
            };

            compressBtn.style.display = 'none';
            downloadZipBtn.style.display = 'inline-flex';
            convertNewBtn.style.display = 'inline-flex';
            statusMsg.textContent = "Done!";
            compressBtn.disabled = false;
            compressBtn.innerHTML = `<span class="material-icons">compress</span> Compress All`;

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error: " + err.message;
            compressBtn.disabled = false;
        }
    });

    async function compressImage(file, quality) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // Force JPEG for compression efficiency unless it's very small
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
            };
            img.src = URL.createObjectURL(file);
        });
    }

    async function compressToTarget(file, targetBytes) {
        // If original is already smaller, just return it (converted to blob if needed)
        if (file.size <= targetBytes) return file;

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // Binary search for quality
                let min = 0, max = 1, quality = 0.5;
                let bestBlob = null;

                const attempt = (q) => {
                    canvas.toBlob((blob) => {
                        if (!bestBlob) bestBlob = blob; // Fallback

                        if (blob.size <= targetBytes) {
                            bestBlob = blob;
                            min = q; // Try for better quality
                        } else {
                            max = q; // Needs lower quality
                        }

                        if (max - min < 0.05) {
                            resolve(bestBlob);
                        } else {
                            attempt((min + max) / 2);
                        }
                    }, 'image/jpeg', q);
                };
                attempt(quality);
            };
            img.src = URL.createObjectURL(file);
        });
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});