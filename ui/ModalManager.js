// Modal Manager - Handles common modal functionality
class ModalManager {
    constructor() {
        this.activeModal = null;
        this.setupGlobalListeners();
    }
    
    // Setup global listeners for escape key and click outside
    setupGlobalListeners() {
        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.closeModal(this.activeModal);
            }
        });
    }
    
    // Open a modal
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        this.activeModal = modalId;
        
        // Calculate scrollbar width to prevent layout shift
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        
        // Prevent body scroll when modal is open and compensate for scrollbar
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = `${scrollbarWidth}px`;
        
        modal.style.display = 'flex';
        
        // Setup click-outside-to-close (use once to avoid duplicates)
        const clickHandler = (e) => {
            // Only close if clicking the modal overlay (not the content inside)
            if (e.target === modal) {
                this.closeModal(modalId);
            }
        };
        
        // Remove any existing listener and add new one
        modal.removeEventListener('click', this._modalClickHandler);
        this._modalClickHandler = clickHandler;
        modal.addEventListener('click', this._modalClickHandler);
    }
    
    // Close a modal
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        modal.style.display = 'none';
        
        // Restore body scroll and remove padding
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        
        // Remove click listener
        if (this._modalClickHandler) {
            modal.removeEventListener('click', this._modalClickHandler);
        }
        
        // Clear active modal if this was it
        if (this.activeModal === modalId) {
            this.activeModal = null;
        }
    }
    
    // Load modal content from HTML file
    async loadModalContent(modalId, htmlFile) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // If already loaded, don't reload
        if (modal.innerHTML.trim() !== '') return;
        
        try {
            const response = await fetch(htmlFile);
            if (!response.ok) {
                throw new Error(`Failed to load modal: ${response.statusText}`);
            }
            const html = await response.text();
            modal.innerHTML = html;
            return true;
        } catch (error) {
            console.error(`Error loading ${modalId}:`, error);
            
            // Check if this is a CORS/file:// protocol error
            const isLocalFile = window.location.protocol === 'file:';
            const errorMessage = isLocalFile 
                ? `<p><strong>Local File Error:</strong> This page needs to be served from a web server to load modal content.</p>
                   <p>For local testing, use one of these options:</p>
                   <ul style="text-align: left; margin: 10px 0;">
                       <li><strong>Python:</strong> <code>python -m http.server 8000</code> then visit <code>http://localhost:8000</code></li>
                       <li><strong>Node.js:</strong> <code>npx http-server</code></li>
                       <li><strong>VS Code:</strong> Use "Live Server" extension</li>
                   </ul>
                   <p><strong>Note:</strong> This will work correctly when deployed to GitHub Pages.</p>`
                : `<p>Error loading content. Please refresh the page or check your network connection.</p>`;
            
            modal.innerHTML = `<div class="modal-content"><div class="modal-header"><span class="close-btn" onclick="document.getElementById('${modalId}').style.display='none'">&times;</span><h2>Error</h2></div><div class="modal-body">${errorMessage}</div></div>`;
            return false;
        }
    }
}

