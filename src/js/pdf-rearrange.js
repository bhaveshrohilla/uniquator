document.addEventListener('DOMContentLoaded', () => {
    
    // --- State ---
    let pdfDoc = null;          // PDF-Lib document
    let pdfViewerDoc = null;    // PDF.js document
    let pageOrder = [];         // Array of original 0-based indices [0, 1, 2...]
    let removedPages = new Set(); // Set of original indices
    let currentFile = null;

    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepEditor = document.getElementById('step-editor');
    const mainGrid = document.getElementById('main-grid');
    const modalGrid = document.getElementById('modal-grid');
    const modal = document.getElementById('large-doc-modal');
    const saveBtn = document.getElementById('save-btn');
    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(saveBtn && saveBtn.parentNode) saveBtn.parentNode.appendChild(convertNewBtn);

    const statusMsg = document.getElementById('status-msg');
    const filenameDisplay = document.getElementById('filename-display');

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

    // --- 2. Load PDF ---
    async function loadPDF(file) {
        if (file.type !== 'application/pdf') return alert('Please select a PDF file.');
        
        try {
            document.getElementById('global-loader').style.display = 'flex';
            document.getElementById('global-loader').style.opacity = '1';

            currentFile = file;
            const arrayBuffer = await file.arrayBuffer();

            // Load for manipulation
            pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            const pageCount = pdfDoc.getPageCount();

            // Load for viewing
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            pdfViewerDoc = await loadingTask.promise;

            // Initialize State
            pageOrder = Array.from({ length: pageCount }, (_, i) => i);
            removedPages.clear();

            // UI Update
            filenameDisplay.textContent = file.name;
            stepUpload.classList.remove('step-active');
            stepUpload.classList.add('step-hidden');
            stepEditor.classList.remove('step-hidden');
            stepEditor.classList.add('step-active');

            // Render
            await renderUI(pageCount);

            document.getElementById('global-loader').style.display = 'none';

        } catch (err) {
            console.error(err);
            alert('Error loading PDF.');
            document.getElementById('global-loader').style.display = 'none';
        }
    }

    // --- 3. Render UI ---
    async function renderUI(pageCount) {
        mainGrid.innerHTML = '';
        modalGrid.innerHTML = '';

        // Decide where to render based on page count
        const targetGrid = (pageCount > 10) ? modalGrid : mainGrid;
        
        if (pageCount > 10) {
            modal.style.display = 'flex';
        }

        for (let i = 0; i < pageCount; i++) {
            const card = createPageCard(i);
            targetGrid.appendChild(card);
            
            // Render thumbnail async
            renderThumbnail(i + 1, card.querySelector('canvas'));
        }
    }

    function createPageCard(pageIndex) {
        const card = document.createElement('div');
        card.className = 'page-card';
        card.draggable = true;
        card.dataset.index = pageIndex; // Original Index

        const canvas = document.createElement('canvas');
        card.appendChild(canvas);

        const label = document.createElement('div');
        label.className = 'page-number';
        label.textContent = `Page ${pageIndex + 1}`;
        card.appendChild(label);

        // Click to Remove
        card.addEventListener('click', () => {
            if (removedPages.has(pageIndex)) {
                removedPages.delete(pageIndex);
                card.classList.remove('removed');
            } else {
                removedPages.add(pageIndex);
                card.classList.add('removed');
            }
        });

        // Drag Events
        addDragEvents(card);

        return card;
    }

    async function renderThumbnail(pageNum, canvas) {
        try {
            const page = await pdfViewerDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.25 }); // Small thumbnail
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            }).promise;
        } catch (e) {
            console.warn('Error rendering page', pageNum, e);
        }
    }

    // --- 4. Drag and Drop Logic ---
    let dragSrcEl = null;

    function addDragEvents(item) {
        item.addEventListener('dragstart', (e) => {
            dragSrcEl = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', item.innerHTML);
        });

        item.addEventListener('dragover', (e) => {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        });

        item.addEventListener('dragenter', (e) => {
            item.classList.add('over');
        });

        item.addEventListener('dragleave', (e) => {
            item.classList.remove('over');
        });

        item.addEventListener('drop', (e) => {
            if (e.stopPropagation) e.stopPropagation();

            if (dragSrcEl !== item) {
                // Swap DOM elements
                const container = item.parentNode;
                const allItems = Array.from(container.children);
                const srcIndex = allItems.indexOf(dragSrcEl);
                const targetIndex = allItems.indexOf(item);

                if (srcIndex < targetIndex) {
                    container.insertBefore(dragSrcEl, item.nextSibling);
                } else {
                    container.insertBefore(dragSrcEl, item);
                }
            }
            return false;
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            document.querySelectorAll('.page-card').forEach(col => col.classList.remove('over'));
        });
    }

    // --- 5. Modal Handling ---
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        modal.style.display = 'none';
        // Move items back to main grid if user closes modal? 
        // For simplicity, we just hide modal, but if they want to edit again they can't reopen it easily without a button.
        // But the prompt implies the modal IS the editor for large files.
        // Let's move items to main grid so they can see result, or just keep them in modal grid and move modal grid content to main grid.
        
        // Move children from modalGrid to mainGrid
        while (modalGrid.firstChild) {
            mainGrid.appendChild(modalGrid.firstChild);
        }
    });

    document.getElementById('modal-done-btn').addEventListener('click', () => {
        modal.style.display = 'none';
        while (modalGrid.firstChild) {
            mainGrid.appendChild(modalGrid.firstChild);
        }
    });

    // --- 6. Save PDF ---
    saveBtn.addEventListener('click', async () => {
        try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="material-icons spin">sync</span> Processing...`;

            // 1. Determine Order from DOM
            const finalOrder = [];
            const cards = document.querySelectorAll('.page-card'); // Selects from wherever they are (main or modal)
            
            cards.forEach(card => {
                const originalIndex = parseInt(card.dataset.index);
                if (!removedPages.has(originalIndex)) {
                    finalOrder.push(originalIndex);
                }
            });

            if (finalOrder.length === 0) throw new Error("No pages selected.");

            // 2. Create New PDF
            const newPdf = await PDFLib.PDFDocument.create();
            const copiedPages = await newPdf.copyPages(pdfDoc, finalOrder);
            copiedPages.forEach(page => newPdf.addPage(page));

            // 3. Download
            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `filenest_rearranged_${Date.now()}.pdf`;
            link.click();

            saveBtn.innerHTML = `<span class="material-icons">check</span> Done`;
            setTimeout(() => { 
                saveBtn.innerHTML = `<span class="material-icons">save</span> Save PDF`; 
                saveBtn.disabled = false;
                convertNewBtn.style.display = 'inline-flex';
            }, 2000);

        } catch (err) {
            console.error(err);
            alert("Error saving PDF: " + err.message);
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span class="material-icons">save</span> Save PDF`;
        }
    });

    // --- 7. Convert New (Reset) ---
    convertNewBtn.addEventListener('click', () => {
        location.reload();
    });
});