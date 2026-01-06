document.addEventListener('DOMContentLoaded', () => {
    
    // --- State ---
    const filesArray = []; 
    
    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepEditor = document.getElementById('step-editor');
    const imageList = document.getElementById('image-list');
    const countBadge = document.getElementById('count-badge');
    
    const addMoreBtn = document.getElementById('add-more-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const resizeBtn = document.getElementById('resize-btn');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const statusMsg = document.getElementById('status-msg');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(resizeBtn && resizeBtn.parentNode) resizeBtn.parentNode.appendChild(convertNewBtn);

    // Settings
    const widthInput = document.getElementById('width-input');
    const heightInput = document.getElementById('height-input');
    const maintainRatioCheck = document.getElementById('maintain-ratio');
    const ratioIcon = document.getElementById('ratio-icon');
    const formatSelect = document.getElementById('format-select');

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
            
            // Get dimensions
            const dims = await getImageDimensions(file);

            filesArray.push({
                id: id,
                name: file.name,
                type: file.type,
                width: dims.width,
                height: dims.height,
                thumb: URL.createObjectURL(file)
            });
        }

        renderList();
        updateUI();
        document.getElementById('global-loader').style.display = 'none';
    }

    function getImageDimensions(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.src = URL.createObjectURL(file);
        });
    }

    // --- 2. UI & Settings ---
    maintainRatioCheck.addEventListener('change', () => {
        if (maintainRatioCheck.checked) {
            ratioIcon.parentElement.classList.add('active');
        } else {
            ratioIcon.parentElement.classList.remove('active');
        }
    });
    // Init state
    if(maintainRatioCheck.checked) ratioIcon.parentElement.classList.add('active');

    // Reset to "Resize" state when settings change
    const resetToResizeState = () => {
        if (filesArray.length > 0 && downloadZipBtn.style.display !== 'none') {
            resizeBtn.style.display = 'inline-flex';
            downloadZipBtn.style.display = 'none';
            convertNewBtn.style.display = 'none';
            statusMsg.textContent = '';
        }
    };

    widthInput.addEventListener('input', resetToResizeState);
    heightInput.addEventListener('input', resetToResizeState);
    maintainRatioCheck.addEventListener('change', resetToResizeState);
    formatSelect.addEventListener('change', resetToResizeState);

    function renderList() {
        imageList.innerHTML = '';
        filesArray.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'image-item';
            el.innerHTML = `
                <img src="${item.thumb}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">
                <div style="flex:1; margin-left:15px;">
                    <div style="font-weight:600;">${item.name}</div>
                    <div style="font-size:0.8rem; color:#888;">Original: ${item.width} x ${item.height}</div>
                </div>
                <span class="material-icons remove-btn" style="cursor:pointer; color:#888;" data-index="${index}">close</span>
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
        
        resizeBtn.style.display = 'inline-flex';
        downloadZipBtn.style.display = 'none';
        convertNewBtn.style.display = 'none';
        statusMsg.textContent = '';
        
        // Optional: Reset inputs to defaults if needed
    });

    // --- 3. Resize Logic ---
    resizeBtn.addEventListener('click', async () => {
        const targetW = parseInt(widthInput.value);
        const targetH = parseInt(heightInput.value);
        const maintainRatio = maintainRatioCheck.checked;
        const format = formatSelect.value;

        if (!targetW || !targetH) return alert("Please enter valid dimensions.");

        resizeBtn.disabled = true;
        resizeBtn.innerHTML = `<span class="material-icons spin">sync</span> Processing...`;
        
        const zip = new JSZip();

        try {
            for (const item of filesArray) {
                statusMsg.textContent = `Resizing ${item.name}...`;
                const file = await VerticonDB.getFile(item.id);
                
                const blob = await resizeImage(file, targetW, targetH, maintainRatio, format);
                
                const newName = item.name.substring(0, item.name.lastIndexOf('.')) + '.' + format;
                zip.file(newName, blob);
            }

            statusMsg.textContent = "Creating ZIP...";
            const content = await zip.generateAsync({ type: "blob" });
            
            downloadZipBtn.onclick = () => {
                const url = URL.createObjectURL(content);
                const link = document.createElement('a');
                link.href = url;
                link.download = `filenest_resized_${Date.now()}.zip`;
                link.click();
            };

            resizeBtn.style.display = 'none';
            downloadZipBtn.style.display = 'inline-flex';
            convertNewBtn.style.display = 'inline-flex';
            statusMsg.textContent = "Done!";
            resizeBtn.disabled = false;
            resizeBtn.innerHTML = `<span class="material-icons">transform</span> Resize & Download`;

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error: " + err.message;
            resizeBtn.disabled = false;
        }
    });

    async function resizeImage(file, targetW, targetH, maintainRatio, format) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = async () => {
                let w = targetW;
                let h = targetH;

                if (maintainRatio) {
                    // Fit within box
                    const scale = Math.min(targetW / img.width, targetH / img.height);
                    w = Math.round(img.width * scale);
                    h = Math.round(img.height * scale);
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                if (format === 'ico') {
                    const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                    const icoBlob = await pngToIco(pngBlob);
                    resolve(icoBlob);
                } else {
                    const mime = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
                    canvas.toBlob(resolve, mime, 0.9);
                }
            };
            img.src = URL.createObjectURL(file);
        });
    }

    // Helper for ICO (Copied from img-convert.js)
    async function pngToIco(pngBlob) {
        const pngData = new Uint8Array(await pngBlob.arrayBuffer());
        const len = pngData.length;
        
        const header = new Uint8Array(22);
        const view = new DataView(header.buffer);

        view.setUint16(0, 0, true); // Reserved
        view.setUint16(2, 1, true); // Type (1=ICO)
        view.setUint16(4, 1, true); // Count (1 image)

        // Width/Height 0 means 256 or ignore if larger, standard ICO header
        view.setUint8(6, 0); 
        view.setUint8(7, 0); 
        view.setUint8(8, 0); 
        view.setUint8(9, 0); 
        view.setUint16(10, 1, true); // Planes
        view.setUint16(12, 32, true); // BPP
        view.setUint32(14, len, true); // Size
        view.setUint32(18, 22, true); // Offset

        const ico = new Uint8Array(22 + len);
        ico.set(header, 0);
        ico.set(pngData, 22);
        
        return new Blob([ico], { type: 'image/x-icon' });
    }
});