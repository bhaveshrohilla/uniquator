document.addEventListener('DOMContentLoaded', () => {
    
    // --- State ---
    const filesArray = []; // { id, name, type, size, thumb, targetFormat, convertedBlob }
    
    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepEditor = document.getElementById('step-editor');
    const imageList = document.getElementById('image-list');
    const countBadge = document.getElementById('count-badge');
    const globalFormatSelect = document.getElementById('global-format');
    const addMoreBtn = document.getElementById('add-more-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const convertBtn = document.getElementById('convert-btn');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const statusMsg = document.getElementById('status-msg');
    const canvas = document.getElementById('process-canvas');
    const ctx = canvas.getContext('2d');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(convertBtn && convertBtn.parentNode) convertBtn.parentNode.appendChild(convertNewBtn);

    // --- 1. File Handling ---
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    // Trigger file input from "Add More"
    addMoreBtn.addEventListener('click', () => fileInput.click());

    async function handleFiles(fileList) {
        if (fileList.length === 0) return;

        document.getElementById('global-loader').style.display = 'flex';
        document.getElementById('global-loader').style.opacity = '1';

        for (const file of Array.from(fileList)) {
            if (!file.type.startsWith('image/')) continue;

            const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Save to DB (using commonscript VerticonDB)
            await VerticonDB.saveFile(id, file);
            
            const thumbUrl = URL.createObjectURL(file);
            
            filesArray.push({
                id: id,
                name: file.name,
                type: file.type,
                size: (file.size / 1024).toFixed(1) + ' KB',
                thumb: thumbUrl,
                targetFormat: 'png', // Default
                convertedBlob: null
            });
        }

        renderList();
        updateUI();
        
        document.getElementById('global-loader').style.display = 'none';
    }

    // --- 2. UI Rendering ---
    function renderList() {
        imageList.innerHTML = '';
        
        filesArray.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'image-item';
            el.innerHTML = `
                <img src="${item.thumb}" class="image-thumb">
                <div class="image-info">
                    <div class="image-name" title="${item.name}">${item.name}</div>
                    <div class="image-meta">${item.size} • ${item.type.split('/')[1].toUpperCase()}</div>
                </div>
                <div class="image-controls">
                    <span class="material-icons" style="font-size:1rem; color:var(--text-muted);">arrow_forward</span>
                    <select class="item-format" data-index="${index}">
                        <option value="png" ${item.targetFormat === 'png' ? 'selected' : ''}>PNG</option>
                        <option value="jpg" ${item.targetFormat === 'jpg' ? 'selected' : ''}>JPG</option>
                        <option value="webp" ${item.targetFormat === 'webp' ? 'selected' : ''}>WEBP</option>
                        <option value="ico" ${item.targetFormat === 'ico' ? 'selected' : ''}>ICO</option>
                        <option value="svg" ${item.targetFormat === 'svg' ? 'selected' : ''}>SVG</option>
                    </select>
                    <span class="material-icons remove-btn" data-index="${index}">close</span>
                </div>
            `;
            imageList.appendChild(el);
        });

        // Bind Events
        document.querySelectorAll('.item-format').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                filesArray[idx].targetFormat = e.target.value;
                filesArray[idx].convertedBlob = null; // Reset conversion
                resetDownloadState();
            });
        });

        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idx = parseInt(e.target.dataset.index);
                const item = filesArray[idx];
                await VerticonDB.deleteFile(item.id);
                URL.revokeObjectURL(item.thumb);
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
        resetDownloadState();
    }

    function resetDownloadState() {
        convertBtn.style.display = 'inline-flex';
        downloadZipBtn.style.display = 'none';
        statusMsg.textContent = '';
        convertNewBtn.style.display = 'none';
    }

    // Global Format Change
    globalFormatSelect.addEventListener('change', (e) => {
        const fmt = e.target.value;
        if (!fmt) return;
        filesArray.forEach(f => {
            f.targetFormat = fmt;
            f.convertedBlob = null;
        });
        renderList();
        resetDownloadState();
    });

    // Clear All
    clearAllBtn.addEventListener('click', async () => {
        if (!confirm('Remove all images?')) return;
        await VerticonDB.clearStore();
        filesArray.forEach(f => URL.revokeObjectURL(f.thumb));
        filesArray.length = 0;
        renderList();
        updateUI();
    });

    // Convert New Logic
    convertNewBtn.addEventListener('click', async () => {
        if (!confirm('Clear all and start over?')) return;
        await VerticonDB.clearStore();
        filesArray.forEach(f => URL.revokeObjectURL(f.thumb));
        filesArray.length = 0;
        renderList();
        updateUI();
        
        convertBtn.style.display = 'inline-flex';
        downloadZipBtn.style.display = 'none';
        convertNewBtn.style.display = 'none';
        statusMsg.textContent = '';
    });

    // --- 3. Conversion Logic ---
    convertBtn.addEventListener('click', async () => {
        convertBtn.disabled = true;
        convertBtn.innerHTML = `<span class="material-icons spin">sync</span> Converting...`;
        
        try {
            const zip = new JSZip();
            let processed = 0;

            for (const item of filesArray) {
                statusMsg.textContent = `Converting ${item.name}...`;
                
                // Get original file
                const file = await VerticonDB.getFile(item.id);
                if (!file) continue;

                // Convert
                const blob = await convertImage(file, item.targetFormat);
                item.convertedBlob = blob;

                // Add to ZIP
                const newName = item.name.substring(0, item.name.lastIndexOf('.')) + '.' + item.targetFormat;
                zip.file(newName, blob);
                
                processed++;
            }

            statusMsg.textContent = "Generating ZIP file...";
            const zipContent = await zip.generateAsync({ type: "blob" });
            
            // Setup Download Button
            downloadZipBtn.onclick = () => {
                const url = URL.createObjectURL(zipContent);
                const link = document.createElement('a');
                link.href = url;
                link.download = `filenest_converted_${Date.now()}.zip`;
                link.click();
            };

            convertBtn.style.display = 'none';
            downloadZipBtn.style.display = 'inline-flex';
            convertNewBtn.style.display = 'inline-flex';
            statusMsg.textContent = "Conversion complete!";
            convertBtn.disabled = false;
            convertBtn.innerHTML = `<span class="material-icons">sync</span> Convert All`;

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error: " + err.message;
            convertBtn.disabled = false;
            convertBtn.innerHTML = `<span class="material-icons">sync</span> Convert All`;
        }
    });

    async function convertImage(file, format) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = async () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                if (format === 'svg') {
                    // Embed as Base64 in SVG
                    const dataUrl = canvas.toDataURL('image/png');
                    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}"><image href="${dataUrl}" width="${img.width}" height="${img.height}" /></svg>`;
                    resolve(new Blob([svgStr], { type: 'image/svg+xml' }));
                } 
                else if (format === 'ico') {
                    // Simple ICO: Resize to 256x256 max if needed, wrap PNG
                    // For simplicity, we'll just wrap the current canvas as PNG inside ICO container
                    // Note: Real ICOs usually need resizing to standard sizes (16, 32, 48, 256).
                    // We will resize to fit within 256x256 maintaining aspect ratio for compatibility.
                    
                    let w = img.width, h = img.height;
                    if (w > 256 || h > 256) {
                        const ratio = Math.min(256/w, 256/h);
                        w = Math.floor(w * ratio);
                        h = Math.floor(h * ratio);
                        // Resize canvas
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = w;
                        tempCanvas.height = h;
                        tempCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        
                        // Get PNG data
                        const pngBlob = await new Promise(r => tempCanvas.toBlob(r, 'image/png'));
                        const icoBlob = await pngToIco(pngBlob);
                        resolve(icoBlob);
                    } else {
                        const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                        const icoBlob = await pngToIco(pngBlob);
                        resolve(icoBlob);
                    }
                }
                else {
                    // Standard Raster (PNG, JPG, WEBP)
                    const mime = `image/${format === 'jpg' ? 'jpeg' : format}`;
                    canvas.toBlob(blob => resolve(blob), mime, 0.9);
                }
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    async function pngToIco(pngBlob) {
        // Create a simple ICO container for the PNG
        const pngData = new Uint8Array(await pngBlob.arrayBuffer());
        const len = pngData.length;
        
        // Header (6 bytes) + Directory Entry (16 bytes) = 22 bytes
        const header = new Uint8Array(22);
        const view = new DataView(header.buffer);

        view.setUint16(0, 0, true); // Reserved
        view.setUint16(2, 1, true); // Type (1=ICO)
        view.setUint16(4, 1, true); // Count (1 image)

        view.setUint8(6, 0); // Width (0 = 256) - We just set 0 for simplicity or actual width if <256
        view.setUint8(7, 0); // Height
        view.setUint8(8, 0); // Colors
        view.setUint8(9, 0); // Reserved
        view.setUint16(10, 1, true); // Planes
        view.setUint16(12, 32, true); // BPP
        view.setUint32(14, len, true); // Size
        view.setUint32(18, 22, true); // Offset (6+16)

        // Combine
        const ico = new Uint8Array(22 + len);
        ico.set(header, 0);
        ico.set(pngData, 22);
        
        return new Blob([ico], { type: 'image/x-icon' });
    }
});