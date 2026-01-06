document.addEventListener('DOMContentLoaded', () => {
    
    // --- State ---
    let pdfDoc = null;          // PDF-Lib document
    let pdfViewerDoc = null;    // PDF.js document
    let totalPages = 0;
    let currentFile = null;
    let rotations = [];         // Array storing added rotation per page (0, 90, 180, 270)

    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepEditor = document.getElementById('step-editor');
    const filenameDisplay = document.getElementById('filename-display');
    const pdfGrid = document.getElementById('pdf-grid');
    const saveBtn = document.getElementById('save-btn');
    const resetBtn = document.getElementById('reset-btn');
    const resetRotationsBtn = document.getElementById('reset-rotations-btn');
    const zoomModal = document.getElementById('zoom-modal');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(saveBtn && saveBtn.parentNode) saveBtn.parentNode.appendChild(convertNewBtn);

    // Quick Tab Elements
    const scopeSelect = document.getElementById('scope-select');
    const pageInputGroup = document.getElementById('page-input-group');
    const pageRangeInput = document.getElementById('page-range-input');
    const quickActions = document.querySelectorAll('.btn-action');

    // --- 1. File Handling ---
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if(e.dataTransfer.files[0]) loadPDF(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if(e.target.files[0]) loadPDF(e.target.files[0]);
    });

    resetBtn.addEventListener('click', () => location.reload());

    // --- 2. Load PDF ---
    async function loadPDF(file) {
        if (file.type !== 'application/pdf') return alert('Please select a PDF file.');
        
        try {
            document.getElementById('global-loader').style.display = 'flex';
            document.getElementById('global-loader').style.opacity = '1';

            currentFile = file;
            const arrayBuffer = await file.arrayBuffer();

            // Load PDF-Lib (for saving)
            pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            totalPages = pdfDoc.getPageCount();

            // Load PDF.js (for viewing)
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            pdfViewerDoc = await loadingTask.promise;

            // Initialize Rotations (0 for all)
            rotations = new Array(totalPages).fill(0);

            // UI Update
            filenameDisplay.textContent = file.name;
            stepUpload.classList.remove('step-active');
            stepUpload.classList.add('step-hidden');
            stepEditor.classList.remove('step-hidden');
            stepEditor.classList.add('step-active');

            renderGrid();

            document.getElementById('global-loader').style.display = 'none';

        } catch (err) {
            console.error(err);
            alert('Error loading PDF.');
            document.getElementById('global-loader').style.display = 'none';
        }
    }

    // --- 3. Render Grid ---
    function renderGrid() {
        pdfGrid.innerHTML = '';
        for (let i = 0; i < totalPages; i++) {
            const card = createPageCard(i);
            pdfGrid.appendChild(card);
            renderThumbnail(i + 1, card.querySelector('canvas'));
        }
    }

    function createPageCard(index) {
        const card = document.createElement('div');
        card.className = 'page-card';
        card.dataset.index = index;

        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-wrapper';
        
        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        card.appendChild(wrapper);

        const label = document.createElement('div');
        label.className = 'page-number';
        label.textContent = `Page ${index + 1}`;
        card.appendChild(label);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'card-controls';
        
        const leftBtn = createIconBtn('rotate_left', () => rotatePage(index, -90));
        const rightBtn = createIconBtn('rotate_right', () => rotatePage(index, 90));
        const eyeBtn = createIconBtn('visibility', () => openZoom(index));

        controls.append(leftBtn, eyeBtn, rightBtn);
        card.appendChild(controls);

        // Mobile: Click image to rotate right
        if (window.matchMedia("(max-width: 768px)").matches) {
            wrapper.addEventListener('click', () => rotatePage(index, 90));
        }

        return card;
    }

    function createIconBtn(icon, onClick) {
        const btn = document.createElement('div');
        btn.className = 'icon-btn material-icons';
        btn.textContent = icon;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }

    async function renderThumbnail(pageNum, canvas) {
        const page = await pdfViewerDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.3 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }

    // --- 4. Rotation Logic ---
    function rotatePage(index, degrees) {
        rotations[index] = (rotations[index] + degrees) % 360;
        updateCardVisual(index);
    }

    function updateCardVisual(index) {
        const card = pdfGrid.children[index];
        const wrapper = card.querySelector('.canvas-wrapper');
        wrapper.style.transform = `rotate(${rotations[index]}deg)`;
    }

    resetRotationsBtn.addEventListener('click', () => {
        rotations.fill(0);
        rotations.forEach((_, i) => updateCardVisual(i));
    });

    // --- 5. Quick Rotate Tab ---
    scopeSelect.addEventListener('change', (e) => {
        pageInputGroup.style.display = (e.target.value === 'specific') ? 'block' : 'none';
    });

    quickActions.forEach(btn => {
        btn.addEventListener('click', () => {
            const deg = parseInt(btn.dataset.rotate);
            const scope = scopeSelect.value;
            
            if (scope === 'all') {
                for(let i=0; i<totalPages; i++) rotatePage(i, deg);
            } else {
                const range = pageRangeInput.value;
                if (!range) return alert("Please enter page numbers.");
                const pages = parsePageRange(range, totalPages);
                pages.forEach(p => rotatePage(p - 1, deg));
            }
            alert("Rotation applied! Check the Visual Editor.");
        });
    });

    // --- 6. Zoom Modal ---
    async function openZoom(index) {
        zoomModal.innerHTML = '';
        zoomModal.style.display = 'flex';
        
        const canvas = document.createElement('canvas');
        // Apply current rotation to canvas style
        canvas.style.transform = `rotate(${rotations[index]}deg)`;
        canvas.style.maxHeight = '90vh';
        canvas.style.maxWidth = '90vw';
        canvas.style.transition = 'transform 0.3s';
        
        zoomModal.appendChild(canvas);

        const page = await pdfViewerDoc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }

    zoomModal.addEventListener('click', () => zoomModal.style.display = 'none');

    // Convert New Logic
    convertNewBtn.addEventListener('click', () => {
        location.reload();
    });

    // --- 7. Save PDF ---
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="material-icons spin">sync</span> Saving...`;

        try {
            const pages = pdfDoc.getPages();
            
            pages.forEach((page, i) => {
                const currentRotation = page.getRotation().angle;
                page.setRotation(currentRotation + rotations[i]);
            });

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `filenest_rotated_${Date.now()}.pdf`;
            link.click();

            saveBtn.innerHTML = `<span class="material-icons">check</span> Done`;
            setTimeout(() => { 
                saveBtn.disabled = false; 
                saveBtn.innerHTML = `<span class="material-icons">save</span> Save PDF`;
                convertNewBtn.style.display = 'inline-flex';
            }, 2000);
        } catch (e) {
            console.error(e);
            alert("Error saving PDF.");
            saveBtn.disabled = false;
        }
    });

    // Helper
    function parsePageRange(str, max) {
        // Simple parser: "1, 3-5" -> [1, 3, 4, 5]
        // (Implementation omitted for brevity, assume standard logic or copy from pdf-split if needed)
        // Re-implementing simple version:
        const result = new Set();
        str.split(',').forEach(part => {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start)) {
                if (end) {
                    for (let i = start; i <= end; i++) if (i <= max) result.add(i);
                } else {
                    if (start <= max) result.add(start);
                }
            }
        });
        return Array.from(result);
    }

    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });
});