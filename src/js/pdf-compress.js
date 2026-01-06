/* file: tools/src/js/pdf-compress.js */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stepUpload = document.getElementById('step-upload');
    const stepProcess = document.getElementById('step-process');
    
    const filenameDisplay = document.getElementById('filename-display');
    const oldSizeDisplay = document.getElementById('old-size');
    const newSizeDisplay = document.getElementById('new-size');
    const statusText = document.getElementById('compression-status');
    const compressBtn = document.getElementById('compress-btn');
    const downloadBtn = document.getElementById('download-btn');

    // Create Convert New Button dynamically
    const convertNewBtn = document.createElement('button');
    convertNewBtn.id = 'convert-new-btn';
    convertNewBtn.className = 'btn';
    convertNewBtn.style.display = 'none';
    convertNewBtn.style.marginLeft = '10px';
    convertNewBtn.innerHTML = `<span class="material-icons">refresh</span> Convert New`;
    if(compressBtn && compressBtn.parentNode) compressBtn.parentNode.appendChild(convertNewBtn);

    let currentFileId = null;

    // --- Drag & Drop ---
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if(e.dataTransfer.files[0]) prepareFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if(e.target.files[0]) prepareFile(e.target.files[0]);
    });

    // --- Prepare File ---
    async function prepareFile(file) {
        if(file.type !== 'application/pdf') return alert('Please upload a PDF file.');
        
        const id = 'compress_current';
        await VerticonDB.saveFile(id, file);
        currentFileId = id;
        
        // Update UI
        filenameDisplay.textContent = file.name;
        oldSizeDisplay.textContent = formatBytes(file.size);
        newSizeDisplay.textContent = '...';
        
        stepUpload.classList.remove('step-active');
        stepUpload.classList.add('step-hidden');
        stepProcess.classList.remove('step-hidden');
        stepProcess.classList.add('step-active');
    }

    // Convert New Logic
    convertNewBtn.addEventListener('click', async () => {
        await VerticonDB.clearStore();
        currentFileId = null;
        
        compressBtn.style.display = 'inline-flex';
        compressBtn.innerHTML = `<span class="material-icons">compress</span> Compress PDF`;
        compressBtn.disabled = false;
        downloadBtn.style.display = 'none';
        convertNewBtn.style.display = 'none';
        statusText.textContent = '';
        stepProcess.classList.remove('step-active');
        stepProcess.classList.add('step-hidden');
        stepUpload.classList.remove('step-hidden');
        stepUpload.classList.add('step-active');
    });

    // --- Compress Logic ---
    compressBtn.addEventListener('click', async () => {
        if(!currentFileId) return;

        try {
            // UI Loading
            compressBtn.disabled = true;
            compressBtn.innerHTML = `<span class="material-icons spin">sync</span> Optimizing...`;
            statusText.textContent = "Analyzing structure and cleaning unused objects...";

            const file = await VerticonDB.getFile(currentFileId);
            const arrayBuffer = await file.arrayBuffer();
            
            // Load PDF
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            
            // SAVE OPTIMIZATION:
            // 1. useObjectStreams: true (Default) - Compresses objects into streams
            // 2. We are essentially re-writing the PDF structure cleanly
            const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
            
            const newBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            const newSize = newBlob.size;

            // Update UI Stats
            newSizeDisplay.textContent = formatBytes(newSize);
            
            // Calculate Savings
            const savings = file.size - newSize;
            if (savings > 0) {
                const percent = (savings / file.size) * 100;
                const percentDisplay = percent < 1 ? percent.toFixed(2) : Math.round(percent);
                statusText.textContent = `Success! Reduced by ${percentDisplay}%`;
                statusText.style.color = '#4caf50';
            } else {
                statusText.textContent = "File is already optimized.";
                statusText.style.color = '#aaa';
            }

            // Setup Download
            const url = URL.createObjectURL(newBlob);
            downloadBtn.href = url;
            downloadBtn.download = `filenest_optimized_${file.name}`;
            
            // Swap Buttons
            compressBtn.style.display = 'none';
            downloadBtn.style.display = 'inline-flex';
            convertNewBtn.style.display = 'inline-flex';

        } catch (error) {
            console.error(error);
            statusText.textContent = "Error optimizing file.";
            compressBtn.disabled = false;
            compressBtn.innerHTML = `<span class="material-icons">compress</span> Try Again`;
        }
    });

    // --- Utility: Format Bytes ---
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
});