document.addEventListener('DOMContentLoaded', () => {
    
    // --- State Management ---
    const filesArray = []; // Stores metadata {id, name, type}
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const imageListEl = document.getElementById('image-list');
    const convertBtn = document.getElementById('convert-btn');
    const statusMsg = document.getElementById('status-msg');
    const downloadLink = document.getElementById('download-link');
    const clearBtn = document.getElementById('clear-btn');
    const convertNewBtn = document.getElementById('convert-new-btn');
    // Detect mobile devices to avoid opening file picker automatically
    const isMobileDevice = () => /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent || navigator.vendor || window.opera || '');
    
    // Settings Elements
    const pageSizeSelect = document.getElementById('page-size');
    const layoutGroup = document.getElementById('layout-group');
    const pageLayoutSelect = document.getElementById('page-layout');
    const orientationGroup = document.getElementById('orientation-group');
    const pageOrientationSelect = document.getElementById('page-orientation');

    // Set default page size to A4 and update layout visibility accordingly
    if (pageSizeSelect) {
        pageSizeSelect.value = 'A4';
        layoutGroup.style.display = (pageSizeSelect.value === 'fit') ? 'none' : 'flex';
        if (orientationGroup) orientationGroup.style.display = (pageSizeSelect.value === 'fit') ? 'none' : 'flex';
    }

    let isExpanded = false;

    // Toggle layout options based on page size
    pageSizeSelect.addEventListener('change', (e) => {
        layoutGroup.style.display = (e.target.value === 'fit') ? 'none' : 'flex';
        if (orientationGroup) orientationGroup.style.display = (e.target.value === 'fit') ? 'none' : 'flex';
    });

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
    dropZone.addEventListener('click', (e) => {
        if (e.target !== fileInput && e.target.tagName !== 'BUTTON') {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    async function handleFiles(files) {
        downloadLink.style.display = 'none';
        convertBtn.style.display = 'inline-flex';
        
        for (const file of Array.from(files)) {
            if (file.type.startsWith('image/')) {
                const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Save to IndexedDB
                await VerticonDB.saveFile(id, file);
                
                // Create Object URL for thumbnail (revoked later if needed, but browser handles small amount)
                const thumbUrl = URL.createObjectURL(file);
                
                const meta = { id: id, name: file.name, type: file.type, thumb: thumbUrl };
                filesArray.push(meta);
            }
        }
        renderImages();
        updateUI();
    }

    function renderImages() {
        imageListEl.innerHTML = '';
        
        const limit = isExpanded ? filesArray.length : 5;
        const visibleItems = filesArray.slice(0, limit);

        visibleItems.forEach(fileMeta => {
            const item = document.createElement('div');
            item.className = 'image-card';
            item.innerHTML = `
                <img src="${fileMeta.thumb}" class="image-preview" alt="${fileMeta.name}">
                <div class="image-name" title="${fileMeta.name}">${fileMeta.name}</div>
                <div class="remove-btn material-icons">close</div>
            `;
            
            // Remove functionality
            item.querySelector('.remove-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const index = filesArray.findIndex(f => f.id === fileMeta.id);
                if (index > -1) {
                    await VerticonDB.deleteFile(fileMeta.id);
                    filesArray.splice(index, 1);
                    renderImages();
                    updateUI();
                }
            });

            imageListEl.appendChild(item);
        });

        if (!isExpanded && filesArray.length > 5) {
            const moreCard = document.createElement('div');
            moreCard.className = 'image-card more-card';
            moreCard.innerHTML = `
                <span class="material-icons" style="font-size: 2rem; color: var(--text-muted);">more_horiz</span>
                <div style="font-size: 0.9rem; color: var(--text-muted);">View All (${filesArray.length - 5})</div>
            `;
            moreCard.addEventListener('click', () => {
                isExpanded = true;
                renderImages();
            });
            imageListEl.appendChild(moreCard);
        }
    }

    function updateUI() {
        if (filesArray.length > 0) {
            convertBtn.disabled = false;
            if (clearBtn) clearBtn.style.display = 'inline-flex';
            if (convertNewBtn) convertNewBtn.style.display = 'none';
            statusMsg.textContent = `${filesArray.length} images ready to convert.`;
        } else {
            convertBtn.disabled = true;
            if (clearBtn) clearBtn.style.display = 'none';
            if (convertNewBtn) convertNewBtn.style.display = 'none';
            statusMsg.textContent = "Add images to begin.";
        }
    }

    // Clear all files (IndexedDB + in-memory thumbnails)
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (filesArray.length === 0) return;
            if (!confirm('Clear all images? This cannot be undone.')) return;

            try {
                await VerticonDB.clearStore();
                // Revoke object URLs created for thumbnails
                filesArray.forEach(f => { if (f.thumb) try { URL.revokeObjectURL(f.thumb); } catch (e) {} });
                filesArray.length = 0;
                renderImages();
                downloadLink.style.display = 'none';
                convertBtn.style.display = 'inline-flex';
                convertBtn.disabled = true;
                statusMsg.textContent = "All images cleared.";
                updateUI();
            } catch (err) {
                console.error(err);
                statusMsg.textContent = "Error clearing images.";
            }
        });
    }

    // --- 3. Conversion Logic ---
    convertBtn.addEventListener('click', async () => {
        if (filesArray.length === 0) return;

        try {
            // UI Loading State
            convertBtn.disabled = true;
            convertBtn.innerHTML = `<span class="material-icons spin">sync</span> Converting...`;
            statusMsg.textContent = "Processing images...";

            // Initialize PDF-Lib
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();
            
            // Get Settings
            const pageSize = pageSizeSelect.value;
            const layoutMode = pageLayoutSelect.value;
            
            // Define Standard Sizes (Points)
            const PageSizes = {
                'A4': [595.28, 841.89],
                'Letter': [612, 792],
                'Legal': [612, 1008]
            };

            // Iterate and Embed
            for (const fileMeta of filesArray) {
                const file = await VerticonDB.getFile(fileMeta.id);
                if (file) {
                    const arrayBuffer = await file.arrayBuffer();
                    let image;
                    
                    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                        image = await pdfDoc.embedJpg(arrayBuffer);
                    } else if (file.type === 'image/png') {
                        image = await pdfDoc.embedPng(arrayBuffer);
                    }

                    if (image) {
                        let pageWidth, pageHeight;
                        let x = 0, y = 0, w = image.width, h = image.height;

                        if (pageSize === 'fit') {
                            // Default: Page matches image
                            pageWidth = image.width;
                            pageHeight = image.height;
                        } else {
                            // Standard Page Size
                            let [baseWidth, baseHeight] = PageSizes[pageSize];

                            // Orientation preference: auto (detect) | portrait | landscape
                            const orientationPref = pageOrientationSelect ? pageOrientationSelect.value : 'auto';
                            const isPortrait = image.height > image.width;

                            if (orientationPref === 'portrait') {
                                if (baseWidth > baseHeight) [baseWidth, baseHeight] = [baseHeight, baseWidth];
                            } else if (orientationPref === 'landscape') {
                                if (baseHeight > baseWidth) [baseWidth, baseHeight] = [baseHeight, baseWidth];
                            } else {
                                // auto-detect from image
                                if (isPortrait && baseWidth > baseHeight) {
                                    [baseWidth, baseHeight] = [baseHeight, baseWidth];
                                } else if (!isPortrait && baseHeight > baseWidth) {
                                    [baseWidth, baseHeight] = [baseHeight, baseWidth];
                                }
                            }

                            pageWidth = baseWidth;
                            pageHeight = baseHeight;

                            if (layoutMode === 'stretch') {
                                w = pageWidth;
                                h = pageHeight;
                            } else {
                                // Contain (Fit to page maintaining aspect ratio)
                                const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
                                w = image.width * scale;
                                h = image.height * scale;
                                // Center image
                                x = (pageWidth - w) / 2;
                                y = (pageHeight - h) / 2;
                            }
                        }

                        const page = pdfDoc.addPage([pageWidth, pageHeight]);
                        page.drawImage(image, {
                            x: x, y: y, width: w, height: h
                        });
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            downloadLink.href = url;
            downloadLink.download = `verticon_images_${Date.now()}.pdf`;
            
            convertBtn.style.display = 'none';
            downloadLink.style.display = 'inline-flex';
                if (convertNewBtn) convertNewBtn.style.display = 'inline-flex';
            statusMsg.textContent = "Conversion complete!";

        } catch (error) {
            console.error(error);
            statusMsg.textContent = "Error converting images.";
            convertBtn.innerHTML = `<span class="material-icons">picture_as_pdf</span> Convert to PDF`;
            convertBtn.disabled = false;
        }
    });

    // Convert New: clear current files and reset UI for a new conversion
    if (convertNewBtn) {
        convertNewBtn.addEventListener('click', async () => {
            try {
                // Revoke the generated PDF blob URL if present
                try { if (downloadLink && downloadLink.href) URL.revokeObjectURL(downloadLink.href); } catch (e) {}

                await VerticonDB.clearStore();
                filesArray.forEach(f => { if (f.thumb) try { URL.revokeObjectURL(f.thumb); } catch (e) {} });
                filesArray.length = 0;
                renderImages();

                // Reset UI
                downloadLink.style.display = 'none';
                downloadLink.href = '';
                if (clearBtn) clearBtn.style.display = 'none';
                convertNewBtn.style.display = 'none';
                convertBtn.style.display = 'inline-flex';
                convertBtn.disabled = true;
                statusMsg.textContent = 'Ready for new images.';
                // restore convert button label
                convertBtn.innerHTML = `<span class="material-icons">picture_as_pdf</span> Convert to PDF`;
                // reset expanded view and page size defaults
                isExpanded = false;
                if (pageSizeSelect) {
                    pageSizeSelect.value = 'A4';
                    layoutGroup.style.display = (pageSizeSelect.value === 'fit') ? 'none' : 'flex';
                }
                updateUI();

                // Clear any existing file input value then open selector for quick new selection
                try {
                    if (fileInput) {
                        fileInput.value = '';
                        // On mobile, skip automatic opener to avoid unexpected prompts
                        if (!isMobileDevice()) {
                            fileInput.click();
                        }
                    }
                } catch (e) {
                    console.warn('Could not open file selector automatically.', e);
                }
            } catch (err) {
                console.error(err);
                statusMsg.textContent = 'Error resetting for new conversion.';
            }
        });
    }
});