/* file: tools/src/js/pdf-split.js */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- State ---
    let pdfDoc = null;       // The PDF-Lib document
    let totalPages = 0;
    let selectedPages = new Set(); // Stores 1-based page numbers
    let currentTab = 'visual';     // 'visual' or 'range'

    // --- DOM Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepEditor = document.getElementById('step-editor');
    const pdfGrid = document.getElementById('pdf-grid');
    const summaryText = document.getElementById('selection-summary');
    const splitBtn = document.getElementById('split-btn');
    const rangeInput = document.getElementById('range-input');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(splitBtn && splitBtn.parentNode) splitBtn.parentNode.appendChild(convertNewBtn);
    
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

    document.getElementById('reset-btn').addEventListener('click', () => {
        location.reload(); // Simple reset
    });

    // --- 2. Load & Render PDF ---
    async function loadPDF(file) {
        try {
            document.getElementById('global-loader').style.display = 'flex';
            document.getElementById('global-loader').style.opacity = '1';

            await VerticonDB.saveFile('split_current', file);
            const pdfData = await file.arrayBuffer();
            
            // A. Load into PDF-Lib (for splitting later)
            pdfDoc = await PDFLib.PDFDocument.load(pdfData);
            totalPages = pdfDoc.getPageCount();

            // B. Load into PDF.js (for visualization)
            // We use a separate loading process for rendering
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            const pdfViewerDoc = await loadingTask.promise;

            // UI Updates
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('page-count-badge').textContent = `${totalPages} pages`;
            
            // Switch Views
            stepUpload.classList.remove('step-active');
            stepUpload.classList.add('step-hidden');
            stepEditor.classList.remove('step-hidden');
            stepEditor.classList.add('step-active');

            // Render Grid
            renderGrid(pdfViewerDoc);

            document.getElementById('global-loader').style.display = 'none';
        } catch (err) {
            console.error(err);
            alert("Error loading PDF. Please try a valid file.");
            document.getElementById('global-loader').style.display = 'none';
        }
    }

    // --- 3. Render Visual Grid ---
    async function renderGrid(pdfViewerDoc) {
        pdfGrid.innerHTML = ''; // Clear
        selectedPages.clear();

        for (let i = 1; i <= totalPages; i++) {
            // Create Card Wrapper
            const card = document.createElement('div');
            card.className = 'page-card';
            card.dataset.pageNumber = i;
            
            // Create Canvas
            const canvas = document.createElement('canvas');
            card.appendChild(canvas);
            
            // Page Number Label
            const label = document.createElement('div');
            label.className = 'page-number';
            label.innerText = `Page ${i}`;
            card.appendChild(label);

            // Checkmark Icon
            const check = document.createElement('div');
            check.className = 'check-icon material-icons';
            check.innerText = 'check';
            card.appendChild(check);

            // Click Event (Toggle Selection)
            card.addEventListener('click', () => togglePageSelection(i, card));

            pdfGrid.appendChild(card);

            // Async Render Page to Canvas
            renderPageThumbnail(pdfViewerDoc, i, canvas);
        }
    }

    async function renderPageThumbnail(pdfViewerDoc, pageNum, canvas) {
        const page = await pdfViewerDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.3 }); // Low scale for thumbnail
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
        };
        await page.render(renderContext).promise;
    }

    // --- 4. Interactions ---
    function togglePageSelection(pageNum, cardElement) {
        if (selectedPages.has(pageNum)) {
            selectedPages.delete(pageNum);
            cardElement.classList.remove('selected');
        } else {
            selectedPages.add(pageNum);
            cardElement.classList.add('selected');
        }
        updateSummary();
    }

    function updateSummary() {
        summaryText.innerText = `${selectedPages.size} pages selected`;
    }

    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            currentTab = btn.dataset.tab;
        });
    });

    // Select All / Clear
    document.getElementById('select-all').addEventListener('click', () => {
        const cards = document.querySelectorAll('.page-card');
        cards.forEach(c => {
            const page = parseInt(c.dataset.pageNumber);
            selectedPages.add(page);
            c.classList.add('selected');
        });
        updateSummary();
    });

    document.getElementById('deselect-all').addEventListener('click', () => {
        selectedPages.clear();
        document.querySelectorAll('.page-card').forEach(c => c.classList.remove('selected'));
        updateSummary();
    });

    // Convert New Logic
    convertNewBtn.addEventListener('click', () => {
        location.reload();
    });

    // --- 5. Split & Download Logic ---
    splitBtn.addEventListener('click', async () => {
        let finalPagesToExtract = [];

        // Logic based on Active Tab
        if (currentTab === 'visual') {
            // Sort pages numerically
            finalPagesToExtract = Array.from(selectedPages).sort((a,b) => a - b);
        } else {
            // Parse Range Input (e.g. "1-5, 8")
            const inputVal = rangeInput.value.trim();
            if(!inputVal) return alert("Please enter a page range.");
            finalPagesToExtract = parsePageRange(inputVal, totalPages);
        }

        if (finalPagesToExtract.length === 0) {
            return alert("No pages selected for extraction.");
        }

        try {
            // UI Feedback
            splitBtn.innerHTML = `<span class="material-icons spin">sync</span> Processing...`;
            
            // Create New PDF
            const newPdf = await PDFLib.PDFDocument.create();
            
            // Convert 1-based page numbers to 0-based indices
            const indices = finalPagesToExtract.map(p => p - 1);
            
            // Copy Pages
            const copiedPages = await newPdf.copyPages(pdfDoc, indices);
            copiedPages.forEach(p => newPdf.addPage(p));

            // Save & Download
            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `filenest_split_${Date.now()}.pdf`;
            link.click();

            // Reset UI
            splitBtn.innerHTML = `<span class="material-icons">check</span> Downloaded!`;
            setTimeout(() => {
                splitBtn.innerHTML = `<span class="material-icons">content_cut</span> Split & Download`;
                convertNewBtn.style.display = 'inline-flex';
            }, 3000);

        } catch (err) {
            console.error(err);
            alert("An error occurred while creating the PDF.");
        }
    });

    // Helper: Parse Range String
    function parsePageRange(str, max) {
        const pages = new Set();
        const parts = str.split(',');
        
        parts.forEach(part => {
            part = part.trim();
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                if (start && end) {
                    for (let i = start; i <= end; i++) {
                        if (i >= 1 && i <= max) pages.add(i);
                    }
                }
            } else {
                const num = Number(part);
                if (num >= 1 && num <= max) pages.add(num);
            }
        });
        return Array.from(pages).sort((a, b) => a - b);
    }
});