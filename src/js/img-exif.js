document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const stepUpload = document.getElementById('step-upload');
    const stepEditor = document.getElementById('step-editor');
    const filenameDisplay = document.getElementById('filename-display');
    const imagePreview = document.getElementById('image-preview');
    const metadataList = document.getElementById('metadata-list');
    const quickCleanBtn = document.getElementById('quick-clean-btn');
    const downloadBtn = document.getElementById('download-btn');
    const resetBtn = document.getElementById('reset-btn');
    const convertNewBtn = document.getElementById('convert-new-btn');

    let currentImageData = null; // Base64 string
    let currentFilename = '';

    // --- File Handling ---
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    async function handleFile(file) {
        if (file.type !== 'image/jpeg') {
            alert('Please upload a JPEG image. EXIF editing is currently optimized for JPEG.');
            return;
        }

        // Save to IndexedDB for persistence (standard Verticon pattern)
        try {
            await VerticonDB.saveFile('exif_editor_temp', file);
        } catch (err) {
            console.warn('IndexedDB save failed:', err);
        }

        currentFilename = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            currentImageData = e.target.result;
            showEditor();
        };
        reader.readAsDataURL(file);
    }

    function showEditor() {
        stepUpload.classList.replace('step-active', 'step-hidden');
        stepEditor.classList.replace('step-hidden', 'step-active');
        filenameDisplay.textContent = currentFilename;
        imagePreview.src = currentImageData;
        downloadBtn.disabled = true; // Enforce cleanup before download
        loadMetadata();
    }

    async function handleReset() {
        // Remove from IndexedDB
        try {
            await VerticonDB.deleteFile('exif_editor_temp');
        } catch (err) {
            console.warn('IndexedDB delete failed:', err);
        }

        currentImageData = null;
        currentFilename = '';
        fileInput.value = '';
        stepEditor.classList.replace('step-active', 'step-hidden');
        stepUpload.classList.replace('step-hidden', 'step-active');
    }

    resetBtn.addEventListener('click', handleReset);
    if (convertNewBtn) convertNewBtn.addEventListener('click', handleReset);

    // --- Metadata Logic ---
    function loadMetadata() {
        metadataList.innerHTML = '';
        try {
            const exifObj = piexif.load(currentImageData);
            const summary = [
                { label: 'Camera Make', value: exifObj["0th"][piexif.ImageIFD.Make] },
                { label: 'Camera Model', value: exifObj["0th"][piexif.ImageIFD.Model] },
                { label: 'Date Taken', value: exifObj["0th"][piexif.ImageIFD.DateTime] },
                { label: 'GPS Info', value: Object.keys(exifObj["GPS"]).length > 0 ? 'Present' : 'None' }
            ];

            summary.forEach(item => {
                const div = document.createElement('div');
                div.className = 'metadata-item';
                div.innerHTML = `<strong>${item.label}:</strong> <span>${item.value || 'N/A'}</span>`;
                metadataList.appendChild(div);
            });
        } catch (e) {
            metadataList.innerHTML = '<p>No EXIF data found or error reading file.</p>';
        }
    }

    quickCleanBtn.addEventListener('click', () => {
        try {
            const exifObj = piexif.load(currentImageData);
            
            // 1. Wipe GPS
            exifObj["GPS"] = {};

            // 2. Wipe identifying strings from 0th IFD
            const sensitive0th = [
                piexif.ImageIFD.Make,
                piexif.ImageIFD.Model,
                piexif.ImageIFD.Software,
                piexif.ImageIFD.Artist,
                piexif.ImageIFD.Copyright
            ];
            sensitive0th.forEach(tag => delete exifObj["0th"][tag]);

            // 3. Wipe Serial Numbers from Exif IFD
            const sensitiveExif = [
                piexif.ExifIFD.BodySerialNumber,
                piexif.ExifIFD.CameraOwnerName,
                piexif.ExifIFD.LensSerialNumber,
                piexif.ExifIFD.LensModel
            ];
            sensitiveExif.forEach(tag => delete exifObj["Exif"][tag]);

            const exifBytes = piexif.dump(exifObj);
            currentImageData = piexif.insert(exifBytes, currentImageData);
            
            loadMetadata();
            downloadBtn.disabled = false; // Enable download after cleanup
            alert('Sensitive metadata removed!');
        } catch (e) {
            alert('Error cleaning metadata.');
        }
    });

    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = currentImageData;
        link.download = `cleaned_${currentFilename}`;
        link.click();
    });
});