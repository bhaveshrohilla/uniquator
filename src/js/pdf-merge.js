/* file: tools/src/js/pdf-merge.js */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- State Management ---
    const filesArray = []; // Stores metadata {id, name}
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileListEl = document.getElementById('file-list');
    const mergeBtn = document.getElementById('merge-btn');
    const statusMsg = document.getElementById('status-msg');
    const downloadLink = document.getElementById('download-link');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(mergeBtn && mergeBtn.parentNode) mergeBtn.parentNode.appendChild(convertNewBtn);

    // Clear previous session data
    VerticonDB.clearStore().catch(console.error);

    // --- 1. Drag & Drop Visuals ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    // --- 2. File Selection ---
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    async function handleFiles(files) {
        // Reset download link if new files are added
        downloadLink.style.display = 'none';
        convertNewBtn.style.display = 'none';
        mergeBtn.style.display = 'inline-flex';
        mergeBtn.innerHTML = `<span class="material-icons">call_merge</span> Merge PDFs`;
        statusMsg.textContent = '';
        
        for (const file of Array.from(files)) {
            if (file.type === 'application/pdf') {
                const id = `merge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                await VerticonDB.saveFile(id, file);
                filesArray.push({ id: id, name: file.name });
                addFileToList({ id: id, name: file.name });
            }
        }
        updateUI();
    }

    function addFileToList(fileMeta) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-name">
                <span class="material-icons" style="font-size: 1.2rem;">description</span>
                ${fileMeta.name}
            </div>
            <span class="material-icons remove-file">close</span>
        `;
        
        // Remove functionality
        item.querySelector('.remove-file').addEventListener('click', async () => {
            const index = filesArray.findIndex(f => f.id === fileMeta.id);
            if (index > -1) {
                await VerticonDB.deleteFile(fileMeta.id);
                filesArray.splice(index, 1);
                item.remove();
                updateUI();
            }
        });

        fileListEl.appendChild(item);
    }

    function updateUI() {
        // Enable merge button only if we have at least 2 files
        if (filesArray.length >= 2) {
            mergeBtn.disabled = false;
            statusMsg.textContent = `${filesArray.length} files ready to merge.`;
        } else {
            mergeBtn.disabled = true;
            statusMsg.textContent = "Please select at least 2 PDF files.";
        }
    }

    // Convert New Logic
    convertNewBtn.addEventListener('click', async () => {
        if (!confirm('Clear all files and start over?')) return;
        await VerticonDB.clearStore();
        filesArray.length = 0;
        fileListEl.innerHTML = '';
        
        mergeBtn.style.display = 'inline-flex';
        mergeBtn.innerHTML = `<span class="material-icons">call_merge</span> Merge PDFs`;
        downloadLink.style.display = 'none';
        convertNewBtn.style.display = 'none';
        statusMsg.textContent = '';
        updateUI();
    });

    // --- 3. Merge Logic (Client-Side) ---
    mergeBtn.addEventListener('click', async () => {
        if (filesArray.length < 2) return;

        try {
            // UI Loading State
            mergeBtn.disabled = true;
            mergeBtn.innerHTML = `<span class="material-icons" style="animation: spin 1s linear infinite;">sync</span> Merging...`;
            statusMsg.textContent = "Processing files...";

            // Initialize PDF-Lib
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            // Iterate and Merge
            for (const fileMeta of filesArray) {
                const file = await VerticonDB.getFile(fileMeta.id);
                if (file) {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await PDFDocument.load(arrayBuffer);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
            }

            // Serialize
            const pdfBytes = await mergedPdf.save();
            
            // Create Download Blob
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // Update UI with Success
            downloadLink.href = url;
            downloadLink.download = `filenest_merged_${Date.now()}.pdf`;
            downloadLink.style.display = 'inline-flex';
            convertNewBtn.style.display = 'inline-flex';
            
            statusMsg.textContent = "Merge complete!";
            mergeBtn.innerHTML = `<span class="material-icons">check</span> Done`;

        } catch (error) {
            console.error(error);
            statusMsg.textContent = "Error merging files. Ensure they are valid PDFs.";
            mergeBtn.innerHTML = `<span class="material-icons">call_merge</span> Merge PDFs`;
            mergeBtn.disabled = false;
        }
    });
});