document.addEventListener('DOMContentLoaded', () => {
    
    // --- State ---
    let pdfDoc = null;          // PDF.js document proxy
    let totalPages = 0;
    let removedPages = new Set(); // Stores 1-based page numbers to exclude
    let currentFile = null;

    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepOptions = document.getElementById('step-options');
    
    const filenameDisplay = document.getElementById('filename-display');
    const pageCountBadge = document.getElementById('page-count-badge');
    const statusMsg = document.getElementById('status-msg');
    
    const advancedBtn = document.getElementById('advanced-btn');
    const convertBtn = document.getElementById('convert-btn');
    const resetBtn = document.getElementById('reset-btn');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(convertBtn && convertBtn.parentNode) convertBtn.parentNode.appendChild(convertNewBtn);

    // Modal Elements
    const modal = document.getElementById('selection-modal');
    const modalGrid = document.getElementById('modal-grid');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalDoneBtn = document.getElementById('modal-done-btn');

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

            // Load PDF using PDF.js
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            pdfDoc = await loadingTask.promise;
            totalPages = pdfDoc.numPages;

            // Reset State
            removedPages.clear();

            // UI Update
            filenameDisplay.textContent = file.name;
            pageCountBadge.textContent = `${totalPages} pages`;
            
            stepUpload.classList.remove('step-active');
            stepUpload.classList.add('step-hidden');
            stepOptions.classList.remove('step-hidden');
            stepOptions.classList.add('step-active');

            document.getElementById('global-loader').style.display = 'none';

        } catch (err) {
            console.error(err);
            alert('Error loading PDF.');
            document.getElementById('global-loader').style.display = 'none';
        }
    }

    // --- 3. Advanced Selection Modal ---
    advancedBtn.addEventListener('click', async () => {
        modal.style.display = 'flex';
        
        // Only render if empty (first time open)
        if (modalGrid.children.length === 0) {
            for (let i = 1; i <= totalPages; i++) {
                const card = createPageCard(i);
                modalGrid.appendChild(card);
                renderThumbnail(i, card.querySelector('canvas'));
            }
        }
    });

    function createPageCard(pageNum) {
        const card = document.createElement('div');
        card.className = 'page-card selected'; // Default selected
        card.dataset.page = pageNum;

        const canvas = document.createElement('canvas');
        card.appendChild(canvas);

        const label = document.createElement('div');
        label.className = 'page-number';
        label.textContent = `Page ${pageNum}`;
        card.appendChild(label);

        // Toggle Logic
        card.addEventListener('click', () => {
            if (removedPages.has(pageNum)) {
                removedPages.delete(pageNum);
                card.classList.remove('removed');
                card.classList.add('selected');
            } else {
                removedPages.add(pageNum);
                card.classList.add('removed');
                card.classList.remove('selected');
            }
        });

        return card;
    }

    async function renderThumbnail(pageNum, canvas) {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.2 }); // Low scale for thumbnail
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            }).promise;
        } catch (e) {
            console.warn('Error rendering thumbnail', pageNum, e);
        }
    }

    closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    modalDoneBtn.addEventListener('click', () => modal.style.display = 'none');

    // Convert New Logic
    convertNewBtn.addEventListener('click', () => {
        location.reload();
    });

    // --- 4. Convert & Download ---
    convertBtn.addEventListener('click', async () => {
        const format = document.querySelector('input[name="format"]:checked').value; // 'png' or 'jpeg'
        const mimeType = `image/${format}`;
        
        try {
            convertBtn.disabled = true;
            convertBtn.innerHTML = `<span class="material-icons spin">sync</span> Processing...`;
            statusMsg.textContent = "Rendering pages...";

            const zip = new JSZip();
            const folder = zip.folder("images");

            let processedCount = 0;
            const pagesToProcess = [];

            // Filter pages
            for (let i = 1; i <= totalPages; i++) {
                if (!removedPages.has(i)) {
                    pagesToProcess.push(i);
                }
            }

            if (pagesToProcess.length === 0) throw new Error("No pages selected.");

            // Process Pages
            for (const pageNum of pagesToProcess) {
                statusMsg.textContent = `Rendering page ${pageNum}...`;
                
                const page = await pdfDoc.getPage(pageNum);
                // High quality scale
                const viewport = page.getViewport({ scale: 2.0 });
                
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: viewport
                }).promise;

                // Convert to Blob
                const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.9));
                const fileName = `page_${pageNum.toString().padStart(3, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`;
                
                folder.file(fileName, blob);
                processedCount++;
            }

            statusMsg.textContent = "Creating ZIP file...";
            const content = await zip.generateAsync({ type: "blob" });
            
            // Download
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `filenest_images_${Date.now()}.zip`;
            link.click();

            statusMsg.textContent = "Download started!";
            convertBtn.innerHTML = `<span class="material-icons">check</span> Done`;
            setTimeout(() => { 
                convertBtn.disabled = false; 
                convertBtn.innerHTML = `<span class="material-icons">folder_zip</span> Convert & Download ZIP`;
                convertNewBtn.style.display = 'inline-flex';
            }, 3000);

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error converting: " + err.message;
            convertBtn.disabled = false;
            convertBtn.innerHTML = `<span class="material-icons">folder_zip</span> Convert & Download ZIP`;
        }
    });
});