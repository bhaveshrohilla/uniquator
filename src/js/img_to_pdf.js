document.addEventListener('DOMContentLoaded', () => {
    const PAGE_SIZES = { 'A4': [595.28, 841.89], 'Letter': [612, 792], 'Legal': [612, 1008] };
    const filesArray = [];
    
    // UI Elements
    const dropZone = document.getElementById('drop-zone'), fileInput = document.getElementById('file-input');
    const statusMsg = document.getElementById('status-msg'), convertBtn = document.getElementById('convert-btn');
    const reprocessBtn = document.getElementById('reprocess-btn'), downloadLink = document.getElementById('download-link');
    const convertNewBtn = document.getElementById('convert-new-btn'), clearBtn = document.getElementById('clear-btn');
    const pageSizeSelect = document.getElementById('page-size'), pageLayoutSelect = document.getElementById('page-layout'), pageOrientationSelect = document.getElementById('page-orientation');

    // --- HEAVY DUTY ORIENTATION FIXER ---
    async function fixImageOrientation(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Canvas naturally draws images upright regardless of EXIF tags
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                // Export as same type to maintain quality
                canvas.toBlob((blob) => resolve(blob || file), file.type, 0.95);
                URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(file);
        });
    }

    const updateLayoutVisibility = () => {
        const isFit = pageSizeSelect.value === 'fit';
        document.getElementById('layout-group').style.display = isFit ? 'none' : 'flex';
        document.getElementById('orientation-group').style.display = isFit ? 'none' : 'flex';
    };
    pageSizeSelect.addEventListener('change', updateLayoutVisibility);

    // Reprocess Logic: Settings badalne par Download hide karo aur Reprocess dikhao
    [pageSizeSelect, pageLayoutSelect, pageOrientationSelect].forEach(el => {
        el.addEventListener('change', () => {
            if (downloadLink.style.display === 'inline-flex') {
                statusMsg.textContent = "Settings changed. Click 'Reprocess' to update! 🔄";
                statusMsg.style.color = "#d9534f";
                downloadLink.style.display = 'none';
                reprocessBtn.style.display = 'inline-flex';
            }
        });
    });

    async function handleFiles(files) {
        const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
        statusMsg.textContent = "Fixing orientations... ⏳";
        
        for (const file of valid) {
            const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const fixedBlob = await fixImageOrientation(file);
            await VerticonDB.saveFile(id, fixedBlob);
            filesArray.push({ id, name: file.name, type: file.type, thumb: URL.createObjectURL(fixedBlob) });
        }
        renderImages();
        updateUI();
    }

    function renderImages() {
        const list = document.getElementById('image-list');
        list.innerHTML = '';
        filesArray.forEach((f, idx) => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.innerHTML = `<img src="${f.thumb}" class="image-preview"><button onclick="removeImage('${f.id}')" class="remove-btn material-icons">close</button>`;
            list.appendChild(card);
        });
    }

    window.removeImage = async (id) => {
        const i = filesArray.findIndex(f => f.id === id);
        URL.revokeObjectURL(filesArray[i].thumb);
        await VerticonDB.deleteFile(id);
        filesArray.splice(i, 1);
        renderImages();
        updateUI();
    };

    function updateUI() {
        const hasFiles = filesArray.length > 0;
        convertBtn.disabled = !hasFiles;
        clearBtn.style.display = hasFiles ? 'inline-flex' : 'none';
        
        if (!hasFiles) {
            statusMsg.textContent = "Add images to begin.";
            statusMsg.style.color = "";
            reprocessBtn.style.display = 'none';
            downloadLink.style.display = 'none';
            convertNewBtn.style.display = 'none';
            convertBtn.style.display = 'inline-flex';
        } else {
            statusMsg.textContent = `${filesArray.length} image(s) ready.`;
        }
    }

    const generatePDF = async () => {
        try {
            statusMsg.textContent = "Generating High Quality PDF... 🚀";
            statusMsg.style.color = "";
            const pdfDoc = await PDFLib.PDFDocument.create();
            
            for (const f of filesArray) {
                const blob = await VerticonDB.getFile(f.id);
                const bytes = await blob.arrayBuffer();
                
                // Embed based on type (PNG vs JPEG)
                const img = f.type.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
                
                let pw, ph, [bw, bh] = PAGE_SIZES[pageSizeSelect.value] || [img.width, img.height];
                if (pageSizeSelect.value !== 'fit') {
                    const orient = pageOrientationSelect.value;
                    if ((orient==='portrait' && bw > bh) || (orient==='landscape' && bh > bw)) [bw, bh] = [bh, bw];
                    pw = bw; ph = bh;
                } else { pw = img.width; ph = img.height; }

                const scale = Math.min(pw / img.width, ph / img.height);
                const w = pageLayoutSelect.value === 'stretch' ? pw : img.width * scale;
                const h = pageLayoutSelect.value === 'stretch' ? ph : img.height * scale;
                pdfDoc.addPage([pw, ph]).drawImage(img, { x: (pw-w)/2, y: (ph-h)/2, width: w, height: h });
            }

            downloadLink.href = URL.createObjectURL(new Blob([await pdfDoc.save()], { type: 'application/pdf' }));
            downloadLink.download = `filenest_${Date.now()}.pdf`;

            convertBtn.style.display = 'none';
            reprocessBtn.style.display = 'inline-flex';
            downloadLink.style.display = 'inline-flex';
            convertNewBtn.style.display = 'inline-flex';
            statusMsg.textContent = "PDF Ready for Download! ✅";
        } catch (e) {
            statusMsg.textContent = "Error: Conversion failed.";
        }
    };

    convertBtn.onclick = generatePDF;
    reprocessBtn.onclick = generatePDF;
    fileInput.onchange = (e) => handleFiles(e.target.files);
    clearBtn.onclick = () => { if(confirm("Clear all?")) location.reload(); };
    convertNewBtn.onclick = () => location.reload();
});
