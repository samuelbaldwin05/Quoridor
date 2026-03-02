// Theme Manager for handling theme switching
class ThemeManager {
    constructor(defaultTheme = 'modern') {
        this.currentTheme = defaultTheme;
        
        // Theme configuration - maps theme names to CSS variable prefixes
        this.themeConfig = {
            'modern': 'modern',
            'classic': 'classic',
            'sunny-day': 'sunny'
        };
        
        // List of all CSS variables that need to be set for each theme
        this.cssVariables = [
            'primary-bg', 'secondary-bg', 'tertiary-bg',
            'board-bg', 'cell-bg', 'cell-alt-bg',
            'ui-brown', 'ui-brown-dark', 'ui-brown-darker', 'ui-accent',
            'player1-color', 'player1-border', 'player1-shadow',
            'player2-color', 'player2-border', 'player2-shadow',
            'text-primary', 'text-dark', 'text-medium', 'text-light', 'text-muted',
            'valid-move', 'hover-danger', 'preview-valid', 'preview-invalid',
            'modal-bg', 'modal-overlay', 'modal-accent', 'modal-border',
            'dev-bg', 'dev-border', 'dev-text', 'dev-label', 'dev-btn'
        ];
    }
    
    // Initialize theme on page load
    initializeTheme() {
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = this.currentTheme;
            this.applyTheme(this.currentTheme);
        }
    }
    
    // Apply a theme by name
    applyTheme(themeName) {
        const root = document.documentElement;
        const themePrefix = this.themeConfig[themeName] || this.themeConfig['classic'];
        
        // Apply all CSS variables for the selected theme
        this.cssVariables.forEach(variable => {
            const cssVarName = `--${variable}`;
            const themeVarName = `--${themePrefix}-${variable}`;
            root.style.setProperty(cssVarName, `var(${themeVarName})`);
        });
        
        this.currentTheme = themeName;
    }
    
    // Get current theme name
    getCurrentTheme() {
        return this.currentTheme;
    }
}

